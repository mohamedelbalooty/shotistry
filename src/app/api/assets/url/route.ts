import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { validateWorkspaceKeyAccess } from '../../../../lib/storage/keys.ts';
import { getObjectStorage } from '../../../../lib/storage/object-storage.ts';

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request, { requireWorkspace: true });
    const url = new URL(request.url);
    const key = url.searchParams.get('key')?.trim() || '';

    if (!key || !session.activeWorkspaceId || !validateWorkspaceKeyAccess(session.activeWorkspaceId, key)) {
      return Response.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    const storage = getObjectStorage();
    const meta = await storage.head(key);
    if (!meta) {
      return Response.json({ success: false, error: 'Asset not found' }, { status: 404 });
    }

    const presignedUrl = await storage.presignGet({
      key,
      expiresInSeconds: 600,
    });

    return Response.json({
      success: true,
      url: presignedUrl,
      fileSize: meta.contentLength,
      mimeType: meta.contentType,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Asset URL retrieval failed';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
