import type { DatabaseSync } from 'node:sqlite';
import { prisma, getDb, withSerializableTransaction } from '../prisma.ts';
import { resolveDbDriver } from '../driver.ts';
import { SUBSCRIPTION_PLANS } from '../../pricing/plans.ts';
import {
  MODEL_PRICING_CATALOG,
  calculateModelGenerationCost,
} from '../../pricing/model-costs.ts';
import type {
  GeminiImageModelId,
  GeminiImageSize,
  PlanTier,
} from '../../types/index.ts';

function resolveModelId(rawModel: unknown): GeminiImageModelId {
  const candidate = String(rawModel || 'gemini-3.1-flash-image') as GeminiImageModelId;
  return candidate in MODEL_PRICING_CATALOG ? candidate : 'gemini-3.1-flash-image';
}

function resolveImageSize(rawResolution: unknown): GeminiImageSize {
  const res = String(rawResolution || '').toUpperCase();
  if (res.includes('4K') || res.includes('4096')) return '4K';
  if (res.includes('2K') || res.includes('2048')) return '2K';
  if (res.includes('512')) return '512';
  return '1K';
}

export interface AdminJobRow {
  id: string;
  product: string;
  preset: string;
  model: string;
  status: string;
  cost: string;
  user: string;
  createdAt: string;
}

export interface JobStatusBreakdown {
  queued: number;
  processing: number;
  completed: number;
  failed: number;
  stuck: number;
}

export interface PaymentEventsSummary {
  total: number;
  paid: number;
  failed: number;
  unmatched: number;
  refunded: number;
}

export interface BetaFunnelMetrics {
  totalRegistrations: number;
  verifiedUsers: number;
  workspacesWithPhotoshoots: number;
  workspacesWithGenerations: number;
  payingSubscribers: number;
  conversionRatePercent: number;
}

export interface PlatformMetricsSummary {
  totalUsers: number;
  payingSubscribers: number;
  mrrUsd: number;
  mrrSar: number;
  mrrEgp: number;
  grossMarginPercent: number;
  aiExpensesUsd: number;
  generationSuccessRate: number;
  totalImagesGenerated: number;
  jobStatusBreakdown: JobStatusBreakdown;
  paymentEventsSummary: PaymentEventsSummary;
  funnelMetrics: BetaFunnelMetrics;
  recentJobs: AdminJobRow[];
  recentAuditLogs: Array<Record<string, unknown>>;
  systemStatus: {
    geminiEngine: string;
    paymobGateways: string;
    database: 'POSTGRESQL' | 'SQLITE';
    storage: string;
  };
}

export interface RecordAuditLogParams {
  auditLogId: string;
  userId: string;
  action: string;
  targetId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
}

export interface AdminRepository {
  getPlatformMetrics(): Promise<PlatformMetricsSummary>;
  findTargetWorkspace(
    targetWorkspaceId?: string,
    targetEmail?: string
  ): Promise<{ workspaceId: string } | null>;
  recordAdminAdjustmentAudit(params: {
    auditLogId: string;
    userId: string;
    workspaceId: string;
    details: string;
    ipAddress?: string | null;
  }): Promise<void>;
  recordAuditLog(params: RecordAuditLogParams): Promise<void>;
  ping(): Promise<boolean>;
}

export class SqliteAdminRepository implements AdminRepository {
  private getDb(): DatabaseSync {
    return getDb();
  }

