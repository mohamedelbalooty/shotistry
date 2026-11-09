import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { PaymobSecurity } from '../src/lib/paymob/paymob-hmac.ts';
import { PaymobClient } from '../src/lib/paymob/paymob-client.ts';
import {
  getPaymobConfig,
  validatePaymobEnvironment,
} from '../src/lib/paymob/paymob-config.ts';
import { getBillingRepository } from '../src/lib/db/repositories/billing-repository.ts';
import { POST as paymobWebhookPost } from '../src/app/api/webhooks/paymob/route.ts';

describe('Milestone M7: Paymob Sandbox Multi-Region & Webhook Hardening Integration Tests', () => {
  const EG_SECRET = 'egy_test_secret_key_8899001122';
  const EG_HMAC = 'egypt_hmac_secret_sha512_livegrade_2026';
  const SA_SECRET = 'sau_test_secret_key_3344556677';
  const SA_HMAC = 'saudi_hmac_secret_sha512_livegrade_2026';

  const origEnv = { ...process.env };

  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();

    process.env.PAYMOB_EG_SECRET_KEY = EG_SECRET;
    process.env.PAYMOB_EG_HMAC_SECRET = EG_HMAC;
    process.env.PAYMOB_SA_SECRET_KEY = SA_SECRET;
    process.env.PAYMOB_SA_HMAC_SECRET = SA_HMAC;
    process.env.SHOTISTRY_STRICT_PAYMENT_INTENT = '1';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it('separates Egypt and Saudi Arabia configurations with proper subunits conversion', () => {
    const egConfig = getPaymobConfig('EG');
    assert.equal(egConfig.country, 'EG');
    assert.equal(egConfig.currency, 'EGP');
    assert.equal(egConfig.secretKey, EG_SECRET);
    assert.equal(egConfig.hmacSecret, EG_HMAC);
    assert.equal(egConfig.isConfigured, true);

    const saConfig = getPaymobConfig('SA');
    assert.equal(saConfig.country, 'SA');
    assert.equal(saConfig.currency, 'SAR');
    assert.equal(saConfig.secretKey, SA_SECRET);
    assert.equal(saConfig.hmacSecret, SA_HMAC);
    assert.equal(saConfig.isConfigured, true);

    // Subunit checks: 349 EGP -> 34,900 piastres; 79 SAR -> 7,900 halalas
    assert.equal(PaymobSecurity.toSubunits(349), 34900);
    assert.equal(PaymobSecurity.toSubunits(79), 7900);
  });

  it('fails closed and blocks live Paymob keys in non-production environments', () => {
    process.env.PAYMOB_EG_SECRET_KEY = 'live_secret_real_money_12345';
    const validation = validatePaymobEnvironment('EG', 'staging');
    assert.equal(validation.valid, false);
    assert.ok(validation.error?.includes('Live Paymob credentials detected'));

    // Production environment permits live keys
    const prodValidation = validatePaymobEnvironment('EG', 'production');
    assert.equal(prodValidation.valid, true);
  });

  it('creates mock payment intentions when mock fallback is allowed in dev/test', async () => {
    const client = new PaymobClient();
    const intention = await client.createPaymentIntention({
      country: 'SA',
      amountCents: 7900,
      currency: 'SAR',
      specialReference: 'ref-test-sa-1',
      items: [{ name: 'Starter Plan', amount: 7900 }],
      billingData: {
        firstName: 'Ahmed',
        lastName: 'Al-Ghamdi',
        email: 'ahmed@riyadh.sa',
      },
    });

    assert.ok(intention.clientSecret.length > 0);
    assert.ok(intention.unifiedCheckoutUrl.includes('clientSecret='));
    assert.equal(typeof intention.orderId, 'string');
  });

  it('resolves transaction strictly from stored intent and ignores spoofed payload fields (Finding C5)', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-c5-victim',
      workspaceId: 'ws-victim',
      country: 'EG',
      currency: 'EGP',
    });

    await ledger.ensureWorkspace({
      userId: 'user-c5-attacker',
      workspaceId: 'ws-attacker',
      country: 'EG',
      currency: 'EGP',
    });

    const billingRepo = getBillingRepository();
    const transactionId = 'pt-intent-c5-verify';
    const paymobOrderId = 'ord-c5-998877';

    // Store legitimate intent for 80 credits on ws-victim for 349 EGP (34,900 cents)
    await billingRepo.createPendingPaymentTransaction({
      id: transactionId,
      workspaceId: 'ws-victim',
      amountCents: 34900,
      currency: 'EGP',
      kind: 'SUBSCRIPTION',
      planTier: 'STARTER',
      credits: 80,
      region: 'EG',
      paymobOrderId,
      specialReference: transactionId,
      paymentMethod: 'card',
      createdAt: new Date().toISOString(),
    });

    // Attacker crafts webhook attempting to divert credits to ws-attacker and inflate to 99999 credits
    const spoofedPayload = {
      amount_cents: 34900, // Valid amount
      created_at: '2026-11-09T12:00:00.000Z',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 991122334,
      integration_id: 441122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: paymobOrderId },
      owner: 112233,
      pending: false,
      source_data: { pan: '4242', sub_type: 'Visa', type: 'card' },
      success: true,
      special_reference: transactionId,
      workspace_id: 'ws-attacker', // SPOOFED WORKSPACE!
      credits: 99999, // SPOOFED CREDITS!
      plan_tier: 'AGENCY', // SPOOFED PLAN TIER!
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(spoofedPayload, EG_HMAC);
    const req = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': hmac,
      },
      body: JSON.stringify(spoofedPayload),
    });

    const res = await paymobWebhookPost(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    // MUST award strictly 80 credits (not 99999) to ws-victim (not ws-attacker)
    assert.equal(body.creditsGranted, 80);

    const victimBalance = await ledger.getWorkspaceBalance('ws-victim');
    assert.equal(victimBalance.settledBalance, 85); // 5 trial + 80 Starter
    assert.equal(victimBalance.planTier, 'STARTER');

    const attackerBalance = await ledger.getWorkspaceBalance('ws-attacker');
    assert.equal(attackerBalance.settledBalance, 5); // Remained only 5 trial!
  });

  it('rejects amount mismatch and grants 0 credits (status: UNMATCHED_AMOUNT)', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-mismatch',
      workspaceId: 'ws-mismatch',
      country: 'EG',
      currency: 'EGP',
    });

    const billingRepo = getBillingRepository();
    const transactionId = 'pt-mismatch-test';
    const paymobOrderId = 'ord-mismatch-1122';

    // Stored intent expects 34,900 cents
    await billingRepo.createPendingPaymentTransaction({
      id: transactionId,
      workspaceId: 'ws-mismatch',
      amountCents: 34900,
      currency: 'EGP',
      kind: 'SUBSCRIPTION',
      planTier: 'STARTER',
      credits: 80,
      region: 'EG',
      paymobOrderId,
      specialReference: transactionId,
      createdAt: new Date().toISOString(),
    });

    // Incoming payment is only 100 cents (1 EGP)
    const underpaidPayload = {
      amount_cents: 100, // Underpaid!
      created_at: '2026-11-09T12:00:00.000Z',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 991122335,
      integration_id: 441122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: paymobOrderId },
      owner: 112233,
      pending: false,
      source_data: { pan: '4242', sub_type: 'Visa', type: 'card' },
      success: true,
      special_reference: transactionId,
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(underpaidPayload, EG_HMAC);
    const req = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': hmac,
      },
      body: JSON.stringify(underpaidPayload),
    });

    const res = await paymobWebhookPost(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.creditsGranted, 0);
    assert.equal(body.transactionStatus, 'UNMATCHED_AMOUNT');

    const balance = await ledger.getWorkspaceBalance('ws-mismatch');
    assert.equal(balance.settledBalance, 5); // No credits granted!
  });

  it('rejects unknown transactions with 0 credits and eliminates 50-credit fallback', async () => {
    const unknownPayload = {
      amount_cents: 999999,
      created_at: '2026-11-09T12:00:00.000Z',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 991122336,
      integration_id: 441122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 'ord-unknown-phantom' },
      owner: 112233,
      pending: false,
      source_data: { pan: '4242', sub_type: 'Visa', type: 'card' },
      success: true,
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(unknownPayload, EG_HMAC);
    const req = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': hmac,
      },
      body: JSON.stringify(unknownPayload),
    });

    const res = await paymobWebhookPost(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.creditsGranted, 0);
    assert.equal(body.transactionStatus, 'UNMATCHED_INTENT');
  });

  it('reverses granted credits via REFUND_REVERSAL when refund webhook arrives', async () => {
    const ledger = new CreditLedgerService();
    await ledger.ensureWorkspace({
      userId: 'user-refund-test',
      workspaceId: 'ws-refund',
      country: 'SA',
      currency: 'SAR',
    });

    const billingRepo = getBillingRepository();
    const transactionId = 'pt-refund-test';
    const paymobOrderId = 'ord-refund-5544';

    // 1. Initial successful purchase of 50 credits (79 SAR = 7900 cents)
    await billingRepo.createPendingPaymentTransaction({
      id: transactionId,
      workspaceId: 'ws-refund',
      amountCents: 7900,
      currency: 'SAR',
      kind: 'TOP_UP',
      credits: 50,
      region: 'SA',
      paymobOrderId,
      specialReference: transactionId,
      createdAt: new Date().toISOString(),
    });

    const successPayload = {
      amount_cents: 7900,
      created_at: '2026-11-09T12:00:00.000Z',
      currency: 'SAR',
      error_occured: false,
      has_parent_transaction: false,
      id: 991122337,
      integration_id: 551122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: paymobOrderId },
      owner: 112233,
      pending: false,
      source_data: { pan: '4242', sub_type: 'mada', type: 'card' },
      success: true,
      special_reference: transactionId,
    };

    const successHmac = PaymobSecurity.calculateTransactionHmac(successPayload, SA_HMAC);
    const successReq = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': successHmac,
      },
      body: JSON.stringify(successPayload),
    });
    const successRes = await paymobWebhookPost(successReq);
    assert.equal(successRes.status, 200);

    const balanceAfterGrant = await ledger.getWorkspaceBalance('ws-refund');
    assert.equal(balanceAfterGrant.settledBalance, 55); // 5 trial + 50 top-up

    // 2. Refund Webhook arrives (is_refunded: true)
    const refundPayload = {
      ...successPayload,
      id: 991122338, // Distinct transaction ID for refund
      is_refunded: true,
    };

    const refundHmac = PaymobSecurity.calculateTransactionHmac(refundPayload, SA_HMAC);
    const refundReq = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': refundHmac,
      },
      body: JSON.stringify(refundPayload),
    });

    const refundRes = await paymobWebhookPost(refundReq);
    assert.equal(refundRes.status, 200);
    const refundBody = await refundRes.json();
    assert.equal(refundBody.refunded, true);
    assert.equal(refundBody.creditsReversed, 50);

    const balanceAfterRefund = await ledger.getWorkspaceBalance('ws-refund');
    assert.equal(balanceAfterRefund.settledBalance, 5); // 55 - 50 = 5!
  });

  it('enforces country-specific HMAC secrets so Egypt secret cannot sign Saudi payload', async () => {
    const saPayload = {
      amount_cents: 7900,
      created_at: '2026-11-09T12:00:00.000Z',
      currency: 'SAR',
      error_occured: false,
      has_parent_transaction: false,
      id: 991122339,
      integration_id: 551122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 'ord-sa-cross-secret' },
      owner: 112233,
      pending: false,
      source_data: { pan: '4242', sub_type: 'mada', type: 'card' },
      success: true,
    };

    // Calculate HMAC using EG_HMAC for an SAR payload
    const invalidCrossHmac = PaymobSecurity.calculateTransactionHmac(saPayload, EG_HMAC);
    const req = new Request('http://localhost:3000/api/webhooks/paymob', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'paymob-hmac': invalidCrossHmac,
      },
      body: JSON.stringify(saPayload),
    });

    const res = await paymobWebhookPost(req);
    assert.equal(res.status, 401, 'Cross-country HMAC signing must be rejected with 401');
  });
});

