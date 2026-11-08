import { getPhotoshootRepository } from '../../../../lib/db/repositories/photoshoot-repository.ts';
import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await resolveAuthenticatedSession(request, { requireWorkspace: true });
    const workspace = requireWorkspacePermission(session, 'job:read');
    const { id: jobId } = await context.params;
    const photoshootRepo = getPhotoshootRepository();

    const jobRow = await photoshootRepo.findJobById(jobId);

    if (!jobRow) {
      return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    if (jobRow.workspaceId !== workspace.workspaceId) {
      return Response.json(
        { success: false, error: 'FORBIDDEN: Job belongs to a different workspace' },
        { status: 403 }
      );
    }

    const images = await photoshootRepo.listJobImages(jobId);

    return Response.json({
      success: true,
      job: jobRow,
      images,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch job';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
