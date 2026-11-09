import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { POST as generatePost } from '../src/app/api/photoshoots/generate/route.ts';
import { GET as getJobById } from '../src/app/api/jobs/[id]/route.ts';
import { POST as reaperPost } from '../src/app/api/cron/generation-reaper/route.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { createSession } from '../src/lib/auth/session.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { getPhotoshootRepository } from '../src/lib/db/repositories/photoshoot-repository.ts';
import { processGenerationJob } from '../src/lib/jobs/generation-worker.ts';

describe('Milestone M3 — Asynchronous, Recoverable Generation Jobs & Reaper', () => {
  const originalEnv = { ...process.env };
  let merchantSession;
  let foreignSession;
  let sampleImage;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = 'test_cron_secret_for_generation_reaper_456';

    const fixturePath = path.resolve('tests/fixtures/product-ruby.png');
    const imageBytes = fs.readFileSync(fixturePath);
    sampleImage = `data:image/png;base64,${imageBytes.toString('base64')}`;

    const ledger = new CreditLedgerService();
    const reg1 = await ledger.registerMerchantWithInitialWorkspace({
      email: `m3_merchant_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
      passwordHash: await hashPassword('StrongPassword123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Studio M3 Alpha',
    });

    const s1 = await createSession({
      userId: reg1.user.id,
      activeWorkspaceId: reg1.workspace.workspaceId,
    });
    merchantSession = {
      token: s1.rawToken,
      csrfToken: s1.session.csrfToken,
      workspaceId: reg1.workspace.workspaceId,
    };

    const reg2 = await ledger.registerMerchantWithInitialWorkspace({
      email: `m3_foreign_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@example.com`,
      passwordHash: await hashPassword('StrongPassword123!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Studio M3 Beta',
    });

    const s2 = await createSession({
      userId: reg2.user.id,
      activeWorkspaceId: reg2.workspace.workspaceId,
    });
    foreignSession = {
      token: s2.rawToken,
      csrfToken: s2.session.csrfToken,
      workspaceId: reg2.workspace.workspaceId,
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('POST /api/photoshoots/generate with Idempotency-Key returns HTTP 202 and prevents duplicate reservations', async () => {
    const idempotencyKey = `idemp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const makeReq = () =>
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `shotistry_session=${merchantSession.token}`,
          'x-csrf-token': merchantSession.csrfToken,
          'idempotency-key': idempotencyKey,
          prefer: 'respond-async',
        },
        body: JSON.stringify({
          productTitle: 'Egyptian Cotton Robe',
          productCategory: 'Fashion',
          presetId: 'gulf_luxury_marble',
          aspectRatio: '1:1',
          rawImageBase64: sampleImage,
        }),
      });

    // 1. First invocation creates job and single reservation
    const res1 = await generatePost(makeReq());
    assert.equal(res1.status, 202);
    const body1 = await res1.json();
    assert.equal(body1.success, true);
    assert.ok(body1.jobId);
    assert.equal(body1.status, 'QUEUED');

    const ledger = new CreditLedgerService();
    const balanceAfter1 = await ledger.getWorkspaceBalance(merchantSession.workspaceId);
    // Initial 5 trial credits: 1 credit reserved -> available = 4, reserved = 1
    assert.equal(balanceAfter1.availableCredits, 4);
    assert.equal(balanceAfter1.reservedCredits, 1);

    // 2. Duplicate invocation with identical Idempotency-Key returns same jobId without duplicate reservation
    const res2 = await generatePost(makeReq());
    assert.ok(res2.status === 200 || res2.status === 202);
    const body2 = await res2.json();
    assert.equal(body2.success, true);
    assert.equal(body2.jobId, body1.jobId);

    const balanceAfter2 = await ledger.getWorkspaceBalance(merchantSession.workspaceId);
    assert.equal(balanceAfter2.availableCredits, 4, 'Available credits must not be deducted twice');
    assert.equal(balanceAfter2.reservedCredits, 1, 'Reserved credits must not increase');
  });

  test('processGenerationJob successfully executes, settles reservation, and records output', async () => {
    const idempotencyKey = `idemp-worker-success-${Date.now()}`;
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
        'idempotency-key': idempotencyKey,
        prefer: 'respond-async',
      },
      body: JSON.stringify({
        productTitle: 'Handmade Clay Pot',
        productCategory: 'Home',
        presetId: 'studio_minimalist_pure',
        aspectRatio: '1:1',
        rawImageBase64: sampleImage,
      }),
    });

    const res = await generatePost(req);
    assert.equal(res.status, 202);
    const { jobId } = await res.json();

    // Execute background worker directly
    await processGenerationJob(jobId);

    const photoshootRepo = getPhotoshootRepository();
    const job = await photoshootRepo.findJobById(jobId);
    assert.ok(job);
    assert.equal(job.status, 'COMPLETED');
    assert.equal(job.reservationStatus, 'SETTLED');

    const ledger = new CreditLedgerService();
    const balance = await ledger.getWorkspaceBalance(merchantSession.workspaceId);
    assert.equal(balance.settledBalance, 4);
    assert.equal(balance.reservedCredits, 0);
    assert.equal(balance.availableCredits, 4);

    const images = await photoshootRepo.listJobImages(jobId);
    assert.equal(images.length, 1);
    assert.ok(images[0].imageUrl);
  });

  test('processGenerationJob on terminal error marks job FAILED and atomically releases reservation', async () => {
    const idempotencyKey = `idemp-worker-fail-${Date.now()}`;
    const req = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
        'idempotency-key': idempotencyKey,
        prefer: 'respond-async',
      },
      body: JSON.stringify({
        productTitle: 'Defective Product',
        productCategory: 'General',
        presetId: 'studio_minimalist_pure',
        aspectRatio: '1:1',
        rawImageBase64: sampleImage,
      }),
    });

    const res = await generatePost(req);
    assert.equal(res.status, 202);
    const { jobId } = await res.json();

    // Trigger failure by executing with an injected/forced failure simulation or invalid key
    await processGenerationJob(jobId, { simulateFailureError: 'Simulated downstream AI service 503' });

    const photoshootRepo = getPhotoshootRepository();
    const job = await photoshootRepo.findJobById(jobId);
    assert.ok(job);
    assert.equal(job.status, 'FAILED');
    assert.equal(job.reservationStatus, 'RELEASED');
    assert.ok(job.errorMessage?.includes('Simulated downstream AI service 503'));

    const ledger = new CreditLedgerService();
    const balance = await ledger.getWorkspaceBalance(merchantSession.workspaceId);
    // Initial 5 credits are fully restored because reservation was released
    assert.equal(balance.availableCredits, 5, 'Customer lost 0 credits on failed job');
    assert.equal(balance.reservedCredits, 0);
  });

  test('POST /api/cron/generation-reaper recovers stale RUNNING jobs and releases reservations', async () => {
    // 1. Unauthorized request without valid CRON_SECRET -> 401
    const unauthReq = new Request('http://localhost:3000/api/cron/generation-reaper', {
      method: 'POST',
    });
    const unauthRes = await reaperPost(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Create a job that gets stuck in PROCESSING with a stale timestamp (> 10 min old)
    const idempotencyKey = `idemp-stale-${Date.now()}`;
    const genReq = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
        'idempotency-key': idempotencyKey,
        prefer: 'respond-async',
      },
      body: JSON.stringify({
        productTitle: 'Stale Photoshoot Test',
        productCategory: 'Accessories',
        presetId: 'studio_minimalist_pure',
        aspectRatio: '1:1',
        rawImageBase64: sampleImage,
      }),
    });

    const genRes = await generatePost(genReq);
    assert.equal(genRes.status, 202);
    const { jobId } = await genRes.json();

    const photoshootRepo = getPhotoshootRepository();
    // Simulate job got stuck 15 minutes ago
    const staleTime = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    await photoshootRepo.markJobRunning(jobId, staleTime);

    // 3. Authorized reaper call recovers stale job
    const authReq = new Request('http://localhost:3000/api/cron/generation-reaper', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_cron_secret_for_generation_reaper_456',
      },
    });

    const reaperRes = await reaperPost(authReq);
    assert.equal(reaperRes.status, 200);
    const reaperBody = await reaperRes.json();
    assert.equal(reaperBody.success, true);
    assert.ok(reaperBody.reapedCount >= 1);

    const reapedJob = await photoshootRepo.findJobById(jobId);
    assert.equal(reapedJob.status, 'FAILED');
    assert.equal(reapedJob.reservationStatus, 'RELEASED');
    assert.equal(reapedJob.lastErrorCode, 'TIMEOUT_STALE_HEARTBEAT');

    const ledger = new CreditLedgerService();
    const balance = await ledger.getWorkspaceBalance(merchantSession.workspaceId);
    assert.equal(balance.availableCredits, 5, 'Stale job credits must be fully restored');
    assert.equal(balance.reservedCredits, 0);

    // 4. Repeated reaper execution is strictly idempotent (settlement/release cannot occur twice)
    const secondReaperRes = await reaperPost(
      new Request('http://localhost:3000/api/cron/generation-reaper', {
        method: 'POST',
        headers: {
          authorization: 'Bearer test_cron_secret_for_generation_reaper_456',
        },
      })
    );
    assert.equal(secondReaperRes.status, 200);
    const secondBody = await secondReaperRes.json();
    assert.equal(secondBody.reapedCount, 0, 'Already reaped job must not be re-processed');
  });

  test('GET /api/jobs/[id] blocks cross-workspace access with 403 or 404', async () => {
    const idempotencyKey = `idemp-iso-${Date.now()}`;
    const genReq = new Request('http://localhost:3000/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
        'idempotency-key': idempotencyKey,
        prefer: 'respond-async',
      },
      body: JSON.stringify({
        productTitle: 'Isolated Job Product',
        productCategory: 'Accessories',
        presetId: 'studio_minimalist_pure',
        aspectRatio: '1:1',
        rawImageBase64: sampleImage,
      }),
    });

    const genRes = await generatePost(genReq);
    const { jobId } = await genRes.json();

    // 1. Merchant accessing their own job -> 200
    const ownReq = new Request(`http://localhost:3000/api/jobs/${jobId}`, {
      headers: {
        cookie: `shotistry_session=${merchantSession.token}`,
      },
    });
    const ownRes = await getJobById(ownReq, { params: Promise.resolve({ id: jobId }) });
    assert.equal(ownRes.status, 200);

    // 2. Foreign workspace attempting to access -> 403 Forbidden
    const foreignReq = new Request(`http://localhost:3000/api/jobs/${jobId}`, {
      headers: {
        cookie: `shotistry_session=${foreignSession.token}`,
      },
    });
    const foreignRes = await getJobById(foreignReq, { params: Promise.resolve({ id: jobId }) });
    assert.equal(foreignRes.status, 403);
  });
});

