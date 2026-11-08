import crypto from 'node:crypto';
import { z } from 'zod';
import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import { requireVerifiedEmail } from '../../../../../lib/auth/email-verification-guard.ts';
import { getWorkspaceInviteRepository } from '../../../../../lib/db/repositories/invite-repository.ts';
import { getWorkspaceRepository } from '../../../../../lib/db/repositories/workspace-repository.ts';
import { getAuthRepository } from '../../../../../lib/db/repositories/auth-repository.ts';

const acceptInviteSchema = z.object({
  token: z.string().min(1).max(512),
});

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const unverified = requireVerifiedEmail(session);
    if (unverified) return unverified;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const parsed = acceptInviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid invite token',
        },
        { status: 400 }
      );
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(parsed.data.token.trim())
      .digest('hex');

    const inviteRepo = getWorkspaceInviteRepository();
    const invite = await inviteRepo.findInviteByTokenHash(tokenHash);

    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      new Date(invite.expiresAt) <= new Date()
    ) {
      return Response.json(
        {
          success: false,
          error:
            'INVALID_OR_EXPIRED_INVITE: Workspace invitation is invalid, expired, or has already been accepted',
        },
        { status: 400 }
      );
    }

    // Identity binding check (ADR-007)
    if (
      session.email.trim().toLowerCase() !==
      invite.invitedEmail.trim().toLowerCase()
    ) {
      return Response.json(
        {
          success: false,
          code: 'INVITE_IDENTITY_MISMATCH',
          error:
            'You are signed in as a different user than the recipient of this invitation',
        },
        { status: 403 }
      );
    }

    // Atomically accept invite
    const accepted = await inviteRepo.acceptInvite(invite.id, session.userId);
    if (!accepted) {
      return Response.json(
        {
          success: false,
          error:
            'INVALID_OR_EXPIRED_INVITE: Invitation could not be accepted',
        },
        { status: 400 }
      );
    }

    // Add or update workspace membership
    const wsRepo = getWorkspaceRepository();
    const existingMember = await wsRepo.getWorkspaceMember(
      invite.workspaceId,
      session.userId
    );
    if (existingMember) {
      await wsRepo.updateWorkspaceMemberRole(existingMember.id, invite.role);
    } else {
      await wsRepo.addWorkspaceMember(
        invite.workspaceId,
        session.userId,
        invite.role
      );
    }

    // Switch active workspace in session
    const authRepo = getAuthRepository();
    await authRepo.setActiveWorkspace(
      session.sessionId,
      session.userId,
      invite.workspaceId
    );

    return Response.json(
      {
        success: true,
        workspaceId: invite.workspaceId,
        role: invite.role,
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to accept invitation';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
