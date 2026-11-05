import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { PaymobSecurity } from '../src/lib/paymob/paymob-hmac.ts';
import { POST as paymobWebhookPost } from '../src/app/api/webhooks/paymob/route.ts';
import { POST as checkoutIntentPost } from '../src/app/api/billing/checkout-intent/route.ts';

describe('Paymob Webhook & Checkout Lifecycle (Fail-Closed & Idempotent SQL Integration)', () => {
  const TEST_SECRET = 'live_grade_paymob_hmac_secret_2026_sha512';
  const originalSecret = process.env.PAYMOB_HMAC_SECRET;

  beforeEach(async () => {
    await resetDbForTests();
    process.env.PAYMOB_HMAC_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.PAYMOB_HMAC_SECRET;
    } else {
      process.env.PAYMOB_HMAC_SECRET = originalSecret;
    }
  });

  test('fails closed (503) when PAYMOB_HMAC_SECRET is unset or placeholder', async () => {
    delete process.env.PAYMOB_HMAC_SECRET;

    const req = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trigger_type: 'Subscription Created', subscription_data: { id: 1 } }),
    });

    const res = await paymobWebhookPost(req);
    assert.equal(res.status, 503);

    process.env.PAYMOB_HMAC_SECRET = 'placeholder_hmac_secret_sha512';
    const req2 = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trigger_type: 'Subscription Created', subscription_data: { id: 1 } }),
    });
    const res2 = await paymobWebhookPost(req2);
    assert.equal(res2.status, 503);
  });

  test('fails closed (401) in non-production when HMAC signature is invalid or missing', async () => {
    const reqInvalidSub = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        trigger_type: 'Subscription Created',
        subscription_data: { id: 12345 },
        hmac: 'deadbeef0000',
      }),
    });
    const res1 = await paymobWebhookPost(reqInvalidSub);
    assert.equal(res1.status, 401);

    // Unsigned arbitrary payload must NOT return 200 OK
    const reqUnsigned = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hello: 'world' }),
    });
    const res2 = await paymobWebhookPost(reqUnsigned);
    assert.equal(res2.status, 401);
  });

  test('processes valid top-up transaction webhook once, grants credits, and deduplicates replays', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-pay-1',
      workspaceId: 'ws-pay-1',
      country: 'SA',
      currency: 'SAR',
    });

    const txnPayload = {
      amount_cents: 6500, // 65 SAR = pack_50 (50 credits)
      created_at: '2026-11-05T12:00:00.000Z',
      currency: 'SAR',
      error_occured: false,
      has_parent_transaction: false,
      id: 778899001,
      integration_id: 441122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 99001122 },
      owner: 112233,
      pending: false,
      source_data: {
        pan: '4242',
        sub_type: 'Visa',
        type: 'card',
      },
      success: true,
      workspace_id: 'ws-pay-1',
      credits: 50,
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(txnPayload, TEST_SECRET);

    const req1 = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': hmac,
      },
      body: JSON.stringify(txnPayload),
    });

    const res1 = await paymobWebhookPost(req1);
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.received, true);
    assert.equal(body1.creditsGranted, 50);
    assert.equal(body1.duplicate, false);

    const balanceAfterFirst = await ledger.getWorkspaceBalance('ws-pay-1');
    assert.equal(balanceAfterFirst.settledBalance, 55); // 5 trial + 50 top-up

    // Replay the exact same webhook event -> must return 200 duplicate: true and NOT grant another 50 credits!
    const reqReplay = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': hmac,
      },
      body: JSON.stringify(txnPayload),
    });

    const resReplay = await paymobWebhookPost(reqReplay);
    assert.equal(resReplay.status, 200);
    const bodyReplay = await resReplay.json();
    assert.equal(bodyReplay.duplicate, true);
    assert.equal(bodyReplay.creditsGranted, 0);

    const balanceAfterReplay = await ledger.getWorkspaceBalance('ws-pay-1');
    assert.equal(balanceAfterReplay.settledBalance, 55);
  });

  test('does NOT grant credits when transaction success is false (failed payment)', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-fail-pay',
      workspaceId: 'ws-fail-pay',
    });

    const failedTxn = {
      amount_cents: 69900,
      created_at: '2026-11-05T12:05:00.000Z',
      currency: 'EGP',
      error_occured: true,
      has_parent_transaction: false,
      id: 778899002,
      integration_id: 441122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 99001123 },
      owner: 112233,
      pending: false,
      source_data: {
        pan: '1111',
        sub_type: 'MasterCard',
        type: 'card',
      },
      success: false,
      workspace_id: 'ws-fail-pay',
      credits: 200,
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(failedTxn, TEST_SECRET);
    const req = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': hmac,
      },
      body: JSON.stringify(failedTxn),
    });

    const res = await paymobWebhookPost(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.creditsGranted, 0);
    assert.equal(body.transactionStatus, 'FAILED');

    const balance = await ledger.getWorkspaceBalance('ws-fail-pay');
    assert.equal(balance.settledBalance, 5); // Unchanged!
  });

  test('updates Subscription lifecycle states (ACTIVE -> PAST_DUE -> CANCELED) and grants credits only on creation/renewal', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-sub-1',
      workspaceId: 'ws-sub-1',
      country: 'SA',
      currency: 'SAR',
    });

    // 1. Subscription Created (PRO plan = 200 credits)
    const subId = 550011;
    const createHmac = PaymobSecurity.calculateSubscriptionHmac(
      'Subscription Created',
      subId,
      TEST_SECRET
    );
    const createReq = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: 'evt-sub-create-550011',
        trigger_type: 'Subscription Created',
        hmac: createHmac,
        subscription_data: {
          id: subId,
          workspace_id: 'ws-sub-1',
          plan_tier: 'PRO',
          currency: 'SAR',
        },
      }),
    });

    const createRes = await paymobWebhookPost(createReq);
    assert.equal(createRes.status, 200);
    const afterCreate = await ledger.getWorkspaceBalance('ws-sub-1');
    assert.equal(afterCreate.planTier, 'PRO');
    assert.equal(afterCreate.subscriptionStatus, 'ACTIVE');
    assert.equal(afterCreate.settledBalance, 205); // 5 trial + 200 PRO

    // 2. Payment Failed -> transitions to PAST_DUE, grants 0 credits
    const failHmac = PaymobSecurity.calculateSubscriptionHmac(
      'payment_failed',
      subId,
      TEST_SECRET
    );
    const failReq = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: 'evt-sub-fail-550011',
        trigger_type: 'payment_failed',
        hmac: failHmac,
        subscription_data: {
          id: subId,
          workspace_id: 'ws-sub-1',
          plan_tier: 'PRO',
        },
      }),
    });
    const failRes = await paymobWebhookPost(failReq);
    assert.equal(failRes.status, 200);
    const afterFail = await ledger.getWorkspaceBalance('ws-sub-1');
    assert.equal(afterFail.subscriptionStatus, 'PAST_DUE');
    assert.equal(afterFail.settledBalance, 205);

    // 3. Subscription Canceled -> transitions to CANCELED, grants 0 credits
    const cancelHmac = PaymobSecurity.calculateSubscriptionHmac(
      'Subscription Canceled',
      subId,
      TEST_SECRET
    );
    const cancelReq = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        event_id: 'evt-sub-cancel-550011',
        trigger_type: 'Subscription Canceled',
        hmac: cancelHmac,
        subscription_data: {
          id: subId,
          workspace_id: 'ws-sub-1',
        },
      }),
    });
    const cancelRes = await paymobWebhookPost(cancelReq);
    assert.equal(cancelRes.status, 200);
    const afterCancel = await ledger.getWorkspaceBalance('ws-sub-1');
    assert.equal(afterCancel.subscriptionStatus, 'CANCELED');
    assert.equal(afterCancel.settledBalance, 205);
  });

  test('creates server-side checkout intent and records pending PaymentTransaction', async () => {
    const req = new Request('http://localhost:3000/api/billing/checkout-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-workspace-id': 'ws-checkout-1',
        'x-user-id': 'user-checkout-1',
      },
      body: JSON.stringify({
        kind: 'SUBSCRIPTION',
        planTier: 'STARTER',
        currency: 'EGP',
        paymentMethod: 'card',
      }),
    });

    const res = await checkoutIntentPost(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.intent.amountCents, 34900);
    assert.equal(body.intent.credits, 80);
    assert.equal(body.intent.status, 'PENDING');

    const db = getDb();
    const row = db
      .prepare(`SELECT "status", "amountCents" FROM "PaymentTransaction" WHERE "id" = ?`)
      .get(body.intent.transactionId);
    assert.equal(row.status, 'PENDING');
    assert.equal(row.amountCents, 34900);
  });
});
