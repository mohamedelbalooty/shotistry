import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { GET as getAdminMetrics } from '../src/app/api/admin/metrics/route.ts';
import { POST as postAdminAdjustCredits } from '../src/app/api/admin/credits/adjust/route.ts';
import { POST as generatePhotoshootPost } from '../src/app/api/photoshoots/generate/route.ts';

describe('Admin Metrics & Audited Credit Adjustments (Real SQL Aggregates)', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  test('rejects non-admin requests with 403 Forbidden', async () => {
    const req = new Request('http://localhost:3000/api/admin/metrics', {
      headers: {
        'x-user-id': 'user-regular',
        'x-user-role': 'USER',
      },
    });
    const res = await getAdminMetrics(req);
    assert.equal(res.status, 403);
  });

  test('returns real SQL aggregates (0 on fresh DB, never hardcoded 1480/5880 demo constants)', async () => {
    const req = new Request('http://localhost:3000/api/admin/metrics', {
      headers: {
        'x-user-id': 'admin-1',
        'x-user-role': 'ADMIN',
      },
    });

    const res = await getAdminMetrics(req);
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
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-merchant-sa',
      email: 'merchant@riyadh.sa',
      workspaceId: 'ws-merchant-sa',
      country: 'SA',
      currency: 'SAR',
    });

    // Activate PRO subscription in SQL (189 SAR)
    const db = getDb();
    db.prepare(
      `UPDATE "Subscription" SET "planTier" = 'PRO', "status" = 'ACTIVE', "currency" = 'SAR', "monthlyCredits" = 200 WHERE "workspaceId" = ?`
    ).run('ws-merchant-sa');

    // Run 1 real photoshoot generation job
    const sampleImg = createSampleProductPngDataUrl({ width: 48, height: 48 });
    const genReq = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': 'ws-merchant-sa',
        'x-user-id': 'user-merchant-sa',
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

    // Query Admin Metrics
    const adminReq = new Request('http://localhost:3000/api/admin/metrics', {
      headers: {
        'x-user-id': 'admin-1',
        'x-user-role': 'ADMIN',
      },
    });
    const adminRes = await getAdminMetrics(adminReq);
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
  });

  test('executes audited credit adjustments and writes immutable AdminAuditLog in SQL', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-target',
      email: 'tariq@oudstore.sa',
      workspaceId: 'ws-target',
      country: 'SA',
      currency: 'SAR',
    });

    const adjustReq = new Request('http://localhost:3000/api/admin/credits/adjust', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-user-id': 'admin-root',
        'x-user-role': 'ADMIN',
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
      .prepare(`SELECT "action", "targetId", "details" FROM "AdminAuditLog" WHERE "id" = ?`)
      .get(body.auditLogId);
    assert.equal(auditRow.action, 'CREDIT_ADJUSTMENT');
    assert.equal(auditRow.targetId, 'ws-target');
    const details = JSON.parse(auditRow.details);
    assert.equal(details.amount, 50);
    assert.equal(details.reason, 'SLA compensation for campaign shoot');
  });
});

