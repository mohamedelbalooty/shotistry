import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PrismaClient } from '@prisma/client';
import { getDb, withSerializableTransaction } from '../db/prisma.ts';
import { resolveDbDriver } from '../db/driver.ts';
import { PostgresCreditLedgerService } from './postgres-ledger-service.ts';

export interface WorkspaceProvisionInput {
  userId?: string;
  email?: string;
  userName?: string;
  role?: 'USER' | 'ADMIN' | 'SUPPORT';
  workspaceId?: string;
  workspaceName?: string;
  country?: 'EG' | 'SA';
  currency?: 'EGP' | 'SAR' | 'USD';
}

export interface RegisterMerchantInput {
  email: string;
  passwordHash: string;
  name?: string;
  phone?: string;
  country?: 'EG' | 'SA';
  locale?: 'ar' | 'en';
  workspaceName?: string;
}

export interface PublicUserRecord {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  role: 'USER' | 'ADMIN' | 'SUPPORT';
  country: string;
  locale: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface WorkspaceBalanceSummary {
  workspaceId: string;
  workspaceName?: string;
  userId: string;
  email: string;
  country: string;
  currency: string;
  planTier: string;
  subscriptionStatus: string;
  settledBalance: number;
  reservedCredits: number;
  availableCredits: number;
}

export interface CreatePhotoshootJobInput {
  workspaceId: string;
  productName?: string;
  category?: string;
  title?: string;
  stylePreset: string;
  aspectRatio: string;
  modelUsed: string;
  rawPrompt: string;
  synthesizedPrompt: string;
  creditCost?: number;
  rawAssetUrl?: string;
  maskedAssetUrl?: string;
  maskAssetUrl?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  idempotencyKey?: string;
  assetKey?: string;
  status?: string;
}

export class CreditLedgerService {
  private readonly pgDelegate?: PostgresCreditLedgerService;

  constructor(prismaClient?: PrismaClient) {
    if (
      prismaClient ||
      (resolveDbDriver() === 'postgres' &&
        process.env.DATABASE_URL?.startsWith('postgres'))
    ) {
      this.pgDelegate = new PostgresCreditLedgerService(prismaClient);
    }
  }

  private computeBalancesSync(db: DatabaseSync, workspaceId: string) {
    const ledgerRow = db
      .prepare(
        `SELECT COALESCE(SUM("amount"), 0) AS settled FROM "CreditLedger" WHERE "workspaceId" = ?`
      )
      .get(workspaceId) as { settled: number } | undefined;

    const reservedRow = db
      .prepare(
        `SELECT COALESCE(SUM("amount"), 0) AS reserved FROM "CreditReservation" WHERE "workspaceId" = ? AND "status" = 'PENDING'`
      )
      .get(workspaceId) as { reserved: number } | undefined;

    const settledBalance = Number(ledgerRow?.settled ?? 0);
    const reservedCredits = Number(reservedRow?.reserved ?? 0);
    const availableCredits = settledBalance - reservedCredits;

    return {
      settledBalance,
      reservedCredits,
      availableCredits,
    };
  }

