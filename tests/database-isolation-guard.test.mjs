import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractDatabaseName,
  assertTestDatabase,
  validatePostgresTestConnection,
} from './helpers/pg-migrate.mjs';

describe('Database Isolation & Test-Gate Safety Invariants (Phase 11A Task 02)', () => {
  describe('extractDatabaseName', () => {
    test('extracts clean database name from standard PostgreSQL URL', () => {
      assert.equal(
        extractDatabaseName('postgresql://user:pass@ep-host.aws.neon.tech/shotistry_staging?sslmode=require'),
        'shotistry_staging'
      );
      assert.equal(
        extractDatabaseName('postgresql://postgres:pass@localhost:5432/shotistry_staging_test?schema=public'),
        'shotistry_staging_test'
      );
    });

    test('extracts clean database name from pooled or direct Neon URLs', () => {
      assert.equal(
        extractDatabaseName('postgres://user:pass@ep-cool-pooler.eu-central-1.aws.neon.tech/shotistry_test?sslmode=require'),
        'shotistry_test'
      );
    });

    test('returns empty string on malformed or empty URLs', () => {
      assert.equal(extractDatabaseName(''), '');
      assert.equal(extractDatabaseName('invalid-url-without-slashes'), '');
    });
  });

  describe('assertTestDatabase', () => {
    test('strictly rejects protected database names', () => {
      const protectedNames = [
        'postgres',
        'defaultdb',
        'shotistry',
        'shotistry_staging',
        'shotistry_prod',
        'shotistry_production',
        'staging',
        'production',
        'main',
      ];
      for (const name of protectedNames) {
        assert.throws(
          () => assertTestDatabase(name),
          /SAFETY_ABORT/,
          `Expected ${name} to be rejected`
        );
      }
    });

    test('strictly rejects any database name that does not end with _test', () => {
      const invalidNames = [
        'shotistry_dev',
        'shotistry_test_db',
        'test_shotistry',
        'shotistry_testing',
      ];
      for (const name of invalidNames) {
        assert.throws(
          () => assertTestDatabase(name),
          /must strictly end with "_test"/,
          `Expected ${name} to be rejected because it does not end with _test`
        );
      }
    });

    test('accepts valid isolated test database names ending with _test', () => {
      assert.doesNotThrow(() => assertTestDatabase('shotistry_test'));
      assert.doesNotThrow(() => assertTestDatabase('shotistry_audit_test'));
      assert.doesNotThrow(() => assertTestDatabase('shotistry_staging_test'));
      assert.doesNotThrow(() => assertTestDatabase('ci_runner_test'));
    });
  });

  describe('validatePostgresTestConnection', () => {
    test('fails closed when POSTGRES_TEST_URL is missing or empty', () => {
      assert.throws(
        () => validatePostgresTestConnection({ testUrl: '', appUrl: 'postgres://localhost/shotistry_staging' }),
        /POSTGRES_TEST_URL is required/
      );
      assert.throws(
        () => validatePostgresTestConnection({ testUrl: undefined, appUrl: 'postgres://localhost/shotistry_staging' }),
        /POSTGRES_TEST_URL is required/
      );
    });

    test('strictly rejects if testUrl targets the same host & database as app DATABASE_URL or DIRECT_URL', () => {
      const appUrl = 'postgresql://user:secret@ep-staging.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require';
      const directUrl = 'postgresql://user:secret@ep-staging-direct.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require';

      // Exact match
      assert.throws(
        () => validatePostgresTestConnection({ testUrl: appUrl, appUrl, directUrl }),
        /SAFETY_ABORT: POSTGRES_TEST_URL cannot point to the application staging database/
      );

      // Same database name even with different pooler host
      const testSameDb = 'postgresql://user:secret@ep-staging-pooler.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require';
      assert.throws(
        () => validatePostgresTestConnection({ testUrl: testSameDb, appUrl, directUrl }),
        /SAFETY_ABORT/
      );
    });

    test('strictly requires testUrl database name to end with _test', () => {
      const testUrlNotTest = 'postgresql://user:secret@ep-test.eu-central-1.aws.neon.tech/shotistry_dev?sslmode=require';
      assert.throws(
        () => validatePostgresTestConnection({
          testUrl: testUrlNotTest,
          appUrl: 'postgresql://user:secret@ep-staging.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require',
        }),
        /must strictly end with "_test"/
      );
    });

    test('accepts properly isolated test database connection URL', () => {
      const appUrl = 'postgresql://user:secret@ep-staging.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require';
      const directUrl = 'postgresql://user:secret@ep-staging-direct.eu-central-1.aws.neon.tech/shotistry_staging?sslmode=require';
      const testUrl = 'postgresql://user:secret@ep-test.eu-central-1.aws.neon.tech/shotistry_staging_test?sslmode=require';

      const validatedDb = validatePostgresTestConnection({ testUrl, appUrl, directUrl });
      assert.equal(validatedDb, 'shotistry_staging_test');
    });
  });
});
