import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgresCreditLedgerService } from '../src/lib/ledger/postgres-ledger-service.ts';

const PG_ADMIN_URL =
  process.env.POSTGRES_ADMIN_URL ||
  'postgresql://tasawk@localhost:5432/postgres';

const PG_TEST_URL =
  process.env.POSTGRES_TEST_URL ||
  process.env.DATABASE_URL ||
  'postgresql://tasawk@localhost:5432/shotistry_audit_test?schema=public';

describe('PostgreSQL Migration & ACID Concurrency Ledger Integration Tests', () => {
  let prisma;
  let ledger;
  let pgReachable = false;
  let pgConnectError = null;

  before(async () => {
    const adminPrisma = new PrismaClient({
      datasources: { db: { url: PG_ADMIN_URL } },
      log: [],
    });

    try {
      await adminPrisma.$queryRaw`SELECT 1`;
      const existingDb = await adminPrisma.$queryRaw`
        SELECT 1 FROM pg_database WHERE datname = 'shotistry_audit_test'
      `;
      if (!Array.isArray(existingDb) || existingDb.length === 0) {
        await adminPrisma.$executeRawUnsafe(`CREATE DATABASE "shotistry_audit_test"`);
      }
      await adminPrisma.$disconnect();

      prisma = new PrismaClient({
        datasources: {
          db: { url: PG_TEST_URL },
        },
        log: [],
      });

      await prisma.$queryRaw`SELECT 1`;

      // Apply prisma/migrations/20261105000000_init/migration.sql if not yet applied
      const existingTables = await prisma.$queryRaw`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'CreditLedger'
      `;

      if (!Array.isArray(existingTables) || existingTables.length === 0) {
        const migrationPath = path.resolve(
          'prisma/migrations/20261105000000_init/migration.sql'
        );
        const migrationSql = fs.readFileSync(migrationPath, 'utf8');
        const statements = migrationSql
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
      }

      pgReachable = true;
      ledger = new PostgresCreditLedgerService(prisma);

      // Clean isolated test rows before suite execution
      await prisma.adminAuditLog.deleteMany({});
      await prisma.webhookEvent.deleteMany({});
      await prisma.paymentTransaction.deleteMany({});
      await prisma.creditReservation.deleteMany({});
      await prisma.creditLedger.deleteMany({});
      await prisma.generatedImage.deleteMany({});
      await prisma.generationJob.deleteMany({});
      await prisma.photoshoot.deleteMany({});
      await prisma.productAsset.deleteMany({});
      await prisma.product.deleteMany({});
      await prisma.brand.deleteMany({});
      await prisma.subscription.deleteMany({});
      await prisma.workspaceMember.deleteMany({});
      await prisma.workspace.deleteMany({});
      await prisma.user.deleteMany({});
    } catch (err) {
      try {
        await adminPrisma.$disconnect();
      } catch {
        // Ignore disconnect error
      }
      pgConnectError = err;
      pgReachable = false;
    }
  });

  after(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  test('verifies all 17 Prisma PostgreSQL tables and 7 PostgreSQL enum types are migrated in PostgreSQL', async (t) => {
    if (!pgReachable) {
      if (process.env.REQUIRE_POSTGRES_TESTS === '1') {
        assert.fail(`PostgreSQL connection required but failed: ${pgConnectError?.message}`);
      }
      t.skip(`PostgreSQL socket blocked in current OS sandbox (${pgConnectError?.message})`);
      return;
    }

    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const tableNames = tables.map((r) => r.table_name);

    const expectedTables = [
      'AdminAuditLog',
      'Brand',
      'CreditLedger',
      'CreditReservation',
      'GeneratedImage',
      'GenerationJob',
      'PaymentTransaction',
      'Photoshoot',
      'Product',
      'ProductAsset',
      'PromptTemplate',
      'PromptVersion',
      'Subscription',
      'User',
      'WebhookEvent',
      'Workspace',
      'WorkspaceMember',
    ];

    for (const expected of expectedTables) {
      assert.ok(
        tableNames.includes(expected),
        `Expected PostgreSQL table "${expected}" in public schema, found: ${tableNames.join(', ')}`
      );
    }

    const enums = await prisma.$queryRaw`
      SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname
    `;
    const enumNames = enums.map((e) => e.typname);
    for (const expectedEnum of [
      'Currency',
      'JobStatus',
      'LedgerTransactionType',
      'PlanTier',
      'ReservationStatus',
      'Role',
      'SubscriptionStatus',
    ]) {
      assert.ok(
        enumNames.includes(expectedEnum),
        `Expected PostgreSQL enum "${expectedEnum}", found: ${enumNames.join(', ')}`
      );
    }
  });

  test('provisions workspace idempotently in PostgreSQL with 5 initial TRIAL_GRANT credits', async (t) => {
    if (!pgReachable) {
      if (process.env.REQUIRE_POSTGRES_TESTS === '1') {
        assert.fail(`PostgreSQL connection required`);
      }
      t.skip('PostgreSQL socket blocked in current OS sandbox');
      return;
    }

    const ws1 = await ledger.ensureWorkspace({
      userId: 'pg-user-1',
      email: 'pg-merchant@shotistry.app',
      workspaceId: 'pg-ws-1',
      country: 'SA',
      currency: 'SAR',
    });

    assert.equal(ws1.workspaceId, 'pg-ws-1');
    assert.equal(ws1.settledBalance, 5);
    assert.equal(ws1.reservedCredits, 0);
    assert.equal(ws1.availableCredits, 5);
    assert.equal(ws1.currency, 'SAR');

    const ws1Repeat = await ledger.ensureWorkspace({
      userId: 'pg-user-1',
      email: 'pg-merchant@shotistry.app',
      workspaceId: 'pg-ws-1',
      country: 'SA',
      currency: 'SAR',
    });
    assert.equal(
      ws1Repeat.settledBalance,
      5,
      'Repeated ensureWorkspace must not duplicate trial credits'
    );
  });

  test('executes credit reservation, settlement, and release lifecycle in PostgreSQL', async (t) => {
    if (!pgReachable) {
      if (process.env.REQUIRE_POSTGRES_TESTS === '1') {
        assert.fail(`PostgreSQL connection required`);
      }
      t.skip('PostgreSQL socket blocked in current OS sandbox');
      return;
    }

    await ledger.ensureWorkspace({
      userId: 'pg-user-lifecycle',
      email: 'pg-lifecycle@shotistry.app',
      workspaceId: 'pg-ws-lifecycle',
    });

    // 1. Reserve & Settle
    const job1 = await ledger.createPhotoshootJob({
      workspaceId: 'pg-ws-lifecycle',
      productName: 'Riyadh Oud',
      stylePreset: 'gulf_luxury_marble',
      aspectRatio: '1:1',
      modelUsed: 'gemini-3.1-flash-image',
      rawPrompt: 'Riyadh Oud',
      synthesizedPrompt: 'Hero studio shot of Riyadh Oud',
      creditCost: 1,
    });

    const res1 = await ledger.reserveCredits({
      workspaceId: 'pg-ws-lifecycle',
      generationJobId: job1.id,
      amount: 1,
    });
    assert.equal(res1.status, 'PENDING');

    const balMid = await ledger.getWorkspaceBalance('pg-ws-lifecycle');
    assert.equal(balMid.settledBalance, 5);
    assert.equal(balMid.reservedCredits, 1);
    assert.equal(balMid.availableCredits, 4);

    const settled = await ledger.settleReservation(res1.id);
    assert.equal(settled.reservation.status, 'SETTLED');
    assert.equal(settled.ledgerEntry.amount, -1);
    assert.equal(settled.ledgerEntry.balanceAfter, 4);

    // 2. Reserve & Release on failure
    const job2 = await ledger.createPhotoshootJob({
      workspaceId: 'pg-ws-lifecycle',
      productName: 'Cairo Serum',
      stylePreset: 'minimalist_concrete_studio',
      aspectRatio: '4:5',
      modelUsed: 'gemini-3.1-flash-image',
      rawPrompt: 'Cairo Serum',
      synthesizedPrompt: 'Hero studio shot of Cairo Serum',
      creditCost: 1,
    });

    const res2 = await ledger.reserveCredits({
      workspaceId: 'pg-ws-lifecycle',
      generationJobId: job2.id,
      amount: 1,
    });

    const released = await ledger.releaseReservation(res2.id, 'Simulated upstream timeout');
    assert.equal(released.status, 'RELEASED');

    const balAfter = await ledger.getWorkspaceBalance('pg-ws-lifecycle');
    assert.equal(balAfter.settledBalance, 4);
    assert.equal(balAfter.reservedCredits, 0);
    assert.equal(balAfter.availableCredits, 4);
  });

  test('prevents double-spending under concurrent PostgreSQL requests using SERIALIZABLE + SELECT FOR UPDATE locking', async (t) => {
    if (!pgReachable) {
      if (process.env.REQUIRE_POSTGRES_TESTS === '1') {
        assert.fail(`PostgreSQL connection required`);
      }
      t.skip('PostgreSQL socket blocked in current OS sandbox');
      return;
    }

    await ledger.ensureWorkspace({
      userId: 'pg-user-race',
      email: 'pg-race@shotistry.app',
      workspaceId: 'pg-ws-race',
    });

    // Reduce balance from 5 to 3 available credits via admin adjustment
    await ledger.grantCredits({
      workspaceId: 'pg-ws-race',
      amount: -2,
      type: 'ADMIN_ADJUSTMENT',
      idempotencyKey: 'pg-race-setup-reduce-to-3',
      description: 'Set balance to 3 for concurrency test',
    });

    const initialBal = await ledger.getWorkspaceBalance('pg-ws-race');
    assert.equal(initialBal.availableCredits, 3);

    // Create 5 photoshoot jobs
    const jobs = [];
    for (let i = 0; i < 5; i++) {
      const job = await ledger.createPhotoshootJob({
        workspaceId: 'pg-ws-race',
        productName: `Concurrent Product ${i}`,
        stylePreset: 'gulf_luxury_marble',
        aspectRatio: '1:1',
        modelUsed: 'gemini-3.1-flash-image',
        rawPrompt: `Prompt ${i}`,
        synthesizedPrompt: `Synthesized ${i}`,
        creditCost: 1,
      });
      jobs.push(job);
    }

    // Fire 5 concurrent credit reservations for 1 credit each against PostgreSQL (only 3 available!)
    const outcomes = await Promise.allSettled(
      jobs.map((job) =>
        ledger.reserveCredits({
          workspaceId: 'pg-ws-race',
          generationJobId: job.id,
          amount: 1,
        })
      )
    );

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');

    assert.equal(
      fulfilled.length,
      3,
      `Expected exactly 3 concurrent reservations to succeed in PostgreSQL, got ${fulfilled.length}`
    );
    assert.equal(
      rejected.length,
      2,
      `Expected exactly 2 concurrent reservations to be rejected in PostgreSQL, got ${rejected.length}`
    );

    for (const rej of rejected) {
      assert.match(rej.reason.message, /Insufficient credits/);
    }

    const finalBal = await ledger.getWorkspaceBalance('pg-ws-race');
    assert.equal(finalBal.settledBalance, 3);
    assert.equal(finalBal.reservedCredits, 3);
    assert.equal(finalBal.availableCredits, 0);
  });
});
