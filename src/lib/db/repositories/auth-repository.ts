import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';
import type { PlatformRole, WorkspaceRole, Country } from '../../types/index.ts';
import type {
  SessionRecord,
  WorkspaceMembershipSummary,
  UserSessionSummary,
} from '../../auth/session.ts';

export interface UserAuthRecord {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  passwordHash: string | null;
  role: PlatformRole;
  country: Country;
  locale: 'ar' | 'en';
  emailVerifiedAt: string | null;
  trialGrantedAt: string | null;
  passwordUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolvedSessionRow {
  sessionId: string;
  userId: string;
  activeWorkspaceId: string | null;
  csrfToken: string;
  idleExpiresAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  email: string;
  name: string | null;
  phone: string | null;
  userRole: PlatformRole;
  userCountry: Country;
  userLocale: 'ar' | 'en';
  emailVerifiedAt: string | null;
  userCreatedAt: string;
}

export interface CreateSessionRecordParams {
  id: string;
  userId: string;
  activeWorkspaceId?: string | null;
  tokenHash: string;
  csrfToken: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  nowIso: string;
  idleExpiresAt: string;
  expiresAt: string;
  rotateFromTokenHash?: string | null;
}

export interface CreatePrivilegedUserInput {
  userId: string;
  email: string;
  name: string;
  passwordHash: string;
  role: 'ADMIN' | 'SUPPORT';
  auditLogId: string;
  auditDetails?: string;
}

export interface AuthRepository {
  findUserByEmail(email: string): Promise<UserAuthRecord | null>;
  findUserById(id: string): Promise<UserAuthRecord | null>;
  createSession(params: CreateSessionRecordParams): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string): Promise<ResolvedSessionRow | null>;
  touchSession(sessionId: string, lastActivityAt: string, idleExpiresAt: string): Promise<void>;
  revokeSessionByTokenHash(tokenHash: string, reason: string): Promise<boolean>;
  revokeSessionById(sessionId: string, userId: string, reason: string): Promise<boolean>;
  revokeAllUserSessions(userId: string, reason: string, exceptSessionId?: string): Promise<number>;
  listActiveSessions(userId: string, currentSessionId?: string): Promise<UserSessionSummary[]>;
  setActiveWorkspace(sessionId: string, userId: string, workspaceId: string): Promise<void>;
  getWorkspacesForUser(userId: string): Promise<WorkspaceMembershipSummary[]>;
  updatePasswordHash(
    userId: string,
    newHash: string,
    options?: {
      bumpPasswordUpdatedAt?: boolean;
      revokeSessionsReason?: string;
      exceptSessionId?: string;
    }
  ): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
  updateUserEmail(userId: string, newEmail: string): Promise<void>;
  countAdmins(): Promise<number>;
  createPrivilegedUser(input: CreatePrivilegedUserInput): Promise<{
    userId: string;
    email: string;
    role: 'ADMIN' | 'SUPPORT';
    auditLogId: string;
  }>;
  insertAuditLog(params: {
    id: string;
    userId: string;
    action: string;
    targetId?: string | null;
    details?: string | null;
    ipAddress?: string | null;
    createdAt: string;
  }): Promise<void>;
}

