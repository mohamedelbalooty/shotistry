import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { resolveDbDriver } from '../driver.ts';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import type { WorkspaceRole } from '../../types/index.ts';

export interface WorkspaceInviteRecord {
  id: string;
  workspaceId: string;
  invitedEmail: string;
  role: WorkspaceRole;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedByUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface CreateInviteParams {
  workspaceId: string;
  invitedEmail: string;
  role: WorkspaceRole;
  invitedByUserId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface WorkspaceInviteRepository {
  createInvite(params: CreateInviteParams): Promise<WorkspaceInviteRecord>;
  findInviteByTokenHash(tokenHash: string): Promise<WorkspaceInviteRecord | null>;
  findInviteById(inviteId: string): Promise<WorkspaceInviteRecord | null>;
  listPendingInvites(workspaceId: string): Promise<WorkspaceInviteRecord[]>;
  acceptInvite(
    inviteId: string,
    acceptedByUserId: string,
    now?: Date
  ): Promise<WorkspaceInviteRecord | null>;
  revokeInvite(inviteId: string, now?: Date): Promise<boolean>;
}

export class SqliteWorkspaceInviteRepository
  implements WorkspaceInviteRepository
{
  private getDb(): DatabaseSync {
    return getDb();
  }

  async createInvite(params: CreateInviteParams): Promise<WorkspaceInviteRecord> {
    const id = `inv-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();
    const expiresAtIso = params.expiresAt.toISOString();
    const normalizedEmail = params.invitedEmail.trim().toLowerCase();

    return withSerializableTransaction((txDb) => {
      // Revoke any prior pending invites for this workspace + email
      txDb
        .prepare(
          `UPDATE "WorkspaceInvite"
           SET "revokedAt" = ?
           WHERE "workspaceId" = ?
             AND LOWER("invitedEmail") = ?
             AND "acceptedAt" IS NULL
             AND "revokedAt" IS NULL`
        )
        .run(nowIso, params.workspaceId, normalizedEmail);

      txDb
        .prepare(
          `INSERT INTO "WorkspaceInvite" (
            "id", "workspaceId", "invitedEmail", "role", "invitedByUserId",
            "tokenHash", "expiresAt", "acceptedAt", "acceptedByUserId", "revokedAt", "createdAt"
          ) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`
        )
        .run(
          id,
          params.workspaceId,
          normalizedEmail,
          params.role,
          params.invitedByUserId,
          params.tokenHash,
          expiresAtIso,
          nowIso
        );

      const row = txDb
        .prepare(`SELECT * FROM "WorkspaceInvite" WHERE "id" = ?`)
        .get(id) as unknown as WorkspaceInviteRecord;

      return row;
    });
  }

  async findInviteByTokenHash(
    tokenHash: string
  ): Promise<WorkspaceInviteRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT * FROM "WorkspaceInvite" WHERE "tokenHash" = ?`)
      .get(tokenHash) as unknown as WorkspaceInviteRecord | undefined;
    return row ?? null;
  }

  async findInviteById(inviteId: string): Promise<WorkspaceInviteRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT * FROM "WorkspaceInvite" WHERE "id" = ?`)
      .get(inviteId) as unknown as WorkspaceInviteRecord | undefined;
    return row ?? null;
  }

  async listPendingInvites(
    workspaceId: string
  ): Promise<WorkspaceInviteRecord[]> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const rows = db
      .prepare(
        `SELECT * FROM "WorkspaceInvite"
         WHERE "workspaceId" = ?
           AND "acceptedAt" IS NULL
           AND "revokedAt" IS NULL
           AND "expiresAt" > ?
         ORDER BY "createdAt" DESC`
      )
      .all(workspaceId, nowIso) as unknown as WorkspaceInviteRecord[];
    return rows;
  }

  async acceptInvite(
    inviteId: string,
    acceptedByUserId: string,
    now = new Date()
  ): Promise<WorkspaceInviteRecord | null> {
    const nowIso = now.toISOString();

    return withSerializableTransaction((txDb) => {
      const res = txDb
        .prepare(
          `UPDATE "WorkspaceInvite"
           SET "acceptedAt" = ?, "acceptedByUserId" = ?
           WHERE "id" = ?
             AND "acceptedAt" IS NULL
             AND "revokedAt" IS NULL
             AND "expiresAt" > ?`
        )
        .run(nowIso, acceptedByUserId, inviteId, nowIso);

      if (res.changes === 0) {
        return null;
      }

      const row = txDb
        .prepare(`SELECT * FROM "WorkspaceInvite" WHERE "id" = ?`)
        .get(inviteId) as unknown as WorkspaceInviteRecord;

      return row;
    });
  }

  async revokeInvite(inviteId: string, now = new Date()): Promise<boolean> {
    const nowIso = now.toISOString();
    return withSerializableTransaction((txDb) => {
      const res = txDb
        .prepare(
          `UPDATE "WorkspaceInvite"
           SET "revokedAt" = ?
           WHERE "id" = ?
             AND "acceptedAt" IS NULL
             AND "revokedAt" IS NULL`
        )
        .run(nowIso, inviteId);
      return res.changes > 0;
    });
  }
}

export class PostgresWorkspaceInviteRepository
  implements WorkspaceInviteRepository
{
  private get client() {
    return prisma;
  }

  async createInvite(params: CreateInviteParams): Promise<WorkspaceInviteRecord> {
    const normalizedEmail = params.invitedEmail.trim().toLowerCase();
    const now = new Date();

    const created = await this.client.$transaction(async (tx) => {
      await tx.workspaceInvite.updateMany({
        where: {
          workspaceId: params.workspaceId,
          invitedEmail: { equals: normalizedEmail, mode: 'insensitive' },
          acceptedAt: null,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });

      return tx.workspaceInvite.create({
        data: {
          workspaceId: params.workspaceId,
          invitedEmail: normalizedEmail,
          role: params.role,
          invitedByUserId: params.invitedByUserId,
          tokenHash: params.tokenHash,
          expiresAt: params.expiresAt,
        },
      });
    });

    return {
      id: created.id,
      workspaceId: created.workspaceId,
      invitedEmail: created.invitedEmail,
      role: created.role as WorkspaceRole,
      invitedByUserId: created.invitedByUserId,
      tokenHash: created.tokenHash,
      expiresAt: created.expiresAt.toISOString(),
      acceptedAt: created.acceptedAt?.toISOString() ?? null,
      acceptedByUserId: created.acceptedByUserId,
      revokedAt: created.revokedAt?.toISOString() ?? null,
      createdAt: created.createdAt.toISOString(),
    };
  }

  async findInviteByTokenHash(
    tokenHash: string
  ): Promise<WorkspaceInviteRecord | null> {
    const row = await this.client.workspaceInvite.findUnique({
      where: { tokenHash },
    });
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      invitedEmail: row.invitedEmail,
      role: row.role as WorkspaceRole,
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      acceptedByUserId: row.acceptedByUserId,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findInviteById(inviteId: string): Promise<WorkspaceInviteRecord | null> {
    const row = await this.client.workspaceInvite.findUnique({
      where: { id: inviteId },
    });
    if (!row) return null;
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      invitedEmail: row.invitedEmail,
      role: row.role as WorkspaceRole,
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      acceptedByUserId: row.acceptedByUserId,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async listPendingInvites(
    workspaceId: string
  ): Promise<WorkspaceInviteRecord[]> {
    const rows = await this.client.workspaceInvite.findMany({
      where: {
        workspaceId,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      invitedEmail: row.invitedEmail,
      role: row.role as WorkspaceRole,
      invitedByUserId: row.invitedByUserId,
      tokenHash: row.tokenHash,
      expiresAt: row.expiresAt.toISOString(),
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      acceptedByUserId: row.acceptedByUserId,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async acceptInvite(
    inviteId: string,
    acceptedByUserId: string,
    now = new Date()
  ): Promise<WorkspaceInviteRecord | null> {
    return this.client.$transaction(async (tx) => {
      const updated = await tx.workspaceInvite.updateMany({
        where: {
          id: inviteId,
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: {
          acceptedAt: now,
          acceptedByUserId,
        },
      });

      if (updated.count === 0) {
        return null;
      }

      const row = await tx.workspaceInvite.findUnique({
        where: { id: inviteId },
      });
      if (!row) return null;

      return {
        id: row.id,
        workspaceId: row.workspaceId,
        invitedEmail: row.invitedEmail,
        role: row.role as WorkspaceRole,
        invitedByUserId: row.invitedByUserId,
        tokenHash: row.tokenHash,
        expiresAt: row.expiresAt.toISOString(),
        acceptedAt: row.acceptedAt?.toISOString() ?? null,
        acceptedByUserId: row.acceptedByUserId,
        revokedAt: row.revokedAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  async revokeInvite(inviteId: string, now = new Date()): Promise<boolean> {
    const res = await this.client.workspaceInvite.updateMany({
      where: {
        id: inviteId,
        acceptedAt: null,
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    return res.count > 0;
  }
}

export function getWorkspaceInviteRepository(): WorkspaceInviteRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresWorkspaceInviteRepository()
    : new SqliteWorkspaceInviteRepository();
}
