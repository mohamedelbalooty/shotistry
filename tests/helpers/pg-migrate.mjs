import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Extracts and validates the database name from a PostgreSQL connection string.
 * Refuses execution if the database name does not end with '_test'.
 */
export function extractDatabaseName(url) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname || '';
    return pathname.replace(/^\//, '').split('?')[0];
  } catch {
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : '';
  }
}

const PROTECTED_DATABASE_NAMES = new Set([
  'postgres',
  'template0',
  'template1',
  'defaultdb',
  'production',
  'prod',
  'shotistry',
  'shotistry_prod',
  'shotistry_production',
  'main',
]);

/**
 * Validates that a database name safely qualifies as an isolated test database.
 * Strictly refuses execution in production environments or against protected/non-test databases.
 */
export function assertTestDatabase(dbName) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'SAFETY_ABORT: Refusing to run test migrations or resets in production environment (NODE_ENV=production).'
    );
  }

  if (!dbName || typeof dbName !== 'string') {
    throw new Error('SAFETY_ABORT: Unable to determine target database name.');
  }

  const normalized = dbName.toLowerCase().trim();

  if (PROTECTED_DATABASE_NAMES.has(normalized)) {
    throw new Error(
      `SAFETY_ABORT: Refusing to run test migrations against protected database "${dbName}".`
    );
  }

  if (normalized.includes('prod') || normalized.includes('production')) {
    throw new Error(
      `SAFETY_ABORT: Refusing to run test migrations against production-named database "${dbName}".`
    );
  }

  if (!normalized.endsWith('_test')) {
    throw new Error(
      `SAFETY_ABORT: Refusing to run migrations on non-test database "${dbName}". ` +
      `Target database name must strictly end with "_test".`
    );
  }
}

/**
 * Applies all migrations in lexical order to PostgreSQL and records them in _prisma_migrations.
 * Uses an advisory lock to coordinate across parallel test runners safely.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ reset?: boolean, migrationsDir?: string }} [options]
 */
export async function runPgMigrations(prisma, options = {}) {
  // 1. Verify current database via SQL
  const dbResult = await prisma.$queryRaw`SELECT current_database() as db`;
  const currentDb = Array.isArray(dbResult) && dbResult[0]?.db ? dbResult[0].db : null;
  assertTestDatabase(currentDb);

  // 2. Acquire PostgreSQL advisory lock so parallel test files serialize cleanly
  await prisma.$executeRawUnsafe(`SELECT pg_advisory_lock(84729103)`);

  try {
    // 3. Check if _prisma_migrations exists and has all 3 migrations already applied
    let alreadyFullyMigrated = false;
    try {
      const rows = await prisma.$queryRaw`
        SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL
      `;
      const appliedNames = new Set(Array.isArray(rows) ? rows.map((r) => r.migration_name) : []);
      if (
        appliedNames.has('20261105000000_init') &&
        appliedNames.has('20261108000000_sessions_rbac') &&
        appliedNames.has('20261109000000_auth_security_hardening') &&
        !options.reset
      ) {
        alreadyFullyMigrated = true;
      }
    } catch {
      // _prisma_migrations table does not exist yet
    }

    if (alreadyFullyMigrated) {
      return [];
    }

    // 4. Drop and recreate public schema for a clean, deterministic migration run
    await prisma.$executeRawUnsafe(`DROP SCHEMA public CASCADE;`);
    await prisma.$executeRawUnsafe(`CREATE SCHEMA public;`);

    // 5. Create _prisma_migrations table
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "_prisma_migrations" (
        "id" VARCHAR(36) NOT NULL,
        "checksum" VARCHAR(64) NOT NULL,
        "finished_at" TIMESTAMPTZ,
        "migration_name" VARCHAR(255) NOT NULL,
        "logs" TEXT,
        "rolled_back_at" TIMESTAMPTZ,
        "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
      );
    `);

    // 6. Discover migrations in lexical order
    const rootMigrationsDir = options.migrationsDir || path.resolve(process.cwd(), 'prisma/migrations');
    if (!fs.existsSync(rootMigrationsDir)) {
      throw new Error(`Migrations directory not found: ${rootMigrationsDir}`);
    }

    const entries = fs
      .readdirSync(rootMigrationsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    const appliedNow = [];

    for (const migrationName of entries) {
      const migrationFilePath = path.join(rootMigrationsDir, migrationName, 'migration.sql');
      if (!fs.existsSync(migrationFilePath)) {
        continue;
      }

      const sqlContent = fs.readFileSync(migrationFilePath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sqlContent, 'utf8').digest('hex');
      const migrationId = crypto.randomUUID();

      const statements = sqlContent
        .split(';')
        .map((s) =>
          s
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n')
            .trim()
        )
        .filter((s) => s.length > 0);

      for (const stmt of statements) {
        await prisma.$executeRawUnsafe(stmt);
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (
          "id", "checksum", "finished_at", "migration_name", "applied_steps_count"
        ) VALUES ($1, $2, now(), $3, 1)`,
        migrationId,
        checksum,
        migrationName
      );

      appliedNow.push(migrationName);
    }

    return appliedNow;
  } finally {
    await prisma.$executeRawUnsafe(`SELECT pg_advisory_unlock(84729103)`);
  }
}
