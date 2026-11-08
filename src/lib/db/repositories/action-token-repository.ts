import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { resolveDbDriver } from '../driver.ts';
import { prisma, getDb } from '../prisma.ts';

export type ActionTokenType = 'EMAIL_VERIFY' | 'PASSWORD_RESET' | 'EMAIL_CHANGE';

export interface ActionTokenRecord {
  id: string;
  userId: string;
  type: ActionTokenType;
  tokenHash: string;
  targetEmail: string | null;
  expiresAt: string;
  consumedAt: string | null;
  revokedAt: string | null;
  createdIp: string | null;
  createdAt: string;
}

export interface IssueTokenParams {
  userId: string;
  type: ActionTokenType;
  tokenHash: string;
  targetEmail?: string | null;
  createdIp?: string | null;
  expiresAt: Date;
}

export interface ConsumeTokenParams {
  tokenHash: string;
  expectedType: ActionTokenType;
  now?: Date;
}

export interface ActionTokenRepository {
  issueToken(params: IssueTokenParams): Promise<ActionTokenRecord>;
  consumeToken(params: ConsumeTokenParams): Promise<ActionTokenRecord | null>;
  findActiveTokenByHash(tokenHash: string): Promise<ActionTokenRecord | null>;
  revokeActiveTokensForUser(
    userId: string,
    type: ActionTokenType,
    reason?: string
  ): Promise<number>;
}

