import { describe, it } from 'node:test';
import assert from 'node:assert';
import { PaymobSecurity } from '../src/lib/paymob/paymob-hmac.ts';

describe('Paymob Cryptographic Security & Webhook Tests', () => {
  const SECRET_KEY = 'test_secret_hmac_key_12345';

  it('should accurately calculate Subscription HMAC-SHA512 using trigger_type + "for" + id', () => {
    const triggerType = 'Subscription Created';
    const subscriptionId = 1264;

    const calculatedHmac = PaymobSecurity.calculateSubscriptionHmac(
      triggerType,
      subscriptionId,
      SECRET_KEY
    );

    assert.ok(typeof calculatedHmac === 'string');
    assert.strictEqual(calculatedHmac.length, 128); // SHA-512 hex length is 128 chars
  });

  it('should successfully verify a valid Paymob subscription webhook payload', () => {
    const triggerType = 'Subscription Created';
    const subscriptionId = 9876;
    const validHmac = PaymobSecurity.calculateSubscriptionHmac(triggerType, subscriptionId, SECRET_KEY);

    const payload = {
      trigger_type: triggerType,
      subscription_data: { id: subscriptionId },
      hmac: validHmac
    };

    const isVerified = PaymobSecurity.verifySubscriptionWebhook(payload, SECRET_KEY);
    assert.strictEqual(isVerified, true);
  });

  it('should reject a tampered subscription webhook payload', () => {
    const validHmac = PaymobSecurity.calculateSubscriptionHmac('Subscription Created', 100, SECRET_KEY);

    // Tampered: Attacker modifies id from 100 to 200
    const tamperedPayload = {
      trigger_type: 'Subscription Created',
      subscription_data: { id: 200 },
      hmac: validHmac
    };

    const isVerified = PaymobSecurity.verifySubscriptionWebhook(tamperedPayload, SECRET_KEY);
    assert.strictEqual(isVerified, false);
  });

  it('should reject verification when secret key is incorrect', () => {
    const validHmac = PaymobSecurity.calculateSubscriptionHmac('renewed', 555, SECRET_KEY);

    const payload = {
      trigger_type: 'renewed',
      subscription_data: { id: 555 },
      hmac: validHmac
    };

    const isVerified = PaymobSecurity.verifySubscriptionWebhook(payload, 'wrong_secret_key');
    assert.strictEqual(isVerified, false);
  });

  it('should verify standard transaction HMACs across ordered fields', () => {
    const txnData = {
      amount_cents: 89900,
      created_at: '2026-11-05T12:00:00',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 998877,
      integration_id: 12345,
      is_3d_secure: true,
      is_auth: false,
      is_capture: true,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      'order.id': 54321,
      owner: 111,
      pending: false,
      'source_data.pan': '2345',
      'source_data.sub_type': 'MasterCard',
      'source_data.type': 'card',
      success: true
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(txnData, SECRET_KEY);
    assert.ok(typeof hmac === 'string');
    assert.strictEqual(hmac.length, 128);

    const isValid = PaymobSecurity.verifyTransactionWebhook(hmac, txnData, SECRET_KEY);
    assert.strictEqual(isValid, true);
  });

  it('should convert currency subunits accurately (EGP piastres / SAR halalas)', () => {
    assert.strictEqual(PaymobSecurity.toSubunits(899), 89900);
    assert.strictEqual(PaymobSecurity.toSubunits(189.5), 18950);
    assert.strictEqual(PaymobSecurity.fromSubunits(89900), 899);
    assert.strictEqual(PaymobSecurity.fromSubunits(18950), 189.5);
  });
});

