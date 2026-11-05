import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests } from '../src/lib/db/prisma.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { GET as getWorkspaceSession } from '../src/app/api/workspace/session/route.ts';
import { POST as postUploadAsset } from '../src/app/api/assets/upload/route.ts';
import { GET as getDownloadAsset } from '../src/app/api/assets/download/route.ts';
import { POST as postGeneratePhotoshoot } from '../src/app/api/photoshoots/generate/route.ts';
import { GET as getJobById } from '../src/app/api/jobs/[id]/route.ts';
import { GET as getBillingPlans } from '../src/app/api/billing/plans/route.ts';
import { POST as postCheckoutIntent } from '../src/app/api/billing/checkout-intent/route.ts';
import { GET as getAdminMetrics } from '../src/app/api/admin/metrics/route.ts';
import { POST as postAdminAdjust } from '../src/app/api/admin/credits/adjust/route.ts';

describe('Full Shotistry Merchant & Admin End-to-End Workflow', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  test('completes full merchant journey: Session -> Asset Upload/Signed Download -> Studio Transformation -> Job Verification -> Paymob Checkout/Webhook -> Admin Telemetry & Audit Log', async () => {
    const headers = {
      'x-workspace-id': 'ws-e2e-merchant',
      'x-user-id': 'user-e2e-merchant',
      'x-country': 'SA',
    };

    // 1. Provision & inspect initial workspace session (5 free trial credits)
    const sessionRes1 = await getWorkspaceSession(
      new Request('http://localhost:3000/api/workspace/session', { headers })
    );
    assert.equal(sessionRes1.status, 200);
    const session1 = await sessionRes1.json();
    assert.equal(session1.workspace.availableCredits, 5);
    assert.equal(session1.workspace.planTier, 'FREE');
    assert.equal(session1.workspace.currency, 'SAR');

    // 2. Upload customer product photo and verify signed download URL
    const rawProductPng = createSampleProductPngDataUrl({
      width: 72,
      height: 72,
      backgroundColor: [252, 252, 252],
      productColor: [155, 25, 45],
      labelColor: [240, 205, 85],
    });

    const uploadRes = await postUploadAsset(
      new Request('http://localhost:3000/api/assets/upload', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ imageBase64: rawProductPng }),
      })
    );
    assert.equal(uploadRes.status, 200);
    const uploaded = await uploadRes.json();
    assert.equal(uploaded.success, true);
    assert.ok(uploaded.asset.signedUrl.startsWith('/api/assets/download?'));

    const downloadRes = await getDownloadAsset(
      new Request(`http://localhost:3000${uploaded.asset.signedUrl}`)
    );
    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers.get('content-type'), 'image/png');
    const downloadedBytes = new Uint8Array(await downloadRes.arrayBuffer());
    assert.ok(downloadedBytes.length > 100);

    // 3. Execute Studio Photoshoot Generation with customer's product image
    const genRes = await postGeneratePhotoshoot(
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          productTitle: 'عطر العود الملكي الفاخر',
          productCategory: 'Fragrances',
          presetId: 'gulf_luxury_marble',
          aspectRatio: '1:1',
          rawImageBase64: rawProductPng,
        }),
      })
    );
    assert.equal(genRes.status, 200);
    const genBody = await genRes.json();
    assert.equal(genBody.success, true);
    assert.equal(genBody.data.remainingCredits, 4);
    assert.equal(genBody.data.modelUsed, 'gemini-3.1-flash-image');
    assert.equal(genBody.data.fidelityVerified, true);
    assert.ok(genBody.data.fidelityScore >= 0.95);

    // 4. Verify Job Status endpoint
    const jobRes = await getJobById(
      new Request(`http://localhost:3000/api/jobs/${genBody.data.jobId}`, { headers }),
      { params: Promise.resolve({ id: genBody.data.jobId }) }
    );
    assert.equal(jobRes.status, 200);
    const jobBody = await jobRes.json();
    assert.equal(jobBody.job.status, 'COMPLETED');
    assert.equal(jobBody.job.reservationStatus, 'SETTLED');

    // 5. Inspect regional billing plans (SAR) and upgrade to PRO (200 credits, 189 SAR)
    const plansRes = await getBillingPlans(
      new Request('http://localhost:3000/api/billing/plans?country=SA')
    );
    assert.equal(plansRes.status, 200);
    const plansBody = await plansRes.json();
    assert.equal(plansBody.currency, 'SAR');
    assert.equal(plansBody.plans.PRO.priceSAR, 189);

    const checkoutRes = await postCheckoutIntent(
      new Request('http://localhost:3000/api/billing/checkout-intent', {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({
          workspaceId: 'ws-e2e-merchant',
          kind: 'SUBSCRIPTION',
          planTier: 'PRO',
          currency: 'SAR',
          paymentMethod: 'mada',
          sandboxSimulateWebhook: true,
        }),
      })
    );
    assert.equal(checkoutRes.status, 200);
    const checkoutBody = await checkoutRes.json();
    assert.equal(checkoutBody.intent.status, 'SUCCEEDED_SANDBOX');

    // Verify workspace balance is now 4 + 200 = 204 credits and PRO plan is ACTIVE
    const sessionRes2 = await getWorkspaceSession(
      new Request('http://localhost:3000/api/workspace/session', { headers })
    );
    const session2 = await sessionRes2.json();
    assert.equal(session2.workspace.availableCredits, 204);
    assert.equal(session2.workspace.planTier, 'PRO');
    assert.equal(session2.workspace.subscriptionStatus, 'ACTIVE');

    // 6. Verify Admin Metrics & Audited Credit Adjustment (+25 credits -> 229 credits)
    const adjustRes = await postAdminAdjust(
      new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-user-id': 'admin-e2e',
          'x-user-role': 'ADMIN',
        },
        body: JSON.stringify({
          workspaceId: 'ws-e2e-merchant',
          targetEmail: session2.workspace.email,
          amount: 25,
          reason: 'VIP onboarding bonus',
        }),
      })
    );
    assert.equal(adjustRes.status, 200);
    const adjustBody = await adjustRes.json();
    assert.equal(adjustBody.newBalance, 229);

    const metricsRes = await getAdminMetrics(
      new Request('http://localhost:3000/api/admin/metrics', {
        headers: { 'x-user-role': 'ADMIN' },
      })
    );
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.json();
    assert.equal(metrics.payingSubscribers, 1);
    assert.equal(metrics.mrrSar, 189);
    assert.equal(metrics.totalImagesGenerated, 1);
    assert.equal(metrics.generationSuccessRate, 100);
    assert.equal(metrics.recentAuditLogs.length, 1);
  });
});