  /**
   * Atomically registers a new merchant account (`role = 'USER'`), initial Workspace,
   * `OWNER` membership, `FREE` Subscription, and a single one-time 5-credit free trial grant.
   */
  public async registerMerchantWithInitialWorkspace(
    input: RegisterMerchantInput
  ): Promise<{
    user: PublicUserRecord;
    workspace: WorkspaceBalanceSummary;
    trialGranted: boolean;
  }> {
    if (this.pgDelegate) {
      return this.pgDelegate.registerMerchantWithInitialWorkspace(input);
    }

    const email = input.email.trim().toLowerCase();
    const country: 'EG' | 'SA' = input.country === 'SA' ? 'SA' : 'EG';
    const currency: 'EGP' | 'SAR' = country === 'SA' ? 'SAR' : 'EGP';
    const locale = input.locale === 'en' ? 'en' : 'ar';
    const name = input.name?.trim() || null;
    const phone = input.phone?.trim() || null;
    const workspaceName =
      input.workspaceName?.trim() ||
      (name ? `${name} Studio` : 'Merchant Studio');

    return withSerializableTransaction((db) => {
      const existing = db
        .prepare(`SELECT "id" FROM "User" WHERE LOWER("email") = LOWER(?)`)
        .get(email) as { id: string } | undefined;

      if (existing) {
        throw new Error('CONFLICT: Account with this email already exists');
      }

      const now = new Date().toISOString();
      const userId = `user-${crypto.randomUUID()}`;
      const workspaceId = `ws-${crypto.randomUUID()}`;
      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'studio'}-${crypto.randomBytes(4).toString('hex')}`;

      db.prepare(
        `INSERT INTO "User" (
           "id", "email", "name", "phone", "passwordHash", "role", "country", "locale",
           "emailVerifiedAt", "trialGrantedAt", "passwordUpdatedAt", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, 'USER', ?, ?, NULL, ?, ?, ?, ?)`
      ).run(userId, email, name, phone, input.passwordHash, country, locale, now, now, now, now);

      db.prepare(
        `INSERT INTO "Workspace" (
           "id", "name", "slug", "ownerId", "country", "currency", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(workspaceId, workspaceName, slug, userId, country, currency, now, now);

      db.prepare(
        `INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
         VALUES (?, ?, ?, 'OWNER', ?)`
      ).run(`wm-${crypto.randomUUID()}`, workspaceId, userId, now);

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO "Subscription" (
           "id", "workspaceId", "planTier", "status", "currency", "monthlyCredits",
           "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt"
         ) VALUES (?, ?, 'FREE', 'ACTIVE', ?, 5, ?, ?, 0, ?, ?)`
      ).run(`sub-${workspaceId}`, workspaceId, currency, now, periodEnd, now, now);

      const trialIdempotencyKey = `trial:grant:user:${userId}`;
      db.prepare(
        `INSERT INTO "CreditLedger" (
           "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
         ) VALUES (?, ?, 5, 5, 'TRIAL_GRANT', ?, ?, 'Initial 5 Free Trial Credits', ?)`
      ).run(`led-trial-${userId}`, workspaceId, `init-${workspaceId}`, trialIdempotencyKey, now);

      return {
        user: {
          id: userId,
          email,
          name,
          phone,
          role: 'USER',
          country,
          locale,
          emailVerified: false,
          createdAt: now,
        },
        workspace: {
          workspaceId,
          workspaceName,
          userId,
          email,
          country,
          currency,
          planTier: 'FREE',
          subscriptionStatus: 'ACTIVE',
          settledBalance: 5,
          reservedCredits: 0,
          availableCredits: 5,
        },
        trialGranted: true,
      };
    });
  }

  /**
   * Creates an additional workspace owned by an already authenticated user.
   * Grants 0 trial credits to prevent trial-credit farming across multiple workspaces.
   */
  public async createAdditionalWorkspaceForUser(input: {
    userId: string;
    workspaceName: string;
    country?: 'EG' | 'SA';
  }): Promise<WorkspaceBalanceSummary> {
    if (this.pgDelegate) {
      return this.pgDelegate.createAdditionalWorkspaceForUser(input);
    }

    const country: 'EG' | 'SA' = input.country === 'SA' ? 'SA' : 'EG';
    const currency: 'EGP' | 'SAR' = country === 'SA' ? 'SAR' : 'EGP';
    const workspaceName = input.workspaceName.trim();

    if (!workspaceName) {
      throw new Error('Workspace name is required');
    }

    return withSerializableTransaction((db) => {
      const user = db
        .prepare(`SELECT "id", "email" FROM "User" WHERE "id" = ?`)
        .get(input.userId) as { id: string; email: string } | undefined;

      if (!user) {
        throw new Error(`NOT_FOUND: User ${input.userId} not found`);
      }

      const now = new Date().toISOString();
      const workspaceId = `ws-${crypto.randomUUID()}`;
      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'studio'}-${crypto.randomBytes(4).toString('hex')}`;

      db.prepare(
        `INSERT INTO "Workspace" (
           "id", "name", "slug", "ownerId", "country", "currency", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(workspaceId, workspaceName, slug, user.id, country, currency, now, now);

      db.prepare(
        `INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
         VALUES (?, ?, ?, 'OWNER', ?)`
      ).run(`wm-${crypto.randomUUID()}`, workspaceId, user.id, now);

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      db.prepare(
        `INSERT INTO "Subscription" (
           "id", "workspaceId", "planTier", "status", "currency", "monthlyCredits",
           "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt"
         ) VALUES (?, ?, 'FREE', 'ACTIVE', ?, 0, ?, ?, 0, ?, ?)`
      ).run(`sub-${workspaceId}`, workspaceId, currency, now, periodEnd, now, now);

      return {
        workspaceId,
        workspaceName,
        userId: user.id,
        email: user.email,
        country,
        currency,
        planTier: 'FREE',
        subscriptionStatus: 'ACTIVE',
        settledBalance: 0,
        reservedCredits: 0,
        availableCredits: 0,
      };
    });
  }

  /**
   * Explicitly provisions a User + Workspace fixture for trusted server/test usage.
   * Rejects missing explicit IDs and refuses to create ADMIN/SUPPORT accounts.
   */
  public async ensureWorkspace(
    input: WorkspaceProvisionInput = {}
  ): Promise<WorkspaceBalanceSummary> {
    if (this.pgDelegate) {
      return this.pgDelegate.ensureWorkspace(input);
    }

    const userId = input.userId?.trim();
    const workspaceId = input.workspaceId?.trim();
    if (!userId || !workspaceId) {
      throw new Error('userId and workspaceId are required for explicit workspace provisioning');
    }

    if (input.role && input.role !== 'USER') {
      throw new Error('FORBIDDEN: Privileged platform roles cannot be provisioned via ensureWorkspace');
    }

    const email = (input.email ?? `${userId}@merchant.shotistry.app`).trim().toLowerCase();
    const userName = input.userName ?? 'Shotistry Merchant';
    const workspaceName = input.workspaceName ?? 'Studio Workspace';
    const country = input.country ?? 'EG';
    const currency = input.currency ?? (country === 'SA' ? 'SAR' : 'EGP');

    return withSerializableTransaction((db) => {
      const now = new Date().toISOString();

      const existingUser = db
        .prepare(`SELECT "id", "email", "trialGrantedAt" FROM "User" WHERE "id" = ? OR LOWER("email") = LOWER(?)`)
        .get(userId, email) as
        | { id: string; email: string; trialGrantedAt: string | null }
        | undefined;

      const resolvedUserId = existingUser ? existingUser.id : userId;

      if (!existingUser) {
        db.prepare(
          `INSERT INTO "User" ("id", "email", "name", "role", "country", "locale", "createdAt", "updatedAt")
           VALUES (?, ?, ?, 'USER', ?, 'ar', ?, ?)`
        ).run(resolvedUserId, email, userName, country, now, now);
      }

      const existingWs = db
        .prepare(`SELECT "id", "name", "country", "currency" FROM "Workspace" WHERE "id" = ?`)
        .get(workspaceId) as
        | { id: string; name: string; country: string; currency: string }
        | undefined;

      if (!existingWs) {
        const slug = `${workspaceId.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
        db.prepare(
          `INSERT INTO "Workspace" ("id", "name", "slug", "ownerId", "country", "currency", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(workspaceId, workspaceName, slug, resolvedUserId, country, currency, now, now);

        db.prepare(
          `INSERT OR IGNORE INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
           VALUES (?, ?, ?, 'OWNER', ?)`
        ).run(`wm-${workspaceId}-${resolvedUserId}`, workspaceId, resolvedUserId, now);

        const canGrantTrial = !existingUser?.trialGrantedAt;
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `INSERT OR IGNORE INTO "Subscription" (
             "id", "workspaceId", "planTier", "status", "currency", "monthlyCredits",
             "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt"
           ) VALUES (?, ?, 'FREE', 'ACTIVE', ?, ?, ?, ?, 0, ?, ?)`
        ).run(
          `sub-${workspaceId}`,
          workspaceId,
          currency,
          canGrantTrial ? 5 : 0,
          now,
          periodEnd,
          now,
          now
        );

        if (canGrantTrial) {
          const trialIdempotencyKey = `trial:grant:user:${resolvedUserId}`;
          const trialRes = db.prepare(
            `INSERT OR IGNORE INTO "CreditLedger" (
               "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
             ) VALUES (?, ?, 5, 5, 'TRIAL_GRANT', ?, ?, 'Initial 5 Free Trial Credits', ?)`
          ).run(
            `led-trial-${resolvedUserId}`,
            workspaceId,
            `init-${workspaceId}`,
            trialIdempotencyKey,
            now
          );
          if (trialRes.changes > 0) {
            db.prepare(`UPDATE "User" SET "trialGrantedAt" = ?, "updatedAt" = ? WHERE "id" = ?`).run(
              now,
              now,
              resolvedUserId
            );
          }
        }
      }

      const subRow = db
        .prepare(`SELECT "planTier", "status" FROM "Subscription" WHERE "workspaceId" = ?`)
        .get(workspaceId) as { planTier: string; status: string } | undefined;

      const balances = this.computeBalancesSync(db, workspaceId);

      return {
        workspaceId,
        workspaceName: existingWs?.name ?? workspaceName,
        userId: resolvedUserId,
        email: existingUser?.email ?? email,
        country: existingWs?.country ?? country,
        currency: existingWs?.currency ?? currency,
        planTier: subRow?.planTier ?? 'FREE',
        subscriptionStatus: subRow?.status ?? 'ACTIVE',
        ...balances,
      };
    });
  }

  public async getWorkspaceBalance(workspaceId: string): Promise<WorkspaceBalanceSummary> {
    if (this.pgDelegate) {
      return this.pgDelegate.getWorkspaceBalance(workspaceId);
    }
    const db = getDb();
    const ws = db
      .prepare(`SELECT "id", "name", "ownerId", "country", "currency" FROM "Workspace" WHERE "id" = ?`)
      .get(workspaceId) as
      | { id: string; name: string; ownerId: string; country: string; currency: string }
      | undefined;

    if (!ws) {
      throw new Error(`NOT_FOUND: Workspace ${workspaceId} not found`);
    }

    const user = db
      .prepare(`SELECT "id", "email" FROM "User" WHERE "id" = ?`)
      .get(ws.ownerId) as { id: string; email: string } | undefined;

    const sub = db
      .prepare(`SELECT "planTier", "status" FROM "Subscription" WHERE "workspaceId" = ?`)
      .get(workspaceId) as { planTier: string; status: string } | undefined;

    const balances = this.computeBalancesSync(db, workspaceId);

    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      userId: user?.id ?? ws.ownerId,
      email: user?.email ?? '',
      country: ws.country,
      currency: ws.currency,
      planTier: sub?.planTier ?? 'FREE',
      subscriptionStatus: sub?.status ?? 'ACTIVE',
      ...balances,
    };
  }

  /**
   * Creates Brand, Product, ProductAsset (if provided), Photoshoot, and GenerationJob
   * rows in SQL persistence so credit reservations can reference a valid GenerationJob.
   */
  public async createPhotoshootJob(input: CreatePhotoshootJobInput): Promise<{
    id: string;
    photoshootId: string;
    productId: string;
    assetId?: string;
    status: string;
  }> {
    if (this.pgDelegate) {
      return this.pgDelegate.createPhotoshootJob(input);
    }
    return withSerializableTransaction((db) => {
      const now = new Date().toISOString();
      const brandId = `brand-${input.workspaceId}`;

      db.prepare(
        `INSERT OR IGNORE INTO "Brand" ("id", "workspaceId", "name", "createdAt", "updatedAt")
         VALUES (?, ?, 'Default Brand', ?, ?)`
      ).run(brandId, input.workspaceId, now, now);

      const productId = `prod-${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO "Product" ("id", "brandId", "name", "category", "createdAt", "updatedAt")
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        productId,
        brandId,
        input.productName ?? 'Commercial Product',
        input.category ?? 'general',
        now,
        now
      );

      let assetId: string | undefined;
      if (input.rawAssetUrl) {
        assetId = `asset-${crypto.randomUUID()}`;
        db.prepare(
          `INSERT INTO "ProductAsset" (
             "id", "productId", "rawUrl", "maskedUrl", "maskUrl", "width", "height", "fileSize", "createdAt"
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          assetId,
          productId,
          input.rawAssetUrl,
          input.maskedAssetUrl ?? null,
          input.maskAssetUrl ?? null,
          input.width ?? 1024,
          input.height ?? 1024,
          input.fileSize ?? 0,
          now
        );
      }

      const photoshootId = `ps-${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO "Photoshoot" (
           "id", "workspaceId", "productId", "title", "stylePreset", "aspectRatio", "createdAt", "updatedAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        photoshootId,
        input.workspaceId,
        productId,
        input.title ?? `${input.stylePreset} Photoshoot`,
        input.stylePreset,
        input.aspectRatio,
        now,
        now
      );

      const jobId = `job-${crypto.randomUUID()}`;
      const status = input.status ?? 'PROCESSING';
      db.prepare(
        `INSERT INTO "GenerationJob" (
           "id", "photoshootId", "status", "modelUsed", "creditCost", "rawPrompt",
           "synthesizedPrompt", "idempotencyKey", "assetKey", "startedAt", "createdAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        jobId,
        photoshootId,
        status,
        input.modelUsed,
        input.creditCost ?? 1,
        input.rawPrompt,
        input.synthesizedPrompt,
        input.idempotencyKey ?? null,
        input.assetKey ?? null,
        status === 'PROCESSING' ? now : null,
        now
      );

      return {
        id: jobId,
        photoshootId,
        productId,
        assetId,
        status,
      };
    });
  }

  /**
   * Atomically reserves credits inside a SERIALIZABLE SQL transaction.
   * Rejects if available credits < amount.
   */
  public async reserveCredits(params: {
    workspaceId: string;
    generationJobId: string;
    amount: number;
  }): Promise<{
    id: string;
    workspaceId: string;
    generationJobId: string;
    amount: number;
    status: 'PENDING' | 'SETTLED' | 'RELEASED';
    createdAt: string;
  }> {
    if (this.pgDelegate) {
      return this.pgDelegate.reserveCredits(params);
    }
    if (params.amount <= 0) {
      throw new Error('Reservation amount must be strictly positive');
    }

    return withSerializableTransaction((db) => {
      const existing = db
        .prepare(
          `SELECT "id", "workspaceId", "generationJobId", "amount", "status", "createdAt"
           FROM "CreditReservation" WHERE "generationJobId" = ?`
        )
        .get(params.generationJobId) as
        | {
            id: string;
            workspaceId: string;
            generationJobId: string;
            amount: number;
            status: 'PENDING' | 'SETTLED' | 'RELEASED';
            createdAt: string;
          }
        | undefined;

      if (existing) {
        return existing;
      }

      const { availableCredits } = this.computeBalancesSync(db, params.workspaceId);
      if (availableCredits < params.amount) {
        throw new Error(
          `Insufficient credits: required ${params.amount}, available ${availableCredits}`
        );
      }

      const id = `res-${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO "CreditReservation" (
           "id", "workspaceId", "generationJobId", "amount", "status", "createdAt"
         ) VALUES (?, ?, ?, ?, 'PENDING', ?)`
      ).run(id, params.workspaceId, params.generationJobId, params.amount, now);

      return {
        id,
        workspaceId: params.workspaceId,
        generationJobId: params.generationJobId,
        amount: params.amount,
        status: 'PENDING',
        createdAt: now,
      };
    });
  }

  /**
   * Atomically settles a PENDING reservation, transitions it to SETTLED,
   * and appends a negative JOB_SETTLEMENT entry to CreditLedger.
   */
  public async settleReservation(reservationId: string): Promise<{
    reservation: {
      id: string;
      workspaceId: string;
      generationJobId: string;
      amount: number;
      status: 'SETTLED';
      settledAt: string;
    };
    ledgerEntry: {
      id: string;
      workspaceId: string;
      amount: number;
      balanceAfter: number;
      type: 'JOB_SETTLEMENT';
      referenceId: string;
      idempotencyKey: string;
    };
  }> {
    if (this.pgDelegate) {
      return this.pgDelegate.settleReservation(reservationId);
    }
    return withSerializableTransaction((db) => {
      const res = db
        .prepare(
          `SELECT "id", "workspaceId", "generationJobId", "amount", "status", "settledAt"
           FROM "CreditReservation" WHERE "id" = ?`
        )
        .get(reservationId) as
        | {
            id: string;
            workspaceId: string;
            generationJobId: string;
            amount: number;
            status: string;
            settledAt: string | null;
          }
        | undefined;

      if (!res) {
        throw new Error(`Reservation ${reservationId} not found`);
      }

      const idempotencyKey = `settle:${res.id}`;
      const existingLedger = db
        .prepare(
          `SELECT "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey"
           FROM "CreditLedger" WHERE "idempotencyKey" = ?`
        )
        .get(idempotencyKey) as
        | {
            id: string;
            workspaceId: string;
            amount: number;
            balanceAfter: number;
            type: 'JOB_SETTLEMENT';
            referenceId: string;
            idempotencyKey: string;
          }
        | undefined;

      if (res.status === 'SETTLED' && existingLedger) {
        return {
          reservation: {
            id: res.id,
            workspaceId: res.workspaceId,
            generationJobId: res.generationJobId,
            amount: res.amount,
            status: 'SETTLED',
            settledAt: res.settledAt ?? new Date().toISOString(),
          },
          ledgerEntry: existingLedger,
        };
      }

      if (res.status !== 'PENDING') {
        throw new Error(`Cannot settle reservation in status ${res.status}`);
      }

      const now = new Date().toISOString();
      const { settledBalance } = this.computeBalancesSync(db, res.workspaceId);
      const balanceAfter = settledBalance - res.amount;

      db.prepare(
        `UPDATE "CreditReservation" SET "status" = 'SETTLED', "settledAt" = ? WHERE "id" = ?`
      ).run(now, res.id);

      const ledgerId = `led-${crypto.randomUUID()}`;
      db.prepare(
        `INSERT INTO "CreditLedger" (
           "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
         ) VALUES (?, ?, ?, ?, 'JOB_SETTLEMENT', ?, ?, ?, ?)`
      ).run(
        ledgerId,
        res.workspaceId,
        -res.amount,
        balanceAfter,
        res.generationJobId,
        idempotencyKey,
        `Photoshoot generation settlement (${res.generationJobId})`,
        now
      );

      return {
        reservation: {
          id: res.id,
          workspaceId: res.workspaceId,
          generationJobId: res.generationJobId,
          amount: res.amount,
          status: 'SETTLED',
          settledAt: now,
        },
        ledgerEntry: {
          id: ledgerId,
          workspaceId: res.workspaceId,
          amount: -res.amount,
          balanceAfter,
          type: 'JOB_SETTLEMENT',
          referenceId: res.generationJobId,
          idempotencyKey,
        },
      };
    });
  }

  /**
   * Releases a PENDING credit reservation when a generation job fails,
   * restoring available credits to the workspace without debiting any credit.
   */
  public async releaseReservation(
    reservationId: string,
    reason = 'Generation job failed'
  ): Promise<{
    id: string;
    workspaceId: string;
    generationJobId: string;
    amount: number;
    status: 'RELEASED';
    settledAt: string;
  }> {
    if (this.pgDelegate) {
      return this.pgDelegate.releaseReservation(reservationId, reason);
    }
    return withSerializableTransaction((db) => {
      const res = db
        .prepare(
          `SELECT "id", "workspaceId", "generationJobId", "amount", "status", "settledAt"
           FROM "CreditReservation" WHERE "id" = ?`
        )
        .get(reservationId) as
        | {
            id: string;
            workspaceId: string;
            generationJobId: string;
            amount: number;
            status: string;
            settledAt: string | null;
          }
        | undefined;

      if (!res) {
        throw new Error(`Reservation ${reservationId} not found`);
      }

      const now = new Date().toISOString();
      db.prepare(
        `UPDATE "CreditReservation" SET "status" = 'RELEASED', "settledAt" = ? WHERE "id" = ?`
      ).run(now, res.id);

      db.prepare(
        `UPDATE "GenerationJob" SET "status" = 'FAILED', "errorMessage" = ?, "completedAt" = ? WHERE "id" = ?`
      ).run(reason, now, res.generationJobId);

      return {
        id: res.id,
        workspaceId: res.workspaceId,
        generationJobId: res.generationJobId,
        amount: res.amount,
        status: 'RELEASED',
        settledAt: now,
      };
    });
  }

  /**
   * Atomically grants or adjusts credits in CreditLedger with idempotency protection.
   */
  public async grantCredits(params: {
    workspaceId: string;
    amount: number;
    type:
      | 'TRIAL_GRANT'
      | 'SUBSCRIPTION_GRANT'
      | 'TOP_UP_PURCHASE'
      | 'ADMIN_ADJUSTMENT'
      | 'JOB_REFUND'
      | 'REFUND_REVERSAL';
    referenceId?: string;
    idempotencyKey: string;
    description?: string;
  }): Promise<{
    id: string;
    workspaceId: string;
    amount: number;
    balanceAfter: number;
    type: string;
    referenceId: string | null;
    idempotencyKey: string;
    description: string | null;
    createdAt: string;
    duplicate: boolean;
  }> {
    if (this.pgDelegate) {
      return this.pgDelegate.grantCredits(params);
    }
    if (params.amount === 0) {
      throw new Error('Credit adjustment amount cannot be zero');
    }

    return withSerializableTransaction((db) => {
      const existing = db
        .prepare(
          `SELECT "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
           FROM "CreditLedger" WHERE "idempotencyKey" = ?`
        )
        .get(params.idempotencyKey) as
        | {
            id: string;
            workspaceId: string;
            amount: number;
            balanceAfter: number;
            type: string;
            referenceId: string | null;
            idempotencyKey: string;
            description: string | null;
            createdAt: string;
          }
        | undefined;

      if (existing) {
        return { ...existing, duplicate: true };
      }

      const { settledBalance } = this.computeBalancesSync(db, params.workspaceId);
      const balanceAfter = settledBalance + params.amount;
      if (balanceAfter < 0 && params.type !== 'REFUND_REVERSAL') {
        throw new Error(
          `Credit adjustment would result in negative balance (${balanceAfter})`
        );
      }

      const id = `led-${crypto.randomUUID()}`;
      const now = new Date().toISOString();

      db.prepare(
        `INSERT INTO "CreditLedger" (
           "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        params.workspaceId,
        params.amount,
        balanceAfter,
        params.type,
        params.referenceId ?? null,
        params.idempotencyKey,
        params.description ?? null,
        now
      );

      return {
        id,
        workspaceId: params.workspaceId,
        amount: params.amount,
        balanceAfter,
        type: params.type,
        referenceId: params.referenceId ?? null,
        idempotencyKey: params.idempotencyKey,
        description: params.description ?? null,
        createdAt: now,
        duplicate: false,
      };
    });
  }
}
