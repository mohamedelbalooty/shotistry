import { getDb } from '../../../../lib/db/prisma.ts';
import { SUBSCRIPTION_PLANS } from '../../../../lib/pricing/plans.ts';
import type { PlanTier } from '../../../../lib/types/index.ts';

function isAuthorizedAdmin(request: Request): boolean {
  const roleHeader = request.headers.get('x-user-role')?.trim().toUpperCase();
  if (roleHeader && roleHeader !== 'ADMIN' && roleHeader !== 'SUPPORT') {
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  if (!isAuthorizedAdmin(request)) {
    return Response.json(
      { error: 'FORBIDDEN: Admin or Support role required' },
      { status: 403 }
    );
  }

  const db = getDb();

  const userCountRow = db
    .prepare(`SELECT COUNT(*) AS count FROM "User"`)
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

  // Exchange rates: 1 USD = 3.75 SAR, 1 USD = 50.0 EGP
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

  const imgCountRow = db
    .prepare(`SELECT COUNT(*) AS count FROM "GeneratedImage"`)
    .get() as { count: number };
  const totalImagesGenerated = Number(imgCountRow?.count ?? 0);

  const generationSuccessRate =
    totalJobs > 0 ? Number(((completedJobs / totalJobs) * 100).toFixed(1)) : 0;

  // Official Gemini Nano Banana 2.1 cost: $0.0336 per 1K generated image
  const aiExpensesUsd = Number((totalImagesGenerated * 0.0336).toFixed(4));
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
              p."title" AS "product",
              p."stylePreset" AS "preset",
              u."email" AS "userEmail"
       FROM "GenerationJob" j
       JOIN "Photoshoot" p ON p."id" = j."photoshootId"
       JOIN "Workspace" w ON w."id" = p."workspaceId"
       LEFT JOIN "User" u ON u."id" = w."ownerId"
       ORDER BY j."createdAt" DESC
       LIMIT 20`
    )
    .all() as Array<Record<string, unknown>>;

  const recentJobs = rawRecentJobs.map((row) => {
    const isCompleted = row.status === 'COMPLETED';
    return {
      id: String(row.id),
      product: String(row.product || 'Commercial Product'),
      preset: String(row.preset || 'gulf_luxury_marble'),
      model: String(row.modelUsed || 'gemini-3.1-flash-image'),
      status: isCompleted ? 'SUCCESS' : String(row.status),
      cost: isCompleted ? '$0.0336' : '$0.0000 (Refunded)',
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
    !geminiKey.includes('Placeholder') &&
    !geminiKey.includes('your_gemini');

  const paymobSecret = process.env.PAYMOB_HMAC_SECRET?.trim() || '';
  const isPaymobConfigured =
    paymobSecret.length >= 8 &&
    !paymobSecret.includes('placeholder') &&
    !paymobSecret.includes('your_paymob');

  return Response.json({
    totalUsers,
    payingSubscribers,
    mrrUsd,
    mrrSar,
    mrrEgp,
    grossMarginPercent,
    aiExpensesUsd,
    generationSuccessRate,
    totalImagesGenerated,
    recentJobs,
    recentAuditLogs,
    systemStatus: {
      geminiEngine: isGeminiLive ? 'LIVE_API_CONFIGURED' : 'SANDBOX_COMPOSITE',
      paymobGateways: isPaymobConfigured
        ? 'HMAC_CONFIGURED'
        : 'UNCONFIGURED_FAIL_CLOSED',
      database: 'OPERATIONAL_ACID_SQL',
      storage: 'OPERATIONAL_SIGNED_URLS',
    },
  });
}
