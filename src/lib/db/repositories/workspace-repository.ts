import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';
import type { WorkspaceRole } from '../../types/index.ts';

export interface StudioJobSnapshot {
  jobId: string;
  status: string;
  modelUsed: string;
  creditCost: number;
  synthesizedPrompt: string;
  createdAt: string;
  completedAt: string | null;
  productTitle: string;
  stylePreset: string;
  aspectRatio: string;
  imageUrl: string | null;
  resolution: string | null;
  synthIdDetected: boolean;
  fidelityScore: number;
  executionMode: string;
}

export interface WorkspaceMemberInfo {
  id: string;
  role: WorkspaceRole;
}

export interface WorkspaceMemberListRow {
  id: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
  email: string;
  name: string | null;
}

export interface WorkspaceRepository {
  getWorkspaceStudioSnapshot(workspaceId: string, limit?: number): Promise<StudioJobSnapshot[]>;
  getWorkspaceMember(workspaceId: string, userId: string): Promise<WorkspaceMemberInfo | null>;
  listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberListRow[]>;
  findWorkspaceOwner(
    workspaceId: string
  ): Promise<{ id: string; name: string; ownerId: string } | null>;
  updateWorkspaceMemberRole(memberId: string, role: WorkspaceRole): Promise<void>;
  addWorkspaceMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<string>;
}

export class SqliteWorkspaceRepository implements WorkspaceRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async getWorkspaceStudioSnapshot(
    workspaceId: string,
    limit = 20
  ): Promise<StudioJobSnapshot[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT j."id" AS "jobId",
                j."status",
                j."modelUsed",
                j."creditCost",
                j."synthesizedPrompt",
                j."createdAt",
                j."completedAt",
                p."title" AS "productTitle",
                p."stylePreset",
                p."aspectRatio",
                img."imageUrl",
                img."resolution",
                img."synthIdDetected",
                img."fidelityScore",
                img."executionMode"
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         LEFT JOIN "GeneratedImage" img ON img."generationJobId" = j."id"
         WHERE p."workspaceId" = ?
         ORDER BY j."createdAt" DESC
         LIMIT ?`
      )
      .all(workspaceId, limit) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      jobId: String(row.jobId),
      status: String(row.status),
      modelUsed: String(row.modelUsed),
      creditCost: Number(row.creditCost),
      synthesizedPrompt: String(row.synthesizedPrompt),
      createdAt: String(row.createdAt),
      completedAt: row.completedAt ? String(row.completedAt) : null,
      productTitle: String(row.productTitle),
      stylePreset: String(row.stylePreset),
      aspectRatio: String(row.aspectRatio),
      imageUrl: row.imageUrl ? String(row.imageUrl) : null,
      resolution: row.resolution ? String(row.resolution) : null,
      synthIdDetected: Boolean(row.synthIdDetected),
      fidelityScore: Number(row.fidelityScore ?? 1.0),
      executionMode: String(row.executionMode || 'LIVE_GEMINI_API'),
    }));
  }

  async getWorkspaceMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberInfo | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT "id", "role" FROM "WorkspaceMember" WHERE "workspaceId" = ? AND "userId" = ?`
      )
      .get(workspaceId, userId) as { id: string; role: string } | undefined;

    if (!row) return null;
    const rawRole = String(row.role || 'MEMBER').toUpperCase();
    const role: WorkspaceRole =
      rawRole === 'OWNER' || rawRole === 'ADMIN' || rawRole === 'VIEWER'
        ? (rawRole as WorkspaceRole)
        : 'MEMBER';
    return { id: row.id, role };
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberListRow[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT wm."id", wm."userId", wm."role", wm."createdAt", u."email", u."name"
         FROM "WorkspaceMember" wm
         JOIN "User" u ON u."id" = wm."userId"
         WHERE wm."workspaceId" = ?
         ORDER BY wm."createdAt" ASC`
      )
      .all(workspaceId) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const rawRole = String(row.role || 'MEMBER').toUpperCase();
      const role: WorkspaceRole =
        rawRole === 'OWNER' || rawRole === 'ADMIN' || rawRole === 'VIEWER'
          ? (rawRole as WorkspaceRole)
          : 'MEMBER';
      return {
        id: String(row.id),
        userId: String(row.userId),
        role,
        createdAt: String(row.createdAt),
        email: String(row.email),
        name: row.name ? String(row.name) : null,
      };
    });
  }

  async findWorkspaceOwner(
    workspaceId: string
  ): Promise<{ id: string; name: string; ownerId: string } | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT "id", "name", "ownerId" FROM "Workspace" WHERE "id" = ?`)
      .get(workspaceId) as { id: string; name: string; ownerId: string } | undefined;
    return row ?? null;
  }

  async updateWorkspaceMemberRole(memberId: string, role: WorkspaceRole): Promise<void> {
    const db = this.getDb();
    db.prepare(`UPDATE "WorkspaceMember" SET "role" = ? WHERE "id" = ?`).run(role, memberId);
  }

  async addWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<string> {
    const id = `wm-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    return withSerializableTransaction((db) => {
      db.prepare(
        `INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, workspaceId, userId, role, now);
      return id;
    });
  }
}

export class PostgresWorkspaceRepository implements WorkspaceRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async getWorkspaceStudioSnapshot(
    workspaceId: string,
    limit = 20
  ): Promise<StudioJobSnapshot[]> {
    const jobs = await this.client.generationJob.findMany({
      where: { photoshoot: { workspaceId } },
      include: {
        photoshoot: true,
        images: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return jobs.map((job) => {
      const img = job.images[0] ?? null;
      return {
        jobId: job.id,
        status: job.status,
        modelUsed: job.modelUsed,
        creditCost: job.creditCost,
        synthesizedPrompt: job.synthesizedPrompt,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt ? job.completedAt.toISOString() : null,
        productTitle: job.photoshoot.title,
        stylePreset: job.photoshoot.stylePreset,
        aspectRatio: job.photoshoot.aspectRatio,
        imageUrl: img ? img.imageUrl : null,
        resolution: img ? img.resolution : null,
        synthIdDetected: img ? img.synthIdDetected : false,
        fidelityScore: img ? img.fidelityScore : 1.0,
        executionMode: img ? img.executionMode : 'LIVE_GEMINI_API',
      };
    });
  }

  async getWorkspaceMember(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMemberInfo | null> {
    const member = await this.client.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { id: true, role: true },
    });
    if (!member) return null;
    return {
      id: member.id,
      role: member.role as WorkspaceRole,
    };
  }

  async listWorkspaceMembers(workspaceId: string): Promise<WorkspaceMemberListRow[]> {
    const members = await this.client.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { email: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      id: m.id,
      userId: m.userId,
      role: m.role as WorkspaceRole,
      createdAt: m.createdAt.toISOString(),
      email: m.user.email,
      name: m.user.name,
    }));
  }

  async findWorkspaceOwner(
    workspaceId: string
  ): Promise<{ id: string; name: string; ownerId: string } | null> {
    const ws = await this.client.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true, ownerId: true },
    });
    return ws;
  }

  async updateWorkspaceMemberRole(memberId: string, role: WorkspaceRole): Promise<void> {
    await this.client.workspaceMember.update({
      where: { id: memberId },
      data: { role },
    });
  }

  async addWorkspaceMember(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole
  ): Promise<string> {
    const member = await this.client.workspaceMember.create({
      data: {
        workspaceId,
        userId,
        role,
      },
    });
    return member.id;
  }
}

export function getWorkspaceRepository(): WorkspaceRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresWorkspaceRepository()
    : new SqliteWorkspaceRepository();
}
