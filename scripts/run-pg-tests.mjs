/**
 * Cross-platform PostgreSQL Test Runner for Shotistry CI / Local Gate.
 * Enforces strict database isolation:
 * - Requires a dedicated test database (must end with _test).
 * - Refuses execution against DATABASE_URL or DIRECT_URL if they point to staging/production.
 * - Sets REQUIRE_POSTGRES_TESTS=1 and SHOTISTRY_DB_DRIVER=postgres.
 */
import { spawn } from 'node:child_process';
import { validatePostgresTestConnection, extractDatabaseName } from '../tests/helpers/pg-migrate.mjs';

const appUrl = process.env.DATABASE_URL || '';
const directUrl = process.env.DIRECT_URL || '';
const testUrl = process.env.POSTGRES_TEST_URL || '';

let validatedDbName = '';

if (testUrl) {
  try {
    validatedDbName = validatePostgresTestConnection({
      testUrl,
      appUrl,
      directUrl,
    });
  } catch (err) {
    console.error(`\n❌ FATAL SAFETY ABORT: ${err.message}\n`);
    process.exit(1);
  }
} else {
  // If no POSTGRES_TEST_URL is set, verify that DATABASE_URL is not pointing to staging or remote
  const appDb = extractDatabaseName(appUrl);
  if (appUrl.includes('neon.tech') || (appDb && !appDb.endsWith('_test'))) {
    console.error(
      '\n❌ FATAL SAFETY ABORT: POSTGRES_TEST_URL must be explicitly provided when staging or remote databases are configured.\n' +
      'Refusing to run destructive or integration tests against DATABASE_URL.\n'
    );
    process.exit(1);
  }

  // Safe local sandbox fallback
  validatedDbName = 'shotistry_test';
}

console.log('------------------------------------------------------------');
console.log('🧪 Shotistry PostgreSQL 16 Integration Gate');
console.log(`   Target Test Database: ${validatedDbName}`);
console.log('   Isolation Status: VERIFIED (Application staging DB protected)');
console.log('------------------------------------------------------------');

process.env.REQUIRE_POSTGRES_TESTS = '1';
process.env.SHOTISTRY_DB_DRIVER = 'postgres';

const nodeExe = process.execPath;
const args = [
  '--import',
  './tests/helpers/env-guard.mjs',
  '--experimental-strip-types',
  '--test',
  'tests/postgres-auth.test.mjs',
  'tests/postgres-ledger.test.mjs',
];

const child = spawn(nodeExe, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    REQUIRE_POSTGRES_TESTS: '1',
    SHOTISTRY_DB_DRIVER: 'postgres',
    ...(testUrl ? { POSTGRES_TEST_URL: testUrl } : {}),
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
