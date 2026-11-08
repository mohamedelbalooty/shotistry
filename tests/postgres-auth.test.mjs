import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { runPgMigrations } from './helpers/pg-migrate.mjs';
import { PostgresAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import { PostgresActionTokenRepository } from '../src/lib/db/repositories/action-token-repository.ts';
import { PostgresCreditLedgerService } from '../src/lib/ledger/postgres-ledger-service.ts';
import { PostgresRateLimitStore } from '../src/lib/security/rate-limit/postgres-store.ts';
import { bootstrapPlatformAdmin, rotateAdminPasswordViaCli } from '../src/lib/auth/admin-bootstrap.ts';
import { hashPassword } from '../src/lib/auth/password.ts';

const PG_ADMIN_URL =
  process.env.POSTGRES_ADMIN_URL ||
  'postgresql://tasawk@localhost:5432/postgres';

const PG_TEST_URL =
  process.env.POSTGRES_TEST_URL ||
  process.env.DATABASE_URL ||
  'postgresql://tasawk@localhost:5432/shotistry_audit_test?schema=public';

process.env.DATABASE_URL = PG_TEST_URL;
process.env.SHOTISTRY_DB_DRIVER = 'postgres';

describe('PostgreSQL 16 Auth & Concurrency CI Gate Integration Tests', () => {
  let prisma;
  let authRepo;
  let tokenRepo;
  let ledger;
  let rateLimiter;
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
        datasources: { db: { url: PG_TEST_URL } },
        log: [],
      });

      await prisma.$queryRaw`SELECT 1`;

      // Apply all migrations via helper
      await runPgMigrations(prisma, { reset: false });

      pgReachable = true;
      authRepo = new PostgresAuthRepository(prisma);
      tokenRepo = new PostgresActionTokenRepository(prisma);
      ledger = new PostgresCreditLedgerService(prisma);
      rateLimiter = new PostgresRateLimitStore();

      // Clean test rows
      await prisma.session.deleteMany({});
      await prisma.authActionToken.deleteMany({});
      await prisma.rateLimitBucket.deleteMany({});
      await prisma.workspaceInvite.deleteMany({});
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
        // ignore disconnect error
      }
      pgConnectError = err;
      pgReachable = false;
    }
  });

  after(async () => {
    if (prisma) {
      try {
        await prisma.session.deleteMany({});
        await prisma.authActionToken.deleteMany({});
        await prisma.rateLimitBucket.deleteMany({});
        await prisma.workspaceInvite.deleteMany({});
        await prisma.adminAuditLog.deleteMany({});
        await prisma.subscription.deleteMany({});
        await prisma.workspaceMember.deleteMany({});
        await prisma.workspace.deleteMany({});
        await prisma.user.deleteMany({});
      } catch {
        // ignore cleanup error
      }
      await prisma.$disconnect();
    }
  });

  function guardPg(t) {
    if (!pgReachable) {
      if (process.env.REQUIRE_POSTGRES_TESTS === '1') {
        assert.fail(`PostgreSQL connection required but failed: ${pgConnectError?.message}`);
      }
      t.skip(`PostgreSQL socket blocked in current OS sandbox (${pgConnectError?.message})`);
      return false;
    }
    return true;
  }

  // 1. Migrations applied cleanly
  test('1. Migrations applied cleanly: Session, AuthActionToken, RateLimitBucket, WorkspaceInvite, _prisma_migrations', async (t) => {
    if (!guardPg(t)) return;

    const tables = await prisma.$queryRaw`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const tableNames = tables.map((r) => r.table_name);

    for (const expected of [
      'Session',
      'AuthActionToken',
      'RateLimitBucket',
      'WorkspaceInvite',
      '_prisma_migrations',
    ]) {
      assert.ok(
        tableNames.includes(expected),
        `Expected PostgreSQL table "${expected}" in public schema`
      );
    }

    const migrationRows = await prisma.$queryRaw`
      SELECT "migration_name" FROM "_prisma_migrations" ORDER BY "migration_name" ASC
    `;
    const names = migrationRows.map((r) => r.migration_name);
    assert.ok(names.length >= 3, `Expected at least 3 migrations, found ${names.length}`);
    assert.ok(names.includes('20261105000000_init'));
    assert.ok(names.includes('20261108000000_sessions_rbac'));
    assert.ok(names.includes('20261109000000_auth_security_hardening'));
  });

  // 2. Session create / resolve / touch / revoke / revoke-all
  test('2. Session lifecycle: create, resolve, touch, revoke, and revoke-all', async (t) => {
    if (!guardPg(t)) return;

    const pwHash = await hashPassword('ValidPass123!');
    const reg = await ledger.registerMerchantWithInitialWorkspace({
      email: `session-${crypto.randomUUID()}@example.com`,
      passwordHash: pwHash,
      name: 'Session Test User',
    });

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token, 'utf8').digest('hex');
    const sessionId = `sess-${crypto.randomUUID()}`;
    const csrfToken = crypto.randomBytes(24).toString('hex');
    const now = new Date();
    const idleExpiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Create session
    const created = await authRepo.createSession({
      id: sessionId,
      userId: reg.user.id,
      activeWorkspaceId: reg.workspace.workspaceId,
      tokenHash,
      csrfToken,
      nowIso: now.toISOString(),
      idleExpiresAt,
      expiresAt,
    });
    assert.equal(created.id, sessionId);
    assert.equal(created.userId, reg.user.id);

    // Resolve session
    const resolved = await authRepo.findSessionByTokenHash(tokenHash);
    assert.ok(resolved);
    assert.equal(resolved.sessionId, sessionId);
    assert.equal(resolved.userId, reg.user.id);
    assert.equal(resolved.csrfToken, csrfToken);

    // Touch session
    const touchedIdle = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const touchedActivity = new Date().toISOString();
    await authRepo.touchSession(sessionId, touchedActivity, touchedIdle);

    const touched = await authRepo.findSessionByTokenHash(tokenHash);
    assert.ok(touched);
    assert.equal(new Date(touched.idleExpiresAt).getTime(), new Date(touchedIdle).getTime());

    // Revoke session
    const revoked = await authRepo.revokeSessionByTokenHash(tokenHash, 'USER_LOGOUT');
    assert.equal(revoked, true);
    const postRevoke = await authRepo.findSessionByTokenHash(tokenHash);
    assert.ok(postRevoke?.revokedAt !== null);

    // Revoke all
    for (let i = 0; i < 3; i++) {
      const sId = `sess-batch-${i}-${crypto.randomUUID()}`;
      const sTok = crypto.createHash('sha256').update(`tok-${i}-${sId}`).digest('hex');
      await authRepo.createSession({
        id: sId,
        userId: reg.user.id,
        activeWorkspaceId: reg.workspace.workspaceId,
        tokenHash: sTok,
        csrfToken: crypto.randomBytes(16).toString('hex'),
        nowIso: new Date().toISOString(),
        idleExpiresAt,
        expiresAt,
      });
    }

    const revokedCount = await authRepo.revokeAllUserSessions(reg.user.id, 'BATCH_REVOKE');
    assert.equal(revokedCount, 3);
    const activeLeft = await authRepo.listActiveSessions(reg.user.id);
    assert.equal(activeLeft.length, 0);
  });

  // 3. 10 concurrent registrations with same email -> exactly 1 success
  test('3. 10 concurrent registrations with same email -> exactly 1 success', async (t) => {
    if (!guardPg(t)) return;

    const email = `race-${crypto.randomUUID()}@example.com`;
    const pwHash = await hashPassword('ValidPass123!');

    const attempts = await Promise.allSettled(
      Array.from({ length: 10 }).map((_, i) =>
        ledger.registerMerchantWithInitialWorkspace({
          email,
          passwordHash: pwHash,
          name: `Concurrent Merchant ${i}`,
        })
      )
    );

    const fulfilled = attempts.filter((a) => a.status === 'fulfilled');
    const rejected = attempts.filter((a) => a.status === 'rejected');

    assert.equal(fulfilled.length, 1, 'Exactly one concurrent registration must succeed');
    assert.equal(rejected.length, 9, 'All 9 duplicate attempts must be rejected');

    const users = await prisma.user.findMany({ where: { email } });
    assert.equal(users.length, 1);
  });

  // 4. Atomic workspace provisioning (user + workspace + OWNER + subscription + 5 trial credits)
  test('4. Atomic workspace provisioning in single transaction (failure rolls back everything)', async (t) => {
    if (!guardPg(t)) return;

    const email = `atomic-${crypto.randomUUID()}@example.com`;
    const pwHash = await hashPassword('ValidPass123!');

    // Success case
    const reg = await ledger.registerMerchantWithInitialWorkspace({
      email,
      passwordHash: pwHash,
      name: 'Atomic Merchant',
    });

    const user = await prisma.user.findUnique({ where: { id: reg.user.id } });
    const workspace = await prisma.workspace.findUnique({ where: { id: reg.workspace.workspaceId } });
    const membership = await prisma.workspaceMember.findFirst({
      where: { workspaceId: reg.workspace.workspaceId, userId: reg.user.id },
    });
    const sub = await prisma.subscription.findUnique({ where: { id: `sub-${reg.workspace.workspaceId}` } });
    const ledgerEntry = await prisma.creditLedger.findFirst({
      where: { workspaceId: reg.workspace.workspaceId },
    });

    assert.ok(user);
    assert.ok(workspace);
    assert.ok(membership && membership.role === 'OWNER');
    assert.ok(sub && sub.planTier === 'FREE');
    assert.ok(ledgerEntry && ledgerEntry.amount === 5);

    // Rollback verification: injected failure
    const badEmail = `fail-${crypto.randomUUID()}@example.com`;
    await assert.rejects(
      async () => {
        await prisma.$transaction(async (tx) => {
          const uId = `u-${crypto.randomUUID()}`;
          await tx.user.create({
            data: {
              id: uId,
              email: badEmail,
              passwordHash: pwHash,
              role: 'USER',
              country: 'EG',
              locale: 'ar',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          });
          // Deliberate error: invalid foreign key
          await tx.workspaceMember.create({
            data: {
              id: `wm-${crypto.randomUUID()}`,
              workspaceId: 'non-existent-workspace-id',
              userId: uId,
              role: 'OWNER',
            },
          });
        });
      }
    );

    const userAfterRollback = await prisma.user.findUnique({ where: { email: badEmail } });
    assert.equal(userAfterRollback, null, 'Rolled back transaction must leave 0 rows');
  });

  // 5. Trial credit idempotency
  test('5. Trial credit idempotency: grant once under concurrency', async (t) => {
    if (!guardPg(t)) return;

    const userId = `trial-user-${crypto.randomUUID()}`;
    const email = `trial-race-${crypto.randomUUID()}@example.com`;
    await prisma.user.create({
      data: {
        id: userId,
        email,
        name: 'Trial Concurrency User',
        country: 'EG',
        locale: 'ar',
        trialGrantedAt: null,
      },
    });

    // Concurrently try provisioning 5 workspaces for this user
    await Promise.all(
      Array.from({ length: 5 }).map((_, i) =>
        ledger.ensureWorkspace({
          userId,
          email,
          workspaceId: `ws-trial-${i}-${crypto.randomUUID()}`,
          workspaceName: `Workspace ${i}`,
        })
      )
    );

    const trialIdempotencyKey = `trial:grant:user:${userId}`;
    const ledgers = await prisma.creditLedger.findMany({
      where: { idempotencyKey: trialIdempotencyKey },
    });
    assert.equal(
      ledgers.length,
      1,
      'Exactly one 5-credit trial ledger entry must be created under concurrency'
    );
    assert.equal(ledgers[0].amount, 5);

    const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
    assert.ok(updatedUser?.trialGrantedAt !== null);
  });

  // 6. 20 concurrent logins for same user -> 20 distinct sessions, no deadlock; revoke-all leaves 0 active
  test('6. 20 concurrent logins for same user: no deadlock, 20 distinct sessions, revoke-all clears all', async (t) => {
    if (!guardPg(t)) return;

    const email = `login-race-${crypto.randomUUID()}@example.com`;
    const pwHash = await hashPassword('ValidPass123!');
    const reg = await ledger.registerMerchantWithInitialWorkspace({
      email,
      passwordHash: pwHash,
    });

    const now = new Date();
    const idleExpiresAt = new Date(now.getTime() + 30 * 60 * 1000).toISOString();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    const createdSessions = await Promise.all(
      Array.from({ length: 20 }).map((_, i) => {
        const sId = `race-sess-${i}-${crypto.randomUUID()}`;
        const tHash = crypto.createHash('sha256').update(`token-${i}-${sId}`).digest('hex');
        return authRepo.createSession({
          id: sId,
          userId: reg.user.id,
          activeWorkspaceId: reg.workspace.workspaceId,
          tokenHash: tHash,
          csrfToken: crypto.randomBytes(16).toString('hex'),
          nowIso: now.toISOString(),
          idleExpiresAt,
          expiresAt,
        });
      })
    );

    assert.equal(createdSessions.length, 20);
    const active = await authRepo.listActiveSessions(reg.user.id);
    assert.equal(active.length, 20);

    const revokedCount = await authRepo.revokeAllUserSessions(reg.user.id, 'PASSWORD_RESET');
    assert.equal(revokedCount, 20);

    const activeAfter = await authRepo.listActiveSessions(reg.user.id);
    assert.equal(activeAfter.length, 0);
  });

  // 7. RBAC persistence across requests
  test('7. RBAC persistence across requests', async (t) => {
    if (!guardPg(t)) return;

    const email = `rbac-${crypto.randomUUID()}@example.com`;
    const pwHash = await hashPassword('ValidPass123!');
    const reg = await ledger.registerMerchantWithInitialWorkspace({
      email,
      passwordHash: pwHash,
    });

    const initialUser = await authRepo.findUserById(reg.user.id);
    assert.equal(initialUser?.role, 'USER');

    // Upgrade platform role to SUPPORT
    await prisma.user.update({
      where: { id: reg.user.id },
      data: { role: 'SUPPORT' },
    });

    const updatedUser = await authRepo.findUserById(reg.user.id);
    assert.equal(updatedUser?.role, 'SUPPORT');

    // Workspace membership role change
    const member = await prisma.workspaceMember.findFirst({
      where: { workspaceId: reg.workspace.workspaceId, userId: reg.user.id },
    });
    assert.ok(member);
    assert.equal(member.role, 'OWNER');

    await prisma.workspaceMember.update({
      where: { id: member.id },
      data: { role: 'ADMIN' },
    });

    const workspaces = await authRepo.getWorkspacesForUser(reg.user.id);
    assert.equal(workspaces[0].role, 'ADMIN');
  });

  // 8. 50 concurrent PostgresRateLimitStore.consume operations
  test('8. 50 concurrent PostgresRateLimitStore.consume operations: exact count and sliding window', async (t) => {
    if (!guardPg(t)) return;

    const bucketKey = `test:rl:pg:${crypto.randomUUID()}`;
    const limit = 30;
    const windowMs = 60000;

    const decisions = await Promise.all(
      Array.from({ length: 50 }).map(() => rateLimiter.consume(bucketKey, limit, windowMs))
    );

    const allowed = decisions.filter((d) => d.allowed);
    const blocked = decisions.filter((d) => !d.allowed);

    assert.equal(allowed.length, 30, 'Exactly 30 requests must be allowed under limit 30');
    assert.equal(blocked.length, 20, 'Exactly 20 requests must be blocked');

    const bucket = await prisma.rateLimitBucket.findUnique({ where: { key: bucketKey } });
    assert.ok(bucket);
    assert.equal(bucket.count, 50, 'Bucket count in PostgreSQL must reflect exact total of 50 attempts');
  });

  // 9. Concurrent action token consumption -> exactly 1 winner
  test('9. Concurrent action token consumption -> exactly 1 winner', async (t) => {
    if (!guardPg(t)) return;

    const email = `token-race-${crypto.randomUUID()}@example.com`;
    const pwHash = await hashPassword('ValidPass123!');
    const reg = await ledger.registerMerchantWithInitialWorkspace({
      email,
      passwordHash: pwHash,
    });

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');

    await tokenRepo.issueToken({
      userId: reg.user.id,
      type: 'EMAIL_VERIFY',
      tokenHash,
      expiresAt: new Date(Date.now() + 60000),
    });

    // 10 concurrent consume attempts
    const consumeResults = await Promise.all(
      Array.from({ length: 10 }).map(() =>
        tokenRepo.consumeToken({
          tokenHash,
          expectedType: 'EMAIL_VERIFY',
        })
      )
    );

    const successfulConsumes = consumeResults.filter((r) => r !== null);
    const failedConsumes = consumeResults.filter((r) => r === null);

    assert.equal(successfulConsumes.length, 1, 'Exactly one consume operation must win');
    assert.equal(failedConsumes.length, 9, 'Other 9 concurrent consume attempts must return null');

    const tokenRow = await prisma.authActionToken.findUnique({ where: { tokenHash } });
    assert.ok(tokenRow?.consumedAt !== null);
  });

  // 10. Admin bootstrap via CLI in PG mode
  test('10. Admin bootstrap and password rotation in PG mode', async (t) => {
    if (!guardPg(t)) return;

    const testSecret = 'test-secret-at-least-24-characters-long!';
    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = testSecret;

    const adminEmail = `admin-cli-${crypto.randomUUID()}@shotistry.local`;
    const initialPass = 'InitialAdminPass123!';

    const bootstrapped = await bootstrapPlatformAdmin({
      email: adminEmail,
      password: initialPass,
      name: 'Test Super Admin',
      bootstrapSecret: testSecret,
    });

    assert.equal(bootstrapped.email, adminEmail);
    assert.equal(bootstrapped.role, 'ADMIN');

    // Duplicate bootstrap must be rejected
    await assert.rejects(
      async () => {
        await bootstrapPlatformAdmin({
          email: `another-admin-${crypto.randomUUID()}@shotistry.local`,
          password: initialPass,
          bootstrapSecret: testSecret,
        });
      },
      /ADMIN_ALREADY_BOOTSTRAPPED/
    );

    // Password rotation
    const rotated = await rotateAdminPasswordViaCli({
      email: adminEmail,
      newPassword: 'RotatedAdminPass456!',
      bootstrapSecret: testSecret,
    });
    assert.equal(rotated.userId, bootstrapped.userId);
    assert.equal(rotated.email, adminEmail);
    assert.ok(rotated.auditLogId);

    const auditLogs = await prisma.adminAuditLog.findMany({
      where: { userId: bootstrapped.userId },
      orderBy: { createdAt: 'asc' },
    });
    assert.ok(auditLogs.length >= 2);
    assert.equal(auditLogs[0].action, 'PLATFORM_ADMIN_BOOTSTRAP');
    assert.equal(auditLogs[1].action, 'ADMIN_PASSWORD_ROTATED_CLI');
  });
});
