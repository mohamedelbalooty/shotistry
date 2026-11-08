import { resolveOptionalSession } from '../../../../lib/auth/session.ts';

export async function GET(request: Request) {
  const session = await resolveOptionalSession(request);
  if (!session) {
    return Response.json(
      {
        authenticated: false,
        user: null,
        activeWorkspace: null,
        workspaceRole: null,
        workspaces: [],
      },
      {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  return Response.json(
    {
      authenticated: true,
      user: session.user,
      activeWorkspace: session.activeWorkspace,
      workspaceRole: session.workspaceRole,
      workspaces: session.workspaces,
      csrfToken: session.csrfToken,
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
