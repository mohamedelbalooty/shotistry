import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Hermetic Test Environment Guarantee (M0 Baseline)', () => {
  test('test environment does not leak local developer .env placeholders into unit tests', () => {
    assert.equal(
      process.env.NODE_ENV,
      'test',
      'Expected NODE_ENV to be set to "test" during test execution'
    );

    assert.notEqual(
      process.env.SHOTISTRY_RATE_LIMIT_BACKEND,
      'upstash',
      'Local .env placeholder backend "upstash" must not leak into unit tests'
    );

    assert.notEqual(
      process.env.SHOTISTRY_TRUSTED_PROXY_COUNT,
      '1',
      'Local .env proxy hop count must not override unit test default'
    );

    const paymobSecret = process.env.PAYMOB_HMAC_SECRET ?? '';
    assert.ok(
      !paymobSecret.includes('placeholder_hmac_secret'),
      'Placeholder HMAC secret from developer .env must not leak into test suite'
    );
  });
});

