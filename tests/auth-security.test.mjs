import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getDb, resetDbForTests } from '../src/lib/db/prisma.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import {
  validatePasswordStrength,
  hashPassword,
  verifyPassword,
  constantTimeDummyVerify,
} from '../src/lib/auth/password.ts';
import {
  consumeRateLimit,
  getClientIp,
  resetRateLimitsForTests,
} from '../src/lib/security/rate-limit.ts';
import {
  validateSameOrigin,
  validateCsrfRequest,
} from '../src/lib/security/csrf.ts';
import {
  getSessionCookieName,
  buildSessionCookieHeader,
  buildClearSessionCookieHeader,
  extractSessionToken,
  hashSessionToken,
  createSession,
  resolveOptionalSession,
  resolveAuthenticatedSession,
  revokeSessionById,
  revokeSessionByRawToken,
  revokeAllUserSessions,
  listActiveUserSessions,
  switchSessionActiveWorkspace,
} from '../src/lib/auth/session.ts';
import {
  hasPlatformPermission,
  hasWorkspacePermission,
  requirePlatformPermission,
  requireWorkspacePermission,
  canManageWorkspaceMemberRole,
} from '../src/lib/auth/rbac.ts';
import {
  bootstrapPlatformAdmin,
  createSupportOperatorByAdmin,
} from '../src/lib/auth/admin-bootstrap.ts';
import { signAssetUrl, readStoredAsset } from '../src/lib/storage/asset-storage.ts';

