import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';

export interface CompleteJobImageParams {
  jobId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  resolution: string;
  aspectRatio: string;
  synthIdDetected: boolean;
  fidelityScore: number;
  executionMode: string;
}

export interface JobDetailsRecord {
  id: string;
  photoshootId: string;
  status: string;
  modelUsed: string;
  creditCost: number;
  rawPrompt: string;
  synthesizedPrompt: string;
  errorMessage: string | null;
  lastErrorCode?: string | null;
  startedAt: string | null;
  completedAt: string | null;
  heartbeatAt?: string | null;
  idempotencyKey?: string | null;
  assetKey?: string | null;
  createdAt: string;
  workspaceId: string;
  productTitle: string;
  stylePreset: string;
  aspectRatio: string;
  reservationId?: string | null;
  reservationStatus: string | null;
  reservedAmount: number | null;
}

export interface JobImageRecord {
  id: string;
  generationJobId: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  resolution: string;
  aspectRatio: string;
  synthIdDetected: boolean;
  fidelityScore: number;
  executionMode: string;
  createdAt: string;
}

export interface PhotoshootRepository {
  completeJobAndPersistImage(params: CompleteJobImageParams): Promise<string>;
  findJobById(jobId: string): Promise<JobDetailsRecord | null>;
  findJobByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<JobDetailsRecord | null>;
  markJobRunning(jobId: string, startedAt?: string): Promise<void>;
  markJobFailed(jobId: string, errorMessage: string, lastErrorCode?: string): Promise<void>;
  findStaleRunningJobs(
    staleBeforeIso: string
  ): Promise<Array<{ id: string; reservationId: string | null }>>;
  listJobImages(jobId: string): Promise<JobImageRecord[]>;
}

export class SqlitePhotoshootRepository implements PhotoshootRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async completeJobAndPersistImage(params: CompleteJobImageParams): Promise<string> {
    const now = new Date().toISOString();
    const generatedImageId = `img-${crypto.randomUUID()}`;

