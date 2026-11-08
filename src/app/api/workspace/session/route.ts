import { getWorkspaceRepository } from '../../../../lib/db/repositories/workspace-repository.ts';
import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request, { requireWorkspace: true });
    const workspace = requireWorkspacePermission(session, 'workspace:read');
    const wsRepo = getWorkspaceRepository();
    const recentJobs = await wsRepo.getWorkspaceStudioSnapshot(workspace.workspaceId, 20);

    return Response.json({
      success: true,
      workspace,
      workspaceRole: session.workspaceRole,
      platformRole: session.platformRole,
      recentJobs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve workspace session';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