describe('Task 1: Schema Parity, Session Model & Anti-Trial-Farming Ledger Controls', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  test('SQLite schema defines Session table and User verification/trial tracking columns', () => {
    const db = getDb();
    const sessionCols = db
      .prepare(`PRAGMA table_info("Session")`)
      .all()
      .map((col) => col.name);

    assert.ok(sessionCols.includes('id'));
    assert.ok(sessionCols.includes('userId'));
    assert.ok(sessionCols.includes('activeWorkspaceId'));
    assert.ok(sessionCols.includes('tokenHash'));
    assert.ok(sessionCols.includes('csrfToken'));
    assert.ok(sessionCols.includes('idleExpiresAt'));
    assert.ok(sessionCols.includes('expiresAt'));
    assert.ok(sessionCols.includes('revokedAt'));
    assert.ok(sessionCols.includes('revokedReason'));

    const userCols = db
      .prepare(`PRAGMA table_info("User")`)
      .all()
      .map((col) => col.name);
    assert.ok(userCols.includes('emailVerifiedAt'));
    assert.ok(userCols.includes('trialGrantedAt'));
    assert.ok(userCols.includes('passwordUpdatedAt'));

    // AuthActionToken table columns
    const actionTokenCols = db
      .prepare(`PRAGMA table_info("AuthActionToken")`)
      .all()
      .map((col) => col.name);
    assert.ok(actionTokenCols.includes('id'));
    assert.ok(actionTokenCols.includes('userId'));
    assert.ok(actionTokenCols.includes('type'));
    assert.ok(actionTokenCols.includes('tokenHash'));
    assert.ok(actionTokenCols.includes('targetEmail'));
    assert.ok(actionTokenCols.includes('expiresAt'));
    assert.ok(actionTokenCols.includes('consumedAt'));
    assert.ok(actionTokenCols.includes('revokedAt'));
    assert.ok(actionTokenCols.includes('createdIp'));
    assert.ok(actionTokenCols.includes('createdAt'));

    // RateLimitBucket table columns
    const rateLimitCols = db
      .prepare(`PRAGMA table_info("RateLimitBucket")`)
      .all()
      .map((col) => col.name);
    assert.ok(rateLimitCols.includes('key'));
    assert.ok(rateLimitCols.includes('count'));
    assert.ok(rateLimitCols.includes('windowStart'));
    assert.ok(rateLimitCols.includes('expiresAt'));
    assert.ok(rateLimitCols.includes('updatedAt'));

    // WorkspaceInvite table columns
    const inviteCols = db
      .prepare(`PRAGMA table_info("WorkspaceInvite")`)
      .all()
      .map((col) => col.name);
    assert.ok(inviteCols.includes('id'));
    assert.ok(inviteCols.includes('workspaceId'));
    assert.ok(inviteCols.includes('invitedEmail'));
    assert.ok(inviteCols.includes('role'));
    assert.ok(inviteCols.includes('invitedByUserId'));
    assert.ok(inviteCols.includes('tokenHash'));
    assert.ok(inviteCols.includes('expiresAt'));
    assert.ok(inviteCols.includes('acceptedAt'));
    assert.ok(inviteCols.includes('acceptedByUserId'));
    assert.ok(inviteCols.includes('revokedAt'));
    assert.ok(inviteCols.includes('createdAt'));
  });

  test('getWorkspaceBalance rejects unknown workspaces with NOT_FOUND instead of silently provisioning', async () => {
    const ledger = new CreditLedgerService();
    await assert.rejects(
      () => ledger.getWorkspaceBalance('ws-does-not-exist'),
      /NOT_FOUND/i
    );
  });

  test('ensureWorkspace rejects missing explicit userId or workspaceId and refuses ADMIN creation', async () => {
    const ledger = new CreditLedgerService();
    await assert.rejects(
      () => ledger.ensureWorkspace({}),
      /userId and workspaceId are required/i
    );
    await assert.rejects(
      () =>
        ledger.ensureWorkspace({
          userId: 'u-bad-role',
          workspaceId: 'ws-bad-role',
          role: 'ADMIN',
        }),
      /FORBIDDEN/i
    );
  });

  test('registerMerchantWithInitialWorkspace grants 5 trial credits once and additional workspaces start at 0 credits', async () => {
    const ledger = new CreditLedgerService();
    const registered = await ledger.registerMerchantWithInitialWorkspace({
      email: 'merchant@riyadh.sa',
      passwordHash: 'scrypt$stub$hash',
      name: 'Tariq',
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Oud Royal',
    });

    assert.equal(registered.user.role, 'USER');
    assert.equal(registered.trialGranted, true);
    assert.equal(registered.workspace.availableCredits, 5);
    assert.equal(registered.workspace.currency, 'SAR');

    // Second workspace created by the same merchant must NOT grant extra trial credits
    const secondWs = await ledger.createAdditionalWorkspaceForUser({
      userId: registered.user.id,
      workspaceName: 'Oud Secondary',
      country: 'EG',
    });

    assert.equal(secondWs.currency, 'EGP');
    assert.equal(secondWs.settledBalance, 0);
    assert.equal(secondWs.availableCredits, 0);
  });
});

