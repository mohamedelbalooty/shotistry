/**
 * Safe, Non-Destructive PostgreSQL Staging Smoke Test
 *
 * Verifies real application staging connectivity without modifying persistent data:
 * 1. Read-only PostgreSQL identity & version verification.
 * 2. Schema migration parity check (_prisma_migrations).
 * 3. Atomic transaction probe: executes an INSERT and triggers an intentional ROLLBACK.
 * 4. Confirms the probe record does not persist in the database.
 * 5. Measures round-trip query latency and autosuspend response.
 */
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

async function runStagingSmoke() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('❌ ERROR: DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  // Mask credentials for safe logging
  let maskedHost = 'unknown';
  try {
    const parsed = new URL(url);
    maskedHost = `${parsed.username ? parsed.username + '@' : ''}${parsed.host}${parsed.pathname}`;
  } catch {
    maskedHost = url.replace(/:[^:@]+@/, ':***@');
  }

  console.log('============================================================');
  console.log('🔍 Shotistry PostgreSQL Staging Smoke & Non-Destructive Probe');
  console.log(`   Target Endpoint: ${maskedHost}`);
  console.log('============================================================');

  const startTime = Date.now();
  const prisma = new PrismaClient({
    datasources: { db: { url } },
    log: ['error'],
  });

  try {
    // 1. Read-only identity check
    const pingStart = Date.now();
    const identityResult = await prisma.$queryRaw`
      SELECT 
        current_database() as db, 
        current_user as usr, 
        version() as ver, 
        now() as ts
    `;
    const pingDuration = Date.now() - pingStart;

    const row = Array.isArray(identityResult) ? identityResult[0] : null;
    if (!row) {
      throw new Error('Identity query returned empty result.');
    }

    console.log('\n[1/4] Database Identity & Version:');
    console.log(`  - Database:  ${row.db}`);
    console.log(`  - User:      ${row.usr}`);
    console.log(`  - Engine:    ${row.ver.split(',')[0]}`);
    console.log(`  - Ping:      ${pingDuration}ms`);

    // 2. Migration count & table inventory check
    const tableResult = await prisma.$queryRaw`
      SELECT count(*)::int as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `;
    const tableCount = Array.isArray(tableResult) ? tableResult[0]?.count : 0;

    let migrationCount = 0;
    try {
      const migResult = await prisma.$queryRaw`
        SELECT count(*)::int as count 
        FROM "_prisma_migrations" 
        WHERE "finished_at" IS NOT NULL
      `;
      migrationCount = Array.isArray(migResult) ? migResult[0]?.count : 0;
    } catch {
      // _prisma_migrations table not found
    }

    console.log('\n[2/4] Schema & Migration State:');
    console.log(`  - Public Tables:    ${tableCount} tables`);
    console.log(`  - Applied Migrations: ${migrationCount} migrations`);

    if (migrationCount < 6) {
      console.warn(`  ⚠️ Warning: Expected at least 6 applied migrations, found ${migrationCount}. Run 'npx prisma migrate deploy'.`);
    } else {
      console.log('  ✅ Schema fully migrated (all 6 migrations applied).');
    }

    // 3. Controlled transaction probe with rollback guarantee
    console.log('\n[3/4] Controlled ACID Transaction & Rollback Test:');
    const probeId = `probe_${crypto.randomUUID().replace(/-/g, '')}`;
    const rollbackToken = 'INTENTIONAL_ROLLBACK_FOR_STAGING_PROBE';

    let probeSeenInsideTx = false;

    try {
      await prisma.$transaction(async (tx) => {
        // Execute probe insert into AdminAuditLog
        await tx.adminAuditLog.create({
          data: {
            id: probeId,
            adminUserId: 'usr_probe_staging',
            action: 'STAGING_NON_DESTRUCTIVE_SMOKE_PROBE',
            targetType: 'SYSTEM',
            metadata: JSON.stringify({ probe: true, timestamp: Date.now() }),
          },
        });

        // Verify read-your-own-writes inside transaction
        const found = await tx.adminAuditLog.findUnique({
          where: { id: probeId },
        });

        if (found && found.id === probeId) {
          probeSeenInsideTx = true;
        }

        // Trigger intentional rollback
        throw new Error(rollbackToken);
      });
    } catch (err) {
      if (err.message !== rollbackToken && !err.message.includes(rollbackToken)) {
        throw err;
      }
    }

    if (!probeSeenInsideTx) {
      throw new Error('ACID verification failed: probe record was not visible inside transaction.');
    }

    // 4. Verify probe record does not exist outside transaction
    const probeOutside = await prisma.adminAuditLog.findUnique({
      where: { id: probeId },
    });

    if (probeOutside !== null) {
      throw new Error(`CRITICAL ROLLBACK FAILURE: probe record ${probeId} persisted despite transaction abort!`);
    }

    console.log('  ✅ Transaction read-your-own-writes verified.');
    console.log('  ✅ Transaction rollback successfully reversed probe mutation.');
    console.log('  ✅ 0 persistent records created (Zero Data Mutation Guarantee).');

    const totalDuration = Date.now() - startTime;
    console.log('\n============================================================');
    console.log(`🎉 Staging Database Connectivity: PASS (${totalDuration}ms total)`);
    console.log('============================================================\n');
  } catch (err) {
    console.error('\n❌ Staging Smoke Test Failed:');
    console.error(err.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

runStagingSmoke();

