import crypto from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma as defaultPrisma } from '../db/prisma.ts';
import type {
  CreatePhotoshootJobInput,
  PublicUserRecord,
  RegisterMerchantInput,
  WorkspaceBalanceSummary,
  WorkspaceProvisionInput,
} from './credit-ledger-service.ts';

function isSerializationFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code;
  const message = (err as { message?: string }).message ?? '';
  return (
    code === 'P2034' ||
    code === '40001' ||
    message.includes('40001') ||
    message.toLowerCase().includes('could not serialize access') ||
    message.toLowerCase().includes('write conflict') ||
    message.toLowerCase().includes('deadlock')
  );
}

/**
 * Production PostgreSQL Credit & Ledger Engine.
 * Executes all credit reservations, settlements, releases, and grants inside
 * PostgreSQL `SERIALIZABLE` transactions with row-level `SELECT ... FOR UPDATE`
 * pessimistic locking on the parent `Workspace` row and automatic retry on SQLSTATE `40001`.
 */
export class PostgresCreditLedgerService {
  private readonly prisma: PrismaClient;

  constructor(prismaClient?: PrismaClient) {
    this.prisma = prismaClient ?? defaultPrisma;
  }

  private async withPgSerializableTx<T>(
    workspaceIdToLock: string | null,
    fn: (tx: Prisma.TransactionClient) => Promise<T>
  ): Promise<T> {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            if (workspaceIdToLock) {
              // Acquire exclusive row-level lock on Workspace first to serialize concurrent spenders cleanly
              await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceIdToLock} FOR UPDATE`;
            }
            return await fn(tx);
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: 10000,
            timeout: 15000,
          }
        );
      } catch (err) {
        if (attempt < maxAttempts && isSerializationFailure(err)) {
          const jitterMs = attempt * 12 + Math.floor(Math.random() * 15);
          await new Promise((r) => setTimeout(r, jitterMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error('PostgreSQL transaction exceeded maximum serialization retries');
  }

  private async computeBalancesTx(
    tx: Prisma.TransactionClient,
    workspaceId: string
  ): Promise<{
    settledBalance: number;
    reservedCredits: number;
    availableCredits: number;
  }> {
    const [ledgerAgg, reservedAgg] = await Promise.all([
      tx.creditLedger.aggregate({
        where: { workspaceId },
        _sum: { amount: true },
      }),
      tx.creditReservation.aggregate({
        where: { workspaceId, status: 'PENDING' },
        _sum: { amount: true },
      }),
    ]);

    const settledBalance = Number(ledgerAgg._sum.amount ?? 0);
    const reservedCredits = Number(reservedAgg._sum.amount ?? 0);
    const availableCredits = settledBalance - reservedCredits;

    return {
      settledBalance,
      reservedCredits,
      availableCredits,
    };
  }

  public async registerMerchantWithInitialWorkspace(
    input: RegisterMerchantInput
  ): Promise<{
    user: PublicUserRecord;
    workspace: WorkspaceBalanceSummary;
    trialGranted: boolean;
  }> {
    const email = input.email.trim().toLowerCase();
    const country: 'EG' | 'SA' = input.country === 'SA' ? 'SA' : 'EG';
    const currency: 'EGP' | 'SAR' = country === 'SA' ? 'SAR' : 'EGP';
    const locale = input.locale === 'en' ? 'en' : 'ar';
    const name = input.name?.trim() || null;
    const phone = input.phone?.trim() || null;
    const workspaceName =
      input.workspaceName?.trim() ||
      (name ? `${name} Studio` : 'Merchant Studio');

    return this.withPgSerializableTx(null, async (tx) => {
      const existing = await tx.user.findFirst({
        where: { email: { equals: email, mode: 'insensitive' } },
      });

      if (existing) {
        throw new Error('CONFLICT: Account with this email already exists');
      }

      const now = new Date();
      const userId = `user-${crypto.randomUUID()}`;
      const workspaceId = `ws-${crypto.randomUUID()}`;
      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'studio'}-${crypto.randomBytes(4).toString('hex')}`;

      await tx.user.create({
        data: {
          id: userId,
          email,
          name,
          phone,
          passwordHash: input.passwordHash,
          role: 'USER',
          country,
          locale,
          emailVerifiedAt: null,
          trialGrantedAt: now,
          passwordUpdatedAt: now,
        },
      });

      await tx.workspace.create({
        data: {
          id: workspaceId,
          name: workspaceName,
          slug,
          ownerId: userId,
          country,
          currency,
        },
      });

      await tx.workspaceMember.create({
        data: {
          id: `wm-${crypto.randomUUID()}`,
          workspaceId,
          userId,
          role: 'OWNER',
        },
      });

      const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await tx.subscription.create({
        data: {
          id: `sub-${workspaceId}`,
          workspaceId,
          planTier: 'FREE',
          status: 'ACTIVE',
          currency,
          monthlyCredits: 5,
          currentPeriodStart: now,
          currentPeriodEnd: periodEnd,
          cancelAtPeriodEnd: false,
        },
      });

      const trialIdempotencyKey = `trial:grant:user:${userId}`;
      await tx.creditLedger.create({
        data: {
          id: `led-trial-${userId}`,
          workspaceId,
          amount: 5,
          balanceAfter: 5,
          type: 'TRIAL_GRANT',
          referenceId: `init-${workspaceId}`,
          idempotencyKey: trialIdempotencyKey,
          description: 'Initial 5 Free Trial Credits',
        },
      });

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
          createdAt: now.toISOString(),
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

  public async createAdditionalWorkspaceForUser(input: {
    userId: string;
    workspaceName: string;
    country?: 'EG' | 'SA';
  }): Promise<WorkspaceBalanceSummary> {
    const country: 'EG' | 'SA' = input.country === 'SA' ? 'SA' : 'EG';
    const currency: 'EGP' | 'SAR' = country === 'SA' ? 'SAR' : 'EGP';
    const workspaceName = input.workspaceName.trim();

    if (!workspaceName) {
      throw new Error('Workspace name is required');
    }

    return this.withPgSerializableTx(null, async (tx) => {
      const user = await tx.user.findUnique({ where: { id: input.userId } });
      if (!user) {
        throw new Error(`NOT_FOUND: User ${input.userId} not found`);
      }

      const now = new Date();
      const workspaceId = `ws-${crypto.randomUUID()}`;
      const slug = `${workspaceName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'studio'}-${crypto.randomBytes(4).toString('hex')}`;

      await tx.workspace.create({
        data: {
          id: workspaceId,
          name: workspaceName,
          slug,
          ownerId: user.id,
          country,
          currency,
        },
      });

      await tx.workspaceMember.create({
        data: {
          id: `wm-${crypto.randomUUID()}`,
          workspaceId,
          userId: user.id,
          role: 'OWNER',
        },
      });

      await tx.subscription.create({
        data: {
          id: `sub-${workspaceId}`,
          workspaceId,
          planTier: 'FREE',
          status: 'ACTIVE',
          currency,
          monthlyCredits: 0,
          currentPeriodStart: now,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: false,
        },
      });

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

  public async ensureWorkspace(
    input: WorkspaceProvisionInput = {}
  ): Promise<WorkspaceBalanceSummary> {
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

    return this.withPgSerializableTx(null, async (tx) => {
      let existingUser = await tx.user.findFirst({
        where: {
          OR: [{ id: userId }, { email: { equals: email, mode: 'insensitive' } }],
        },
      });

      if (!existingUser) {
        existingUser = await tx.user.create({
          data: {
            id: userId,
            email,
            name: userName,
            role: 'USER',
            country,
            locale: 'ar',
          },
        });
      }

      const resolvedUserId = existingUser.id;
      let existingWs = await tx.workspace.findUnique({
        where: { id: workspaceId },
      });

      if (!existingWs) {
        const slug = `${workspaceId.toLowerCase().replace(/[^a-z0-9-]+/g, '-')}`;
        existingWs = await tx.workspace.create({
          data: {
            id: workspaceId,
            name: workspaceName,
            slug,
            ownerId: resolvedUserId,
            country,
            currency,
          },
        });

        await tx.workspaceMember.upsert({
          where: {
            workspaceId_userId: {
              workspaceId,
              userId: resolvedUserId,
            },
          },
          update: {},
          create: {
            id: `wm-${workspaceId}-${resolvedUserId}`,
            workspaceId,
            userId: resolvedUserId,
            role: 'OWNER',
          },
        });

        const canGrantTrial = !existingUser.trialGrantedAt;
        const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        await tx.subscription.upsert({
          where: { workspaceId },
          update: {},
          create: {
            id: `sub-${workspaceId}`,
            workspaceId,
            planTier: 'FREE',
            status: 'ACTIVE',
            currency,
            monthlyCredits: canGrantTrial ? 5 : 0,
            currentPeriodStart: new Date(),
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: false,
          },
        });

        if (canGrantTrial) {
          const trialIdempotencyKey = `trial:grant:user:${resolvedUserId}`;
          const existingTrial = await tx.creditLedger.findUnique({
            where: { idempotencyKey: trialIdempotencyKey },
          });
          if (!existingTrial) {
            await tx.creditLedger.create({
              data: {
                id: `led-trial-${resolvedUserId}`,
                workspaceId,
                amount: 5,
                balanceAfter: 5,
                type: 'TRIAL_GRANT',
                referenceId: `init-${workspaceId}`,
                idempotencyKey: trialIdempotencyKey,
                description: 'Initial 5 Free Trial Credits',
              },
            });
          }
          await tx.user.update({
            where: { id: resolvedUserId },
            data: { trialGrantedAt: new Date() },
          });
        }
      }

      await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;

      const subRow = await tx.subscription.findUnique({
        where: { workspaceId },
      });

      const balances = await this.computeBalancesTx(tx, workspaceId);

      return {
        workspaceId,
        workspaceName: existingWs.name,
        userId: resolvedUserId,
        email: existingUser.email,
        country: existingWs.country,
        currency: existingWs.currency,
        planTier: subRow?.planTier ?? 'FREE',
        subscriptionStatus: subRow?.status ?? 'ACTIVE',
        ...balances,
      };
    });
  }

  public async getWorkspaceBalance(workspaceId: string): Promise<WorkspaceBalanceSummary> {
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { subscription: true },
    });

    if (!ws) {
      throw new Error(`NOT_FOUND: Workspace ${workspaceId} not found`);
    }

    const user = await this.prisma.user.findUnique({
      where: { id: ws.ownerId },
    });

    const balances = await this.computeBalancesTx(this.prisma, workspaceId);

    return {
      workspaceId: ws.id,
      workspaceName: ws.name,
      userId: user?.id ?? ws.ownerId,
      email: user?.email ?? '',
      country: ws.country,
      currency: ws.currency,
      planTier: ws.subscription?.planTier ?? 'FREE',
      subscriptionStatus: ws.subscription?.status ?? 'ACTIVE',
      ...balances,
    };
  }

  public async createPhotoshootJob(input: CreatePhotoshootJobInput): Promise<{
    id: string;
    photoshootId: string;
    productId: string;
    assetId?: string;
    status: string;
  }> {
    return this.withPgSerializableTx(input.workspaceId, async (tx) => {
      const brandId = `brand-${input.workspaceId}`;
      await tx.brand.upsert({
        where: { id: brandId },
        update: {},
        create: {
          id: brandId,
          workspaceId: input.workspaceId,
          name: 'Default Brand',
        },
      });

      const productId = `prod-${crypto.randomUUID()}`;
      await tx.product.create({
        data: {
          id: productId,
          brandId,
          name: input.productName ?? 'Commercial Product',
          category: input.category ?? 'general',
        },
      });

      let assetId: string | undefined;
      if (input.rawAssetUrl) {
        assetId = `asset-${crypto.randomUUID()}`;
        await tx.productAsset.create({
          data: {
            id: assetId,
            productId,
            rawUrl: input.rawAssetUrl,
            maskedUrl: input.maskedAssetUrl ?? null,
            maskUrl: input.maskAssetUrl ?? null,
            width: input.width ?? 1024,
            height: input.height ?? 1024,
            fileSize: input.fileSize ?? 0,
          },
        });
      }

      const photoshootId = `ps-${crypto.randomUUID()}`;
      await tx.photoshoot.create({
        data: {
          id: photoshootId,
          workspaceId: input.workspaceId,
          productId,
          title: input.title ?? `${input.stylePreset} Photoshoot`,
          stylePreset: input.stylePreset,
          aspectRatio: input.aspectRatio,
        },
      });

      const jobId = `job-${crypto.randomUUID()}`;
      await tx.generationJob.create({
        data: {
          id: jobId,
          photoshootId,
          status: 'PROCESSING',
          modelUsed: input.modelUsed,
          creditCost: input.creditCost ?? 1,
          rawPrompt: input.rawPrompt,
          synthesizedPrompt: input.synthesizedPrompt,
          startedAt: new Date(),
        },
      });

      return {
        id: jobId,
        photoshootId,
        productId,
        assetId,
        status: 'PROCESSING',
      };
    });
  }

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
    if (params.amount <= 0) {
      throw new Error('Reservation amount must be strictly positive');
    }

    return this.withPgSerializableTx(params.workspaceId, async (tx) => {
      const existing = await tx.creditReservation.findUnique({
        where: { generationJobId: params.generationJobId },
      });

      if (existing) {
        return {
          id: existing.id,
          workspaceId: existing.workspaceId,
          generationJobId: existing.generationJobId,
          amount: existing.amount,
          status: existing.status,
          createdAt: existing.createdAt.toISOString(),
        };
      }

      const { availableCredits } = await this.computeBalancesTx(tx, params.workspaceId);
      if (availableCredits < params.amount) {
        throw new Error(
          `Insufficient credits: required ${params.amount}, available ${availableCredits}`
        );
      }

      const created = await tx.creditReservation.create({
        data: {
          id: `res-${crypto.randomUUID()}`,
          workspaceId: params.workspaceId,
          generationJobId: params.generationJobId,
          amount: params.amount,
          status: 'PENDING',
        },
      });

      return {
        id: created.id,
        workspaceId: created.workspaceId,
        generationJobId: created.generationJobId,
        amount: created.amount,
        status: created.status,
        createdAt: created.createdAt.toISOString(),
      };
    });
  }

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
    const initialLookup = await this.prisma.creditReservation.findUnique({
      where: { id: reservationId },
    });
    if (!initialLookup) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    return this.withPgSerializableTx(initialLookup.workspaceId, async (tx) => {
      const res = await tx.creditReservation.findUnique({
        where: { id: reservationId },
      });
      if (!res) {
        throw new Error(`Reservation ${reservationId} not found`);
      }

      const idempotencyKey = `settle:${res.id}`;
      const existingLedger = await tx.creditLedger.findUnique({
        where: { idempotencyKey },
      });

      if (res.status === 'SETTLED' && existingLedger) {
        return {
          reservation: {
            id: res.id,
            workspaceId: res.workspaceId,
            generationJobId: res.generationJobId,
            amount: res.amount,
            status: 'SETTLED',
            settledAt: (res.settledAt ?? new Date()).toISOString(),
          },
          ledgerEntry: {
            id: existingLedger.id,
            workspaceId: existingLedger.workspaceId,
            amount: existingLedger.amount,
            balanceAfter: existingLedger.balanceAfter,
            type: 'JOB_SETTLEMENT',
            referenceId: existingLedger.referenceId ?? res.generationJobId,
            idempotencyKey: existingLedger.idempotencyKey ?? idempotencyKey,
          },
        };
      }

      if (res.status !== 'PENDING') {
        throw new Error(`Cannot settle reservation in status ${res.status}`);
      }

      const now = new Date();
      const { settledBalance } = await this.computeBalancesTx(tx, res.workspaceId);
      const balanceAfter = settledBalance - res.amount;

      await tx.creditReservation.update({
        where: { id: res.id },
        data: {
          status: 'SETTLED',
          settledAt: now,
        },
      });

      const ledgerEntry = await tx.creditLedger.create({
        data: {
          id: `led-${crypto.randomUUID()}`,
          workspaceId: res.workspaceId,
          amount: -res.amount,
          balanceAfter,
          type: 'JOB_SETTLEMENT',
          referenceId: res.generationJobId,
          idempotencyKey,
          description: `Photoshoot generation settlement (${res.generationJobId})`,
        },
      });

      return {
        reservation: {
          id: res.id,
          workspaceId: res.workspaceId,
          generationJobId: res.generationJobId,
          amount: res.amount,
          status: 'SETTLED',
          settledAt: now.toISOString(),
        },
        ledgerEntry: {
          id: ledgerEntry.id,
          workspaceId: ledgerEntry.workspaceId,
          amount: ledgerEntry.amount,
          balanceAfter: ledgerEntry.balanceAfter,
          type: 'JOB_SETTLEMENT',
          referenceId: ledgerEntry.referenceId ?? res.generationJobId,
          idempotencyKey: ledgerEntry.idempotencyKey ?? idempotencyKey,
        },
      };
    });
  }

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
    const initialLookup = await this.prisma.creditReservation.findUnique({
      where: { id: reservationId },
    });
    if (!initialLookup) {
      throw new Error(`Reservation ${reservationId} not found`);
    }