describe('Task 2: Scrypt Passwords, Rate Limits, CSRF & Opaque Session Lifecycle', () => {
  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
  });

  test('validates password strength and hashes/verifies passwords using scrypt and timingSafeEqual', async () => {
    assert.equal(validatePasswordStrength('short1').valid, false);
    assert.equal(validatePasswordStrength('onlyletters').valid, false);
    assert.equal(validatePasswordStrength('12345678').valid, false);
    assert.equal(validatePasswordStrength('MerchantPass2026').valid, true);
    assert.equal(validatePasswordStrength('ShortPass1', 12).valid, false);

    const hashA = await hashPassword('MerchantPass2026!');
    const hashB = await hashPassword('MerchantPass2026!');
    assert.ok(hashA.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'));
    assert.notEqual(hashA, hashB, 'Each salt must be unique');

    assert.equal(await verifyPassword('MerchantPass2026!', hashA), true);
    assert.equal(await verifyPassword('WrongPass2026!', hashA), false);
    assert.equal(await verifyPassword('MerchantPass2026!', null), false);
    assert.equal(await verifyPassword('MerchantPass2026!', 'corrupt-hash'), false);
    await constantTimeDummyVerify('WrongPass2026!');
  });

  test('enforces sliding-window rate limits and extracts client IP safely', async () => {
    const req = new Request('http://localhost:3000/api/auth/login', {
      headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
    });
    assert.equal(getClientIp(req), '203.0.113.9');

    const r1 = await consumeRateLimit('login:203.0.113.9', 2, 60_000);
    const r2 = await consumeRateLimit('login:203.0.113.9', 2, 60_000);
    const r3 = await consumeRateLimit('login:203.0.113.9', 2, 60_000);

    assert.equal(r1.allowed, true);
    assert.equal(r2.allowed, true);
    assert.equal(r3.allowed, false);
    assert.ok(r3.retryAfterSeconds >= 1);

    resetRateLimitsForTests();
    const r4 = await consumeRateLimit('login:203.0.113.9', 2, 60_000);
    assert.equal(r4.allowed, true);
  });

  test('enforces Origin / Sec-Fetch-Site and timing-safe x-csrf-token checks', () => {
    const crossSiteReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(validateSameOrigin(crossSiteReq).valid, false);

    const evilOriginReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'https://evil.example' },
    });
    assert.equal(validateSameOrigin(evilOriginReq).valid, false);

    const validOriginReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: {
        origin: 'http://localhost:3000',
        'x-csrf-token': 'valid-csrf-token-123',
      },
    });
    assert.equal(validateCsrfRequest(validOriginReq, 'valid-csrf-token-123').valid, true);
    assert.equal(validateCsrfRequest(validOriginReq, 'different-csrf-token').valid, false);

    const missingTokenReq = new Request('http://localhost:3000/api/auth/logout', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000' },
    });
    assert.equal(validateCsrfRequest(missingTokenReq, 'valid-csrf-token-123').valid, false);
  });

  test('builds __Host- production cookie without Domain and rejects plain fallback cookies in production', () => {
    assert.equal(getSessionCookieName(true), '__Host-shotistry_session');
    assert.equal(getSessionCookieName(false), 'shotistry_session');

    const expiresAt = new Date(Date.now() + 3600 * 1000);
    const prodCookie = buildSessionCookieHeader('raw_token_abc', expiresAt, true);
    assert.ok(prodCookie.startsWith('__Host-shotistry_session=raw_token_abc'));
    assert.ok(prodCookie.includes('HttpOnly'));
    assert.ok(prodCookie.includes('Secure'));
    assert.ok(prodCookie.includes('SameSite=Lax'));
    assert.ok(prodCookie.includes('Path=/'));
    assert.ok(!prodCookie.toLowerCase().includes('domain='));

    const clearHeader = buildClearSessionCookieHeader(true);
    assert.ok(clearHeader.startsWith('__Host-shotistry_session=;'));
    assert.ok(clearHeader.includes('Max-Age=0'));

    const shadowedReq = new Request('https://shotistry.app/api/auth/session', {
      headers: { cookie: 'shotistry_session=forged-subdomain-cookie' },
    });
    assert.equal(extractSessionToken(shadowedReq, true), null);
    assert.equal(extractSessionToken(shadowedReq, false), 'forged-subdomain-cookie');
  });

  test('stores SHA-256 hash only, supports rotation, expiry, revocation, multi-device sessions & workspace switching', async () => {
    const ledger = new CreditLedgerService();
    const { user, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'owner@studio.sa',
      passwordHash: await hashPassword('StrongPass123!'),
      country: 'SA',
      workspaceName: 'Primary Studio',
    });

    const secondWs = await ledger.createAdditionalWorkspaceForUser({
      userId: user.id,
      workspaceName: 'Secondary Brand',
      country: 'EG',
    });

    // Device 1 session
    const s1 = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.workspaceId,
      userAgent: 'Chrome/Mac',
      ipAddress: '1.1.1.1',
    });

    const db = getDb();
    const storedRow = db
      .prepare(`SELECT * FROM "Session" WHERE "id" = ?`)
      .get(s1.session.id);

    assert.notEqual(storedRow.tokenHash, s1.rawToken, 'Raw token must NEVER be stored in DB');
    assert.equal(storedRow.tokenHash, hashSessionToken(s1.rawToken));
    assert.equal(
      storedRow.tokenHash,
      crypto.createHash('sha256').update(s1.rawToken).digest('hex')
    );

    // Forged headers without valid cookie must NEVER authenticate
    const forgedOnlyReq = new Request('http://localhost:3000/api/workspace/session', {
      headers: {
        'x-user-id': user.id,
        'x-user-role': 'ADMIN',
        'x-workspace-id': workspace.workspaceId,
        cookie: `shotistry_user_id=${user.id}; shotistry_role=ADMIN`,
      },
    });
    assert.equal(await resolveOptionalSession(forgedOnlyReq), null);
    await assert.rejects(() => resolveAuthenticatedSession(forgedOnlyReq), /UNAUTHORIZED/i);

    // Rotate session on re-authentication -> old token must immediately fail
    const s1Rotated = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.workspaceId,
      rotateFromRawToken: s1.rawToken,
      userAgent: 'Chrome/Mac',
    });

    const oldReq = new Request('http://localhost:3000/api/auth/session', {
      headers: { cookie: `shotistry_session=${s1.rawToken}` },
    });
    assert.equal(await resolveOptionalSession(oldReq), null);

    // Device 2 session (multi-device)
    const s2 = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.workspaceId,
      userAgent: 'Safari/iPhone',
      ipAddress: '2.2.2.2',
    });

    const activeList = await listActiveUserSessions(user.id, s1Rotated.session.id);
    assert.equal(activeList.length, 2);
    assert.equal(activeList.filter((item) => item.isCurrent).length, 1);

    // Switch workspace on Device 1 (valid member vs non-member)
    const switched = await switchSessionActiveWorkspace(
      s1Rotated.session.id,
      user.id,
      secondWs.workspaceId
    );
    assert.equal(switched.workspaceId, secondWs.workspaceId);

    const otherUser = await ledger.registerMerchantWithInitialWorkspace({
      email: 'stranger@studio.eg',
      passwordHash: await hashPassword('StrangerPass123!'),
      country: 'EG',
    });
    await assert.rejects(
      () => switchSessionActiveWorkspace(s1Rotated.session.id, user.id, otherUser.workspace.workspaceId),
      /FORBIDDEN/i
    );

    // Cross-user session revocation must fail
    const crossRevoked = await revokeSessionById(s2.session.id, otherUser.user.id, 'ATTACK');
    assert.equal(crossRevoked, false);

    // Owner revokes single device s2 -> s2 fails, s1Rotated stays active
    assert.equal(await revokeSessionById(s2.session.id, user.id, 'USER_REVOKED'), true);
    assert.equal(
      await resolveOptionalSession(
        new Request('http://localhost:3000/api/auth/session', {
          headers: { cookie: `shotistry_session=${s2.rawToken}` },
        })
      ),
      null
    );
    assert.ok(
      await resolveOptionalSession(
        new Request('http://localhost:3000/api/auth/session', {
          headers: { cookie: `shotistry_session=${s1Rotated.rawToken}` },
        })
      )
    );

    // Idle expiration check
    const pastIso = new Date(Date.now() - 60_000).toISOString();
    db.prepare(`UPDATE "Session" SET "idleExpiresAt" = ? WHERE "id" = ?`).run(
      pastIso,
      s1Rotated.session.id
    );
    assert.equal(
      await resolveOptionalSession(
        new Request('http://localhost:3000/api/auth/session', {
          headers: { cookie: `shotistry_session=${s1Rotated.rawToken}` },
        })
      ),
      null
    );

    // Absolute expiration check on a fresh session
    const s3 = await createSession({ userId: user.id, activeWorkspaceId: workspace.workspaceId });
    db.prepare(`UPDATE "Session" SET "expiresAt" = ? WHERE "id" = ?`).run(pastIso, s3.session.id);
    assert.equal(
      await resolveOptionalSession(
        new Request('http://localhost:3000/api/auth/session', {
          headers: { cookie: `shotistry_session=${s3.rawToken}` },
        })
      ),
      null
    );

    // Bulk revoke all remaining user sessions
    const s4 = await createSession({ userId: user.id, activeWorkspaceId: workspace.workspaceId });
    const s5 = await createSession({ userId: user.id, activeWorkspaceId: workspace.workspaceId });
    const revokedCount = await revokeAllUserSessions(user.id, 'PASSWORD_CHANGED');
    assert.equal(revokedCount, 2);
    assert.equal(await revokeSessionByRawToken(s4.rawToken, 'LOGOUT'), false);
    assert.equal(
      await resolveOptionalSession(
        new Request('http://localhost:3000/api/auth/session', {
          headers: { cookie: `shotistry_session=${s5.rawToken}` },
        })
      ),
      null
    );
  });
});

