import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { getDb, resetDbForTests } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { bootstrapPlatformAdmin, createSupportOperatorByAdmin } from '../src/lib/auth/admin-bootstrap.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';
import { PaymobSecurity } from '../src/lib/paymob/paymob-hmac.ts';
import { markEmailVerifiedForTests } from './helpers/verify-email.mjs';
import { POST as acceptInvitePost } from '../src/app/api/workspaces/invites/accept/route.ts';
import {
  setEmailTransportForTests,
  MemoryEmailTransport,
} from '../src/lib/email/index.ts';
import { POST as registerPost } from '../src/app/api/auth/register/route.ts';
import { POST as loginPost } from '../src/app/api/auth/login/route.ts';
import { POST as logoutPost } from '../src/app/api/auth/logout/route.ts';
import { GET as sessionGet } from '../src/app/api/auth/session/route.ts';
import { GET as sessionsListGet } from '../src/app/api/auth/sessions/route.ts';
import { DELETE as sessionRevokeDelete } from '../src/app/api/auth/sessions/[id]/route.ts';
import { POST as sessionsRevokeAllPost } from '../src/app/api/auth/sessions/revoke-all/route.ts';
import { POST as changePasswordPost } from '../src/app/api/auth/password/route.ts';
import { GET as workspacesGet, POST as workspacesPost } from '../src/app/api/workspaces/route.ts';
import { POST as workspaceSwitchPost } from '../src/app/api/workspace/switch/route.ts';
import {
  GET as membersGet,
  POST as membersPost,
} from '../src/app/api/workspaces/[id]/members/route.ts';
import { GET as workspaceSessionGet } from '../src/app/api/workspace/session/route.ts';
import { POST as assetsUploadPost } from '../src/app/api/assets/upload/route.ts';
import { GET as assetsDownloadGet } from '../src/app/api/assets/download/route.ts';
import { POST as photoshootGeneratePost } from '../src/app/api/photoshoots/generate/route.ts';
import { GET as jobByIdGet } from '../src/app/api/jobs/[id]/route.ts';
import { POST as checkoutIntentPost } from '../src/app/api/billing/checkout-intent/route.ts';
import { GET as adminMetricsGet } from '../src/app/api/admin/metrics/route.ts';
import { POST as adminAdjustPost } from '../src/app/api/admin/credits/adjust/route.ts';
import { POST as paymobWebhookPost } from '../src/app/api/webhooks/paymob/route.ts';

export function extractCookiePair(res, cookieName = 'shotistry_session') {
  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(new RegExp(`${cookieName}=([^;]+)`));
  return match ? `${cookieName}=${match[1]}` : '';
}

