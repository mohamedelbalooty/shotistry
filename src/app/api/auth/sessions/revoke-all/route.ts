import {
  buildClearSessionCookieHeader,
  resolveAuthenticatedSession,
  revokeAllUserSessions,
} from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';

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

    let keepCurrent = false;
    try {
      const body = await request.json();
      keepCurrent = body?.keepCurrent === true;
    } catch {
      // Optional empty body
    }

    const revokedCount = await revokeAllUserSessions(
      session.userId,
      'USER_REVOKE_ALL',
      keepCurrent ? session.sessionId : undefined
    );

    const headers: Record<string, string> = { 'Cache-Control': 'no-store' };
    if (!keepCurrent) {
      headers['Set-Cookie'] = buildClearSessionCookieHeader();
    }

    return Response.json(
      { success: true, revokedCount },
      { status: 200, headers }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to revoke sessions';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
