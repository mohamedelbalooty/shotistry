import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import {
  createActionToken,
  consumeActionToken,
} from '../src/lib/auth/action-tokens.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { getAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import {
  getEmailTransport,
  setEmailTransportForTests,
  MemoryEmailTransport,
} from '../src/lib/email/index.ts';
import { POST as registerRoute } from '../src/app/api/auth/register/route.ts';
import { POST as confirmVerifyRoute } from '../src/app/api/auth/verify-email/confirm/route.ts';
import { POST as resendVerifyRoute } from '../src/app/api/auth/verify-email/resend/route.ts';
import { POST as emailChangeRequestRoute } from '../src/app/api/auth/email/change-request/route.ts';
import { POST as emailChangeConfirmRoute } from '../src/app/api/auth/email/change-confirm/route.ts';
import { GET as sessionRoute } from '../src/app/api/auth/session/route.ts';
import {
  createSession,
  listActiveUserSessions,
  extractSessionToken,
} from '../src/lib/auth/session.ts';
import { hashPassword } from '../src/lib/auth/password.ts';

describe('AuthActionToken & Email Verification Lifecycle (Phase 5)', () => {
  let memoryTransport;

  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    memoryTransport = new MemoryEmailTransport();
    setEmailTransportForTests(memoryTransport);
  });

  afterEach(() => {
    setEmailTransportForTests(null);
  });

  test('createActionToken stores SHA-256 hash in DB and never raw token', async () => {
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'token.test@cairo.eg',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'ar',
      workspaceName: 'Token Studio',
    });

    const { rawToken, tokenRecord } = await createActionToken({
      userId: user.id,
      type: 'EMAIL_VERIFY',
      targetEmail: 'token.test@cairo.eg',
      ttlMinutes: 30,
    });

    assert.ok(rawToken.length >= 32);
    const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    assert.equal(tokenRecord.tokenHash, expectedHash);
    assert.notEqual(tokenRecord.tokenHash, rawToken);

    // Verify database row
    const db = getDb();
    const row = db
      .prepare('SELECT * FROM "AuthActionToken" WHERE "id" = ?')
      .get(tokenRecord.id);
    assert.ok(row);
    assert.equal(row.tokenHash, expectedHash);
    assert.equal(row.userId, user.id);
  });

  test('consumeActionToken is strictly single-use and atomic under concurrency', async () => {
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'atomic.test@cairo.eg',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'ar',
      workspaceName: 'Atomic Studio',
    });

    const { rawToken } = await createActionToken({
      userId: user.id,
      type: 'EMAIL_VERIFY',
      targetEmail: 'atomic.test@cairo.eg',
      ttlMinutes: 30,
    });

    // Run 5 concurrent consume attempts with the exact same rawToken
    const results = await Promise.all([
      consumeActionToken({ rawToken, expectedType: 'EMAIL_VERIFY' }),
      consumeActionToken({ rawToken, expectedType: 'EMAIL_VERIFY' }),
      consumeActionToken({ rawToken, expectedType: 'EMAIL_VERIFY' }),
      consumeActionToken({ rawToken, expectedType: 'EMAIL_VERIFY' }),
      consumeActionToken({ rawToken, expectedType: 'EMAIL_VERIFY' }),
    ]);

    const successfulConsumes = results.filter((r) => r !== null);
    assert.equal(
      successfulConsumes.length,
      1,
      'Exactly one concurrent attempt must succeed in consuming the token'
    );
  });

  test('registration dispatches verification email with #token= and verify/confirm route marks email verified', async () => {
    const regReq = new Request('http://localhost:3000/api/auth/register', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email: 'merchant.new@riyadh.sa',
        password: 'StrongPassword2026!',
        name: 'New Merchant',
        country: 'SA',
        locale: 'ar',
      }),
    });

    const regRes = await registerRoute(regReq);
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    assert.equal(regBody.verificationEmailSent, true);

    // Verify email was dispatched to memory transport
    const messages = memoryTransport.getSentMessages();
    assert.equal(messages.length, 1);
    const verifyMsg = messages[0];
    assert.equal(verifyMsg.to, 'merchant.new@riyadh.sa');
    assert.ok(verifyMsg.html.includes('/verify-email#token='));

    // Extract rawToken from the email HTML link
    const match = /#token=([A-Za-z0-9_-]+)/.exec(verifyMsg.html);
    assert.ok(match, 'Token fragment must be present in HTML link');
    const extractedToken = match[1];

    // Confirm verification via POST /api/auth/verify-email/confirm
    const confirmReq = new Request('http://localhost:3000/api/auth/verify-email/confirm', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({ token: extractedToken }),
    });

    const confirmRes = await confirmVerifyRoute(confirmReq);
    assert.equal(confirmRes.status, 200);
    const confirmBody = await confirmRes.json();
    assert.equal(confirmBody.success, true);
    assert.equal(confirmBody.verified, true);

    // Assert subsequent session probe reports emailVerified === true
    const cookieHeader = regRes.headers.get('set-cookie');
    const sessionReq = new Request('http://localhost:3000/api/auth/session', {
      headers: {
        cookie: cookieHeader || '',
      },
    });

    const sessRes = await sessionRoute(sessionReq);
    const sessBody = await sessRes.json();
    assert.equal(sessBody.authenticated, true);
    assert.equal(sessBody.user.emailVerified, true);

    // Replay confirm attempt must fail with 400
    const replayReq = new Request('http://localhost:3000/api/auth/verify-email/confirm', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({ token: extractedToken }),
    });
    const replayRes = await confirmVerifyRoute(replayReq);
    assert.equal(replayRes.status, 400);
    const replayBody = await replayRes.json();
    assert.equal(replayBody.code, 'INVALID_OR_EXPIRED_TOKEN');
  });

  test('email change request and confirm updates user email and revokes other sessions', async () => {
    const authRepo = getAuthRepository();
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'original@brand.eg',
      passwordHash: await hashPassword('ChangeEmailPass2026!'),
      country: 'EG',
      locale: 'ar',
      workspaceName: 'Original Brand',
    });
    await authRepo.markEmailVerified(user.id);

    // Create primary session and secondary session
    const primarySession = await createSession({
      userId: user.id,
      userAgent: 'Primary-Browser',
      ipAddress: '10.0.0.1',
    });
    const secondarySession = await createSession({
      userId: user.id,
      userAgent: 'Mobile-Device',
      ipAddress: '10.0.0.2',
    });

    const activeBefore = await listActiveUserSessions(user.id);
    assert.equal(activeBefore.length, 2);

    // Request email change
    const changeReq = new Request('http://localhost:3000/api/auth/email/change-request', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        cookie: primarySession.cookieHeader,
        'x-csrf-token': primarySession.session.csrfToken,
      },
      body: JSON.stringify({
        newEmail: 'new.brand@cairo.eg',
        currentPassword: 'ChangeEmailPass2026!',
      }),
    });

    const changeRes = await emailChangeRequestRoute(changeReq);
    assert.equal(changeRes.status, 202);

    // Verify 2 emails sent: confirmation to new email, security notice to old email
    const sent = memoryTransport.getSentMessages();
    assert.equal(sent.length, 2);
    const confirmEmail = sent.find((m) => m.to === 'new.brand@cairo.eg');
    const noticeEmail = sent.find((m) => m.to === 'original@brand.eg');
    assert.ok(confirmEmail, 'Confirm email must be sent to new address');
    assert.ok(noticeEmail, 'Notice email must be sent to old address');
    assert.ok(!noticeEmail.html.includes('#token='), 'Notice email must not have token');

    const tokenMatch = /#token=([A-Za-z0-9_-]+)/.exec(confirmEmail.html);
    assert.ok(tokenMatch);
    const changeToken = tokenMatch[1];

    // Confirm email change
    const confirmChangeReq = new Request('http://localhost:3000/api/auth/email/change-confirm', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        cookie: primarySession.cookieHeader,
        'x-csrf-token': primarySession.session.csrfToken,
      },
      body: JSON.stringify({ token: changeToken }),
    });

    const confirmChangeRes = await emailChangeConfirmRoute(confirmChangeReq);
    assert.equal(confirmChangeRes.status, 200);

    // Verify DB user record
    const updatedUser = await authRepo.findUserById(user.id);
    assert.equal(updatedUser.email, 'new.brand@cairo.eg');
    assert.ok(updatedUser.emailVerifiedAt);

    // Verify sessions: secondary revoked, primary active
    const activeAfter = await listActiveUserSessions(user.id);
    assert.equal(activeAfter.length, 1);
    assert.equal(activeAfter[0].id, primarySession.session.id);
  });

  test('verify-email/resend route issues fresh token for unverified user and returns alreadyVerified for verified user', async () => {
    const authRepo = getAuthRepository();
    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'resend.test@riyadh.sa',
      passwordHash: await hashPassword('ResendPass2026!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Resend Studio',
    });

    const session = await createSession({
      userId: user.id,
      userAgent: 'Test-Agent',
      ipAddress: '192.168.1.50',
    });

    // 1. Resend when unverified
    const resendReq = new Request('http://localhost:3000/api/auth/verify-email/resend', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        cookie: session.cookieHeader,
        'x-csrf-token': session.session.csrfToken,
      },
    });

    const resendRes = await resendVerifyRoute(resendReq);
    assert.equal(resendRes.status, 200);
    const resendBody = await resendRes.json();
    assert.equal(resendBody.success, true);
    assert.equal(resendBody.sent, true);

    const messages = memoryTransport.getSentMessages();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].to, 'resend.test@riyadh.sa');

    // 2. Mark verified
    await authRepo.markEmailVerified(user.id);

    // 3. Resend when already verified
    const resendReq2 = new Request('http://localhost:3000/api/auth/verify-email/resend', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
        cookie: session.cookieHeader,
        'x-csrf-token': session.session.csrfToken,
      },
    });

    const resendRes2 = await resendVerifyRoute(resendReq2);
    assert.equal(resendRes2.status, 200);
    const resendBody2 = await resendRes2.json();
    assert.equal(resendBody2.success, true);
    assert.equal(resendBody2.alreadyVerified, true);
  });
});
