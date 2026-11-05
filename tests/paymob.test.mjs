import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PaymobSecurity } from '../src/lib/paymob/paymob-hmac.ts';

describe('Paymob HMAC-SHA512 Security & Currency Subunit Tests', () => {
  const secret = 'test_paymob_hmac_secret_key_998877';

  it('matches an independent known HMAC-SHA512 hex vector for subscription concatenation ("Subscription Createdfor849201")', () => {
    // Independent HMAC-SHA512 digest of message "Subscription Createdfor849201" with key "shotistry_fixed_vector_key"
    const fixedKey = 'shotistry_fixed_vector_key';
    const expectedIndependentHex =
      '064b84c0034fef1dc8e97f879ab190393befade208498c8ecad8614b577cc701484762f875e7c49efd3eba90ff7c534d879249ea1acfcac0acafa13dc9a611a2';

    const calculated = PaymobSecurity.calculateSubscriptionHmac(
      'Subscription Created',
      849201,
      fixedKey
    );
    assert.strictEqual(calculated, expectedIndependentHex);
  });

  it('correctly calculates and verifies valid Subscription Webhook HMAC', () => {
    const triggerType = 'Subscription Created';
    const subId = 849201;

    const validHmac = PaymobSecurity.calculateSubscriptionHmac(triggerType, subId, secret);

    const isVerified = PaymobSecurity.verifySubscriptionWebhook(
      {
        trigger_type: triggerType,
        subscription_data: { id: subId },
        hmac: validHmac,
      },
      secret
    );

    assert.strictEqual(isVerified, true);
  });

  it('rejects tampered Subscription Webhook payloads', () => {
    const triggerType = 'Subscription Created';
    const subId = 849201;
    const validHmac = PaymobSecurity.calculateSubscriptionHmac(triggerType, subId, secret);

    const isVerified = PaymobSecurity.verifySubscriptionWebhook(
      {
        trigger_type: triggerType,
        subscription_data: { id: 999999 },
        hmac: validHmac,
      },
      secret
    );

    assert.strictEqual(isVerified, false);
  });

  it('correctly calculates and verifies standard 20-field Transaction Webhook HMAC', () => {
    const sampleTxn = {
      amount_cents: 69900,
      created_at: '2025-05-01T12:00:00.000Z',
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: 192837465,
      integration_id: 441122,
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: 55667788 },
      owner: 112233,
      pending: false,
      source_data: {
        pan: '2346',
        sub_type: 'MasterCard',
        type: 'card',
      },
      success: true,
    };

    const hmac = PaymobSecurity.calculateTransactionHmac(sampleTxn, secret);
    const verified = PaymobSecurity.verifyTransactionWebhook(hmac, sampleTxn, secret);
    assert.strictEqual(verified, true);

    const tamperedTxn = { ...sampleTxn, amount_cents: 100 };
    const verifiedTampered = PaymobSecurity.verifyTransactionWebhook(
      hmac,
      tamperedTxn,
      secret
    );
    assert.strictEqual(verifiedTampered, false);
  });

  it('converts EGP and SAR major units to cents/halalas accurately', () => {
    assert.strictEqual(PaymobSecurity.toSubunits(699), 69900);
    assert.strictEqual(PaymobSecurity.toSubunits(149), 14900);
    assert.strictEqual(PaymobSecurity.fromSubunits(189900), 1899);
  });
});
