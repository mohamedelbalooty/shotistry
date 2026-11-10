/**
 * Environment Guard for Hermetic Test Execution.
 * Ensures local developer .env files never pollute or break unit & integration test suites.
 */
import fs from 'node:fs';
import path from 'node:path';

// Force NODE_ENV to 'test'
process.env.NODE_ENV = 'test';

// Default overrides for local unit/integration tests
process.env.SHOTISTRY_DB_DRIVER = process.env.SHOTISTRY_DB_DRIVER || 'sqlite';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/shotistry_dev?schema=public';
process.env.DIRECT_URL =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL;
process.env.POSTGRES_TEST_URL =
  process.env.POSTGRES_TEST_URL ||
  'postgresql://postgres:postgres@localhost:5432/shotistry_test?schema=public';
process.env.SHOTISTRY_RATE_LIMIT_BACKEND = 'memory';
process.env.SHOTISTRY_TRUSTED_PROXY_COUNT = '0';
process.env.SHOTISTRY_MAX_CONCURRENT_HASHES = '4';
process.env.APP_BASE_URL = 'http://localhost:3000';
process.env.ASSET_SIGNING_SECRET =
  process.env.ASSET_SIGNING_SECRET ||
  'test_asset_signing_secret_at_least_32_characters_for_hmac';

// If PAYMOB_HMAC_SECRET contains placeholder or is missing, set a valid deterministic test secret
if (
  !process.env.PAYMOB_HMAC_SECRET ||
  process.env.PAYMOB_HMAC_SECRET.includes('placeholder')
) {
  process.env.PAYMOB_HMAC_SECRET =
    'test_paymob_hmac_secret_sha512_strictly_for_local_testing_suite';
}

// Clear placeholder external cloud credentials so test gates fail-closed or skip appropriately
const PLACEHOLDER_VARS = [
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'GEMINI_API_KEY',
  'PAYMOB_API_KEY',
  'PAYMOB_SECRET_KEY',
  'PAYMOB_PUBLIC_KEY',
  'RESEND_API_KEY',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'STORAGE_ENDPOINT',
  'STORAGE_ACCESS_KEY_ID',
  'STORAGE_SECRET_ACCESS_KEY',
  'STORAGE_BUCKET_NAME',
];

for (const varName of PLACEHOLDER_VARS) {
  const val = process.env[varName];
  if (val && (val.includes('placeholder') || val.includes('your_') || val.includes('changeme'))) {
    delete process.env[varName];
  }
}

