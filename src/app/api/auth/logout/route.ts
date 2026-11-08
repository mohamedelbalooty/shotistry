import {
  buildClearSessionCookieHeader,
  extractSessionToken,
  resolveAuthenticatedSession,
  revokeSessionByRawToken,
} from '../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';

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

    const rawToken = extractSessionToken(request);
    if (rawToken) {
      await revokeSessionByRawToken(rawToken, 'LOGOUT');
    }

    return Response.json(
      { success: true },
      {
        status: 200,
        headers: {
          'Set-Cookie': buildClearSessionCookieHeader(),
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Logout failed';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
