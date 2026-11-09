import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';
import { validateWorkspaceKeyAccess } from '../../../../lib/storage/keys.ts';
import { getObjectStorage } from '../../../../lib/storage/object-storage.ts';
import { decodeProductImage } from '../../../../lib/ai/image-processor.ts';

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request, { requireWorkspace: true });
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const workspace = requireWorkspacePermission(session, 'asset:upload');

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const key = typeof body?.key === 'string' ? body.key.trim() : '';
    if (!key) {
      return Response.json({ success: false, error: 'Missing required field: key' }, { status: 400 });
    }

    if (!validateWorkspaceKeyAccess(workspace.workspaceId, key)) {
      return Response.json(
        { success: false, error: 'FORBIDDEN: Requested storage key does not belong to active workspace' },
        { status: 403 }
      );
    }

    const storage = getObjectStorage();
    const meta = await storage.head(key);
    if (!meta) {
      return Response.json(
        { success: false, error: 'Uploaded file not found in storage' },
        { status: 404 }
      );
    }

    const objectData = await storage.getBuffer(key);
    if (!objectData) {
      return Response.json(
        { success: false, error: 'Failed to read uploaded object from storage' },
        { status: 500 }
      );
    }

    // Verify image format and integrity using Sharp
    const decoded = await decodeProductImage(objectData.buffer);

    const presignedGetUrl = await storage.presignGet({
      key,
      expiresInSeconds: 3600,
    });

    return Response.json({
      success: true,
      key,
      width: decoded.width,
      height: decoded.height,
      fileSize: meta.contentLength,
      mimeType: meta.contentType,
      url: presignedGetUrl,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Asset finalization failed';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}

