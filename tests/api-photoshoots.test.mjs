import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { signAssetUrl, verifySignedAssetUrl } from '../src/lib/storage/asset-storage.ts';
import { POST as registerPost } from '../src/app/api/auth/register/route.ts';
import { POST as generatePhotoshootPost } from '../src/app/api/photoshoots/generate/route.ts';
import { GET as getJobById } from '../src/app/api/jobs/[id]/route.ts';

function extractCookie(res) {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/shotistry_session=([^;]+)/);
  return match ? `shotistry_session=${match[1]}` : '';
}

async function registerMerchant(email, country = 'SA') {
  const res = await registerPost(
    new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'MerchantPassword2026!',
        country,
      }),
    })
  );
  const body = await res.json();
  return {
    cookie: extractCookie(res),
    csrfToken: body.csrfToken,
    workspaceId: body.activeWorkspace.workspaceId,
    userId: body.user.id,
  };
}

describe('Studio Generation API, Job Tracking & Signed Asset URLs (Integration)', () => {
  const sampleImage = createSampleProductPngDataUrl({
    width: 64,
    height: 64,
    backgroundColor: [255, 255, 255],
    productColor: [180, 40, 70],
    labelColor: [245, 210, 95],
  });

  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
  });

  test('rejects generation with 400 when rawImageBase64 is missing', async () => {
    const merchant = await registerMerchant('studio-1@shotistry.app');
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchant.cookie,
        'x-csrf-token': merchant.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Luxury Oud',
        productCategory: 'Fragrances',
        presetId: 'gulf_luxury_marble',
        aspectRatio: '1:1',
      }),
    });

    const res = await generatePhotoshootPost(req);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /rawImageBase64/i);
  });

  test('executes end-to-end product transformation, reserves & settles 1 credit, and persists job in SQL', async () => {
    const merchant = await registerMerchant('studio-2@shotistry.app');
    const intruder = await registerMerchant('intruder@shotistry.app');

    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchant.cookie,
        'x-csrf-token': merchant.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Royal Dates Box',
        productCategory: 'Gourmet',
        presetId: 'ramadan_eid_heritage',
        aspectRatio: '4:5',
        rawImageBase64: sampleImage,
      }),
    });

    const res = await generatePhotoshootPost(req);
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.data.aspectRatio, '4:5');
    assert.equal(body.data.resolution, '1080x1350');
    assert.equal(body.data.modelUsed, 'gemini-3.1-flash-image');
    assert.equal(body.data.creditsCharged, 1);
    assert.equal(body.data.remainingCredits, 4); // 5 initial trial - 1 settled
    assert.equal(body.data.fidelityVerified, true);
    assert.ok(body.data.fidelityScore >= 0.95);
    assert.ok(body.data.imageUrl.startsWith('data:image/png;base64,'));

    // Verify job is retrievable via GET /api/jobs/[id] by owning workspace
    const jobReq = new Request(`http://localhost:3000/api/jobs/${body.data.jobId}`, {
      headers: { cookie: merchant.cookie },
    });
    const jobRes = await getJobById(jobReq, {
      params: Promise.resolve({ id: body.data.jobId }),
    });
    assert.equal(jobRes.status, 200);
    const jobData = await jobRes.json();
    assert.equal(jobData.job.status, 'COMPLETED');
    assert.equal(jobData.job.reservationStatus, 'SETTLED');
    assert.equal(jobData.images.length, 1);

    // Verify a different authenticated workspace is blocked from reading this job (403 Forbidden)
    const crossWorkspaceReq = new Request(`http://localhost:3000/api/jobs/${body.data.jobId}`, {
      headers: { cookie: intruder.cookie },
    });
    const crossRes = await getJobById(crossWorkspaceReq, {
      params: Promise.resolve({ id: body.data.jobId }),
    });
    assert.equal(crossRes.status, 403);
  });

  test('rejects with 402 Payment Required when workspace has 0 available credits', async () => {
    const merchant = await registerMerchant('broke@shotistry.app');
    const ledger = new CreditLedgerService();
    // Debit all 5 trial credits via admin adjustment
    await ledger.grantCredits({
      workspaceId: merchant.workspaceId,
      amount: -5,
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: 'drain-ws-broke',
      description: 'Drain credits for 402 test',
    });

    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchant.cookie,
        'x-csrf-token': merchant.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Perfume',
        productCategory: 'Fragrances',
        presetId: 'gulf_luxury_marble',
        aspectRatio: '1:1',
        rawImageBase64: sampleImage,
      }),
    });

    const res = await generatePhotoshootPost(req);
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.match(body.error, /Insufficient credits/i);
  });

  test('releases credit reservation if image processing fails so customer loses 0 credits', async () => {
    const merchant = await registerMerchant('fail-refund@shotistry.app');
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchant.cookie,
        'x-csrf-token': merchant.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Perfume',
        productCategory: 'Fragrances',
        presetId: 'gulf_luxury_marble',
        aspectRatio: '1:1',
        // Corrupt base64 image payload triggers decoder error after reservation
        rawImageBase64: 'data:image/png;base64,!!!not-a-valid-image!!!',
      }),
    });

    const res = await generatePhotoshootPost(req);
    assert.ok(res.status >= 400);

    const ledger = new CreditLedgerService();
    const balance = await ledger.getWorkspaceBalance(merchant.workspaceId);
    assert.equal(balance.settledBalance, 5);
    assert.equal(balance.reservedCredits, 0);
    assert.equal(balance.availableCredits, 5);
  });

  test('signs and verifies time-limited asset download URLs and blocks tampering', () => {
    const signed = signAssetUrl('workspaces/ws-1/job-1.png', 60);
    const validCheck = verifySignedAssetUrl(signed.key, signed.expires, signed.signature);
    assert.equal(validCheck.valid, true);

    const tamperedCheck = verifySignedAssetUrl(
      'workspaces/ws-2/other.png',
      signed.expires,
      signed.signature
    );
    assert.equal(tamperedCheck.valid, false);

    const expiredSigned = signAssetUrl('workspaces/ws-1/job-1.png', -10);
    const expiredCheck = verifySignedAssetUrl(
      expiredSigned.key,
      expiredSigned.expires,
      expiredSigned.signature
    );
    assert.equal(expiredCheck.valid, false);
  });

  test('enforces plan model/resolution entitlements (403 on Free 4K/Pro) and deducts weighted credits for Pro 4K shoots', async () => {
    const merchant = await registerMerchant('plan-gate@shotistry.app');

    // FREE plan requesting gemini-3-pro-image at 4K must be rejected with 403
    const freeProReq = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchant.cookie,
        'x-csrf-token': merchant.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Luxury Oud',
        productCategory: 'Fragrances',
        presetId: 'gulf_luxury_marble',
        aspectRatio: '1:1',
        model: 'gemini-3-pro-image',
        imageSize: '4K',
        rawImageBase64: sampleImage,
      }),
    });
    const freeProRes = await generatePhotoshootPost(freeProReq);
    assert.equal(freeProRes.status, 403);

    // Upgrade workspace to PRO plan
    const db = getDb();
    db.prepare(
      `UPDATE "Subscription" SET "planTier" = 'PRO', "status" = 'ACTIVE', "monthlyCredits" = 200 WHERE "workspaceId" = ?`
    ).run(merchant.workspaceId);

    const pro4kReq = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: merchant.cookie,
        'x-csrf-token': merchant.csrfToken,
      },
      body: JSON.stringify({
        productTitle: 'Luxury Oud',
        productCategory: 'Fragrances',
        presetId: 'gulf_luxury_marble',
        aspectRatio: '1:1',
        model: 'gemini-3-pro-image',
        imageSize: '4K',
        rawImageBase64: sampleImage,
      }),
    });
    const pro4kRes = await generatePhotoshootPost(pro4kReq);
    assert.equal(pro4kRes.status, 200);
    const pro4kBody = await pro4kRes.json();
    assert.equal(pro4kBody.data.modelUsed, 'gemini-3-pro-image');
    assert.equal(pro4kBody.data.creditsCharged, 4);
    assert.equal(pro4kBody.data.remainingCredits, 1); // 5 - 4 credits
  });
});
