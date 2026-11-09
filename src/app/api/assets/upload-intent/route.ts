import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';
import { buildUploadAssetKey } from '../../../../lib/storage/keys.ts';
import { getObjectStorage } from '../../../../lib/storage/object-storage.ts';

const MAX_UPLOAD_SIZE = 15 * 1024 * 1024; // 15 MB
const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);

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

    const contentType = typeof body?.contentType === 'string' ? body.contentType.toLowerCase().trim() : '';
    const fileSize = typeof body?.fileSize === 'number' ? body.fileSize : 0;

    if (!SUPPORTED_MIME_TYPES.has(contentType)) {
      return Response.json(
        {
          success: false,
          error: 'Unsupported image format. Allowed formats: PNG, JPEG, WebP.',
        },
        { status: 400 }
      );
    }

    if (fileSize <= 0) {
      return Response.json(
        { success: false, error: 'fileSize must be a positive integer' },
        { status: 400 }
      );
    }

    if (fileSize > MAX_UPLOAD_SIZE) {
      return Response.json(
        {
          success: false,
          error: `File size exceeds the 15MB limit (received ${Math.round(fileSize / (1024 * 1024))}MB)`,
        },
        { status: 413 }
      );
    }

    const ext = contentType.includes('jpeg') || contentType.includes('jpg')
      ? 'jpg'
      : contentType.includes('webp')
        ? 'webp'
        : 'png';

    const key = buildUploadAssetKey(workspace.workspaceId, ext);
    const storage = getObjectStorage();
    const presigned = await storage.presignPut({
      key,
      contentType,
      contentLength: fileSize,
      expiresInSeconds: 300,
    });

    return Response.json({
      success: true,
      key,
      uploadUrl: presigned.url,
      headers: presigned.headers,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Upload intent generation failed';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}

