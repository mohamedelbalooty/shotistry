import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { getAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import {
  getEmailTransport,
  setEmailTransportForTests,
  MemoryEmailTransport,
} from '../src/lib/email/index.ts';
import {
  createSession,
  listActiveUserSessions,
  extractSessionToken,
} from '../src/lib/auth/session.ts';
import { hashPassword, verifyPassword } from '../src/lib/auth/password.ts';
import {
  bootstrapPlatformAdmin,
  rotateAdminPasswordViaCli,
  createSupportOperatorByAdmin,
  rotateSupportOperatorPassword,
} from '../src/lib/auth/admin-bootstrap.ts';

// Routes to test
import { POST as forgotPasswordRoute } from '../src/app/api/auth/forgot-password/route.ts';
import { POST as resetPasswordRoute } from '../src/app/api/auth/reset-password/route.ts';
import { POST as passwordChangeRoute } from '../src/app/api/auth/password/route.ts';
import { POST as loginRoute } from '../src/app/api/auth/login/route.ts';

// Next.js config
import nextConfig from '../next.config.ts';

describe('Phase 6 — Account Recovery & Token-Leakage Headers', () => {
  let memoryTransport;
  const BOOTSTRAP_SECRET = 'super-secret-bootstrap-token-2026-xyz';

  beforeEach(async () => {
    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = BOOTSTRAP_SECRET;
    await resetDbForTests();
    resetRateLimitsForTests();
    memoryTransport = new MemoryEmailTransport();
    setEmailTransportForTests(memoryTransport);
  });

  afterEach(() => {
    setEmailTransportForTests(null);
  });

  test('POST /forgot-password returns 202 uniform response and floor timing for unknown email', async () => {
    const start = Date.now();
    const req = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.20',
      },
      body: JSON.stringify({ email: 'nonexistent@example.com' }),
    });

    const res = await forgotPasswordRoute(req);
    const elapsed = Date.now() - start;

    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.match(body.message, /password reset instructions/i);
    assert.equal(memoryTransport.getSentMessages().length, 0);
    // Anti-enumeration timing floor ~50ms
    assert.ok(
      elapsed >= 35,
      `Response took ${elapsed}ms; expected anti-enumeration timing floor >= 35ms`
    );
  });

  test('POST /forgot-password generates token and emails known merchant user', async () => {
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'merchant.recovery@shotistry.app',
      passwordHash: await hashPassword('OldPassword123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Cairo Studios',
    });

    const req = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.21',
      },
      body: JSON.stringify({ email: 'merchant.recovery@shotistry.app' }),
    });

    const res = await forgotPasswordRoute(req);
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.success, true);

    const sent = memoryTransport.getSentMessages();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'merchant.recovery@shotistry.app');
    assert.match(sent[0].html, /#token=/);

    // Verify token record in database
    const tokenMatch = sent[0].html.match(/#token=([a-zA-Z0-9_-]+)/);
    assert.ok(tokenMatch, 'Email must contain #token= fragment');
    const rawToken = tokenMatch[1];

    const expectedHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const db = getDb();
    const row = db
      .prepare('SELECT * FROM "AuthActionToken" WHERE "tokenHash" = ?')
      .get(expectedHash);
    assert.ok(row, 'Token record must exist in DB with hashed token');
    assert.equal(row.userId, user.id);
    assert.equal(row.type, 'PASSWORD_RESET');
    assert.equal(row.consumedAt, null);
  });

  test('POST /forgot-password excludes ADMIN and SUPPORT roles and logs PRIVILEGED_RESET_ATTEMPT', async () => {
    await bootstrapPlatformAdmin({
      email: 'admin.recovery@shotistry.app',
      password: 'StrongAdminP@ssword2026!',
      name: 'Recovery Admin',
      bootstrapSecret: BOOTSTRAP_SECRET,
    });

    const req = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '198.51.100.22',
      },
      body: JSON.stringify({ email: 'admin.recovery@shotistry.app' }),
    });

    const res = await forgotPasswordRoute(req);
    assert.equal(res.status, 202);
    const body = await res.json();
    assert.equal(body.success, true);

    // No email must be dispatched
    assert.equal(memoryTransport.getSentMessages().length, 0);

    // No action token created
    const db = getDb();
    const tokenCount = db
      .prepare('SELECT COUNT(*) as count FROM "AuthActionToken"')
      .get();
    assert.equal(tokenCount.count, 0);

    // PRIVILEGED_RESET_ATTEMPT logged to AdminAuditLog
    const auditRow = db
      .prepare(
        'SELECT * FROM "AdminAuditLog" WHERE "action" = ? ORDER BY "createdAt" DESC'
      )
      .get('PRIVILEGED_RESET_ATTEMPT');
    assert.ok(auditRow, 'PRIVILEGED_RESET_ATTEMPT must be recorded');
    const details = JSON.parse(auditRow.details);
    assert.equal(details.role, 'ADMIN');
    assert.equal(details.email, 'admin.recovery@shotistry.app');
  });

  test('POST /reset-password rejects weak password without consuming token', async () => {
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'merchant.weak@shotistry.app',
      passwordHash: await hashPassword('OldPassword123!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Riyadh Studio',
    });

    // Request reset to get token
    const req1 = new Request('http://localhost/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'merchant.weak@shotistry.app' }),
    });
    await forgotPasswordRoute(req1);
    const sent = memoryTransport.getLastMessage();
    const rawToken = sent.html.match(/#token=([a-zA-Z0-9_-]+)/)[1];

    // Attempt reset with weak password
    const req2 = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'weak' }),
    });
    const res2 = await resetPasswordRoute(req2);
    assert.equal(res2.status, 400);

    // Verify token is still unconsumed in DB
    const expectedHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM "AuthActionToken" WHERE "tokenHash" = ?')
      .get(expectedHash);
    assert.equal(row.consumedAt, null, 'Token must not be consumed on validation failure');

    // Now reset with strong password succeeds
    const req3 = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'StrongNewP@ssword2026!' }),
    });
    const res3 = await resetPasswordRoute(req3);
    assert.equal(res3.status, 200);

    // Now token is consumed
    const rowConsumed = db
      .prepare('SELECT * FROM "AuthActionToken" WHERE "tokenHash" = ?')
      .get(expectedHash);
    assert.ok(rowConsumed.consumedAt, 'Token must be marked consumed');
  });

  test('POST /reset-password updates password, revokes all sessions, sends notice and invalidates replay', async () => {
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'merchant.reset@shotistry.app',
      passwordHash: await hashPassword('InitialP@ssword123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Alex Studio',
    });

    // Create 2 sessions for this user
    const s1 = await createSession({ userId: user.id });
    const s2 = await createSession({ userId: user.id });
    const activeBefore = await listActiveUserSessions(user.id);
    assert.equal(activeBefore.length, 2);

    // Request reset
    await forgotPasswordRoute(
      new Request('http://localhost/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'merchant.reset@shotistry.app' }),
      })
    );
    const rawToken = memoryTransport
      .getLastMessage()
      .html.match(/#token=([a-zA-Z0-9_-]+)/)[1];

    // Reset password
    const resetReq = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'BrandNewP@ssword2026!' }),
    });
    const resetRes = await resetPasswordRoute(resetReq);
    assert.equal(resetRes.status, 200);

    // Cookie cleared
    const setCookie = resetRes.headers.get('set-cookie');
    assert.ok(setCookie && setCookie.includes('Max-Age=0'));

    // All sessions revoked
    const activeAfter = await listActiveUserSessions(user.id);
    assert.equal(activeAfter.length, 0);

    // Notice email sent
    const lastEmail = memoryTransport.getLastMessage();
    assert.equal(lastEmail.to, 'merchant.reset@shotistry.app');
    assert.match(lastEmail.subject, /security alert|تنبيه أمني/i);

    // Replay fails
    const replayReq = new Request('http://localhost/api/auth/reset-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: rawToken, newPassword: 'BrandNewP@ssword2026!' }),
    });
    const replayRes = await resetPasswordRoute(replayReq);
    assert.equal(replayRes.status, 400);

    // Login with new password succeeds, old password fails
    const oldLogin = await loginRoute(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant.reset@shotistry.app',
          password: 'InitialP@ssword123!',
        }),
      })
    );
    assert.equal(oldLogin.status, 401);

    const newLogin = await loginRoute(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant.reset@shotistry.app',
          password: 'BrandNewP@ssword2026!',
        }),
      })
    );
    assert.equal(newLogin.status, 200);
  });

  test('POST /api/auth/password sends passwordChangedNotice security alert', async () => {
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'merchant.pwchange@shotistry.app',
      passwordHash: await hashPassword('CurrentP@ssword123!'),
      country: 'SA',
      locale: 'en',
      workspaceName: 'Jeddah Hub',
    });

    const sessionRes = await createSession({ userId: user.id });
    const req = new Request('http://localhost/api/auth/password', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: sessionRes.cookieHeader,
        'x-csrf-token': sessionRes.session.csrfToken,
      },
      body: JSON.stringify({
        currentPassword: 'CurrentP@ssword123!',
        newPassword: 'UpdatedP@ssword2026!',
      }),
    });

    memoryTransport.clear();
    const res = await passwordChangeRoute(req);
    assert.equal(res.status, 200);

    const sent = memoryTransport.getSentMessages();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'merchant.pwchange@shotistry.app');
    assert.match(sent[0].subject, /security alert|تنبيه أمني/i);
  });

  test('rotateAdminPasswordViaCli rotates password, revokes admin sessions, and logs audit', async () => {
    const admin = await bootstrapPlatformAdmin({
      email: 'admin.cli@shotistry.app',
      password: 'InitialAdminP@ss2026!',
      name: 'Admin Cli',
      bootstrapSecret: BOOTSTRAP_SECRET,
    });

    // Create session for admin
    await createSession({ userId: admin.userId });
    assert.equal((await listActiveUserSessions(admin.userId)).length, 1);

    // Rotate password
    const result = await rotateAdminPasswordViaCli({
      email: 'admin.cli@shotistry.app',
      newPassword: 'RotatedAdminP@ss2026!',
      bootstrapSecret: BOOTSTRAP_SECRET,
    });

    assert.equal(result.email, 'admin.cli@shotistry.app');
    assert.equal(result.role, 'ADMIN');

    // Admin sessions revoked
    assert.equal((await listActiveUserSessions(admin.userId)).length, 0);

    // Audit log written
    const db = getDb();
    const log = db
      .prepare('SELECT * FROM "AdminAuditLog" WHERE "action" = ?')
      .get('ADMIN_PASSWORD_ROTATED_CLI');
    assert.ok(log);
    assert.equal(log.userId, admin.userId);

    // Verify login with new password
    const authRepo = getAuthRepository();
    const user = await authRepo.findUserById(admin.userId);
    const valid = await verifyPassword('RotatedAdminP@ss2026!', user.passwordHash);
    assert.equal(valid, true);
  });

  test('next.config.ts exports security headers conforming to specification', async () => {
    assert.ok(nextConfig, 'nextConfig must exist');
    assert.equal(typeof nextConfig.headers, 'function');

    const headersList = await nextConfig.headers();
    assert.ok(Array.isArray(headersList));

    // Global headers check
    const globalRule = headersList.find((r) => r.source === '/:path*');
    assert.ok(globalRule, 'Global headers rule /:path* must exist');
    const headerMap = Object.fromEntries(
      globalRule.headers.map((h) => [h.key.toLowerCase(), h.value])
    );
    assert.equal(headerMap['x-content-type-options'], 'nosniff');
    assert.equal(headerMap['x-frame-options'], 'DENY');
    assert.equal(headerMap['referrer-policy'], 'strict-origin-when-cross-origin');

    // Sensitive route headers checks
    const sensitivePaths = [
      '/verify-email',
      '/reset-password',
      '/account/confirm-email',
      '/invites/accept',
      '/api/auth/:path*',
    ];

    for (const path of sensitivePaths) {
      const rule = headersList.find((r) => r.source === path);
      assert.ok(rule, `Security header rule for ${path} must exist`);
      const map = Object.fromEntries(
        rule.headers.map((h) => [h.key.toLowerCase(), h.value])
      );
      assert.equal(
        map['referrer-policy'],
        'no-referrer',
        `${path} must have Referrer-Policy: no-referrer`
      );
      assert.equal(
        map['cache-control'],
        'no-store',
        `${path} must have Cache-Control: no-store`
      );
    }
  });
});