describe('Task 3: Multi-Tier RBAC, Secure Admin Bootstrap & Hardened Asset Signing', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_BOOTSTRAP = process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET;
  const ORIGINAL_ASSET_SECRET = process.env.ASSET_SIGNING_SECRET;

  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_BOOTSTRAP === undefined) {
      delete process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET;
    } else {
      process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = ORIGINAL_BOOTSTRAP;
    }
    if (ORIGINAL_ASSET_SECRET === undefined) {
      delete process.env.ASSET_SIGNING_SECRET;
    } else {
      process.env.ASSET_SIGNING_SECRET = ORIGINAL_ASSET_SECRET;
    }
  });

  test('separates PlatformRole and WorkspaceRole permissions and enforces live mid-session revocation', async () => {
    assert.equal(hasPlatformPermission('USER', 'platform:metrics:read'), false);
    assert.equal(hasPlatformPermission('USER', 'platform:credits:adjust'), false);
    assert.equal(hasPlatformPermission('SUPPORT', 'platform:metrics:read'), true);
    assert.equal(hasPlatformPermission('SUPPORT', 'platform:credits:adjust:bounded'), true);
    assert.equal(hasPlatformPermission('SUPPORT', 'platform:credits:adjust'), false);
    assert.equal(hasPlatformPermission('ADMIN', 'platform:credits:adjust'), true);

    assert.equal(hasWorkspacePermission('OWNER', 'billing:checkout'), true);
    assert.equal(hasWorkspacePermission('ADMIN', 'billing:checkout'), false);
    assert.equal(hasWorkspacePermission('ADMIN', 'workspace:members:manage'), true);
    assert.equal(hasWorkspacePermission('MEMBER', 'workspace:members:manage'), false);
    assert.equal(hasWorkspacePermission('MEMBER', 'photoshoot:generate'), true);
    assert.equal(hasWorkspacePermission('VIEWER', 'asset:upload'), false);
    assert.equal(hasWorkspacePermission('VIEWER', 'photoshoot:generate'), false);
    assert.equal(hasWorkspacePermission('VIEWER', 'job:read'), true);

    assert.equal(canManageWorkspaceMemberRole('OWNER', 'ADMIN'), true);
    assert.equal(canManageWorkspaceMemberRole('ADMIN', 'OWNER'), false);
    assert.equal(canManageWorkspaceMemberRole('ADMIN', 'MEMBER'), true);
    assert.equal(canManageWorkspaceMemberRole('MEMBER', 'VIEWER'), false);

    // Workspace OWNER never gains platform ADMIN privileges
    const ledger = new CreditLedgerService();
    const { user, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'wsowner@brand.sa',
      passwordHash: await hashPassword('OwnerPass2026!'),
      country: 'SA',
    });

    const ownerSession = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.workspaceId,
    });
    const ctx = await resolveAuthenticatedSession(
      new Request('http://localhost:3000/api/workspace/session', {
        headers: { cookie: `shotistry_session=${ownerSession.rawToken}` },
      })
    );
    assert.throws(
      () => requirePlatformPermission(ctx, 'platform:metrics:read'),
      /FORBIDDEN/i
    );
    assert.equal(requireWorkspacePermission(ctx, 'billing:checkout').workspaceId, workspace.workspaceId);

    // Mid-session membership removal immediately revokes workspace access on next resolution
    const db = getDb();
    db.prepare(`DELETE FROM "WorkspaceMember" WHERE "userId" = ? AND "workspaceId" = ?`).run(
      user.id,
      workspace.workspaceId
    );
    const afterRemoval = await resolveAuthenticatedSession(
      new Request('http://localhost:3000/api/workspace/session', {
        headers: { cookie: `shotistry_session=${ownerSession.rawToken}` },
      })
    );
    assert.throws(
      () => requireWorkspacePermission(afterRemoval, 'job:read'),
      /FORBIDDEN/i
    );
  });

  test('enforces secure one-time admin bootstrap and rejects repeated or weak/unauthorized bootstrap attempts', async () => {
    delete process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET;

    await assert.rejects(
      () =>
        bootstrapPlatformAdmin({
          email: 'root@shotistry.app',
          password: 'SuperAdminPassword2026!',
          bootstrapSecret: 'short',
        }),
      /BOOTSTRAP_SECRET/i
    );

    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = 'ultra_secure_bootstrap_secret_32chars_min';

    await assert.rejects(
      () =>
        bootstrapPlatformAdmin({
          email: 'root@shotistry.app',
          password: 'SuperAdminPassword2026!',
          bootstrapSecret: 'wrong_bootstrap_secret_32_characters_long',
        }),
      /BOOTSTRAP_SECRET/i
    );

    await assert.rejects(
      () =>
        bootstrapPlatformAdmin({
          email: 'root@shotistry.app',
          password: 'short1',
          bootstrapSecret: 'ultra_secure_bootstrap_secret_32chars_min',
        }),
      /password/i
    );

    const bootstrapped = await bootstrapPlatformAdmin({
      email: 'root@shotistry.app',
      password: 'SuperAdminPassword2026!',
      name: 'Platform Root',
      bootstrapSecret: 'ultra_secure_bootstrap_secret_32chars_min',
    });
    assert.equal(bootstrapped.role, 'ADMIN');
    assert.equal(bootstrapped.email, 'root@shotistry.app');
    assert.ok(bootstrapped.auditLogId);

    // Repeated bootstrap must fail closed once initial ADMIN exists
    await assert.rejects(
      () =>
        bootstrapPlatformAdmin({
          email: 'second-admin@shotistry.app',
          password: 'SecondAdminPassword2026!',
          bootstrapSecret: 'ultra_secure_bootstrap_secret_32chars_min',
        }),
      /ADMIN_ALREADY_BOOTSTRAPPED/i
    );

    // Support operator can be created only by authentic ADMIN
    const support = await createSupportOperatorByAdmin({
      adminUserId: bootstrapped.userId,
      email: 'support1@shotistry.app',
      password: 'SupportPassword2026!',
      name: 'Customer Care',
    });
    assert.equal(support.role, 'SUPPORT');
  });

  test('fails closed in production if ASSET_SIGNING_SECRET is unconfigured and blocks path traversal', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ASSET_SIGNING_SECRET;

    assert.throws(() => signAssetUrl('ws-1/test.png', 60), /ASSET_SIGNING_SECRET/i);

    process.env.NODE_ENV = 'test';
    assert.equal(readStoredAsset('../../etc/passwd'), null);
  });
});
