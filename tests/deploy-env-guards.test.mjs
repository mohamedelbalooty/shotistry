import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDeployEnv, isProductionLike, isMockFallbackAllowed } from '../src/lib/config/env.ts';
import { GeminiClient } from '../src/lib/ai/gemini-client.ts';
import { POST as checkoutIntentPost } from '../src/app/api/billing/checkout-intent/route.ts';
import { GET as healthGet } from '../src/app/api/health/route.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { createSession } from '../src/lib/auth/session.ts';
import { markEmailVerifiedForTests } from './helpers/verify-email.mjs';
import { hashPassword } from '../src/lib/auth/password.ts';

describe('Milestone M1 — Deployment Environment Model, Fail-Closed Guards & Health Endpoint', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('getDeployEnv resolves current deploy environment correctly', () => {
    process.env.SHOTISTRY_DEPLOY_ENV = 'staging';
    assert.equal(getDeployEnv(), 'staging');
    assert.equal(isProductionLike(), true);
    assert.equal(isMockFallbackAllowed(), false);

    process.env.SHOTISTRY_DEPLOY_ENV = 'production';
    assert.equal(getDeployEnv(), 'production');
    assert.equal(isProductionLike(), true);
    assert.equal(isMockFallbackAllowed(), false);

    process.env.SHOTISTRY_DEPLOY_ENV = 'local';
    assert.equal(getDeployEnv(), 'local');
    assert.equal(isProductionLike(), false);
    assert.equal(isMockFallbackAllowed(), true);

    delete process.env.SHOTISTRY_DEPLOY_ENV;
    process.env.NODE_ENV = 'test';
    assert.equal(getDeployEnv(), 'test');
    assert.equal(isProductionLike(), false);
    assert.equal(isMockFallbackAllowed(), true);
  });

  test('GeminiClient in staging or production fails closed if GEMINI_API_KEY is not configured', async () => {
    process.env.SHOTISTRY_DEPLOY_ENV = 'staging';
    delete process.env.GEMINI_API_KEY;

    const client = new GeminiClient();
    assert.equal(client.isLiveMode(), false);

    // Calling generateProductPhoto must reject instead of returning silent LOCAL_COMPOSITE_SANDBOX
    await assert.rejects(
      async () => {
        await client.generateProductPhoto('job-test-m1', {
          prompt: 'test studio prompt',
          negativePrompt: 'blurry',
          aspectRatio: '1:1',
          imageSize: '1K',
          referenceImageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        });
      },
      (err) => {
        assert.ok(
          err.message.includes('AI provider unavailable') ||
            err.message.includes('GEMINI_API_KEY is required in staging and production'),
          `Unexpected error message: ${err.message}`
        );
        return true;
      }
    );
  });

  test('POST /api/billing/checkout-intent strictly blocks sandboxSimulateWebhook in staging', async () => {
    process.env.SHOTISTRY_DEPLOY_ENV = 'staging';
    process.env.NODE_ENV = 'test';

    // Register a merchant to obtain authentic session
    const ledger = new CreditLedgerService();
    const reg = await ledger.registerMerchantWithInitialWorkspace({
      email: `m1_staging_billing_${Date.now()}@example.com`,
      passwordHash: await hashPassword('StrongPassword123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Staging Brand',
    });

    await markEmailVerifiedForTests(reg.user.id);
    const sessionRes = await createSession({
      userId: reg.user.id,
      activeWorkspaceId: reg.workspace.id,
    });

    const cookieName =
      process.env.NODE_ENV === 'production' ? '__Host-shotistry_session' : 'shotistry_session';
    const req = new Request('http://localhost:3000/api/billing/checkout-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `${cookieName}=${sessionRes.rawToken}`,
        'x-csrf-token': sessionRes.session.csrfToken,
      },
      body: JSON.stringify({
        kind: 'SUBSCRIPTION',
        planTier: 'STARTER',
        currency: 'EGP',
        paymentMethod: 'card',
        sandboxSimulateWebhook: true,
      }),
    });

    const res = await checkoutIntentPost(req);
    const body = await res.json();
    assert.equal(res.status, 403, `Expected 403 but got ${res.status}: ${JSON.stringify(body)}`);
    assert.equal(body.success, false);
    assert.ok(
      body.error.includes('Simulation is disabled') ||
        body.error.includes('disabled in production') ||
        body.error.includes('disabled in staging')
    );
  });

  test('GET /api/health returns 200 with operational telemetry and no secret leakage', async () => {
    process.env.SHOTISTRY_DEPLOY_ENV = 'staging';
    process.env.APP_BASE_URL = 'https://staging.shotistry.com';

    const req = new Request('http://localhost:3000/api/health');
    const res = await healthGet(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.equal(body.deployEnv, 'staging');
    assert.equal(typeof body.database, 'object');
    assert.equal(typeof body.database.connected, 'boolean');
    assert.equal(typeof body.storage, 'object');
    assert.equal(typeof body.timestamp, 'string');

    // Confirm no secrets leaked
    const jsonStr = JSON.stringify(body);
    assert.ok(!jsonStr.includes('postgres://'));
    assert.ok(!jsonStr.includes('AIzaSy'));
    assert.ok(!jsonStr.includes('secret'));
    assert.ok(!jsonStr.includes('re_'));
  });
});