  async getPlatformMetrics(): Promise<PlatformMetricsSummary> {
    const db = this.getDb();

    const userCountRow = db
      .prepare(`SELECT COUNT(*) AS count FROM "User" WHERE "role" = 'USER'`)
      .get() as { count: number };
    const totalUsers = Number(userCountRow?.count ?? 0);

    const activeSubs = db
      .prepare(
        `SELECT "planTier", "currency"
         FROM "Subscription"
         WHERE "status" = 'ACTIVE' AND "planTier" != 'FREE'`
      )
      .all() as Array<{ planTier: string; currency: string }>;

    const payingSubscribers = activeSubs.length;

    let mrrSar = 0;
    let mrrEgp = 0;
    for (const sub of activeSubs) {
      const tier = sub.planTier as PlanTier;
      const plan = SUBSCRIPTION_PLANS[tier];
      if (!plan) continue;
      if (sub.currency === 'SAR') {
        mrrSar += plan.priceSAR;
      } else {
        mrrEgp += plan.priceEGP;
      }
    }

    const mrrUsd = Number((mrrSar / 3.75 + mrrEgp / 50.0).toFixed(2));

    const jobStats = db
      .prepare(
        `SELECT
           COUNT(*) AS totalJobs,
           SUM(CASE WHEN "status" = 'COMPLETED' THEN 1 ELSE 0 END) AS completedJobs
         FROM "GenerationJob"`
      )
      .get() as { totalJobs: number; completedJobs: number | null };

    const totalJobs = Number(jobStats?.totalJobs ?? 0);
    const completedJobs = Number(jobStats?.completedJobs ?? 0);
    const generationSuccessRate =
      totalJobs > 0 ? Number(((completedJobs / totalJobs) * 100).toFixed(1)) : 0;

    const imgCountRow = db
      .prepare(`SELECT COUNT(*) AS count FROM "GeneratedImage"`)
      .get() as { count: number };
    const totalImagesGenerated = Number(imgCountRow?.count ?? 0);

    const generatedImageRows = db
      .prepare(
        `SELECT gi."resolution", j."modelUsed"
         FROM "GeneratedImage" gi
         LEFT JOIN "GenerationJob" j ON j."id" = gi."generationJobId"`
      )
      .all() as Array<{ resolution?: string; modelUsed?: string }>;

    let rawAiExpensesUsd = 0;
    for (const imgRow of generatedImageRows) {
      const modelId = resolveModelId(imgRow.modelUsed);
      const imageSize = resolveImageSize(imgRow.resolution);
      rawAiExpensesUsd += calculateModelGenerationCost(
        modelId,
        imageSize,
        'standard'
      ).actualCostPerSuccessfulImageUsd;
    }
    const aiExpensesUsd = Number(rawAiExpensesUsd.toFixed(4));

    const grossMarginPercent =
      mrrUsd > 0
        ? Number((((mrrUsd - aiExpensesUsd) / mrrUsd) * 100).toFixed(1))
        : 0;

    const rawRecentJobs = db
      .prepare(
        `SELECT j."id",
                j."status",
                j."modelUsed",
                j."startedAt",
                j."completedAt",
                j."createdAt",
                gi."resolution" AS "resolution",
                p."title" AS "product",
                p."stylePreset" AS "preset",
                u."email" AS "userEmail"
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         JOIN "Workspace" w ON w."id" = p."workspaceId"
         LEFT JOIN "User" u ON u."id" = w."ownerId"
         LEFT JOIN "GeneratedImage" gi ON gi."generationJobId" = j."id"
         ORDER BY j."createdAt" DESC
         LIMIT 20`
      )
      .all() as Array<Record<string, unknown>>;

    const recentJobs: AdminJobRow[] = rawRecentJobs.map((row) => {
      const isCompleted = row.status === 'COMPLETED';
      const modelId = resolveModelId(row.modelUsed);
      const imageSize = resolveImageSize(row.resolution);
      const jobCostUsd = calculateModelGenerationCost(
        modelId,
        imageSize,
        'standard'
      ).actualCostPerSuccessfulImageUsd;
      return {
        id: String(row.id),
        product: String(row.product || 'Commercial Product'),
        preset: String(row.preset || 'gulf_luxury_marble'),
        model: modelId,
        status: isCompleted ? 'SUCCESS' : String(row.status),
        cost: isCompleted ? `$${jobCostUsd.toFixed(4)}` : '$0.0000 (Refunded)',
        user: String(row.userEmail || 'merchant@shotistry.app'),
        createdAt: String(row.createdAt),
      };
    });

    const recentAuditLogs = db
      .prepare(
        `SELECT "id", "userId", "action", "targetId", "details", "createdAt"
         FROM "AdminAuditLog"
         ORDER BY "createdAt" DESC
         LIMIT 10`
      )
      .all();

    const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
    const isGeminiLive =
      geminiKey.length > 10 &&
      !geminiKey.includes('placeholder') &&
      !geminiKey.includes('your_gemini');

    const paymobSecret = process.env.PAYMOB_HMAC_SECRET?.trim() || '';
    const isPaymobConfigured =
      paymobSecret.length >= 8 &&
      !paymobSecret.includes('placeholder') &&
      !paymobSecret.includes('your_paymob');

    const jobBreakdownRow = db
      .prepare(
        `SELECT
           SUM(CASE WHEN "status" = 'QUEUED' THEN 1 ELSE 0 END) AS queued,
           SUM(CASE WHEN "status" = 'PROCESSING' THEN 1 ELSE 0 END) AS processing,
           SUM(CASE WHEN "status" = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
           SUM(CASE WHEN "status" = 'FAILED' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN "status" IN ('QUEUED', 'PROCESSING') AND datetime("createdAt") < datetime('now', '-5 minutes') THEN 1 ELSE 0 END) AS stuck
         FROM "GenerationJob"`
      )
      .get() as Record<string, number | null>;

    const jobStatusBreakdown: JobStatusBreakdown = {
      queued: Number(jobBreakdownRow?.queued ?? 0),
      processing: Number(jobBreakdownRow?.processing ?? 0),
      completed: Number(jobBreakdownRow?.completed ?? 0),
      failed: Number(jobBreakdownRow?.failed ?? 0),
      stuck: Number(jobBreakdownRow?.stuck ?? 0),
    };

    const paymentSummaryRow = db
      .prepare(
        `SELECT
           COUNT(*) AS total,
           SUM(CASE WHEN "status" = 'PAID' THEN 1 ELSE 0 END) AS paid,
           SUM(CASE WHEN "status" = 'FAILED' THEN 1 ELSE 0 END) AS failed,
           SUM(CASE WHEN "status" IN ('UNMATCHED_INTENT', 'UNMATCHED_AMOUNT') THEN 1 ELSE 0 END) AS unmatched,
           SUM(CASE WHEN "status" = 'REFUNDED' THEN 1 ELSE 0 END) AS refunded
         FROM "PaymentTransaction"`
      )
      .get() as Record<string, number | null>;

    const paymentEventsSummary: PaymentEventsSummary = {
      total: Number(paymentSummaryRow?.total ?? 0),
      paid: Number(paymentSummaryRow?.paid ?? 0),
      failed: Number(paymentSummaryRow?.failed ?? 0),
      unmatched: Number(paymentSummaryRow?.unmatched ?? 0),
      refunded: Number(paymentSummaryRow?.refunded ?? 0),
    };

    const verifiedUsersRow = db
      .prepare(`SELECT COUNT(*) AS count FROM "User" WHERE "emailVerifiedAt" IS NOT NULL`)
      .get() as { count: number } | undefined;
    const verifiedUsersCount = Number(verifiedUsersRow?.count ?? 0);

    const wsWithShootsRow = db
      .prepare(`SELECT COUNT(DISTINCT "workspaceId") AS count FROM "Photoshoot"`)
      .get() as { count: number } | undefined;
    const wsWithShoots = Number(wsWithShootsRow?.count ?? 0);

    const wsWithGensRow = db
      .prepare(
        `SELECT COUNT(DISTINCT p."workspaceId") AS count
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         WHERE j."status" = 'COMPLETED'`
      )
      .get() as { count: number } | undefined;
    const wsWithGens = Number(wsWithGensRow?.count ?? 0);

    const funnelMetrics: BetaFunnelMetrics = {
      totalRegistrations: totalUsers,
      verifiedUsers: verifiedUsersCount,
      workspacesWithPhotoshoots: wsWithShoots,
      workspacesWithGenerations: wsWithGens,
      payingSubscribers,
      conversionRatePercent:
        totalUsers > 0 ? Number(((payingSubscribers / totalUsers) * 100).toFixed(1)) : 0,
    };

    return {
      totalUsers,
      payingSubscribers,
      mrrUsd,
      mrrSar,
      mrrEgp,
      grossMarginPercent,
      aiExpensesUsd,
      generationSuccessRate,
      totalImagesGenerated,
      jobStatusBreakdown,
      paymentEventsSummary,
      funnelMetrics,
      recentJobs,
      recentAuditLogs,
      systemStatus: {
        geminiEngine: isGeminiLive ? 'LIVE_API_CONFIGURED' : 'SANDBOX_COMPOSITE',
        paymobGateways: isPaymobConfigured
          ? 'HMAC_CONFIGURED'
          : 'UNCONFIGURED_FAIL_CLOSED',
        database: 'SQLITE',
        storage: 'OPERATIONAL_SIGNED_URLS',
      },
    };
  }