describe('Task 4: Authentication, Multi-Device Session & Workspace APIs', () => {
  let memoryTransport;

  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = 'bootstrap_secret_minimum_32_characters_ok';
    memoryTransport = new MemoryEmailTransport();
    setEmailTransportForTests(memoryTransport);
  });

  afterEach(() => {
    setEmailTransportForTests(null);
  });

  test('anonymous browser /api/auth/session stays guest and never auto-provisions defaults', async () => {
    const res = await sessionGet(
      new Request('http://localhost:3000/api/auth/session', {
        headers: {
          'x-user-id': 'user-forged',
          'x-user-role': 'ADMIN',
          'x-workspace-id': 'ws-forged',
          cookie: 'shotistry_user_id=user-forged; shotistry_role=ADMIN',
        },
      })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, false);
    assert.equal(body.user, null);

    const db = getDb();
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS c FROM "User"`).get().c), 0);
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS c FROM "Workspace"`).get().c), 0);
  });

  test('registration creates USER + Workspace + OWNER + 5 trial credits, blocks duplicate email & role escalation', async () => {
    // Client attempts privilege escalation during registration
    const escalatedRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'hacker@shotistry.app',
          password: 'Password2026!',
          role: 'ADMIN',
        }),
      })
    );
    assert.equal(escalatedRes.status, 403);

    // Non-JSON form CSRF attempt on registration must fail
    const formRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'email=a@b.com&password=Password2026!',
      })
    );
    assert.equal(formRes.status, 415);

    // Legitimate registration
    const regRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'TestBrowser/1.0',
        },
        body: JSON.stringify({
          email: 'Tariq@Oud.sa',
          password: 'TariqPassword2026!',
          name: 'Tariq Al Saud',
          country: 'SA',
          locale: 'ar',
          workspaceName: 'Oud Kingdom',
        }),
      })
    );

    assert.equal(regRes.status, 201);
    const cookie = extractCookiePair(regRes);
    assert.ok(cookie.startsWith('shotistry_session='));
    const regBody = await regRes.json();
    assert.equal(regBody.success, true);
    assert.equal(regBody.user.email, 'tariq@oud.sa');
    assert.equal(regBody.user.role, 'USER');
    assert.equal(regBody.activeWorkspace.availableCredits, 5);
    assert.equal(regBody.activeWorkspace.currency, 'SAR');
    assert.equal(regBody.passwordHash, undefined);
    assert.ok(regBody.csrfToken);

    // Duplicate account attempt must return 409 and NOT grant extra trial credits
    const dupRes = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'tariq@oud.sa',
          password: 'AnotherPassword2026!',
          country: 'EG',
        }),
      })
    );
    assert.equal(dupRes.status, 409);

    const db = getDb();
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS c FROM "User"`).get().c), 1);
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS c FROM "CreditLedger"`).get().c), 1);
  });

  test('login returns generic failure messages, rotates sessions, enforces rate limits & supports admin session', async () => {
    await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'nouran@fashion.eg',
          password: 'NouranPassword2026!',
          country: 'EG',
        }),
      })
    );

    const badPassRes = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'nouran@fashion.eg', password: 'WrongPassword1!' }),
      })
    );
    assert.equal(badPassRes.status, 401);
    const badPassBody = await badPassRes.json();

    const unknownEmailRes = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'missing@fashion.eg', password: 'WrongPassword1!' }),
      })
    );
    assert.equal(unknownEmailRes.status, 401);
    const unknownBody = await unknownEmailRes.json();
    assert.equal(
      badPassBody.error,
      unknownBody.error,
      'Login failures must use generic identical message to prevent account enumeration'
    );

    // Valid login #1 -> cookie1
    const loginRes1 = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Laptop' },
        body: JSON.stringify({ email: 'nouran@fashion.eg', password: 'NouranPassword2026!' }),
      })
    );
    assert.equal(loginRes1.status, 200);
    const cookie1 = extractCookiePair(loginRes1);

    // Login #2 submitting cookie1 -> rotates session (cookie1 invalidated, cookie2 active)
    const loginRes2 = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookie1,
          'user-agent': 'Laptop-Rotated',
        },
        body: JSON.stringify({ email: 'nouran@fashion.eg', password: 'NouranPassword2026!' }),
      })
    );
    assert.equal(loginRes2.status, 200);
    const cookie2 = extractCookiePair(loginRes2);
    assert.notEqual(cookie1, cookie2);

    const staleCheck = await (
      await sessionGet(
        new Request('http://localhost:3000/api/auth/session', { headers: { cookie: cookie1 } })
      )
    ).json();
    assert.equal(staleCheck.authenticated, false);

    // Bootstrapped admin can log in cleanly without merchant workspaces
    await bootstrapPlatformAdmin({
      email: 'ops-admin@shotistry.app',
      password: 'OpsAdminStrongPassword2026!',
      bootstrapSecret: process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET,
    });
    const adminLoginRes = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ops-admin@shotistry.app',
          password: 'OpsAdminStrongPassword2026!',
        }),
      })
    );
    assert.equal(adminLoginRes.status, 200);
    const adminBody = await adminLoginRes.json();
    assert.equal(adminBody.user.role, 'ADMIN');
    assert.equal(adminBody.activeWorkspace, null);

    // Login rate limiting kicks in on repeated invalid attempts
    for (let i = 0; i < 12; i++) {
      const attempt = await loginPost(
        new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-forwarded-for': '198.51.100.77',
          },
          body: JSON.stringify({ email: 'brute@target.eg', password: 'WrongPassword1!' }),
        })
      );
      if (i >= 10) {
        assert.equal(attempt.status, 429);
        assert.ok(attempt.headers.get('retry-after'));
      }
    }
  });

  test('logout, CSRF, multi-device sessions, revoke-all, password change invalidation & workspace management', async () => {
    // Register User A & User B
    const regA = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Device-A1' },
        body: JSON.stringify({
          email: 'ownera@brand.sa',
          password: 'OwnerAPassword2026!',
          country: 'SA',
          workspaceName: 'Brand A1',
        }),
      })
    );
    const cookieA1 = extractCookiePair(regA);
    const bodyA1 = await regA.json();

    const loginA2 = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Device-A2' },
        body: JSON.stringify({ email: 'ownera@brand.sa', password: 'OwnerAPassword2026!' }),
      })
    );
    const cookieA2 = extractCookiePair(loginA2);
    const bodyA2 = await loginA2.json();

    // Missing CSRF token on logout fails 403
    const badLogout = await logoutPost(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: { cookie: cookieA2 },
      })
    );
    assert.equal(badLogout.status, 403);

    // Cross-origin request fails 403 even with valid CSRF
    const evilLogout = await logoutPost(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: cookieA2,
          'x-csrf-token': bodyA2.csrfToken,
          origin: 'https://attacker.evil',
        },
      })
    );
    assert.equal(evilLogout.status, 403);

    // List multi-device sessions from A1 -> sees A1 and A2
    const listRes = await sessionsListGet(
      new Request('http://localhost:3000/api/auth/sessions', {
        headers: { cookie: cookieA1 },
      })
    );
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.sessions.length, 2);
    const deviceA2Summary = listBody.sessions.find((s) => !s.isCurrent);
    assert.ok(deviceA2Summary);

    // Owner revokes single device s2 -> s2 fails, s1Rotated stays active
    const delS2Body = await (
      await sessionRevokeDelete(
        new Request(`http://localhost:3000/api/auth/sessions/${deviceA2Summary.id}`, {
          method: 'DELETE',
          headers: {
            cookie: cookieA1,
            'x-csrf-token': bodyA1.csrfToken,
          },
        }),
        { params: Promise.resolve({ id: deviceA2Summary.id }) }
      )
    ).json();
    assert.equal(delS2Body.success, true);
    assert.equal(delS2Body.revokedCurrentSession, false);

    const a2Check = await (
      await sessionGet(
        new Request('http://localhost:3000/api/auth/session', { headers: { cookie: cookieA2 } })
      )
    ).json();
    assert.equal(a2Check.authenticated, false);

    // Unverified user is blocked 403 on creating additional workspace
    const wsCreateBlocked = await workspacesPost(
      new Request('http://localhost:3000/api/workspaces', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA1,
          'x-csrf-token': bodyA1.csrfToken,
        },
        body: JSON.stringify({ name: 'Brand A2', country: 'EG' }),
      })
    );
    assert.equal(wsCreateBlocked.status, 403);
    const blockedBody = await wsCreateBlocked.json();
    assert.equal(blockedBody.code, 'EMAIL_VERIFICATION_REQUIRED');

    // Verify User A email, then workspace creation succeeds
    await markEmailVerifiedForTests(bodyA1.user.id);

    // Create additional workspace (0 extra credits) and switch
    const wsCreateRes = await workspacesPost(
      new Request('http://localhost:3000/api/workspaces', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA1,
          'x-csrf-token': bodyA1.csrfToken,
        },
        body: JSON.stringify({ name: 'Brand A2', country: 'EG' }),
      })
    );
    assert.equal(wsCreateRes.status, 201);
    const wsCreateBody = await wsCreateRes.json();
    assert.equal(wsCreateBody.workspace.availableCredits, 0);

    const switchRes = await workspaceSwitchPost(
      new Request('http://localhost:3000/api/workspace/switch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA1,
          'x-csrf-token': bodyA1.csrfToken,
        },
        body: JSON.stringify({ workspaceId: wsCreateBody.workspace.workspaceId }),
      })
    );
    assert.equal(switchRes.status, 200);

    const wsListBody = await (
      await workspacesGet(
        new Request('http://localhost:3000/api/workspaces', {
          headers: { cookie: cookieA1 },
        })
      )
    ).json();
    assert.equal(wsListBody.workspaces.length, 2);

    // Register User B -> User A cannot switch into User B's workspace (403)
    const regB = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'memberb@brand.eg',
          password: 'MemberBPassword2026!',
          country: 'EG',
        }),
      })
    );
    const bodyB = await regB.json();
    const crossSwitch = await workspaceSwitchPost(
      new Request('http://localhost:3000/api/workspace/switch', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA1,
          'x-csrf-token': bodyA1.csrfToken,
        },
        body: JSON.stringify({ workspaceId: bodyB.activeWorkspace.workspaceId }),
      })
    );
    assert.equal(crossSwitch.status, 403);

    // Invite User B as VIEWER on Brand A2
    const inviteRes = await membersPost(
      new Request(`http://localhost:3000/api/workspaces/${wsCreateBody.workspace.workspaceId}/members`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA1,
          'x-csrf-token': bodyA1.csrfToken,
        },
        body: JSON.stringify({ email: 'memberb@brand.eg', role: 'VIEWER' }),
      }),
      { params: Promise.resolve({ id: wsCreateBody.workspace.workspaceId }) }
    );
    assert.equal(inviteRes.status, 202);
    const inviteBody = await inviteRes.json();
    assert.equal(inviteBody.status, 'INVITED');

    // Login as User B to accept the invite
    await markEmailVerifiedForTests(bodyB.user.id);
    const regBLogin = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'memberb@brand.eg', password: 'MemberBPassword2026!' }),
      })
    );
    const cookieB = extractCookiePair(regBLogin);
    const regBBody = await regBLogin.json();

    const inviteEmail = memoryTransport.getLastMessage();
    const inviteToken = inviteEmail.html.match(/#token=([a-zA-Z0-9_-]+)/)[1];
    const acceptRes = await acceptInvitePost(
      new Request('http://localhost:3000/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieB,
          'x-csrf-token': regBBody.csrfToken,
        },
        body: JSON.stringify({ token: inviteToken }),
      })
    );
    assert.equal(acceptRes.status, 200);

    const membersBody = await (
      await membersGet(
        new Request(`http://localhost:3000/api/workspaces/${wsCreateBody.workspace.workspaceId}/members`, {
          headers: { cookie: cookieA1 },
        }),
        { params: Promise.resolve({ id: wsCreateBody.workspace.workspaceId }) }
      )
    ).json();
    assert.equal(membersBody.members.length, 2);
    assert.ok(membersBody.members[0].membershipId);
    assert.ok(membersBody.members[0].workspaceRole);

    // VIEWER cannot list workspace members (requires workspace:members:read)
    const viewerListMembersRes = await membersGet(
      new Request(`http://localhost:3000/api/workspaces/${wsCreateBody.workspace.workspaceId}/members`, {
        headers: { cookie: cookieB },
      }),
      { params: Promise.resolve({ id: wsCreateBody.workspace.workspaceId }) }
    );
    assert.equal(viewerListMembersRes.status, 403);

    // Change password invalidates ALL old sessions and issues fresh rotated cookie
    const secondLoginA = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Other-Tab' },
        body: JSON.stringify({ email: 'ownera@brand.sa', password: 'OwnerAPassword2026!' }),
      })
    );
    const otherTabCookie = extractCookiePair(secondLoginA);

    const pwRes = await changePasswordPost(
      new Request('http://localhost:3000/api/auth/password', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA1,
          'x-csrf-token': bodyA1.csrfToken,
        },
        body: JSON.stringify({
          currentPassword: 'OwnerAPassword2026!',
          newPassword: 'OwnerANewPassword2026!',
        }),
      })
    );
    assert.equal(pwRes.status, 200);
    const pwNewCookie = extractCookiePair(pwRes);
    const pwBody = await pwRes.json();

    // Both old A1 and Other-Tab cookies must be invalidated immediately
    assert.equal(
      (await (await sessionGet(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: cookieA1 } }))).json()).authenticated,
      false
    );
    assert.equal(
      (await (await sessionGet(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: otherTabCookie } }))).json()).authenticated,
      false
    );
    // New cookie works cleanly -> revoking current session sets revokedCurrentSession: true
    const currentListBody = await (
      await sessionsListGet(
        new Request('http://localhost:3000/api/auth/sessions', {
          headers: { cookie: pwNewCookie },
        })
      )
    ).json();
    const currentSess = currentListBody.sessions.find((s) => s.isCurrent);
    assert.ok(currentSess);

    const extraLogin = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Temp-Device' },
        body: JSON.stringify({ email: 'ownera@brand.sa', password: 'OwnerANewPassword2026!' }),
      })
    );
    const extraCookie = extractCookiePair(extraLogin);
    const extraBody = await extraLogin.json();
    const extraListBody = await (
      await sessionsListGet(
        new Request('http://localhost:3000/api/auth/sessions', { headers: { cookie: extraCookie } })
      )
    ).json();
    const extraCurrent = extraListBody.sessions.find((s) => s.isCurrent);
    const selfRevokeRes = await sessionRevokeDelete(
      new Request(`http://localhost:3000/api/auth/sessions/${extraCurrent.id}`, {
        method: 'DELETE',
        headers: {
          cookie: extraCookie,
          'x-csrf-token': extraBody.csrfToken,
        },
      }),
      { params: Promise.resolve({ id: extraCurrent.id }) }
    );
    assert.equal(selfRevokeRes.status, 200);
    assert.equal((await selfRevokeRes.json()).revokedCurrentSession, true);

    // Valid HTTP POST /api/auth/logout clears cookie (Max-Age=0) & revokes session server-side
    const logoutSessionLogin = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'Logout-Device' },
        body: JSON.stringify({ email: 'ownera@brand.sa', password: 'OwnerANewPassword2026!' }),
      })
    );
    const logoutCookie = extractCookiePair(logoutSessionLogin);
    const logoutLoginBody = await logoutSessionLogin.json();
    const okLogout = await logoutPost(
      new Request('http://localhost:3000/api/auth/logout', {
        method: 'POST',
        headers: {
          cookie: logoutCookie,
          'x-csrf-token': logoutLoginBody.csrfToken,
        },
      })
    );
    assert.equal(okLogout.status, 200);
    const clearCookieHeader = okLogout.headers.get('set-cookie') || '';
    assert.ok(clearCookieHeader.includes('shotistry_session=;'));
    assert.ok(clearCookieHeader.includes('Max-Age=0'));
    assert.equal(
      (
        await (
          await sessionGet(
            new Request('http://localhost:3000/api/auth/session', {
              headers: { cookie: logoutCookie },
            })
          )
        ).json()
      ).authenticated,
      false
    );

    // Revoke-all logs remaining sessions out
    const revokeAllRes = await sessionsRevokeAllPost(
      new Request('http://localhost:3000/api/auth/sessions/revoke-all', {
        method: 'POST',
        headers: {
          cookie: pwNewCookie,
          'x-csrf-token': pwBody.csrfToken,
        },
      })
    );
    assert.equal(revokeAllRes.status, 200);
    assert.equal(
      (await (await sessionGet(new Request('http://localhost:3000/api/auth/session', { headers: { cookie: pwNewCookie } }))).json()).authenticated,
      false
    );
  });
});