export class SqliteAuthRepository implements AuthRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async findUserByEmail(email: string): Promise<UserAuthRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT "id", "email", "name", "phone", "passwordHash", "role",
                "country", "locale", "emailVerifiedAt", "trialGrantedAt",
                "passwordUpdatedAt", "createdAt", "updatedAt"
         FROM "User"
         WHERE LOWER("email") = LOWER(?)`
      )
      .get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.mapUserRow(row);
  }

  async findUserById(id: string): Promise<UserAuthRecord | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT "id", "email", "name", "phone", "passwordHash", "role",
                "country", "locale", "emailVerifiedAt", "trialGrantedAt",
                "passwordUpdatedAt", "createdAt", "updatedAt"
         FROM "User"
         WHERE "id" = ?`
      )
      .get(id) as Record<string, unknown> | undefined;

    if (!row) return null;
    return this.mapUserRow(row);
  }

  private mapUserRow(row: Record<string, unknown>): UserAuthRecord {
    const rawRole = String(row.role || 'USER').toUpperCase();
    const role: PlatformRole =
      rawRole === 'ADMIN' || rawRole === 'SUPPORT' ? (rawRole as PlatformRole) : 'USER';
    return {
      id: String(row.id),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      phone: row.phone ? String(row.phone) : null,
      passwordHash: row.passwordHash ? String(row.passwordHash) : null,
      role,
      country: String(row.country || 'EG').toUpperCase() === 'SA' ? 'SA' : 'EG',
      locale: String(row.locale || 'ar') === 'en' ? 'en' : 'ar',
      emailVerifiedAt: row.emailVerifiedAt ? String(row.emailVerifiedAt) : null,
      trialGrantedAt: row.trialGrantedAt ? String(row.trialGrantedAt) : null,
      passwordUpdatedAt: row.passwordUpdatedAt ? String(row.passwordUpdatedAt) : null,
      createdAt: String(row.createdAt),
      updatedAt: String(row.updatedAt),
    };
  }

  async createSession(params: CreateSessionRecordParams): Promise<SessionRecord> {
    await withSerializableTransaction((db) => {
      if (params.rotateFromTokenHash) {
        db.prepare(
          `UPDATE "Session"
           SET "revokedAt" = ?, "revokedReason" = 'ROTATED_ON_AUTH'
           WHERE "tokenHash" = ? AND "revokedAt" IS NULL`
        ).run(params.nowIso, params.rotateFromTokenHash);
      }

      db.prepare(
        `INSERT INTO "Session" (
           "id", "userId", "activeWorkspaceId", "tokenHash", "csrfToken",
           "userAgent", "ipAddress", "createdAt", "lastActivityAt",
           "idleExpiresAt", "expiresAt", "revokedAt", "revokedReason"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
      ).run(
        params.id,
        params.userId,
        params.activeWorkspaceId ?? null,
        params.tokenHash,
        params.csrfToken,
        params.userAgent ? params.userAgent.slice(0, 512) : null,
        params.ipAddress ? params.ipAddress.slice(0, 128) : null,
        params.nowIso,
        params.nowIso,
        params.idleExpiresAt,
        params.expiresAt
      );
    });

    return {
      id: params.id,
      userId: params.userId,
      activeWorkspaceId: params.activeWorkspaceId ?? null,
      csrfToken: params.csrfToken,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      createdAt: params.nowIso,
      lastActivityAt: params.nowIso,
      idleExpiresAt: params.idleExpiresAt,
      expiresAt: params.expiresAt,
      revokedAt: null,
      revokedReason: null,
    };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<ResolvedSessionRow | null> {
    const db = this.getDb();
    const row = db
      .prepare(
        `SELECT s."id" AS "sessionId",
                s."userId",
                s."activeWorkspaceId",
                s."csrfToken",
                s."idleExpiresAt",
                s."expiresAt",
                s."revokedAt",
                s."revokedReason",
                u."email",
                u."name",
                u."phone",
                u."role" AS "userRole",
                u."country" AS "userCountry",
                u."locale" AS "userLocale",
                u."emailVerifiedAt",
                u."createdAt" AS "userCreatedAt"
         FROM "Session" s
         JOIN "User" u ON u."id" = s."userId"
         WHERE s."tokenHash" = ?`
      )
      .get(tokenHash) as Record<string, unknown> | undefined;

    if (!row) return null;

    const rawRole = String(row.userRole || 'USER').toUpperCase();
    const userRole: PlatformRole =
      rawRole === 'ADMIN' || rawRole === 'SUPPORT' ? (rawRole as PlatformRole) : 'USER';

    return {
      sessionId: String(row.sessionId),
      userId: String(row.userId),
      activeWorkspaceId: row.activeWorkspaceId ? String(row.activeWorkspaceId) : null,
      csrfToken: String(row.csrfToken),
      idleExpiresAt: String(row.idleExpiresAt),
      expiresAt: String(row.expiresAt),
      revokedAt: row.revokedAt ? String(row.revokedAt) : null,
      revokedReason: row.revokedReason ? String(row.revokedReason) : null,
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      phone: row.phone ? String(row.phone) : null,
      userRole,
      userCountry: String(row.userCountry || 'EG').toUpperCase() === 'SA' ? 'SA' : 'EG',
      userLocale: String(row.userLocale || 'ar') === 'en' ? 'en' : 'ar',
      emailVerifiedAt: row.emailVerifiedAt ? String(row.emailVerifiedAt) : null,
      userCreatedAt: String(row.userCreatedAt),
    };
  }

  async touchSession(
    sessionId: string,
    lastActivityAt: string,
    idleExpiresAt: string
  ): Promise<void> {
    const db = this.getDb();
    db.prepare(
      `UPDATE "Session" SET "lastActivityAt" = ?, "idleExpiresAt" = ? WHERE "id" = ?`
    ).run(lastActivityAt, idleExpiresAt, sessionId);
  }

  async revokeSessionByTokenHash(tokenHash: string, reason: string): Promise<boolean> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const res = db
      .prepare(
        `UPDATE "Session"
         SET "revokedAt" = ?, "revokedReason" = ?
         WHERE "tokenHash" = ? AND "revokedAt" IS NULL`
      )
      .run(nowIso, reason, tokenHash);
    return res.changes > 0;
  }

  async revokeSessionById(sessionId: string, userId: string, reason: string): Promise<boolean> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const res = db
      .prepare(
        `UPDATE "Session"
         SET "revokedAt" = ?, "revokedReason" = ?
         WHERE "id" = ? AND "userId" = ? AND "revokedAt" IS NULL`
      )
      .run(nowIso, reason, sessionId, userId);
    return res.changes > 0;
  }

  async revokeAllUserSessions(
    userId: string,
    reason: string,
    exceptSessionId?: string
  ): Promise<number> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    if (exceptSessionId) {
      const res = db
        .prepare(
          `UPDATE "Session"
           SET "revokedAt" = ?, "revokedReason" = ?
           WHERE "userId" = ? AND "id" != ? AND "revokedAt" IS NULL`
        )
        .run(nowIso, reason, userId, exceptSessionId);
      return Number(res.changes);
    }
    const res = db
      .prepare(
        `UPDATE "Session"
         SET "revokedAt" = ?, "revokedReason" = ?
         WHERE "userId" = ? AND "revokedAt" IS NULL`
      )
      .run(nowIso, reason, userId);
    return Number(res.changes);
  }

  async listActiveSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<UserSessionSummary[]> {
    const db = this.getDb();
    const nowIso = new Date().toISOString();
    const rows = db
      .prepare(
        `SELECT "id", "activeWorkspaceId", "userAgent", "ipAddress",
                "createdAt", "lastActivityAt", "idleExpiresAt", "expiresAt"
         FROM "Session"
         WHERE "userId" = ?
           AND "revokedAt" IS NULL
           AND "expiresAt" > ?
           AND "idleExpiresAt" > ?
         ORDER BY "lastActivityAt" DESC`
      )
      .all(userId, nowIso, nowIso) as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: String(row.id),
      activeWorkspaceId: row.activeWorkspaceId ? String(row.activeWorkspaceId) : null,
      userAgent: row.userAgent ? String(row.userAgent) : null,
      ipAddress: row.ipAddress ? String(row.ipAddress) : null,
      createdAt: String(row.createdAt),
      lastActivityAt: String(row.lastActivityAt),
      idleExpiresAt: String(row.idleExpiresAt),
      expiresAt: String(row.expiresAt),
      isCurrent: String(row.id) === currentSessionId,
    }));
  }

  async setActiveWorkspace(
    sessionId: string,
    userId: string,
    workspaceId: string
  ): Promise<void> {
    const db = this.getDb();
    db.prepare(
      `UPDATE "Session" SET "activeWorkspaceId" = ? WHERE "id" = ? AND "userId" = ?`
    ).run(workspaceId, sessionId, userId);
  }

  async getWorkspacesForUser(userId: string): Promise<WorkspaceMembershipSummary[]> {
    const db = this.getDb();
    const rows = db
      .prepare(
        `SELECT wm."workspaceId",
                wm."role" AS "memberRole",
                w."name" AS "workspaceName",
                w."slug",
                w."country",
                w."currency",
                s."planTier",
                s."status" AS "subscriptionStatus",
                COALESCE((SELECT SUM(l."amount") FROM "CreditLedger" l WHERE l."workspaceId" = w."id"), 0) AS "settledBalance",
                COALESCE((SELECT SUM(r."amount") FROM "CreditReservation" r WHERE r."workspaceId" = w."id" AND r."status" = 'PENDING'), 0) AS "reservedCredits"
         FROM "WorkspaceMember" wm
         JOIN "Workspace" w ON w."id" = wm."workspaceId"
         LEFT JOIN "Subscription" s ON s."workspaceId" = w."id"
         WHERE wm."userId" = ?
         ORDER BY wm."createdAt" ASC`
      )
      .all(userId) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const rawRole = String(row.memberRole || 'MEMBER').toUpperCase();
      const role: WorkspaceRole =
        rawRole === 'OWNER' || rawRole === 'ADMIN' || rawRole === 'VIEWER'
          ? (rawRole as WorkspaceRole)
          : 'MEMBER';
      const settled = Number(row.settledBalance ?? 0);
      const reserved = Number(row.reservedCredits ?? 0);
      return {
        workspaceId: String(row.workspaceId),
        workspaceName: String(row.workspaceName || 'Workspace'),
        slug: String(row.slug || row.workspaceId),
        role,
        country: String(row.country || 'EG').toUpperCase() === 'SA' ? 'SA' : 'EG',
        currency: String(row.currency || 'EGP'),
        planTier: String(row.planTier || 'FREE'),
        subscriptionStatus: String(row.subscriptionStatus || 'ACTIVE'),
        availableCredits: settled - reserved,
      };
    });
  }

  async updatePasswordHash(
    userId: string,
    newHash: string,
    options?: {
      bumpPasswordUpdatedAt?: boolean;
      revokeSessionsReason?: string;
      exceptSessionId?: string;
    }
  ): Promise<void> {
    const nowIso = new Date().toISOString();
    await withSerializableTransaction((txDb) => {
      if (options?.bumpPasswordUpdatedAt) {
        txDb
          .prepare(
            `UPDATE "User"
             SET "passwordHash" = ?, "passwordUpdatedAt" = ?, "updatedAt" = ?
             WHERE "id" = ?`
          )
          .run(newHash, nowIso, nowIso, userId);
      } else {
        txDb
          .prepare(
            `UPDATE "User"
             SET "passwordHash" = ?, "updatedAt" = ?
             WHERE "id" = ?`
          )
          .run(newHash, nowIso, userId);
      }

      if (options?.revokeSessionsReason) {
        if (options.exceptSessionId) {
          txDb
            .prepare(
              `UPDATE "Session"
               SET "revokedAt" = ?, "revokedReason" = ?
               WHERE "userId" = ? AND "id" != ? AND "revokedAt" IS NULL`
            )
            .run(nowIso, options.revokeSessionsReason, userId, options.exceptSessionId);
        } else {
          txDb
            .prepare(
              `UPDATE "Session"
               SET "revokedAt" = ?, "revokedReason" = ?
               WHERE "userId" = ? AND "revokedAt" IS NULL`
            )
            .run(nowIso, options.revokeSessionsReason, userId);
        }
      }
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const db = this.getDb();
    db.prepare(`UPDATE "User" SET "emailVerifiedAt" = ?, "updatedAt" = ? WHERE "id" = ?`).run(
      nowIso,
      nowIso,
      userId
    );
  }

  async updateUserEmail(userId: string, newEmail: string): Promise<void> {
    const nowIso = new Date().toISOString();
    const db = this.getDb();
    const normalized = newEmail.trim().toLowerCase();
    db.prepare(
      `UPDATE "User"
       SET "email" = ?, "emailVerifiedAt" = ?, "updatedAt" = ?
       WHERE "id" = ?`
    ).run(normalized, nowIso, nowIso, userId);
  }

  async countAdmins(): Promise<number> {
    const db = this.getDb();
    const row = db
      .prepare(`SELECT COUNT(*) as count FROM "User" WHERE "role" = 'ADMIN'`)
      .get() as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }

  async createPrivilegedUser(input: CreatePrivilegedUserInput): Promise<{
    userId: string;
    email: string;
    role: 'ADMIN' | 'SUPPORT';
    auditLogId: string;
  }> {
    const now = new Date().toISOString();
    return withSerializableTransaction((db) => {
      const existingAdmin =
        input.role === 'ADMIN'
          ? (db
              .prepare(`SELECT "id" FROM "User" WHERE "role" = 'ADMIN' LIMIT 1`)
              .get() as { id: string } | undefined)
          : undefined;

      if (existingAdmin) {
        throw new Error(
          'ADMIN_ALREADY_BOOTSTRAPPED: Initial platform administrator already exists'
        );
      }

      const emailTaken = db
        .prepare(`SELECT "id" FROM "User" WHERE LOWER("email") = LOWER(?)`)
        .get(input.email) as { id: string } | undefined;

      if (emailTaken) {
        throw new Error('CONFLICT: Account with this email already exists');
      }

      db.prepare(
        `INSERT INTO "User" (
           "id", "email", "name", "passwordHash", "role", "country", "locale",
           "emailVerifiedAt", "passwordUpdatedAt", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, 'SA', 'en', ?, ?, ?, ?)`
      ).run(
        input.userId,
        input.email,
        input.name,
        input.passwordHash,
        input.role,
        now,
        now,
        now,
        now
      );

      db.prepare(
        `INSERT INTO "AdminAuditLog" ("id", "userId", "action", "targetId", "details", "ipAddress", "createdAt")
         VALUES (?, ?, ?, ?, ?, 'cli-bootstrap', ?)`
      ).run(
        input.auditLogId,
        input.userId,
        input.role === 'ADMIN' ? 'PLATFORM_ADMIN_BOOTSTRAP' : 'SUPPORT_OPERATOR_CREATED',
        input.userId,
        input.auditDetails ?? JSON.stringify({ email: input.email, role: input.role }),
        now
      );

      return {
        userId: input.userId,
        email: input.email,
        role: input.role,
        auditLogId: input.auditLogId,
      };
    });
  }

  async insertAuditLog(params: {
    id: string;
    userId: string;
    action: string;
    targetId?: string | null;
    details?: string | null;
    ipAddress?: string | null;
    createdAt: string;
  }): Promise<void> {
    const db = this.getDb();
    db.prepare(
      `INSERT INTO "AdminAuditLog" ("id", "userId", "action", "targetId", "details", "ipAddress", "createdAt")
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      params.id,
      params.userId,
      params.action,
      params.targetId ?? null,
      params.details ?? null,
      params.ipAddress ?? null,
      params.createdAt
    );
  }
}

export class PostgresAuthRepository implements AuthRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async findUserByEmail(email: string): Promise<UserAuthRecord | null> {
    const user = await this.client.user.findFirst({
      where: { email: { equals: email.trim().toLowerCase(), mode: 'insensitive' } },
    });
    if (!user) return null;
    return this.mapPrismaUser(user);
  }

  async findUserById(id: string): Promise<UserAuthRecord | null> {
    const user = await this.client.user.findUnique({
      where: { id },
    });
    if (!user) return null;
    return this.mapPrismaUser(user);
  }

  private mapPrismaUser(user: any): UserAuthRecord {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      passwordHash: user.passwordHash,
      role: user.role as PlatformRole,
      country: user.country === 'SA' ? 'SA' : 'EG',
      locale: user.locale === 'en' ? 'en' : 'ar',
      emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
      trialGrantedAt: user.trialGrantedAt ? user.trialGrantedAt.toISOString() : null,
      passwordUpdatedAt: user.passwordUpdatedAt ? user.passwordUpdatedAt.toISOString() : null,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  async createSession(params: CreateSessionRecordParams): Promise<SessionRecord> {
    const expiresAtDate = new Date(params.expiresAt);
    const idleExpiresAtDate = new Date(params.idleExpiresAt);
    const now = new Date(params.nowIso);

    await this.client.$transaction(
      async (tx) => {
        if (params.rotateFromTokenHash) {
          await tx.session.updateMany({
            where: {
              tokenHash: params.rotateFromTokenHash,
              revokedAt: null,
            },
            data: {
              revokedAt: now,
              revokedReason: 'ROTATED_ON_AUTH',
            },
          });
        }

        await tx.session.create({
          data: {
            id: params.id,
            userId: params.userId,
            activeWorkspaceId: params.activeWorkspaceId ?? null,
            tokenHash: params.tokenHash,
            csrfToken: params.csrfToken,
            userAgent: params.userAgent ? params.userAgent.slice(0, 512) : null,
            ipAddress: params.ipAddress ? params.ipAddress.slice(0, 128) : null,
            createdAt: now,
            lastActivityAt: now,
            idleExpiresAt: idleExpiresAtDate,
            expiresAt: expiresAtDate,
          },
        });
      },
      {
        maxWait: Number(process.env.PRISMA_TX_MAX_WAIT || 30000),
        timeout: Number(process.env.PRISMA_TX_TIMEOUT || 60000),
      }
    );

    return {
      id: params.id,
      userId: params.userId,
      activeWorkspaceId: params.activeWorkspaceId ?? null,
      csrfToken: params.csrfToken,
      userAgent: params.userAgent ?? null,
      ipAddress: params.ipAddress ?? null,
      createdAt: params.nowIso,
      lastActivityAt: params.nowIso,
      idleExpiresAt: params.idleExpiresAt,
      expiresAt: params.expiresAt,
      revokedAt: null,
      revokedReason: null,
    };
  }

  async findSessionByTokenHash(tokenHash: string): Promise<ResolvedSessionRow | null> {
    const session = await this.client.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session || !session.user) return null;

    return {
      sessionId: session.id,
      userId: session.userId,
      activeWorkspaceId: session.activeWorkspaceId,
      csrfToken: session.csrfToken,
      idleExpiresAt: session.idleExpiresAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      revokedAt: session.revokedAt ? session.revokedAt.toISOString() : null,
      revokedReason: session.revokedReason,
      email: session.user.email,
      name: session.user.name,
      phone: session.user.phone,
      userRole: session.user.role as PlatformRole,
      userCountry: session.user.country === 'SA' ? 'SA' : 'EG',
      userLocale: session.user.locale === 'en' ? 'en' : 'ar',
      emailVerifiedAt: session.user.emailVerifiedAt ? session.user.emailVerifiedAt.toISOString() : null,
      userCreatedAt: session.user.createdAt.toISOString(),
    };
  }

  async touchSession(
    sessionId: string,
    lastActivityAt: string,
    idleExpiresAt: string
  ): Promise<void> {
    await this.client.session.update({
      where: { id: sessionId },
      data: {
        lastActivityAt: new Date(lastActivityAt),
        idleExpiresAt: new Date(idleExpiresAt),
      },
    });
  }

  async revokeSessionByTokenHash(tokenHash: string, reason: string): Promise<boolean> {
    const res = await this.client.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
    return res.count > 0;
  }

  async revokeSessionById(sessionId: string, userId: string, reason: string): Promise<boolean> {
    const res = await this.client.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
    return res.count > 0;
  }

  async revokeAllUserSessions(
    userId: string,
    reason: string,
    exceptSessionId?: string
  ): Promise<number> {
    const where: any = { userId, revokedAt: null };
    if (exceptSessionId) {
      where.id = { not: exceptSessionId };
    }
    const res = await this.client.session.updateMany({
      where,
      data: {
        revokedAt: new Date(),
        revokedReason: reason,
      },
    });
    return res.count;
  }

  async listActiveSessions(
    userId: string,
    currentSessionId?: string
  ): Promise<UserSessionSummary[]> {
    const now = new Date();
    const rows = await this.client.session.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        idleExpiresAt: { gt: now },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    return rows.map((row) => ({
      id: row.id,
      activeWorkspaceId: row.activeWorkspaceId,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: row.createdAt.toISOString(),
      lastActivityAt: row.lastActivityAt.toISOString(),
      idleExpiresAt: row.idleExpiresAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      isCurrent: row.id === currentSessionId,
    }));
  }

  async setActiveWorkspace(
    sessionId: string,
    userId: string,
    workspaceId: string
  ): Promise<void> {
    await this.client.session.updateMany({
      where: { id: sessionId, userId },
      data: { activeWorkspaceId: workspaceId },
    });
  }

  async getWorkspacesForUser(userId: string): Promise<WorkspaceMembershipSummary[]> {
    const members = await this.client.workspaceMember.findMany({
      where: { userId },
      include: {
        workspace: {
          include: {
            subscription: true,
            creditLedgers: { select: { amount: true } },
            reservations: {
              where: { status: 'PENDING' },
              select: { amount: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => {
      const ws = m.workspace;
      const settled = ws.creditLedgers.reduce((acc, cur) => acc + cur.amount, 0);
      const reserved = ws.reservations.reduce((acc, cur) => acc + cur.amount, 0);
      return {
        workspaceId: ws.id,
        workspaceName: ws.name,
        slug: ws.slug,
        role: m.role as WorkspaceRole,
        country: ws.country === 'SA' ? 'SA' : 'EG',
        currency: ws.currency,
        planTier: ws.subscription?.planTier ?? 'FREE',
        subscriptionStatus: ws.subscription?.status ?? 'ACTIVE',
        availableCredits: settled - reserved,
      };
    });
  }

  async updatePasswordHash(
    userId: string,
    newHash: string,
    options?: {
      bumpPasswordUpdatedAt?: boolean;
      revokeSessionsReason?: string;
      exceptSessionId?: string;
    }
  ): Promise<void> {
    const now = new Date();
    await this.client.$transaction(
      async (tx) => {
        const data: any = { passwordHash: newHash };
        if (options?.bumpPasswordUpdatedAt) {
          data.passwordUpdatedAt = now;
        }
        await tx.user.update({
          where: { id: userId },
          data,
        });

        if (options?.revokeSessionsReason) {
          const where: any = { userId, revokedAt: null };
          if (options.exceptSessionId) {
            where.id = { not: options.exceptSessionId };
          }
          await tx.session.updateMany({
            where,
            data: {
              revokedAt: now,
              revokedReason: options.revokeSessionsReason,
            },
          });
        }
      },
      {
        maxWait: Number(process.env.PRISMA_TX_MAX_WAIT || 30000),
        timeout: Number(process.env.PRISMA_TX_TIMEOUT || 60000),
      }
    );
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.client.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async updateUserEmail(userId: string, newEmail: string): Promise<void> {
    const normalized = newEmail.trim().toLowerCase();
    await this.client.user.update({
      where: { id: userId },
      data: {
        email: normalized,
        emailVerifiedAt: new Date(),
      },
    });
  }

  async countAdmins(): Promise<number> {
    return this.client.user.count({ where: { role: 'ADMIN' } });
  }

  async createPrivilegedUser(input: CreatePrivilegedUserInput): Promise<{
    userId: string;
    email: string;
    role: 'ADMIN' | 'SUPPORT';
    auditLogId: string;
  }> {
    const now = new Date();
    return this.client.$transaction(
      async (tx) => {
        if (input.role === 'ADMIN') {
          const existingAdmin = await tx.user.findFirst({ where: { role: 'ADMIN' } });
          if (existingAdmin) {
            throw new Error(
              'ADMIN_ALREADY_BOOTSTRAPPED: Initial platform administrator already exists'
            );
          }
        }

        const emailTaken = await tx.user.findUnique({ where: { email: input.email } });
        if (emailTaken) {
          throw new Error('CONFLICT: Account with this email already exists');
        }

        await tx.user.create({
          data: {
            id: input.userId,
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash,
            role: input.role,
            country: 'SA',
            locale: 'en',
            emailVerifiedAt: now,
            passwordUpdatedAt: now,
            createdAt: now,
          },
        });

        await tx.adminAuditLog.create({
          data: {
            id: input.auditLogId,
            userId: input.userId,
            action: input.role === 'ADMIN' ? 'PLATFORM_ADMIN_BOOTSTRAP' : 'SUPPORT_OPERATOR_CREATED',
            targetId: input.userId,
            details: input.auditDetails ? JSON.parse(input.auditDetails) : { email: input.email, role: input.role },
            ipAddress: 'cli-bootstrap',
            createdAt: now,
          },
        });

        return {
          userId: input.userId,
          email: input.email,
          role: input.role,
          auditLogId: input.auditLogId,
        };
      },
      {
        maxWait: Number(process.env.PRISMA_TX_MAX_WAIT || 30000),
        timeout: Number(process.env.PRISMA_TX_TIMEOUT || 60000),
      }
    );
  }

  async insertAuditLog(params: {
    id: string;
    userId: string;
    action: string;
    targetId?: string | null;
    details?: string | null;
    ipAddress?: string | null;
    createdAt: string;
  }): Promise<void> {
    await this.client.adminAuditLog.create({
      data: {
        id: params.id,
        userId: params.userId,
        action: params.action,
        targetId: params.targetId ?? null,
        details: params.details ? JSON.parse(params.details) : undefined,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(params.createdAt),
      },
    });
  }
}

export function getAuthRepository(): AuthRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresAuthRepository()
    : new SqliteAuthRepository();
}
