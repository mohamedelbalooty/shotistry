import {
  buildClearSessionCookieHeader,
  resolveAuthenticatedSession,
  revokeSessionById,
} from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';

export async function DELETE(
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

    const { id: targetSessionId } = await context.params;
    const revoked = await revokeSessionById(
      targetSessionId,
      session.userId,
      'SINGLE_DEVICE_REVOKED'
    );

    if (!revoked) {
      return Response.json(
        { success: false, error: 'Session not found or not owned by authenticated user' },
        { status: 404 }
      );
    }

    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    const revokedCurrentSession = targetSessionId === session.sessionId;
    if (revokedCurrentSession) {
      headers['Set-Cookie'] = buildClearSessionCookieHeader();
    }

    return Response.json(
      { success: true, revokedSessionId: targetSessionId, revokedCurrentSession },
      { status: 200, headers }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to revoke session';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
