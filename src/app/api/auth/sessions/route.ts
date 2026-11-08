import {
  listActiveUserSessions,
  resolveAuthenticatedSession,
} from '../../../../lib/auth/session.ts';

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const sessions = await listActiveUserSessions(session.userId, session.sessionId);
    return Response.json(
      { success: true, sessions },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list sessions';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
