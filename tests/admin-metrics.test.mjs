import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { bootstrapPlatformAdmin } from '../src/lib/auth/admin-bootstrap.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { POST as registerPost } from '../src/app/api/auth/register/route.ts';
import { POST as loginPost } from '../src/app/api/auth/login/route.ts';
import { GET as getAdminMetrics } from '../src/app/api/admin/metrics/route.ts';
import { POST as postAdminAdjustCredits } from '../src/app/api/admin/credits/adjust/route.ts';
import { POST as generatePhotoshootPost } from '../src/app/api/photoshoots/generate/route.ts';

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/shotistry_session=([^;]+)/);
  return match ? `shotistry_session=${match[1]}` : '';
}

async function createAdminSession() {
  const admin = await bootstrapPlatformAdmin({
    email: 'admin-ops@shotistry.app',
    password: 'AdminOpsStrongPassword2026!',
    bootstrapSecret: process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET,
  });
  const loginRes = await loginPost(
    new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'admin-ops@shotistry.app',
        password: 'AdminOpsStrongPassword2026!',
      }),
    })
  );
  const body = await loginRes.json();
  return {
    adminUserId: admin.userId,
    cookie: extractCookie(loginRes),
    csrfToken: body.csrfToken,
  };
}

describe('Admin Metrics & Audited Credit Adjustments (Real SQL Aggregates)', () => {
  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = 'bootstrap_secret_minimum_32_characters_ok';
  });

  test('rejects unauthenticated forged headers (401) and regular merchant users (403 Forbidden)', async () => {
    const forgedReq = new Request('http://localhost:3000/api/admin/metrics', {
      headers: {
        'x-user-id': 'admin-forged',
        'x-user-role': 'ADMIN',
      },
    });
    assert.equal((await getAdminMetrics(forgedReq)).status, 401);

    const regRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'regular@merchant.sa',
          password: 'MerchantPassword2026!',
          country: 'SA',
        }),
      })
    );
    const cookie = extractCookie(regRes);

    const nonAdminRes = await getAdminMetrics(
      new Request('http://localhost:3000/api/admin/metrics', {
        headers: { cookie },
      })
    );
    assert.equal(nonAdminRes.status, 403);
  });

  test('returns real SQL aggregates (0 on fresh DB, never hardcoded 1480/5880 demo constants)', async () => {
    const { cookie } = await createAdminSession();
    const res = await getAdminMetrics(
      new Request('http://localhost:3000/api/admin/metrics', {
        headers: { cookie },
      })
    );
    assert.equal(res.status, 200);
    const metrics = await res.json();

    assert.notEqual(metrics.totalUsers, 1480, 'Must not return hardcoded 1480 demo users');
    assert.notEqual(metrics.mrrUsd, 5880, 'Must not return hardcoded 5880 demo MRR');
    assert.equal(metrics.totalUsers, 0);
    assert.equal(metrics.payingSubscribers, 0);
    assert.equal(metrics.mrrSar, 0);
    assert.equal(metrics.mrrEgp, 0);
    assert.equal(metrics.mrrUsd, 0);
    assert.equal(metrics.totalImagesGenerated, 0);
    assert.equal(Array.isArray(metrics.recentJobs), true);
    assert.equal(metrics.recentJobs.length, 0);
  });

  test('computes accurate MRR, subscriber count, AI costs, and job telemetry from real SQL records', async () => {
    const regRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant@riyadh.sa',
          password: 'MerchantPassword2026!',
          country: 'SA',
        }),
      })
    );
    const merchantCookie = extractCookie(regRes);
    const regBody = await regRes.json();
    const wsId = regBody.activeWorkspace.workspaceId;

    // Activate PRO subscription in SQL (189 SAR)
    const db = getDb();
    db.prepare(
      `UPDATE "Subscription" SET "planTier" = 'PRO', "status" = 'ACTIVE', "currency" = 'SAR', "monthlyCredits" = 200 WHERE "workspaceId" = ?`
    ).run(wsId);

    // Run 1 real photoshoot generation job
    const sampleImg = createSampleProductPngDataUrl({ width: 48, height: 48 });
    const genReq = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchantCookie,
        'x-csrf-token': regBody.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Riyadh Oud',
        productCategory: 'Fragrances',
        presetId: 'gulf_luxury_marble',
        aspectRatio: '1:1',
        rawImageBase64: sampleImg,
      }),
    });
    const genRes = await generatePhotoshootPost(genReq);
    assert.equal(genRes.status, 200);

    // Query Admin Metrics via authenticated ADMIN session
    const { cookie: adminCookie } = await createAdminSession();
    const adminRes = await getAdminMetrics(
      new Request('http://localhost:3000/api/admin/metrics', {
        headers: { cookie: adminCookie },
      })
    );
    assert.equal(adminRes.status, 200);
    const metrics = await adminRes.json();

    assert.equal(metrics.totalUsers, 1);
    assert.equal(metrics.payingSubscribers, 1);
    assert.equal(metrics.mrrSar, 189);
    assert.ok(metrics.mrrUsd > 45 && metrics.mrrUsd < 55); // 189 SAR / 3.75 = $50.40
    assert.equal(metrics.totalImagesGenerated, 1);
    assert.equal(metrics.generationSuccessRate, 100);
    assert.equal(metrics.recentJobs.length, 1);
    assert.equal(metrics.recentJobs[0].model, 'gemini-3.1-flash-image');
    assert.notEqual(
      metrics.aiExpensesUsd,
      0.0336,
      'Must not use Lite model $0.0336 price for gemini-3.1-flash-image job'
    );
    assert.equal(metrics.aiExpensesUsd, 0.0711);
    assert.equal(metrics.recentJobs[0].cost, '$0.0711');
  });

  test('executes audited credit adjustments and writes immutable AdminAuditLog in SQL', async () => {
    const regTarget = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'tariq@oudstore.sa',
          password: 'TariqPassword2026!',
          country: 'SA',
        }),
      })
    );
    const targetBody = await regTarget.json();
    const targetWsId = targetBody.activeWorkspace.workspaceId;

    const { cookie: adminCookie, csrfToken, adminUserId } = await createAdminSession();
    const adjustReq = new Request('http://localhost:3000/api/admin/credits/adjust', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: adminCookie,
        'x-csrf-token': csrfToken,
      },
      body: JSON.stringify({
        targetEmail: 'tariq@oudstore.sa',
        amount: 50,
        reason: 'SLA compensation for campaign shoot',
      }),
    });

    const res = await postAdminAdjustCredits(adjustReq);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.newBalance, 55); // 5 initial + 50 adjustment
    assert.ok(body.auditLogId);

    const db = getDb();
    const auditRow = db
      .prepare(`SELECT "userId", "action", "targetId", "details" FROM "AdminAuditLog" WHERE "id" = ?`)
      .get(body.auditLogId);
    assert.equal(auditRow.userId, adminUserId);
    assert.equal(auditRow.action, 'CREDIT_ADJUSTMENT');
    assert.equal(auditRow.targetId, targetWsId);
    const details = JSON.parse(auditRow.details);
    assert.equal(details.amount, 50);
    assert.equal(details.reason, 'SLA compensation for campaign shoot');
  });
});