    return this.withPgSerializableTx(initialLookup.workspaceId, async (tx) => {
      const res = await tx.creditReservation.findUnique({
        where: { id: reservationId },
      });
      if (!res) {
        throw new Error(`Reservation ${reservationId} not found`);
      }

      const now = new Date();
      await tx.creditReservation.update({
        where: { id: res.id },
        data: {
          status: 'RELEASED',
          settledAt: now,
        },
      });

      await tx.generationJob.update({
        where: { id: res.generationJobId },
        data: {
          status: 'FAILED',
          errorMessage: reason,
          completedAt: now,
        },
      });

      return {
        id: res.id,
        workspaceId: res.workspaceId,
        generationJobId: res.generationJobId,
        amount: res.amount,
        status: 'RELEASED',
        settledAt: now.toISOString(),
      };
    });
  }

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
    if (params.amount === 0) {
      throw new Error('Credit adjustment amount cannot be zero');
    }

    return this.withPgSerializableTx(params.workspaceId, async (tx) => {
      const existing = await tx.creditLedger.findUnique({
        where: { idempotencyKey: params.idempotencyKey },
      });

      if (existing) {
        return {
          id: existing.id,
          workspaceId: existing.workspaceId,
          amount: existing.amount,
          balanceAfter: existing.balanceAfter,
          type: existing.type,
          referenceId: existing.referenceId,
          idempotencyKey: existing.idempotencyKey ?? params.idempotencyKey,
          description: existing.description,
          createdAt: existing.createdAt.toISOString(),
          duplicate: true,
        };
      }

      const { settledBalance } = await this.computeBalancesTx(tx, params.workspaceId);
      const balanceAfter = settledBalance + params.amount;
      if (balanceAfter < 0) {
        throw new Error(
          `Credit adjustment would result in negative balance (${balanceAfter})`
        );
      }

      const created = await tx.creditLedger.create({
        data: {
          id: `led-${crypto.randomUUID()}`,
          workspaceId: params.workspaceId,
          amount: params.amount,
          balanceAfter,
          type: params.type,
          referenceId: params.referenceId ?? null,
          idempotencyKey: params.idempotencyKey,
          description: params.description ?? null,
        },
      });

      return {
        id: created.id,
        workspaceId: created.workspaceId,
        amount: created.amount,
        balanceAfter: created.balanceAfter,
        type: created.type,
        referenceId: created.referenceId,
        idempotencyKey: created.idempotencyKey ?? params.idempotencyKey,
        description: created.description,
        createdAt: created.createdAt.toISOString(),
        duplicate: false,
      };
    });
  }
}
