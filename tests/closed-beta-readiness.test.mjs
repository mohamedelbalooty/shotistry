import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  createBetaInviteCode,
  validateBetaInviteCode,
  redeemBetaInvite,
} from '../src/lib/auth/beta-invites.ts';
import { createSession } from '../src/lib/auth/session.ts';
import { getAdminRepository } from '../src/lib/db/repositories/admin-repository.ts';
import { getDb, withSerializableTransaction } from '../src/lib/db/prisma.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { POST as registerRoute } from '../src/app/api/auth/register/route.ts';
import { POST as feedbackRoute } from '../src/app/api/images/[id]/feedback/route.ts';

test('Milestone M11 — Beta Invite Code Validation & Redemption Logic', async () => {
  const ledger = new CreditLedgerService();
  const timestamp = Date.now();
  const { user } = await ledger.registerMerchantWithInitialWorkspace({
    email: `merchant-beta-${timestamp}@example.com`,
    passwordHash: 'hash123',
    name: 'Beta Tester',
  });

  const codeName = `BETA-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const created = await createBetaInviteCode({
    code: codeName,
    description: 'VIP Beta Merchant Test Code',
    maxUses: 1,
  });

  assert.equal(created.code, codeName);

  // 1. Valid code check
  const validCheck = await validateBetaInviteCode(codeName);
  assert.equal(validCheck.isValid, true);
  assert.equal(validCheck.usedCount, 0);
  assert.equal(validCheck.maxUses, 1);

  // 2. Non-existent code check
  const invalidCheck = await validateBetaInviteCode('NONEXISTENT-CODE-1234');
  assert.equal(invalidCheck.isValid, false);
  assert.equal(invalidCheck.reason, 'NOT_FOUND');

  // 3. Redeem code with real user
  await redeemBetaInvite(created.id, user.id);

  // 4. Check that code is now exhausted
  const exhaustedCheck = await validateBetaInviteCode(codeName);
  assert.equal(exhaustedCheck.isValid, false);
  assert.equal(exhaustedCheck.reason, 'EXHAUSTED');
});

test('Milestone M11 — Registration Gating with SHOTISTRY_BETA_INVITE_REQUIRED=1', async () => {
  const originalEnv = process.env.SHOTISTRY_BETA_INVITE_REQUIRED;
  process.env.SHOTISTRY_BETA_INVITE_REQUIRED = '1';

  try {
    const timestamp = Date.now();
    const email = `merchant-gated-${timestamp}@example.com`;
    const password = 'Password123!Secure';

    // 1. Attempt registration WITHOUT invite code -> must be rejected with 403
    const reqWithoutCode = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email,
        password,
      }),
    });

    const resWithoutCode = await registerRoute(reqWithoutCode);
    assert.equal(resWithoutCode.status, 403, 'Should reject registration without invite code');
    const dataWithoutCode = await resWithoutCode.json();
    assert.equal(dataWithoutCode.code, 'BETA_INVITE_REQUIRED');

    // 2. Attempt registration with INVALID invite code -> must be rejected with 403
    const reqWithBadCode = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email,
        password,
        inviteCode: 'INVALID-CODE-XYZ',
      }),
    });

    const resWithBadCode = await registerRoute(reqWithBadCode);
    assert.equal(resWithBadCode.status, 403, 'Should reject invalid invite code');

    // 3. Create valid invite code and register
    const validInviteCode = `VIP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    await createBetaInviteCode({
      code: validInviteCode,
      description: 'Test Gated Invite',
      maxUses: 1,
    });

    const reqWithGoodCode = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email,
        password,
        name: 'تاجر المدعوين',
        inviteCode: validInviteCode,
      }),
    });

    const resWithGoodCode = await registerRoute(reqWithGoodCode);
    assert.equal(resWithGoodCode.status, 201, 'Registration should succeed with valid beta invite code');
    const dataWithGoodCode = await resWithGoodCode.json();
    assert.equal(dataWithGoodCode.success, true);
    assert.equal(dataWithGoodCode.user.email, email);

    // 4. Verify invite code is now exhausted and cannot be reused
    const reqReuseCode = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email: `another-${timestamp}@example.com`,
        password,
        inviteCode: validInviteCode,
      }),
    });

    const resReuseCode = await registerRoute(reqReuseCode);
    assert.equal(resReuseCode.status, 403, 'Should reject exhausted invite code');
  } finally {
    if (originalEnv === undefined) {
      delete process.env.SHOTISTRY_BETA_INVITE_REQUIRED;
    } else {
      process.env.SHOTISTRY_BETA_INVITE_REQUIRED = originalEnv;
    }
  }
});