    await withSerializableTransaction((db) => {
      db.prepare(
        `INSERT INTO "GeneratedImage" (
           "id", "generationJobId", "imageUrl", "thumbnailUrl", "resolution",
           "aspectRatio", "isFavorite", "synthIdDetected", "fidelityScore", "executionMode", "createdAt"
         ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
      ).run(
        generatedImageId,
        params.jobId,
        params.imageUrl,
        params.thumbnailUrl,
        params.resolution,
        params.aspectRatio,
        params.synthIdDetected ? 1 : 0,
        params.fidelityScore,
        params.executionMode,
        now
      );

      db.prepare(
        `UPDATE "GenerationJob" SET "status" = 'COMPLETED', "completedAt" = ? WHERE "id" = ?`
      ).run(now, params.jobId);
    });

    return generatedImageId;
  }

  async findJobById(jobId: string): Promise<JobDetailsRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT j."id",
                j."photoshootId",
                j."status",
                j."modelUsed",
                j."creditCost",
                j."rawPrompt",
                j."synthesizedPrompt",
                j."errorMessage",
                j."lastErrorCode",
                j."startedAt",
                j."completedAt",
                j."heartbeatAt",
                j."idempotencyKey",
                j."assetKey",
                j."createdAt",
                p."workspaceId",
                p."title" AS "productTitle",
                p."stylePreset",
                p."aspectRatio",
                r."id" AS "reservationId",
                r."status" AS "reservationStatus",
                r."amount" AS "reservedAmount"
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         LEFT JOIN "CreditReservation" r ON r."generationJobId" = j."id"
         WHERE j."id" = ?`
      )
      .get(jobId) as JobDetailsRecord | undefined;

    return row ?? null;
  }

  async findJobByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<JobDetailsRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT j."id",
                j."photoshootId",
                j."status",
                j."modelUsed",
                j."creditCost",
                j."rawPrompt",
                j."synthesizedPrompt",
                j."errorMessage",
                j."lastErrorCode",
                j."startedAt",
                j."completedAt",
                j."heartbeatAt",
                j."idempotencyKey",
                j."assetKey",
                j."createdAt",
                p."workspaceId",
                p."title" AS "productTitle",
                p."stylePreset",
                p."aspectRatio",
                r."id" AS "reservationId",
                r."status" AS "reservationStatus",
                r."amount" AS "reservedAmount"
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         LEFT JOIN "CreditReservation" r ON r."generationJobId" = j."id"
         WHERE p."workspaceId" = ? AND j."idempotencyKey" = ?`
      )
      .get(workspaceId, idempotencyKey) as JobDetailsRecord | undefined;

    return row ?? null;
  }

  async markJobRunning(jobId: string, startedAt?: string): Promise<void> {
    const db = this.getDb();
    const ts = startedAt || new Date().toISOString();
    db.prepare(
      `UPDATE "GenerationJob"
       SET "status" = 'PROCESSING',
           "startedAt" = COALESCE("startedAt", ?),
           "heartbeatAt" = ?
       WHERE "id" = ?`
    ).run(ts, ts, jobId);
  }

  async markJobFailed(jobId: string, errorMessage: string, lastErrorCode?: string): Promise<void> {
    const db = this.getDb();
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE "GenerationJob"
       SET "status" = 'FAILED',
           "errorMessage" = ?,
           "lastErrorCode" = ?,
           "completedAt" = ?
       WHERE "id" = ?`
    ).run(errorMessage, lastErrorCode ?? null, now, jobId);
  }

  async findStaleRunningJobs(
    staleBeforeIso: string
  ): Promise<Array<{ id: string; reservationId: string | null }>> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT j."id", r."id" AS "reservationId"
         FROM "GenerationJob" j
         LEFT JOIN "CreditReservation" r ON r."generationJobId" = j."id"
         WHERE j."status" = 'PROCESSING'
           AND (
             (j."heartbeatAt" IS NOT NULL AND j."heartbeatAt" < ?)
             OR
             (j."heartbeatAt" IS NULL AND j."startedAt" IS NOT NULL AND j."startedAt" < ?)
             OR
             (j."heartbeatAt" IS NULL AND j."startedAt" IS NULL AND j."createdAt" < ?)
           )`
      )
      .all(staleBeforeIso, staleBeforeIso, staleBeforeIso) as Array<{
      id: string;
      reservationId: string | null;
    }>;

    return rows;
  }

  async listJobImages(jobId: string): Promise<JobImageRecord[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT "id",
                "generationJobId",
                "imageUrl",
                "thumbnailUrl",
                "resolution",
                "aspectRatio",
                "synthIdDetected",
                "fidelityScore",
                "executionMode",
                "createdAt"
         FROM "GeneratedImage"
         WHERE "generationJobId" = ?
         ORDER BY "createdAt" DESC`
      )
      .all(jobId) as Array<Record<string, unknown>>;

    return rows.map((img) => ({
      id: String(img.id),
      generationJobId: String(img.generationJobId),
      imageUrl: String(img.imageUrl),
      thumbnailUrl: img.thumbnailUrl ? String(img.thumbnailUrl) : null,
      resolution: String(img.resolution),
      aspectRatio: String(img.aspectRatio),
      synthIdDetected: Boolean(img.synthIdDetected),
      fidelityScore: Number(img.fidelityScore ?? 1.0),
      executionMode: String(img.executionMode || 'LIVE_GEMINI_API'),
      createdAt: String(img.createdAt),
    }));
  }
}

export class PostgresPhotoshootRepository implements PhotoshootRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async completeJobAndPersistImage(params: CompleteJobImageParams): Promise<string> {
    const now = new Date();
    const id = `img-${crypto.randomUUID()}`;

    await this.client.$transaction(async (tx) => {
      await tx.generatedImage.create({
        data: {
          id,
          generationJobId: params.jobId,
          imageUrl: params.imageUrl,
          thumbnailUrl: params.thumbnailUrl,
          resolution: params.resolution,
          aspectRatio: params.aspectRatio,
          isFavorite: false,
          synthIdDetected: params.synthIdDetected,
          fidelityScore: params.fidelityScore,
          executionMode: params.executionMode,
          createdAt: now,
        },
      });

      await tx.generationJob.update({
        where: { id: params.jobId },
        data: {
          status: 'COMPLETED',
          completedAt: now,
        },
      });
    });