describe('Task 5: Hardened Merchant, Admin & Webhook API Routes', () => {
  let memoryTransport;
  const samplePng = createSampleProductPngDataUrl({
    width: 48,
    height: 48,
    backgroundColor: [255, 255, 255],
    productColor: [160, 40, 70],
    labelColor: [235, 200, 90],
  });

  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET = 'bootstrap_secret_minimum_32_characters_ok';
    process.env.PAYMOB_HMAC_SECRET = 'live_grade_paymob_hmac_secret_2026_sha512';
    memoryTransport = new MemoryEmailTransport();
    setEmailTransportForTests(memoryTransport);
  });

  afterEach(() => {
    setEmailTransportForTests(null);
  });

  test('rejects unauthenticated requests & forged identity headers with 401 across all protected routes', async () => {
    const forgedHeaders = {
      'content-type': 'application/json',
      'x-user-id': 'admin-forged',
      'x-user-role': 'ADMIN',
      'x-workspace-id': 'ws-default-studio',
      cookie: 'shotistry_user_id=admin-forged; shotistry_role=ADMIN; shotistry_workspace_id=ws-default-studio',
    };

    const r1 = await workspaceSessionGet(
      new Request('http://localhost:3000/api/workspace/session', { headers: forgedHeaders })
    );
    assert.equal(r1.status, 401);

    const r2 = await assetsUploadPost(
      new Request('http://localhost:3000/api/assets/upload', {
        method: 'POST',
        headers: forgedHeaders,
        body: JSON.stringify({ imageBase64: samplePng }),
      })
    );
    assert.equal(r2.status, 401);

    const r3 = await photoshootGeneratePost(
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: forgedHeaders,
        body: JSON.stringify({ productTitle: 'Oud', rawImageBase64: samplePng }),
      })
    );
    assert.equal(r3.status, 401);

    const r4 = await jobByIdGet(
      new Request('http://localhost:3000/api/jobs/job-any', { headers: forgedHeaders }),
      { params: Promise.resolve({ id: 'job-any' }) }
    );
    assert.equal(r4.status, 401);

    const r5 = await checkoutIntentPost(
      new Request('http://localhost:3000/api/billing/checkout-intent', {
        method: 'POST',
        headers: forgedHeaders,
        body: JSON.stringify({ kind: 'SUBSCRIPTION', planTier: 'PRO' }),
      })
    );
    assert.equal(r5.status, 401);

    const r6 = await adminMetricsGet(
      new Request('http://localhost:3000/api/admin/metrics', { headers: forgedHeaders })
    );
    assert.equal(r6.status, 401);

    const r7 = await adminAdjustPost(
      new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
        headers: forgedHeaders,
        body: JSON.stringify({ workspaceId: 'ws-default-studio', amount: 100, reason: 'exploit' }),
      })
    );
    assert.equal(r7.status, 401);

    const db = getDb();
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS c FROM "User"`).get().c), 0);
    assert.equal(Number(db.prepare(`SELECT COUNT(*) AS c FROM "Workspace"`).get().c), 0);
  });

  test('enforces CSRF, cross-workspace isolation, and WorkspaceRole RBAC (OWNER/ADMIN/MEMBER/VIEWER) including live mid-session demotion', async () => {
    // Register Owner A
    const regA = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ownera@studio.sa',
          password: 'OwnerASecret2026!',
          country: 'SA',
          workspaceName: 'Studio Alpha',
        }),
      })
    );
    const cookieA = extractCookiePair(regA);
    const bodyA = await regA.json();
    const wsAId = bodyA.activeWorkspace.workspaceId;

    // Missing CSRF token on upload/generate/checkout must fail 403
    const noCsrfUpload = await assetsUploadPost(
      new Request('http://localhost:3000/api/assets/upload', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: cookieA },
        body: JSON.stringify({ imageBase64: samplePng }),
      })
    );
    assert.equal(noCsrfUpload.status, 403);

    // Owner A uploads asset & fetches via signed URL
    const okUpload = await assetsUploadPost(
      new Request('http://localhost:3000/api/assets/upload', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-csrf-token': bodyA.csrfToken,
        },
        body: JSON.stringify({ imageBase64: samplePng }),
      })
    );
    assert.equal(okUpload.status, 200);
    const uploadJson = await okUpload.json();
    const downloadRes = await assetsDownloadGet(
      new Request(`http://localhost:3000${uploadJson.asset.signedUrl}`)
    );
    assert.equal(downloadRes.status, 200);

    // Owner A generates photoshoot
    const okGen = await photoshootGeneratePost(
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-csrf-token': bodyA.csrfToken,
        },
        body: JSON.stringify({
          workspaceId: wsAId,
          productTitle: 'Royal Amber',
          presetId: 'gulf_luxury_marble',
          aspectRatio: '1:1',
          rawImageBase64: samplePng,
        }),
      })
    );
    assert.equal(okGen.status, 200);
    const genJson = await okGen.json();
    const jobAId = genJson.data.jobId;

    // Register User B (different workspace B)
    const regB = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'userb@studio.eg',
          password: 'UserBSecret2026!',
          country: 'EG',
        }),
      })
    );
    const cookieB = extractCookiePair(regB);
    const bodyB = await regB.json();

    // User B cannot pass workspaceId: wsAId in generate or checkout, nor read Owner A's job
    const crossGen = await photoshootGeneratePost(
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieB,
          'x-csrf-token': bodyB.csrfToken,
        },
        body: JSON.stringify({
          workspaceId: wsAId,
          productTitle: 'Spoofed Shoot',
          rawImageBase64: samplePng,
        }),
      })
    );
    assert.equal(crossGen.status, 403);

    const crossJob = await jobByIdGet(
      new Request(`http://localhost:3000/api/jobs/${jobAId}`, { headers: { cookie: cookieB } }),
      { params: Promise.resolve({ id: jobAId }) }
    );
    assert.equal(crossJob.status, 403);

    // Verify Owner A's email first so they can invite members
    await markEmailVerifiedForTests(bodyA.user.id);

    // Invite User B as VIEWER on Studio Alpha and accept invite
    const invAlphaRes = await membersPost(
      new Request(`http://localhost:3000/api/workspaces/${wsAId}/members`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-csrf-token': bodyA.csrfToken,
        },
        body: JSON.stringify({ email: 'userb@studio.eg', role: 'VIEWER' }),
      }),
      { params: Promise.resolve({ id: wsAId }) }
    );
    assert.equal(invAlphaRes.status, 202);

    // User B verifies email and accepts the invite (switches B's active workspace to wsAId)
    await markEmailVerifiedForTests(bodyB.user.id);
    const lastAlphaEmail = memoryTransport.getLastMessage();
    const tokenAlpha = lastAlphaEmail.html.match(/#token=([a-zA-Z0-9_-]+)/)[1];
    const acceptAlphaRes = await acceptInvitePost(
      new Request('http://localhost:3000/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieB,
          'x-csrf-token': bodyB.csrfToken,
        },
        body: JSON.stringify({ token: tokenAlpha }),
      })
    );
    assert.equal(acceptAlphaRes.status, 200);

    // VIEWER can read session & job, but is blocked 403 on upload, generate, checkout
    assert.equal(
      (
        await workspaceSessionGet(
          new Request('http://localhost:3000/api/workspace/session', { headers: { cookie: cookieB } })
        )
      ).status,
      200
    );
    assert.equal(
      (
        await jobByIdGet(
          new Request(`http://localhost:3000/api/jobs/${jobAId}`, { headers: { cookie: cookieB } }),
          { params: Promise.resolve({ id: jobAId }) }
        )
      ).status,
      200
    );
    assert.equal(
      (
        await assetsUploadPost(
          new Request('http://localhost:3000/api/assets/upload', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: cookieB,
              'x-csrf-token': bodyB.csrfToken,
            },
            body: JSON.stringify({ imageBase64: samplePng }),
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await photoshootGeneratePost(
          new Request('http://localhost:3000/api/photoshoots/generate', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: cookieB,
              'x-csrf-token': bodyB.csrfToken,
            },
            body: JSON.stringify({ productTitle: 'Viewer Attempt', rawImageBase64: samplePng }),
          })
        )
      ).status,
      403
    );

    // Promote User B to Workspace ADMIN -> can generate, STILL blocked 403 from billing:checkout (OWNER only)
    await membersPost(
      new Request(`http://localhost:3000/api/workspaces/${wsAId}/members`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-csrf-token': bodyA.csrfToken,
        },
        body: JSON.stringify({ email: 'userb@studio.eg', role: 'ADMIN' }),
      }),
      { params: Promise.resolve({ id: wsAId }) }
    );

    const adminWsCheckout = await checkoutIntentPost(
      new Request('http://localhost:3000/api/billing/checkout-intent', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieB,
          'x-csrf-token': bodyB.csrfToken,
        },
        body: JSON.stringify({ kind: 'SUBSCRIPTION', planTier: 'PRO' }),
      })
    );
    assert.equal(adminWsCheckout.status, 403);

    // Owner A IS allowed to checkout
    const ownerCheckout = await checkoutIntentPost(
      new Request('http://localhost:3000/api/billing/checkout-intent', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-csrf-token': bodyA.csrfToken,
        },
        body: JSON.stringify({ kind: 'SUBSCRIPTION', planTier: 'STARTER' }),
      })
    );
    assert.equal(ownerCheckout.status, 200);

    // Demote User B back to VIEWER mid-session -> immediately blocked 403 on generate without re-login!
    await membersPost(
      new Request(`http://localhost:3000/api/workspaces/${wsAId}/members`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieA,
          'x-csrf-token': bodyA.csrfToken,
        },
        body: JSON.stringify({ email: 'userb@studio.eg', role: 'VIEWER' }),
      }),
      { params: Promise.resolve({ id: wsAId }) }
    );

    const demotedGen = await photoshootGeneratePost(
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: cookieB,
          'x-csrf-token': bodyB.csrfToken,
        },
        body: JSON.stringify({ productTitle: 'Demoted Attempt', rawImageBase64: samplePng }),
      })
    );
    assert.equal(demotedGen.status, 403);
  });

  test('separates Platform ADMIN/SUPPORT from Workspace OWNER, caps SUPPORT adjustments & removes Admin tenant bypass', async () => {
    const regOwner = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'merchant@riyadh.sa',
          password: 'MerchantPassword2026!',
          country: 'SA',
        }),
      })
    );
    const ownerCookie = extractCookiePair(regOwner);
    const ownerBody = await regOwner.json();
    const ownerWsId = ownerBody.activeWorkspace.workspaceId;

    // Owner generates 1 job -> gets jobId
    const ownerGen = await photoshootGeneratePost(
      new Request('http://localhost:3000/api/photoshoots/generate', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerCookie,
          'x-csrf-token': ownerBody.csrfToken,
        },
        body: JSON.stringify({
          productTitle: 'Merchant Job',
          rawImageBase64: samplePng,
        }),
      })
    );
    const ownerJobId = (await ownerGen.json()).data.jobId;

    // Workspace OWNER cannot access platform admin endpoints
    assert.equal(
      (
        await adminMetricsGet(
          new Request('http://localhost:3000/api/admin/metrics', { headers: { cookie: ownerCookie } })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await adminAdjustPost(
          new Request('http://localhost:3000/api/admin/credits/adjust', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: ownerCookie,
              'x-csrf-token': ownerBody.csrfToken,
            },
            body: JSON.stringify({ workspaceId: ownerWsId, amount: 500, reason: 'self-grant' }),
          })
        )
      ).status,
      403
    );

    // Bootstrap Platform ADMIN & Support Operator
    const admin = await bootstrapPlatformAdmin({
      email: 'root-admin@shotistry.app',
      password: 'RootAdminPassword2026!',
      bootstrapSecret: process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET,
    });
    await createSupportOperatorByAdmin({
      adminUserId: admin.userId,
      email: 'support-ops@shotistry.app',
      password: 'SupportPassword2026!',
    });

    const adminLogin = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'root-admin@shotistry.app', password: 'RootAdminPassword2026!' }),
      })
    );
    const adminCookie = extractCookiePair(adminLogin);
    const adminBody = await adminLogin.json();

    const supportLogin = await loginPost(
      new Request('http://localhost:3000/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'support-ops@shotistry.app', password: 'SupportPassword2026!' }),
      })
    );
    const supportCookie = extractCookiePair(supportLogin);
    const supportBody = await supportLogin.json();

    // Platform ADMIN CANNOT bypass workspace isolation on merchant /api/jobs/[id]
    const adminBypassJob = await jobByIdGet(
      new Request(`http://localhost:3000/api/jobs/${ownerJobId}`, {
        headers: { cookie: adminCookie },
      }),
      { params: Promise.resolve({ id: ownerJobId }) }
    );
    assert.equal(adminBypassJob.status, 403);

    // SUPPORT can read admin metrics and issue bounded positive credit (<= 200)
    const supMetrics = await adminMetricsGet(
      new Request('http://localhost:3000/api/admin/metrics', { headers: { cookie: supportCookie } })
    );
    assert.equal(supMetrics.status, 200);

    const supOkAdj = await adminAdjustPost(
      new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: supportCookie,
          'x-csrf-token': supportBody.csrfToken,
        },
        body: JSON.stringify({
          targetEmail: 'merchant@riyadh.sa',
          amount: 50,
          reason: 'Support goodwill credit',
        }),
      })
    );
    assert.equal(supOkAdj.status, 200);

    // SUPPORT blocked on > 200 and on negative credits
    assert.equal(
      (
        await adminAdjustPost(
          new Request('http://localhost:3000/api/admin/credits/adjust', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: supportCookie,
              'x-csrf-token': supportBody.csrfToken,
            },
            body: JSON.stringify({ workspaceId: ownerWsId, amount: 250, reason: 'Over cap' }),
          })
        )
      ).status,
      403
    );
    assert.equal(
      (
        await adminAdjustPost(
          new Request('http://localhost:3000/api/admin/credits/adjust', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              cookie: supportCookie,
              'x-csrf-token': supportBody.csrfToken,
            },
            body: JSON.stringify({ workspaceId: ownerWsId, amount: -5, reason: 'Deduct' }),
          })
        )
      ).status,
      403
    );

    // ADMIN can adjust any valid amount & gets 404 for unknown workspace (no auto-provisioning!)
    const missingWsAdj = await adminAdjustPost(
      new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
          'x-csrf-token': adminBody.csrfToken,
        },
        body: JSON.stringify({ targetEmail: 'ghost@nowhere.sa', amount: 10, reason: 'Test missing' }),
      })
    );
    assert.equal(missingWsAdj.status, 404);

    const adminAdj = await adminAdjustPost(
      new Request('http://localhost:3000/api/admin/credits/adjust', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: adminCookie,
          'x-csrf-token': adminBody.csrfToken,
        },
        body: JSON.stringify({ workspaceId: ownerWsId, amount: -10, reason: 'Chargeback reversal' }),
      })
    );
    assert.equal(adminAdj.status, 200);
    const adminAdjBody = await adminAdj.json();

    const db = getDb();
    const auditRow = db
      .prepare(`SELECT "userId" FROM "AdminAuditLog" WHERE "id" = ?`)
      .get(adminAdjBody.auditLogId);
    assert.equal(auditRow.userId, admin.userId);
  });

  test('blocks production sandbox webhook simulation (403) and rejects unknown/missing workspace on Paymob webhook', async () => {
    const reg = await registerPost(
      new Request('http://localhost:3000/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'billing-owner@cairo.eg',
          password: 'BillingOwnerPassword2026!',
          country: 'EG',
        }),
      })
    );
    const body = await reg.json();
    await markEmailVerifiedForTests(body.user.id);

    // Production guard on sandboxSimulateWebhook
    const prevEnv = process.env.NODE_ENV;
    const prevBackend = process.env.SHOTISTRY_RATE_LIMIT_BACKEND;
    process.env.NODE_ENV = 'production';
    process.env.SHOTISTRY_RATE_LIMIT_BACKEND = 'postgres';
    try {
      const prodLogin = await loginPost(
        new Request('http://localhost:3000/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'billing-owner@cairo.eg', password: 'BillingOwnerPassword2026!' }),
        })
      );
      const hostCookie = extractCookiePair(prodLogin, '__Host-shotistry_session');
      const prodLoginBody = await prodLogin.json();
      assert.ok(hostCookie.startsWith('__Host-shotistry_session='));

      const simRes = await checkoutIntentPost(
        new Request('https://shotistry.app/api/billing/checkout-intent', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: 'https://shotistry.app',
            cookie: hostCookie,
            'x-csrf-token': prodLoginBody.csrfToken,
          },
          body: JSON.stringify({
            kind: 'SUBSCRIPTION',
            planTier: 'PRO',
            sandboxSimulateWebhook: true,
          }),
        })
      );
      assert.equal(simRes.status, 403);
    } finally {
      process.env.NODE_ENV = prevEnv;
      if (prevBackend === undefined) {
        delete process.env.SHOTISTRY_RATE_LIMIT_BACKEND;
      } else {
        process.env.SHOTISTRY_RATE_LIMIT_BACKEND = prevBackend;
      }
    }

    // Paymob webhook missing workspace_id -> 400
    const missingWsSub = {
      trigger_type: 'Subscription Created',
      hmac: PaymobSecurity.calculateSubscriptionHmac(
        'Subscription Created',
        998877,
        process.env.PAYMOB_HMAC_SECRET
      ),
      subscription_data: {
        id: 998877,
        plan_tier: 'PRO',
        currency: 'EGP',
      },
    };
    const resMissing = await paymobWebhookPost(
      new Request('http://localhost:3000/api/webhooks/paymob', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(missingWsSub),
      })
    );
    assert.equal(resMissing.status, 400);

    // Paymob webhook for non-existent workspace -> 404 (no auto-creation!)
    const unknownWsSub = {
      trigger_type: 'Subscription Created',
      hmac: PaymobSecurity.calculateSubscriptionHmac(
        'Subscription Created',
        998878,
        process.env.PAYMOB_HMAC_SECRET
      ),
      subscription_data: {
        id: 998878,
        workspace_id: 'ws-does-not-exist',
        plan_tier: 'PRO',
        currency: 'EGP',
      },
    };
    const resUnknown = await paymobWebhookPost(
      new Request('http://localhost:3000/api/webhooks/paymob', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(unknownWsSub),
      })
    );
    assert.equal(resUnknown.status, 404);
    assert.ok(body.activeWorkspace.workspaceId);
  });
});