test('Milestone M11 — Per-Image Feedback & Cross-Workspace Isolation', async () => {
  const ledger = new CreditLedgerService();
  const timestamp = Date.now();

  // Create workspace A and merchant A
  const { user: userA, workspace: wsA } = await ledger.registerMerchantWithInitialWorkspace({
    email: `merchant-a-${timestamp}@example.com`,
    passwordHash: 'hash',
    name: 'Merchant A',
  });

  // Create workspace B and merchant B
  const { user: userB, workspace: wsB } = await ledger.registerMerchantWithInitialWorkspace({
    email: `merchant-b-${timestamp}@example.com`,
    passwordHash: 'hash',
    name: 'Merchant B',
  });

  // Insert a test GeneratedImage under workspace A
  const db = getDb();
  const brandId = `brand-${crypto.randomUUID()}`;
  const prodId = `prod-${crypto.randomUUID()}`;
  const shootId = `shoot-${crypto.randomUUID()}`;
  const jobId = `job-${crypto.randomUUID()}`;
  const imageId = `img-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO "Brand" ("id", "workspaceId", "name", "createdAt", "updatedAt")
     VALUES (?, ?, 'Brand A', ?, ?)`
  ).run(brandId, wsA.workspaceId, now, now);

  db.prepare(
    `INSERT INTO "Product" ("id", "brandId", "name", "category", "createdAt", "updatedAt")
     VALUES (?, ?, 'Product A', 'Perfume', ?, ?)`
  ).run(prodId, brandId, now, now);

  db.prepare(
    `INSERT INTO "Photoshoot" ("id", "workspaceId", "productId", "title", "stylePreset", "aspectRatio", "createdAt", "updatedAt")
     VALUES (?, ?, ?, 'Product A Shoot', 'gulf_luxury_marble', '1:1', ?, ?)`
  ).run(shootId, wsA.workspaceId, prodId, now, now);

  db.prepare(
    `INSERT INTO "GenerationJob" ("id", "photoshootId", "status", "modelUsed", "rawPrompt", "synthesizedPrompt", "createdAt")
     VALUES (?, ?, 'COMPLETED', 'gemini-3.1-flash-image', 'raw prompt', 'synth prompt', ?)`
  ).run(jobId, shootId, now);

  db.prepare(
    `INSERT INTO "GeneratedImage" ("id", "generationJobId", "imageUrl", "createdAt")
     VALUES (?, ?, 'https://assets.shotistry.com/raw/img.png', ?)`
  ).run(imageId, jobId, now);

  // Create sessions for User A and User B
  const sessionResultA = await createSession({
    userId: userA.id,
    activeWorkspaceId: wsA.workspaceId,
  });
  const tokenA = sessionResultA.rawToken;
  const csrfA = sessionResultA.session.csrfToken;

  const sessionResultB = await createSession({
    userId: userB.id,
    activeWorkspaceId: wsB.workspaceId,
  });
  const tokenB = sessionResultB.rawToken;
  const csrfB = sessionResultB.session.csrfToken;

  // 1. Merchant B attempts to submit feedback on Merchant A's image -> MUST BE REJECTED 403
  const reqCrossWorkspace = new Request(`http://localhost:3000/api/images/${imageId}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `shotistry_session=${tokenB}`,
      'x-csrf-token': csrfB,
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      rating: 'THUMBS_DOWN',
      reason: 'POOR_LIGHTING',
      comment: 'Trying to tamper with foreign image',
    }),
  });

  const resCrossWorkspace = await feedbackRoute(reqCrossWorkspace, {
    params: Promise.resolve({ id: imageId }),
  });
  assert.equal(resCrossWorkspace.status, 403, 'Cross-workspace feedback submission must be rejected with 403');

  // 2. Merchant A submits feedback on their own image -> SUCCEEDS
  const reqValidFeedback = new Request(`http://localhost:3000/api/images/${imageId}/feedback`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `shotistry_session=${tokenA}`,
      'x-csrf-token': csrfA,
      origin: 'http://localhost:3000',
    },
    body: JSON.stringify({
      rating: 'THUMBS_UP',
      comment: 'Great commercial photography quality!',
    }),
  });

  const resValidFeedback = await feedbackRoute(reqValidFeedback, {
    params: Promise.resolve({ id: imageId }),
  });
  assert.equal(resValidFeedback.status, 200, 'Legitimate feedback submission must succeed');
  const dataValidFeedback = await resValidFeedback.json();
  assert.equal(dataValidFeedback.success, true);
  assert.equal(dataValidFeedback.feedback.rating, 'THUMBS_UP');
  assert.equal(dataValidFeedback.feedback.comment, 'Great commercial photography quality!');
});

test('Milestone M11 — Funnel Metrics in Platform Metrics Summary', async () => {
  const adminRepo = getAdminRepository();
  const metrics = await adminRepo.getPlatformMetrics();

  assert.ok(metrics.funnelMetrics, 'Platform metrics must include funnelMetrics');
  assert.equal(typeof metrics.funnelMetrics.totalRegistrations, 'number');
  assert.equal(typeof metrics.funnelMetrics.verifiedUsers, 'number');
  assert.equal(typeof metrics.funnelMetrics.workspacesWithPhotoshoots, 'number');
  assert.equal(typeof metrics.funnelMetrics.workspacesWithGenerations, 'number');
  assert.equal(typeof metrics.funnelMetrics.payingSubscribers, 'number');
  assert.equal(typeof metrics.funnelMetrics.conversionRatePercent, 'number');
});
