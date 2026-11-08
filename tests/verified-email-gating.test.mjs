import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { getAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import { createSession } from '../src/lib/auth/session.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { markEmailVerifiedForTests } from './helpers/verify-email.mjs';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import {
  setEmailTransportForTests,
  MemoryEmailTransport,
} from '../src/lib/email/index.ts';

// Gated routes
import { POST as checkoutIntentRoute } from '../src/app/api/billing/checkout-intent/route.ts';
import { POST as workspacesRoute } from '../src/app/api/workspaces/route.ts';
import { POST as membersRoute } from '../src/app/api/workspaces/[id]/members/route.ts';
import { POST as acceptInviteRoute } from '../src/app/api/workspaces/invites/accept/route.ts';

// Non-gated routes
import { POST as generateRoute } from '../src/app/api/photoshoots/generate/route.ts';
import { POST as paymobWebhookRoute } from '../src/app/api/webhooks/paymob/route.ts';

describe('Phase 7 — Verified-Email Gating', () => {
  let memoryTransport;
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
    memoryTransport = new MemoryEmailTransport();
    setEmailTransportForTests(memoryTransport);
  });

  afterEach(() => {
    setEmailTransportForTests(null);
  });

  test('unverified merchant is blocked with 403 EMAIL_VERIFICATION_REQUIRED on checkout intent', async () => {
    const ledger = new CreditLedgerService();
    const { user, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'unverified.checkout@shotistry.app',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Unverified Studio',
    });

    const s = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.id,
    });

    const req = new Request('http://localhost/api/billing/checkout-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: s.cookieHeader,
        'x-csrf-token': s.session.csrfToken,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        planTier: 'PRO',
        billingPeriod: 'MONTHLY',
        currency: 'EGP',
      }),
    });

    const res = await checkoutIntentRoute(req);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'EMAIL_VERIFICATION_REQUIRED');
    assert.match(body.error, /email verification is required/i);

    // Verify email and ensure it is now allowed
    await markEmailVerifiedForTests(user.id);
    const sVerified = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.id,
    });
    const req2 = new Request('http://localhost/api/billing/checkout-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sVerified.cookieHeader,
        'x-csrf-token': sVerified.session.csrfToken,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        planTier: 'PRO',
        billingPeriod: 'MONTHLY',
        currency: 'EGP',
      }),
    });
    const res2 = await checkoutIntentRoute(req2);
    assert.equal(res2.status, 200);
  });

  test('unverified merchant is blocked on workspace creation (POST /api/workspaces)', async () => {
    const ledger = new CreditLedgerService();
    const { user, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'unverified.ws@shotistry.app',
      passwordHash: await hashPassword('Password123!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Initial Studio',
    });

    const s = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.id,
    });

    const req = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: s.cookieHeader,
        'x-csrf-token': s.session.csrfToken,
      },
      body: JSON.stringify({ name: 'Secondary Studio' }),
    });

    const res = await workspacesRoute(req);
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.code, 'EMAIL_VERIFICATION_REQUIRED');

    // After email verification, workspace creation succeeds
    await markEmailVerifiedForTests(user.id);
    const sVerified = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.id,
    });
    const req2 = new Request('http://localhost/api/workspaces', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sVerified.cookieHeader,
        'x-csrf-token': sVerified.session.csrfToken,
      },
      body: JSON.stringify({ name: 'Secondary Studio' }),
    });
    const res2 = await workspacesRoute(req2);
    assert.equal(res2.status, 201);
  });

  test('unverified merchant is allowed on generation (photoshoots:generate) using trial credits', async () => {
    const ledger = new CreditLedgerService();
    const { user, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'unverified.gen@shotistry.app',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Creative Studio',
    });

    const s = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.id,
    });

    const req = new Request('http://localhost/api/photoshoots/generate', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: s.cookieHeader,
        'x-csrf-token': s.session.csrfToken,
      },
      body: JSON.stringify({
        workspaceId: workspace.id,
        productTitle: 'Perfume Bottle',
        preset: 'gulf_luxury_marble',
        rawImageBase64: sampleImage,
      }),
    });

    const res = await generateRoute(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.jobId);
  });
});
