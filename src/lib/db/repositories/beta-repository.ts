import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';

export interface BetaInviteRecord {
  id: string;
  code: string;
  description?: string | null;
  maxUses: number;
  usedCount: number;
  expiresAt?: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface RecordImageFeedbackParams {
  id: string;
  generatedImageId: string;
  workspaceId: string;
  userId: string;
  rating: string;
  reason?: string | null;
  comment?: string | null;
  nowIso: string;
}

export interface BetaRepository {
  findInviteByCode(code: string): Promise<BetaInviteRecord | null>;
  redeemInviteCode(inviteCodeId: string, userId: string): Promise<void>;
  createInviteCode(params: {
    id: string;
    code: string;
    description?: string;
    maxUses?: number;
    expiresAtIso?: string | null;
    nowIso: string;
  }): Promise<void>;
  findImageWorkspace(imageId: string): Promise<{ id: string; workspaceId: string } | null>;
  recordFeedback(params: RecordImageFeedbackParams): Promise<void>;
}

export class SqliteBetaRepository implements BetaRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async findInviteByCode(code: string): Promise<BetaInviteRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT * FROM "BetaInviteCode" WHERE "code" = ?`)
      .get(code) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: String(row.id),
      code: String(row.code),
      description: row.description ? String(row.description) : null,
      maxUses: Number(row.maxUses ?? 1),
      usedCount: Number(row.usedCount ?? 0),
      expiresAt: row.expiresAt ? String(row.expiresAt) : null,
      isActive: Boolean(row.isActive),
      createdAt: String(row.createdAt),
    };
  }

  async redeemInviteCode(inviteCodeId: string, userId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const redemptionId = `redemption-${crypto.randomUUID()}`;

    await withSerializableTransaction((txDb) => {
      txDb
        .prepare(
          `UPDATE "BetaInviteCode"
           SET "usedCount" = "usedCount" + 1, "updatedAt" = ?
           WHERE "id" = ?`
        )
        .run(nowIso, inviteCodeId);

      txDb
        .prepare(
          `INSERT OR IGNORE INTO "BetaInviteRedemption" ("id", "inviteCodeId", "userId", "redeemedAt")
           VALUES (?, ?, ?, ?)`
        )
        .run(redemptionId, inviteCodeId, userId, nowIso);
    });
  }

  async createInviteCode(params: {
    id: string;
    code: string;
    description?: string;
    maxUses?: number;
    expiresAtIso?: string | null;
    nowIso: string;
  }): Promise<void> {
    const db = this.getDb();
    db.prepare(
      `INSERT INTO "BetaInviteCode" ("id", "code", "description", "maxUses", "usedCount", "expiresAt", "isActive", "createdAt", "updatedAt")
       VALUES (?, ?, ?, ?, 0, ?, 1, ?, ?)`
    ).run(
      params.id,
      params.code,
      params.description ?? null,
      params.maxUses ?? 1,
      params.expiresAtIso ?? null,
      params.nowIso,
      params.nowIso
    );
  }

  async findImageWorkspace(imageId: string): Promise<{ id: string; workspaceId: string } | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT gi."id", p."workspaceId"
         FROM "GeneratedImage" gi
         JOIN "GenerationJob" j ON j."id" = gi."generationJobId"
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         WHERE gi."id" = ?`
      )
      .get(imageId) as { id: string; workspaceId: string } | undefined;

    return row ? { id: row.id, workspaceId: row.workspaceId } : null;
  }

  async recordFeedback(params: RecordImageFeedbackParams): Promise<void> {
    const db = this.getDb();
    db.prepare(
      `INSERT INTO "ImageFeedback" ("id", "generatedImageId", "workspaceId", "userId", "rating", "reason", "comment", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.id,
      params.generatedImageId,
      params.workspaceId,
      params.userId,
      params.rating,
      params.reason ?? null,
      params.comment ?? null,
      params.nowIso
    );
  }
}

export class PostgresBetaRepository implements BetaRepository {
  private client = prisma;

  async findInviteByCode(code: string): Promise<BetaInviteRecord | null> {
    const record = await this.client.betaInviteCode.findUnique({
      where: { code },
    });
    if (!record) return null;

    return {
      id: record.id,
      code: record.code,
      description: record.description,
      maxUses: record.maxUses,
      usedCount: record.usedCount,
      expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
      isActive: record.isActive,
      createdAt: record.createdAt.toISOString(),
    };
  }

  async redeemInviteCode(inviteCodeId: string, userId: string): Promise<void> {
    const redemptionId = `redemption-${crypto.randomUUID()}`;

    await this.client.$transaction(async (tx) => {
      await tx.betaInviteCode.update({
        where: { id: inviteCodeId },
        data: { usedCount: { increment: 1 } },
      });

      await tx.betaInviteRedemption.upsert({
        where: {
          inviteCodeId_userId: {
            inviteCodeId,
            userId,
          },
        },
        create: {
          id: redemptionId,
          inviteCodeId,
          userId,
        },
        update: {},
      });
    });
  }

  async createInviteCode(params: {
    id: string;
    code: string;
    description?: string;
    maxUses?: number;
    expiresAtIso?: string | null;
    nowIso: string;
  }): Promise<void> {
    await this.client.betaInviteCode.create({
      data: {
        id: params.id,
        code: params.code,
        description: params.description,
        maxUses: params.maxUses ?? 1,
        expiresAt: params.expiresAtIso ? new Date(params.expiresAtIso) : null,
        isActive: true,
      },
    });
  }

  async findImageWorkspace(imageId: string): Promise<{ id: string; workspaceId: string } | null> {
    const record = await this.client.generatedImage.findUnique({
      where: { id: imageId },
      include: {
        generationJob: {
          include: {
            photoshoot: {
              select: { workspaceId: true },
            },
          },
        },
      },
    });

    if (!record || !record.generationJob?.photoshoot) return null;
    return {
      id: record.id,
      workspaceId: record.generationJob.photoshoot.workspaceId,
    };
  }

  async recordFeedback(params: RecordImageFeedbackParams): Promise<void> {
    await this.client.imageFeedback.create({
      data: {
        id: params.id,
        generatedImageId: params.generatedImageId,
        workspaceId: params.workspaceId,
        userId: params.userId,
        rating: params.rating,
        reason: params.reason,
        comment: params.comment,
      },
    });
  }
}

export function getBetaRepository(): BetaRepository {
  const driver = resolveDbDriver();
  return driver === 'postgres' ? new PostgresBetaRepository() : new SqliteBetaRepository();
}