export class SqliteActionTokenRepository implements ActionTokenRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async issueToken(params: IssueTokenParams): Promise<ActionTokenRecord> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const id = crypto.randomUUID();
    const expiresAtIso = params.expiresAt.toISOString();

    // Revoke prior active tokens of this type for this user
    db.prepare(
      `UPDATE "AuthActionToken"
       SET "revokedAt" = ?
       WHERE "userId" = ? AND "type" = ? AND "consumedAt" IS NULL AND "revokedAt" IS NULL`
    ).run(nowIso, params.userId, params.type);

    // Insert new token
    db.prepare(
      `INSERT INTO "AuthActionToken" (
         "id", "userId", "type", "tokenHash", "targetEmail",
         "expiresAt", "createdIp", "createdAt"
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      params.userId,
      params.type,
      params.tokenHash,
      params.targetEmail ?? null,
      expiresAtIso,
      params.createdIp ?? null,
      nowIso
    );

    return {
      id,
      userId: params.userId,
      type: params.type,
      tokenHash: params.tokenHash,
      targetEmail: params.targetEmail ?? null,
      expiresAt: expiresAtIso,
      consumedAt: null,
      revokedAt: null,
      createdIp: params.createdIp ?? null,
      createdAt: nowIso,
    };
  }

  async consumeToken(params: ConsumeTokenParams): Promise<ActionTokenRecord | null> {
    const db = this.getDb();
    const nowIso = (params.now ?? new Date()).toISOString();

    const row = db
      .prepare(
        `UPDATE "AuthActionToken"
         SET "consumedAt" = ?
         WHERE "tokenHash" = ?
           AND "type" = ?
           AND "consumedAt" IS NULL
           AND "revokedAt" IS NULL
           AND "expiresAt" > ?
         RETURNING *`
      )
      .get(nowIso, params.tokenHash, params.expectedType, nowIso) as
      | Record<string, unknown>
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      userId: String(row.userId),
      type: String(row.type) as ActionTokenType,
      tokenHash: String(row.tokenHash),
      targetEmail: row.targetEmail ? String(row.targetEmail) : null,
      expiresAt: String(row.expiresAt),
      consumedAt: row.consumedAt ? String(row.consumedAt) : null,
      revokedAt: row.revokedAt ? String(row.revokedAt) : null,
      createdIp: row.createdIp ? String(row.createdIp) : null,
      createdAt: String(row.createdAt),
    };
  }

  async findActiveTokenByHash(tokenHash: string): Promise<ActionTokenRecord | null> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();

    const row = db
      .prepare(
        `SELECT * FROM "AuthActionToken"
         WHERE "tokenHash" = ?
           AND "consumedAt" IS NULL
           AND "revokedAt" IS NULL
           AND "expiresAt" > ?`
      )
      .get(tokenHash, nowIso) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return {
      id: String(row.id),
      userId: String(row.userId),
      type: String(row.type) as ActionTokenType,
      tokenHash: String(row.tokenHash),
      targetEmail: row.targetEmail ? String(row.targetEmail) : null,
      expiresAt: String(row.expiresAt),
      consumedAt: row.consumedAt ? String(row.consumedAt) : null,
      revokedAt: row.revokedAt ? String(row.revokedAt) : null,
      createdIp: row.createdIp ? String(row.createdIp) : null,
      createdAt: String(row.createdAt),
    };
  }

  async revokeActiveTokensForUser(
    userId: string,
    type: ActionTokenType
  ): Promise<number> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const res = db
      .prepare(
        `UPDATE "AuthActionToken"
         SET "revokedAt" = ?
         WHERE "userId" = ? AND "type" = ? AND "consumedAt" IS NULL AND "revokedAt" IS NULL`
      )
      .run(nowIso, userId, type);

    return Number(res.changes);
  }
}

export class PostgresActionTokenRepository implements ActionTokenRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async issueToken(params: IssueTokenParams): Promise<ActionTokenRecord> {
    const now = new Date();
    const id = crypto.randomUUID();

    return this.client.$transaction(async (tx) => {
      await tx.authActionToken.updateMany({
        where: {
          userId: params.userId,
          type: params.type,
          consumedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      const created = await tx.authActionToken.create({
        data: {
          id,
          userId: params.userId,
          type: params.type,
          tokenHash: params.tokenHash,
          targetEmail: params.targetEmail ?? null,
          createdIp: params.createdIp ?? null,
          expiresAt: params.expiresAt,
          createdAt: now,
        },
      });

      return {
        id: created.id,
        userId: created.userId,
        type: created.type as ActionTokenType,
        tokenHash: created.tokenHash,
        targetEmail: created.targetEmail,
        expiresAt: created.expiresAt.toISOString(),
        consumedAt: null,
        revokedAt: null,
        createdIp: created.createdIp,
        createdAt: created.createdAt.toISOString(),
      };
    });
  }

  async consumeToken(params: ConsumeTokenParams): Promise<ActionTokenRecord | null> {
    const nowIso = (params.now ?? new Date()).toISOString();

    const rows = (await this.client.$queryRawUnsafe(
      `UPDATE "AuthActionToken"
       SET "consumedAt" = $1::timestamp
       WHERE "tokenHash" = $2
         AND "type" = $3::"AuthActionTokenType"
         AND "consumedAt" IS NULL
         AND "revokedAt" IS NULL
         AND "expiresAt" > $1::timestamp
       RETURNING *`,
      nowIso,
      params.tokenHash,
      params.expectedType
    )) as Array<{
      id: string;
      userId: string;
      type: string;
      tokenHash: string;
      targetEmail: string | null;
      expiresAt: Date;
      consumedAt: Date | null;
      revokedAt: Date | null;
      createdIp: string | null;
      createdAt: Date;
    }>;

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      id: row.id,
      userId: row.userId,
      type: row.type as ActionTokenType,
      tokenHash: row.tokenHash,
      targetEmail: row.targetEmail,
      expiresAt: row.expiresAt.toISOString(),
      consumedAt: row.consumedAt ? row.consumedAt.toISOString() : null,
      revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
      createdIp: row.createdIp,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async findActiveTokenByHash(tokenHash: string): Promise<ActionTokenRecord | null> {
    const now = new Date();
    const token = await this.client.authActionToken.findFirst({
      where: {
        tokenHash,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });

    if (!token) return null;

    return {
      id: token.id,
      userId: token.userId,
      type: token.type as ActionTokenType,
      tokenHash: token.tokenHash,
      targetEmail: token.targetEmail,
      expiresAt: token.expiresAt.toISOString(),
      consumedAt: null,
      revokedAt: null,
      createdIp: token.createdIp,
      createdAt: token.createdAt.toISOString(),
    };
  }

  async revokeActiveTokensForUser(
    userId: string,
    type: ActionTokenType
  ): Promise<number> {
    const res = await this.client.authActionToken.updateMany({
      where: {
        userId,
        type,
        consumedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return res.count;
  }
}

let sqliteActionTokenRepo: ActionTokenRepository | null = null;
let postgresActionTokenRepo: ActionTokenRepository | null = null;

export function getActionTokenRepository(): ActionTokenRepository {
  const driver = resolveDbDriver();
  if (driver === 'postgres') {
    if (!postgresActionTokenRepo) {
      postgresActionTokenRepo = new PostgresActionTokenRepository();
    }
    return postgresActionTokenRepo;
  }

  if (!sqliteActionTokenRepo) {
    sqliteActionTokenRepo = new SqliteActionTokenRepository();
  }
  return sqliteActionTokenRepo;
}