    return id;
  }

  async findJobById(jobId: string): Promise<JobDetailsRecord | null> {
    const job = await this.client.generationJob.findUnique({
      where: { id: jobId },
      include: {
        photoshoot: {
          select: {
            workspaceId: true,
            title: true,
            stylePreset: true,
            aspectRatio: true,
          },
        },
        reservation: {
          select: {
            id: true,
            status: true,
            amount: true,
          },
        },
      },
    });

    if (!job) return null;

    return {
      id: job.id,
      photoshootId: job.photoshootId,
      status: job.status,
      modelUsed: job.modelUsed,
      creditCost: job.creditCost,
      rawPrompt: job.rawPrompt,
      synthesizedPrompt: job.synthesizedPrompt,
      errorMessage: job.errorMessage,
      lastErrorCode: (job as any).lastErrorCode ?? null,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      heartbeatAt: (job as any).heartbeatAt ? (job as any).heartbeatAt.toISOString() : null,
      idempotencyKey: (job as any).idempotencyKey ?? null,
      assetKey: (job as any).assetKey ?? null,
      createdAt: job.createdAt.toISOString(),
      workspaceId: job.photoshoot.workspaceId,
      productTitle: job.photoshoot.title,
      stylePreset: job.photoshoot.stylePreset,
      aspectRatio: job.photoshoot.aspectRatio,
      reservationId: job.reservation ? job.reservation.id : null,
      reservationStatus: job.reservation ? job.reservation.status : null,
      reservedAmount: job.reservation ? job.reservation.amount : null,
    };
  }

  async findJobByIdempotencyKey(
    workspaceId: string,
    idempotencyKey: string
  ): Promise<JobDetailsRecord | null> {
    const job = await this.client.generationJob.findFirst({
      where: {
        idempotencyKey,
        photoshoot: { workspaceId },
      },
      include: {
        photoshoot: {
          select: {
            workspaceId: true,
            title: true,
            stylePreset: true,
            aspectRatio: true,
          },
        },
        reservation: {
          select: {
            id: true,
            status: true,
            amount: true,
          },
        },
      },
    });

    if (!job) return null;

    return {
      id: job.id,
      photoshootId: job.photoshootId,
      status: job.status,
      modelUsed: job.modelUsed,
      creditCost: job.creditCost,
      rawPrompt: job.rawPrompt,
      synthesizedPrompt: job.synthesizedPrompt,
      errorMessage: job.errorMessage,
      lastErrorCode: (job as any).lastErrorCode ?? null,
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      heartbeatAt: (job as any).heartbeatAt ? (job as any).heartbeatAt.toISOString() : null,
      idempotencyKey: (job as any).idempotencyKey ?? null,
      assetKey: (job as any).assetKey ?? null,
      createdAt: job.createdAt.toISOString(),
      workspaceId: job.photoshoot.workspaceId,
      productTitle: job.photoshoot.title,
      stylePreset: job.photoshoot.stylePreset,
      aspectRatio: job.photoshoot.aspectRatio,
      reservationId: job.reservation ? job.reservation.id : null,
      reservationStatus: job.reservation ? job.reservation.status : null,
      reservedAmount: job.reservation ? job.reservation.amount : null,
    };
  }

  async markJobRunning(jobId: string, startedAt?: string): Promise<void> {
    const date = startedAt ? new Date(startedAt) : new Date();
    await this.client.generationJob.update({
      where: { id: jobId },
      data: {
        status: 'PROCESSING',
        startedAt: date,
        heartbeatAt: date,
      },
    });
  }

  async markJobFailed(jobId: string, errorMessage: string, lastErrorCode?: string): Promise<void> {
    await this.client.generationJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage,
        lastErrorCode: lastErrorCode ?? null,
        completedAt: new Date(),
      },
    });
  }

  async findStaleRunningJobs(
    staleBeforeIso: string
  ): Promise<Array<{ id: string; reservationId: string | null }>> {
    const threshold = new Date(staleBeforeIso);
    const jobs = await this.client.generationJob.findMany({
      where: {
        status: 'PROCESSING',
        OR: [
          { heartbeatAt: { lt: threshold } },
          { AND: [{ heartbeatAt: null }, { startedAt: { lt: threshold } }] },
          { AND: [{ heartbeatAt: null }, { startedAt: null }, { createdAt: { lt: threshold } }] },
        ],
      },
      include: {
        reservation: {
          select: { id: true },
        },
      },
    });

    return jobs.map((j) => ({
      id: j.id,
      reservationId: j.reservation ? j.reservation.id : null,
    }));
  }

  async listJobImages(jobId: string): Promise<JobImageRecord[]> {
    const images = await this.client.generatedImage.findMany({
      where: { generationJobId: jobId },
      orderBy: { createdAt: 'desc' },
    });

    return images.map((img) => ({
      id: img.id,
      generationJobId: img.generationJobId,
      imageUrl: img.imageUrl,
      thumbnailUrl: img.thumbnailUrl,
      resolution: img.resolution,
      aspectRatio: img.aspectRatio,
      synthIdDetected: img.synthIdDetected,
      fidelityScore: img.fidelityScore,
      executionMode: img.executionMode,
      createdAt: img.createdAt.toISOString(),
    }));
  }
}

export function getPhotoshootRepository(): PhotoshootRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresPhotoshootRepository()
    : new SqlitePhotoshootRepository();
}
