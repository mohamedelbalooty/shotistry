import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests } from '../src/lib/db/prisma.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { signAssetUrl, verifySignedAssetUrl } from '../src/lib/storage/asset-storage.ts';
import { POST as generatePhotoshootPost } from '../src/app/api/photoshoots/generate/route.ts';
import { GET as getJobById } from '../src/app/api/jobs/[id]/route.ts';

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
  });

  test('rejects generation with 400 when rawImageBase64 is missing', async () => {
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': 'ws-studio-1',
        'x-user-id': 'user-studio-1',
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
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': 'ws-studio-2',
        'x-user-id': 'user-studio-2',
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
    assert.equal(body.data.modelUsed, 'gemini-nano-banana-2.1');
    assert.equal(body.data.creditsCharged, 1);
    assert.equal(body.data.remainingCredits, 4); // 5 initial trial - 1 settled
    assert.equal(body.data.fidelityVerified, true);
    assert.ok(body.data.fidelityScore >= 0.95);
    assert.ok(body.data.imageUrl.startsWith('data:image/png;base64,'));

    // Verify job is retrievable via GET /api/jobs/[id] by owning workspace
    const jobReq = new Request(`http://localhost:3000/api/jobs/${body.data.jobId}`, {
      headers: {
        'x-workspace-id': 'ws-studio-2',
        'x-user-id': 'user-studio-2',
      },
    });
    const jobRes = await getJobById(jobReq, {
      params: Promise.resolve({ id: body.data.jobId }),
    });
    assert.equal(jobRes.status, 200);
    const jobData = await jobRes.json();
    assert.equal(jobData.job.status, 'COMPLETED');
    assert.equal(jobData.job.reservationStatus, 'SETTLED');
    assert.equal(jobData.images.length, 1);

    // Verify a different workspace is blocked from reading this job (403 Forbidden)
    const crossWorkspaceReq = new Request(`http://localhost:3000/api/jobs/${body.data.jobId}`, {
      headers: {
        'x-workspace-id': 'ws-intruder',
        'x-user-id': 'user-intruder',
      },
    });
    const crossRes = await getJobById(crossWorkspaceReq, {
      params: Promise.resolve({ id: body.data.jobId }),
    });
    assert.equal(crossRes.status, 403);
  });

  test('rejects with 402 Payment Required when workspace has 0 available credits', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-broke',
      workspaceId: 'ws-broke',
    });
    // Debit all 5 trial credits via admin adjustment
    await ledger.grantCredits({
      workspaceId: 'ws-broke',
      amount: -5,
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: 'drain-ws-broke',
      description: 'Drain credits for 402 test',
    });

    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': 'ws-broke',
        'x-user-id': 'user-broke',
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
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': 'ws-fail-refund',
        'x-user-id': 'user-fail-refund',
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
    const balance = await ledger.getWorkspaceBalance('ws-fail-refund');
    assert.equal(balance.settledBalance, 5);
    assert.equal(balance.reservedCredits, 0);
    assert.equal(balance.availableCredits, 5);
  });

  test('signs and verifies time-limited asset download URLs and blocks tampering', () => {
    const signed = signAssetUrl('workspaces/ws-1/job-1.png', 60);
    const validCheck = verifySignedAssetUrl(signed.key, signed.expires, signed.signature);
    assert.equal(validCheck.valid, true);

    const tamperedCheck = verifySignedAssetUrl('workspaces/ws-2/other.png', signed.expires, signed.signature);
    assert.equal(tamperedCheck.valid, false);

    const expiredSigned = signAssetUrl('workspaces/ws-1/job-1.png', -10);
    const expiredCheck = verifySignedAssetUrl(
      expiredSigned.key,
      expiredSigned.expires,
      expiredSigned.signature
    );
    assert.equal(expiredCheck.valid, false);
  });
});