  async findTargetWorkspace(
    targetWorkspaceId?: string,
    targetEmail?: string
  ): Promise<{ workspaceId: string } | null> {
    const db = this.getDb();
    if (targetWorkspaceId) {
      const ws = db
        .prepare(`SELECT "id" FROM "Workspace" WHERE "id" = ?`)
        .get(targetWorkspaceId) as { id: string } | undefined;
      return ws ? { workspaceId: ws.id } : null;
    }

    if (targetEmail) {
      const foundWs = db
        .prepare(
          `SELECT w."id"
           FROM "Workspace" w
           JOIN "User" u ON u."id" = w."ownerId"
           WHERE LOWER(u."email") = LOWER(?)
           ORDER BY w."createdAt" ASC
           LIMIT 1`
        )
        .get(targetEmail) as { id: string } | undefined;
      return foundWs ? { workspaceId: foundWs.id } : null;
    }

    return null;
  }

  async recordAdminAdjustmentAudit(params: {
    auditLogId: string;
    userId: string;
    workspaceId: string;
    details: string;
    ipAddress?: string | null;
  }): Promise<void> {
    const now = new Date().toISOString();
    await withSerializableTransaction((txDb) => {
      txDb
        .prepare(
          `INSERT INTO "AdminAuditLog" ("id", "userId", "action", "targetId", "details", "ipAddress", "createdAt")
           VALUES (?, ?, 'CREDIT_ADJUSTMENT', ?, ?, ?, ?)`
        )
        .run(
          params.auditLogId,
          params.userId,
          params.workspaceId,
          params.details,
          params.ipAddress ?? null,
          now
        );
    });
  }

