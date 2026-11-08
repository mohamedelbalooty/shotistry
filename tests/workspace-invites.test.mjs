import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { getAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import { getWorkspaceRepository } from '../src/lib/db/repositories/workspace-repository.ts';
import { createSession } from '../src/lib/auth/session.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { markEmailVerifiedForTests } from './helpers/verify-email.mjs';
import {
  setEmailTransportForTests,
  MemoryEmailTransport,
} from '../src/lib/email/index.ts';

// Routes
import {
  GET as membersGetRoute,
  POST as membersPostRoute,
} from '../src/app/api/workspaces/[id]/members/route.ts';
import { POST as acceptInviteRoute } from '../src/app/api/workspaces/invites/accept/route.ts';
import { DELETE as revokeInviteRoute } from '../src/app/api/workspaces/[id]/invites/[inviteId]/route.ts';

describe('Phase 7 — Workspace Invites Lifecycle (ADR-007)', () => {
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

  test('inviting a new member returns 202 INVITED, emits email with #token, and persists sanitized invite', async () => {
    const ledger = new CreditLedgerService();
    const { user: owner, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'owner.inv@shotistry.app',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Studio Invite Corp',
    });
    await markEmailVerifiedForTests(owner.id);

    const ownerSession = await createSession({
      userId: owner.id,
      activeWorkspaceId: workspace.workspaceId,
    });

    // Invite new user (collaborator@partner.eg) as MEMBER
    const inviteReq = new Request(
      `http://localhost/api/workspaces/${workspace.workspaceId}/members`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerSession.cookieHeader,
          'x-csrf-token': ownerSession.session.csrfToken,
        },
        body: JSON.stringify({
          email: 'collaborator@partner.eg',
          role: 'MEMBER',
        }),
      }
    );

    const inviteRes = await membersPostRoute(inviteReq, {
      params: Promise.resolve({ id: workspace.workspaceId }),
    });

    assert.equal(inviteRes.status, 202);
    const body = await inviteRes.json();
    assert.equal(body.success, true);
    assert.equal(body.status, 'INVITED');
    assert.equal(body.invite.invitedEmail, 'collaborator@partner.eg');
    assert.equal(body.invite.role, 'MEMBER');
    assert.equal(body.invite.tokenHash, undefined, 'tokenHash must never be exposed');

    // Email dispatched
    const sent = memoryTransport.getSentMessages();
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, 'collaborator@partner.eg');
    assert.match(sent[0].html, /#token=/);

    // List members includes sanitized pending invites
    const listRes = await membersGetRoute(
      new Request(`http://localhost/api/workspaces/${workspace.workspaceId}/members`, {
        headers: { cookie: ownerSession.cookieHeader },
      }),
      { params: Promise.resolve({ id: workspace.workspaceId }) }
    );
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.ok(Array.isArray(listBody.invites));
    assert.equal(listBody.invites.length, 1);
    assert.equal(listBody.invites[0].invitedEmail, 'collaborator@partner.eg');
    assert.equal(listBody.invites[0].tokenHash, undefined);
  });

  test('accepting an invite enforces identity binding, email verification, and workspace membership', async () => {
    const ledger = new CreditLedgerService();
    const { user: owner, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'owner.acc@shotistry.app',
      passwordHash: await hashPassword('Password123!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Saudi Creative Lab',
    });
    await markEmailVerifiedForTests(owner.id);

    const ownerSession = await createSession({
      userId: owner.id,
      activeWorkspaceId: workspace.workspaceId,
    });

    // Owner invites 'invitee@agency.sa'
    await membersPostRoute(
      new Request(`http://localhost/api/workspaces/${workspace.workspaceId}/members`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerSession.cookieHeader,
          'x-csrf-token': ownerSession.session.csrfToken,
        },
        body: JSON.stringify({
          email: 'invitee@agency.sa',
          role: 'ADMIN',
        }),
      }),
      { params: Promise.resolve({ id: workspace.workspaceId }) }
    );

    const lastEmail = memoryTransport.getLastMessage();
    const tokenMatch = lastEmail.html.match(/#token=([a-zA-Z0-9_-]+)/);
    assert.ok(tokenMatch);
    const rawToken = tokenMatch[1];

    // Register a third party 'wronguser@other.com'
    const { user: wrongUser } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'wronguser@other.com',
      passwordHash: await hashPassword('Password123!'),
      country: 'SA',
      locale: 'en',
      workspaceName: 'Wrong Workspace',
    });
    await markEmailVerifiedForTests(wrongUser.id);
    const wrongSession = await createSession({ userId: wrongUser.id });

    // Third party attempts to accept invite -> 403 INVITE_IDENTITY_MISMATCH
    const mismatchRes = await acceptInviteRoute(
      new Request('http://localhost/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: wrongSession.cookieHeader,
          'x-csrf-token': wrongSession.session.csrfToken,
        },
        body: JSON.stringify({ token: rawToken }),
      })
    );
    assert.equal(mismatchRes.status, 403);
    const mismatchBody = await mismatchRes.json();
    assert.equal(mismatchBody.code, 'INVITE_IDENTITY_MISMATCH');

    // Register actual invitee 'invitee@agency.sa' but DO NOT verify yet
    const { user: invitee } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'invitee@agency.sa',
      passwordHash: await hashPassword('Password123!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Invitee Workspace',
    });
    const unverifiedSession = await createSession({ userId: invitee.id });

    // Unverified invitee attempts to accept -> 403 EMAIL_VERIFICATION_REQUIRED
    const unverifiedRes = await acceptInviteRoute(
      new Request('http://localhost/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: unverifiedSession.cookieHeader,
          'x-csrf-token': unverifiedSession.session.csrfToken,
        },
        body: JSON.stringify({ token: rawToken }),
      })
    );
    assert.equal(unverifiedRes.status, 403);
    const unverifiedBody = await unverifiedRes.json();
    assert.equal(unverifiedBody.code, 'EMAIL_VERIFICATION_REQUIRED');

    // Verify invitee email and accept invite -> 200
    await markEmailVerifiedForTests(invitee.id);
    const verifiedSession = await createSession({ userId: invitee.id });
    const acceptRes = await acceptInviteRoute(
      new Request('http://localhost/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: verifiedSession.cookieHeader,
          'x-csrf-token': verifiedSession.session.csrfToken,
        },
        body: JSON.stringify({ token: rawToken }),
      })
    );
    assert.equal(acceptRes.status, 200);
    const acceptBody = await acceptRes.json();
    assert.equal(acceptBody.success, true);
    assert.equal(acceptBody.workspaceId, workspace.workspaceId);
    assert.equal(acceptBody.role, 'ADMIN');

    // Replay fails
    const replayRes = await acceptInviteRoute(
      new Request('http://localhost/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: verifiedSession.cookieHeader,
          'x-csrf-token': verifiedSession.session.csrfToken,
        },
        body: JSON.stringify({ token: rawToken }),
      })
    );
    assert.equal(replayRes.status, 400);

    // Invitee is now member in workspace with role ADMIN
    const wsRepo = getWorkspaceRepository();
    const memberRow = await wsRepo.getWorkspaceMember(workspace.workspaceId, invitee.id);
    assert.ok(memberRow);
    assert.equal(memberRow.role, 'ADMIN');
  });

  test('revoking an invite marks it revoked and prevents acceptance', async () => {
    const ledger = new CreditLedgerService();
    const { user: owner, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'owner.rev@shotistry.app',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Studio Revocation',
    });
    await markEmailVerifiedForTests(owner.id);

    const ownerSession = await createSession({
      userId: owner.id,
      activeWorkspaceId: workspace.workspaceId,
    });

    const inviteRes = await membersPostRoute(
      new Request(`http://localhost/api/workspaces/${workspace.workspaceId}/members`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: ownerSession.cookieHeader,
          'x-csrf-token': ownerSession.session.csrfToken,
        },
        body: JSON.stringify({
          email: 'revoked.candidate@brand.eg',
          role: 'VIEWER',
        }),
      }),
      { params: Promise.resolve({ id: workspace.workspaceId }) }
    );
    const inviteBody = await inviteRes.json();
    const inviteId = inviteBody.invite.id;

    const rawToken = memoryTransport.getLastMessage().html.match(/#token=([a-zA-Z0-9_-]+)/)[1];

    // Revoke the invite
    const revokeRes = await revokeInviteRoute(
      new Request(
        `http://localhost/api/workspaces/${workspace.workspaceId}/invites/${inviteId}`,
        {
          method: 'DELETE',
          headers: {
            cookie: ownerSession.cookieHeader,
            'x-csrf-token': ownerSession.session.csrfToken,
          },
        }
      ),
      { params: Promise.resolve({ id: workspace.workspaceId, inviteId }) }
    );
    assert.equal(revokeRes.status, 200);

    // Register candidate and attempt acceptance -> 400
    const { user: candidate } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'revoked.candidate@brand.eg',
      passwordHash: await hashPassword('Password123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Candidate Studio',
    });
    await markEmailVerifiedForTests(candidate.id);
    const candidateSession = await createSession({ userId: candidate.id });

    const acceptRes = await acceptInviteRoute(
      new Request('http://localhost/api/workspaces/invites/accept', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: candidateSession.cookieHeader,
          'x-csrf-token': candidateSession.session.csrfToken,
        },
        body: JSON.stringify({ token: rawToken }),
      })
    );
    assert.equal(acceptRes.status, 400);
  });
});
