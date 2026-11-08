import { z } from 'zod';
import {
  getWorkspacesForUser,
  resolveAuthenticatedSession,
  switchSessionActiveWorkspace,
} from '../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';

const switchSchema = z.object({
  workspaceId: z.string().trim().min(1),
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const parsed = switchSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'workspaceId is required' },
        { status: 400 }
      );
    }

    const activeWorkspace = await switchSessionActiveWorkspace(
      session.sessionId,
      session.userId,
      parsed.data.workspaceId
    );
    const workspaces = await getWorkspacesForUser(session.userId);
    const matched = workspaces.find((w) => w.workspaceId === parsed.data.workspaceId);

    return Response.json({
      success: true,
      activeWorkspace,
      workspaceRole: matched?.role ?? null,
      workspaces,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to switch workspace';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
