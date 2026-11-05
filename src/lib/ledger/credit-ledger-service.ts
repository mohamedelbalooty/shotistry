import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { PrismaClient } from '@prisma/client';
import { getDb, withSerializableTransaction } from '../db/prisma.ts';
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

export interface WorkspaceBalanceSummary {
  workspaceId: string;
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
}

export class CreditLedgerService {
  private readonly pgDelegate?: PostgresCreditLedgerService;

  constructor(prismaClient?: PrismaClient) {
    if (
      prismaClient ||
      (process.env.SHOTISTRY_DB_DRIVER === 'postgres' &&
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
   * Idempotently ensures User, Workspace, WorkspaceMember, Subscription, and
   * initial 5-credit free trial grant exist in SQL persistence.
   */
  public async ensureWorkspace(
    input: WorkspaceProvisionInput = {}
  ): Promise<WorkspaceBalanceSummary> {
    if (this.pgDelegate) {
      return this.pgDelegate.ensureWorkspace(input);
    }
    const userId = input.userId ?? 'user-default-merchant';
    const email = input.email ?? `${userId}@merchant.shotistry.app`;
    const userName = input.userName ?? 'Shotistry Merchant';
    const role = input.role ?? 'USER';
    const workspaceId = input.workspaceId ?? 'ws-default-studio';
    const workspaceName = input.workspaceName ?? 'Default Studio Workspace';
    const country = input.country ?? 'EG';
    const currency = input.currency ?? (country === 'SA' ? 'SAR' : 'EGP');

    return withSerializableTransaction((db) => {
      const now = new Date().toISOString();

      const existingUser = db
        .prepare(`SELECT "id", "email" FROM "User" WHERE "id" = ? OR "email" = ?`)
        .get(userId, email) as { id: string; email: string } | undefined;

      const resolvedUserId = existingUser ? existingUser.id : userId;

      if (!existingUser) {
        db.prepare(
          `INSERT INTO "User" ("id", "email", "name", "role", "country", "locale", "createdAt", "updatedAt")
           VALUES (?, ?, ?, ?, ?, 'ar', ?, ?)`
        ).run(resolvedUserId, email, userName, role, country, now, now);
      }

      const existingWs = db
        .prepare(`SELECT "id", "country", "currency" FROM "Workspace" WHERE "id" = ?`)
        .get(workspaceId) as { id: string; country: string; currency: string } | undefined;

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

        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare(
          `INSERT OR IGNORE INTO "Subscription" (
             "id", "workspaceId", "planTier", "status", "currency", "monthlyCredits",
             "currentPeriodStart", "currentPeriodEnd", "cancelAtPeriodEnd", "createdAt", "updatedAt"
           ) VALUES (?, ?, 'FREE', 'ACTIVE', ?, 5, ?, ?, 0, ?, ?)`
        ).run(`sub-${workspaceId}`, workspaceId, currency, now, periodEnd, now, now);

        // Grant initial 5 free trial credits idempotently
        const trialIdempotencyKey = `trial:grant:${workspaceId}`;
        db.prepare(
          `INSERT OR IGNORE INTO "CreditLedger" (
             "id", "workspaceId", "amount", "balanceAfter", "type", "referenceId", "idempotencyKey", "description", "createdAt"
           ) VALUES (?, ?, 5, 5, 'TRIAL_GRANT', ?, ?, 'Initial 5 Free Trial Credits', ?)`
        ).run(
          `led-trial-${workspaceId}`,
          workspaceId,
          `init-${workspaceId}`,
          trialIdempotencyKey,
          now
        );
      }

      const subRow = db
        .prepare(`SELECT "planTier", "status" FROM "Subscription" WHERE "workspaceId" = ?`)
        .get(workspaceId) as { planTier: string; status: string } | undefined;

      const balances = this.computeBalancesSync(db, workspaceId);

      return {
        workspaceId,
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
      .prepare(`SELECT "id", "ownerId", "country", "currency" FROM "Workspace" WHERE "id" = ?`)
      .get(workspaceId) as
      | { id: string; ownerId: string; country: string; currency: string }
      | undefined;

    if (!ws) {
      return this.ensureWorkspace({ workspaceId });
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
      userId: user?.id ?? ws.ownerId,
      email: user?.email ?? `${ws.ownerId}@merchant.shotistry.app`,
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
      db.prepare(
        `INSERT INTO "GenerationJob" (
           "id", "photoshootId", "status", "modelUsed", "creditCost", "rawPrompt", "synthesizedPrompt", "startedAt", "createdAt"
         ) VALUES (?, ?, 'PROCESSING', ?, ?, ?, ?, ?, ?)`
      ).run(
        jobId,
        photoshootId,
        input.modelUsed,
        input.creditCost ?? 1,
        input.rawPrompt,
        input.synthesizedPrompt,
        now,
        now
      );

      return {
        id: jobId,
        photoshootId,
        productId,
        assetId,
        status: 'PROCESSING',
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
      | 'JOB_REFUND';
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
      if (balanceAfter < 0) {
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