  async recordAuditLog(params: RecordAuditLogParams): Promise<void> {
    const now = new Date().toISOString();
    await withSerializableTransaction((txDb) => {
      txDb
        .prepare(
          `INSERT INTO "AdminAuditLog" ("id", "userId", "action", "targetId", "details", "ipAddress", "createdAt")
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          params.auditLogId,
          params.userId,
          params.action,
          params.targetId ?? null,
          params.details ? JSON.stringify(params.details) : null,
          params.ipAddress ?? null,
          now
        );
    });
  }

  async ping(): Promise<boolean> {
    const db = this.getDb();
    const row = db.prepare('SELECT 1 as alive').get() as { alive: number } | undefined;
    return row?.alive === 1;
  }
}

export class PostgresAdminRepository implements AdminRepository {
  private client: typeof prisma;

  constructor(client?: typeof prisma) {
    this.client = client ?? prisma;
  }

  async getPlatformMetrics(): Promise<PlatformMetricsSummary> {
    const totalUsers = await this.client.user.count({ where: { role: 'USER' } });

    const activeSubs = await this.client.subscription.findMany({
      where: {
        status: 'ACTIVE',
        planTier: { not: 'FREE' },
      },
      select: { planTier: true, currency: true },
    });

    const payingSubscribers = activeSubs.length;
    let mrrSar = 0;
    let mrrEgp = 0;
    for (const sub of activeSubs) {
      const tier = sub.planTier as PlanTier;
      const plan = SUBSCRIPTION_PLANS[tier];
      if (!plan) continue;
      if (sub.currency === 'SAR') {
        mrrSar += plan.priceSAR;
      } else {
        mrrEgp += plan.priceEGP;
      }
    }
    const mrrUsd = Number((mrrSar / 3.75 + mrrEgp / 50.0).toFixed(2));

    const totalJobs = await this.client.generationJob.count();
    const completedJobs = await this.client.generationJob.count({
      where: { status: 'COMPLETED' },
    });
    const generationSuccessRate =
      totalJobs > 0 ? Number(((completedJobs / totalJobs) * 100).toFixed(1)) : 0;

    const totalImagesGenerated = await this.client.generatedImage.count();

    const generatedImageRows = await this.client.generatedImage.findMany({
      select: {
        resolution: true,
        generationJob: { select: { modelUsed: true } },
      },
    });

    let rawAiExpensesUsd = 0;
    for (const imgRow of generatedImageRows) {
      const modelId = resolveModelId(imgRow.generationJob?.modelUsed);
      const imageSize = resolveImageSize(imgRow.resolution);
      rawAiExpensesUsd += calculateModelGenerationCost(
        modelId,
        imageSize,
        'standard'
      ).actualCostPerSuccessfulImageUsd;
    }
    const aiExpensesUsd = Number(rawAiExpensesUsd.toFixed(4));

    const grossMarginPercent =
      mrrUsd > 0
        ? Number((((mrrUsd - aiExpensesUsd) / mrrUsd) * 100).toFixed(1))
        : 0;

    const rawRecentJobs = await this.client.generationJob.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        photoshoot: {
          include: {
            workspace: {
              include: {
                members: {
                  where: { role: 'OWNER' },
                  include: { user: { select: { email: true } } },
                  take: 1,
                },
              },
            },
          },
        },
        images: { select: { resolution: true }, take: 1 },
      },
    });

    const recentJobs: AdminJobRow[] = rawRecentJobs.map((job) => {
      const isCompleted = job.status === 'COMPLETED';
      const modelId = resolveModelId(job.modelUsed);
      const imageSize = resolveImageSize(job.images[0]?.resolution);
      const jobCostUsd = calculateModelGenerationCost(
        modelId,
        imageSize,
        'standard'
      ).actualCostPerSuccessfulImageUsd;
      const ownerEmail =
        job.photoshoot?.workspace?.members[0]?.user?.email || 'merchant@shotistry.app';

      return {
        id: job.id,
        product: job.photoshoot?.title || 'Commercial Product',
        preset: job.photoshoot?.stylePreset || 'gulf_luxury_marble',
        model: modelId,
        status: isCompleted ? 'SUCCESS' : job.status,
        cost: isCompleted ? `$${jobCostUsd.toFixed(4)}` : '$0.0000 (Refunded)',
        user: ownerEmail,
        createdAt: job.createdAt.toISOString(),
      };
    });

    const recentAuditLogs = await this.client.adminAuditLog.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
    });

    const geminiKey = process.env.GEMINI_API_KEY?.trim() || '';
    const isGeminiLive =
      geminiKey.length > 10 &&
      !geminiKey.includes('placeholder') &&
      !geminiKey.includes('your_gemini');

    const paymobSecret = process.env.PAYMOB_HMAC_SECRET?.trim() || '';
    const isPaymobConfigured =
      paymobSecret.length >= 8 &&
      !paymobSecret.includes('placeholder') &&
      !paymobSecret.includes('your_paymob');

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const [
      queuedJobs,
      processingJobs,
      completedJobsCount,
      failedJobs,
      stuckJobs,
      totalPayments,
      paidPayments,
      failedPayments,
      unmatchedIntentPayments,
      unmatchedAmountPayments,
      refundedPayments,
    ] = await Promise.all([
      this.client.generationJob.count({ where: { status: 'QUEUED' } }),
      this.client.generationJob.count({ where: { status: 'PROCESSING' } }),
      this.client.generationJob.count({ where: { status: 'COMPLETED' } }),
      this.client.generationJob.count({ where: { status: 'FAILED' } }),
      this.client.generationJob.count({
        where: {
          status: { in: ['QUEUED', 'PROCESSING'] },
          createdAt: { lt: fiveMinutesAgo },
        },
      }),
      this.client.paymentTransaction.count(),
      this.client.paymentTransaction.count({ where: { status: 'PAID' } }),
      this.client.paymentTransaction.count({ where: { status: 'FAILED' } }),
      this.client.paymentTransaction.count({ where: { status: 'UNMATCHED_INTENT' } }),
      this.client.paymentTransaction.count({ where: { status: 'UNMATCHED_AMOUNT' } }),
      this.client.paymentTransaction.count({ where: { status: 'REFUNDED' } }),
    ]);

    const jobStatusBreakdown: JobStatusBreakdown = {
      queued: queuedJobs,
      processing: processingJobs,
      completed: completedJobsCount,
      failed: failedJobs,
      stuck: stuckJobs,
    };

    const paymentEventsSummary: PaymentEventsSummary = {
      total: totalPayments,
      paid: paidPayments,
      failed: failedPayments,
      unmatched: unmatchedIntentPayments + unmatchedAmountPayments,
      refunded: refundedPayments,
    };

    const verifiedUsersCount = await this.client.user.count({
      where: { emailVerifiedAt: { not: null } },
    });

    const shootsGroupBy = await this.client.photoshoot.groupBy({
      by: ['workspaceId'],
    });
    const wsWithShoots = shootsGroupBy.length;

    const completedJobsRows = await this.client.generationJob.findMany({
      where: { status: 'COMPLETED' },
      select: { photoshoot: { select: { workspaceId: true } } },
    });
    const wsWithGens = new Set(
      completedJobsRows.map((j) => j.photoshoot?.workspaceId).filter(Boolean)
    ).size;

    const funnelMetrics: BetaFunnelMetrics = {
      totalRegistrations: totalUsers,
      verifiedUsers: verifiedUsersCount,
      workspacesWithPhotoshoots: wsWithShoots,
      workspacesWithGenerations: wsWithGens,
      payingSubscribers,
      conversionRatePercent:
        totalUsers > 0 ? Number(((payingSubscribers / totalUsers) * 100).toFixed(1)) : 0,
    };

    return {
      totalUsers,
      payingSubscribers,
      mrrUsd,
      mrrSar,
      mrrEgp,
      grossMarginPercent,
      aiExpensesUsd,
      generationSuccessRate,
      totalImagesGenerated,
      jobStatusBreakdown,
      paymentEventsSummary,
      funnelMetrics,
      recentJobs,
      recentAuditLogs: recentAuditLogs.map((log) => ({
        id: log.id,
        userId: log.userId,
        action: log.action,
        targetId: log.targetId,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
      })),
      systemStatus: {
        geminiEngine: isGeminiLive ? 'LIVE_API_CONFIGURED' : 'SANDBOX_COMPOSITE',
        paymobGateways: isPaymobConfigured
          ? 'HMAC_CONFIGURED'
          : 'UNCONFIGURED_FAIL_CLOSED',
        database: 'POSTGRESQL',
        storage: 'OPERATIONAL_SIGNED_URLS',
      },
    };
  }

  async findTargetWorkspace(
    targetWorkspaceId?: string,
    targetEmail?: string
  ): Promise<{ workspaceId: string } | null> {
    if (targetWorkspaceId) {
      const ws = await this.client.workspace.findUnique({
        where: { id: targetWorkspaceId },
        select: { id: true },
      });
      return ws ? { workspaceId: ws.id } : null;
    }

    if (targetEmail) {
      const user = await this.client.user.findFirst({
        where: { email: { equals: targetEmail.trim().toLowerCase(), mode: 'insensitive' } },
        include: {
          workspaces: {
            where: { role: 'OWNER' },
            orderBy: { createdAt: 'asc' },
            take: 1,
          },
        },
      });
      const wsId = user?.workspaces[0]?.workspaceId;
      return wsId ? { workspaceId: wsId } : null;
    }

    return null;
  }

  async recordAdminAdjustmentAudit(params: {
    auditLogId: string;
    userId: string;
    workspaceId: string;
    details: string;
    ipAddress?: string | null;
  }): Promise<void> {
    await this.client.adminAuditLog.create({
      data: {
        id: params.auditLogId,
        userId: params.userId,
        action: 'CREDIT_ADJUSTMENT',
        targetId: params.workspaceId,
        details: JSON.parse(params.details),
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async recordAuditLog(params: RecordAuditLogParams): Promise<void> {
    await this.client.adminAuditLog.create({
      data: {
        id: params.auditLogId,
        userId: params.userId,
        action: params.action,
        targetId: params.targetId ?? null,
        details: (params.details as any) ?? null,
        ipAddress: params.ipAddress ?? null,
        createdAt: new Date(),
      },
    });
  }

  async ping(): Promise<boolean> {
    const res = await this.client.$queryRaw`SELECT 1 as alive`;
    return Array.isArray(res) && res.length > 0;
  }
}

export function getAdminRepository(): AdminRepository {
  return resolveDbDriver() === 'postgres'
    ? new PostgresAdminRepository()
    : new SqliteAdminRepository();
}
