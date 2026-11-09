import crypto from 'node:crypto';
import { z } from 'zod';
import { getAuthRepository } from '../../../../../lib/db/repositories/auth-repository.ts';
import { getWorkspaceRepository } from '../../../../../lib/db/repositories/workspace-repository.ts';
import { getWorkspaceInviteRepository } from '../../../../../lib/db/repositories/invite-repository.ts';
import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import {
  hasWorkspacePermission,
  canManageWorkspaceMemberRole,
} from '../../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import { requireVerifiedEmail } from '../../../../../lib/auth/email-verification-guard.ts';
import { getEmailTransport } from '../../../../../lib/email/index.ts';
import { renderWorkspaceInviteTemplate } from '../../../../../lib/email/templates.ts';
import { createScopedLogger } from '../../../../../lib/observability/logger.ts';
import type { WorkspaceRole } from '../../../../../lib/types/index.ts';

const logger = createScopedLogger('workspaces:members');

const memberMutationSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

function parseWorkspaceRole(rawRole: unknown): WorkspaceRole {
  const upper = String(rawRole || '').toUpperCase();
  if (
    upper === 'OWNER' ||
    upper === 'ADMIN' ||
    upper === 'MEMBER' ||
    upper === 'VIEWER'
  ) {
    return upper as WorkspaceRole;
  }
  return 'MEMBER';
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const { id: workspaceId } = await context.params;
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
    if (!hasWorkspacePermission(requesterRole, 'workspace:members:read')) {
      return Response.json(
        {
          success: false,
          error: `FORBIDDEN: Workspace role '${requesterRole}' cannot view workspace member list`,
        },
        { status: 403 }
      );
    }

    const rawMembers = await wsRepo.listWorkspaceMembers(workspaceId);

    const members = rawMembers.map((m) => {
      const parsedRole = parseWorkspaceRole(m.role);
      return {
        id: m.id,
        membershipId: m.id,
        userId: m.userId,
        email: m.email,
        name: m.name,
        role: parsedRole,
        workspaceRole: parsedRole,
        createdAt: m.createdAt,
      };
    });

    const inviteRepo = getWorkspaceInviteRepository();
    const rawInvites = await inviteRepo.listPendingInvites(workspaceId);
    const invites = rawInvites.map((inv) => ({
      id: inv.id,
      workspaceId: inv.workspaceId,
      invitedEmail: inv.invitedEmail,
      role: inv.role,
      invitedByUserId: inv.invitedByUserId,
      expiresAt: inv.expiresAt,
      createdAt: inv.createdAt,
    }));

    return Response.json({ success: true, members, invites });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to list workspace members';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
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

    const { id: workspaceId } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    const parsed = memberMutationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid member details',
        },
        { status: 400 }
      );
    }

    const wsRepo = getWorkspaceRepository();
    const authRepo = getAuthRepository();

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
    if (
      !hasWorkspacePermission(requesterRole, 'workspace:members:manage') ||
      !canManageWorkspaceMemberRole(requesterRole, parsed.data.role)
    ) {
      return Response.json(
        {
          success: false,
          error: `FORBIDDEN: Workspace role '${requesterRole}' cannot assign role '${parsed.data.role}'`,
        },
        { status: 403 }
      );
    }

    const wsRow = await wsRepo.findWorkspaceOwner(workspaceId);
    if (!wsRow) {
      return Response.json(
        { success: false, error: 'Workspace not found' },
        { status: 404 }
      );
    }

    const targetEmail = parsed.data.email.trim().toLowerCase();
    const targetUser = await authRepo.findUserByEmail(targetEmail);

    // If target user exists and is ALREADY a member of this workspace, update role
    const existingMember = targetUser
      ? await wsRepo.getWorkspaceMember(workspaceId, targetUser.id)
      : null;

    if (existingMember && targetUser) {
      if (targetUser.id === wsRow.ownerId) {
        return Response.json(
          {
            success: false,
            error: 'FORBIDDEN: Cannot modify the workspace owner role',
          },
          { status: 403 }
        );
      }

      const existingRole = parseWorkspaceRole(existingMember.role);
      if (!canManageWorkspaceMemberRole(requesterRole, existingRole)) {
        return Response.json(
          {
            success: false,
            error: `FORBIDDEN: Cannot reassign member currently holding role '${existingRole}'`,
          },
          { status: 403 }
        );
      }

      await wsRepo.updateWorkspaceMemberRole(existingMember.id, parsed.data.role);

      return Response.json({
        success: true,
        status: 'UPDATED',
        member: {
          id: existingMember.id,
          workspaceId,
          userId: targetUser.id,
          email: targetUser.email,
          name: targetUser.name,
          role: parsed.data.role,
        },
      });
    }

    // Otherwise, issue an identity-bound workspace invite (ADR-007)
    const rawBytes = crypto.randomBytes(32);
    const rawToken = rawBytes.toString('base64url');
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    const inviteRepo = getWorkspaceInviteRepository();
    const invite = await inviteRepo.createInvite({
      workspaceId,
      invitedEmail: targetEmail,
      role: parsed.data.role,
      invitedByUserId: session.userId,
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    try {
      const transport = getEmailTransport();
      const rendered = renderWorkspaceInviteTemplate({
        workspaceName: wsRow.name || 'Shotistry Studio',
        inviterName: session.user?.name || session.email,
        invitedEmail: targetEmail,
        role: parsed.data.role,
        token: rawToken,
        locale: 'en',
      });
      await transport.send({
        to: targetEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `ws-invite:${invite.id}:${rawToken.slice(0, 16)}`,
      });
    } catch (emailErr) {
      logger.error('Failed to dispatch workspace invite email', emailErr);
    }

    return Response.json(
      {
        success: true,
        status: 'INVITED',
        invite: {
          id: invite.id,
          workspaceId: invite.workspaceId,
          invitedEmail: invite.invitedEmail,
          role: invite.role,
          expiresAt: invite.expiresAt,
          createdAt: invite.createdAt,
        },
      },
      {
        status: 202,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Failed to update workspace member';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
