import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { bootstrapPlatformAdmin } from '../src/lib/auth/admin-bootstrap.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { POST as registerPost } from '../src/app/api/auth/register/route.ts';
import { POST as loginPost } from '../src/app/api/auth/login/route.ts';
import { GET as getWorkspaceSession } from '../src/app/api/workspace/session/route.ts';
import { POST as postUploadAsset } from '../src/app/api/assets/upload/route.ts';
import { GET as getDownloadAsset } from '../src/app/api/assets/download/route.ts';
import { POST as postGeneratePhotoshoot } from '../src/app/api/photoshoots/generate/route.ts';
import { GET as getJobById } from '../src/app/api/jobs/[id]/route.ts';
import { GET as getBillingPlans } from '../src/app/api/billing/plans/route.ts';
import { POST as postCheckoutIntent } from '../src/app/api/billing/checkout-intent/route.ts';
import { GET as getAdminMetrics } from '../src/app/api/admin/metrics/route.ts';
import { POST as postAdminAdjust } from '../src/app/api/admin/credits/adjust/route.ts';

import { markEmailVerifiedForTests } from './helpers/verify-email.mjs';

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/shotistry_session=([^;]+)/);
  return match ? `shotistry_session=${match[1]}` : '';
}

describe('Full Shotistry Merchant & Admin End-to-End Workflow', () => {
  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = 'bootstrap_secret_minimum_32_characters_ok';
  });

  test('completes full merchant journey: Register -> Session -> Asset Upload/Signed Download -> Studio Transformation -> Job Verification -> Paymob Checkout/Webhook -> Admin Telemetry & Audit Log', async () => {
    // 0. Register a merchant account atomically (5 initial trial credits, SAR)
    const regRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-merchant@riyadh.sa',
          password: 'MerchantE2ePassword2026!',
          name: 'E2E Merchant',
          country: 'SA',
          workspaceName: 'E2E Saudi Studio',
        }),
      })
    );
    assert.equal(regRes.status, 201);
    const merchantCookie = extractCookie(regRes);
    const regBody = await regRes.json();
    const merchantWsId = regBody.activeWorkspace.workspaceId;
    const merchantCsrf = regBody.csrfToken;

    const authHeaders = {
      cookie: merchantCookie,
      'x-csrf-token': merchantCsrf,
    };

    // 1. Inspect initial workspace session (5 free trial credits)
    const sessionRes1 = await getWorkspaceSession(
      new Request('http://localhost:3000/api/workspace/session', {
        headers: { cookie: merchantCookie },
      })
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
        headers: { ...authHeaders, 'content-type': 'application/json' },
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
        headers: { ...authHeaders, 'content-type': 'application/json' },
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
      new Request(`http://localhost:3000/api/jobs/${genBody.data.jobId}`, {
        headers: { cookie: merchantCookie },
      }),
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

    await markEmailVerifiedForTests(regBody.user.id);

    const checkoutRes = await postCheckoutIntent(
      new Request('http://localhost:3000/api/billing/checkout-intent', {
        method: 'POST',
        headers: { ...authHeaders, 'content-type': 'application/json' },
        body: JSON.stringify({
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
      new Request('http://localhost:3000/api/workspace/session', {
        headers: { cookie: merchantCookie },
      })
    );
    const session2 = await sessionRes2.json();
    assert.equal(session2.workspace.availableCredits, 204);
    assert.equal(session2.workspace.planTier, 'PRO');
    assert.equal(session2.workspace.subscriptionStatus, 'ACTIVE');

    // 6. Bootstrap Platform Admin, authenticate, and verify Admin Metrics & Credit Adjustment (+25 -> 229)
    await bootstrapPlatformAdmin({
      email: 'e2e-admin@shotistry.app',
      password: 'AdminE2ePassword2026!',
      bootstrapSecret: process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET,
    });
    const adminLoginRes = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'e2e-admin@shotistry.app',
          password: 'AdminE2ePassword2026!',
        }),
      })
    );
    const adminCookie = extractCookie(adminLoginRes);
    const adminLoginBody = await adminLoginRes.json();

    const adjustRes = await postAdminAdjust(
      new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
          'x-csrf-token': adminLoginBody.csrfToken,
        },
        body: JSON.stringify({
          workspaceId: merchantWsId,
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
        headers: { cookie: adminCookie },
      })
    );
    assert.equal(metricsRes.status, 200);
    const metrics = await metricsRes.json();
    assert.equal(metrics.payingSubscribers, 1);
    assert.equal(metrics.mrrSar, 189);
    assert.equal(metrics.totalImagesGenerated, 1);
    assert.equal(metrics.generationSuccessRate, 100);
    assert.ok(metrics.recentAuditLogs.some((l) => l.action === 'CREDIT_ADJUSTMENT'));
  });
});
