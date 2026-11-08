import { resolveAuthenticatedSession } from '../../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../../lib/security/csrf.ts';
import { requireVerifiedEmail } from '../../../../../../lib/auth/email-verification-guard.ts';
import {
  hasWorkspacePermission,
  canManageWorkspaceMemberRole,
} from '../../../../../../lib/auth/rbac.ts';
import { getWorkspaceRepository } from '../../../../../../lib/db/repositories/workspace-repository.ts';
import { getWorkspaceInviteRepository } from '../../../../../../lib/db/repositories/invite-repository.ts';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; inviteId: string }> }
) {
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

    const { id: workspaceId, inviteId } = await context.params;

    const wsRepo = getWorkspaceRepository();
    const requesterMember = await wsRepo.getWorkspaceMember(
      workspaceId,
      session.userId
    );
    if (!requesterMember) {
      return Response.json(
        { success: false, error: 'FORBIDDEN: Not a member of this workspace' },
        { status: 403 }
      );
    }

    const requesterRole = requesterMember.role;
    if (!hasWorkspacePermission(requesterRole, 'workspace:members:manage')) {
      return Response.json(
        {
          success: false,
          error: `FORBIDDEN: Workspace role '${requesterRole}' cannot manage invitations`,
        },
        { status: 403 }
      );
    }

    const inviteRepo = getWorkspaceInviteRepository();
    const invite = await inviteRepo.findInviteById(inviteId);
    if (!invite || invite.workspaceId !== workspaceId) {
      return Response.json(
        { success: false, error: 'Invitation not found' },
        { status: 404 }
      );
    }

    if (!canManageWorkspaceMemberRole(requesterRole, invite.role)) {
      return Response.json(
        {
          success: false,
          error: `FORBIDDEN: Cannot revoke invitation with role '${invite.role}'`,
        },
        { status: 403 }
      );
    }

    await inviteRepo.revokeInvite(inviteId);

    return Response.json(
      { success: true },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to revoke invitation';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
