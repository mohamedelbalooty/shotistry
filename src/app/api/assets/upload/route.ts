import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';
import { storeProductAssetBase64 } from '../../../../lib/storage/asset-storage.ts';

const MAX_UPLOAD_BASE64_LENGTH = 20 * 1024 * 1024;

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

    if (
      typeof body?.workspaceId === 'string' &&
      body.workspaceId.trim() &&
      body.workspaceId.trim() !== workspace.workspaceId
    ) {
      return Response.json(
        { success: false, error: 'FORBIDDEN: Cross-workspace asset upload is denied' },
        { status: 403 }
      );
    }

    if (!body?.imageBase64 || typeof body.imageBase64 !== 'string') {
      return Response.json(
        { success: false, error: 'imageBase64 is required for asset upload' },
        { status: 400 }
      );
    }

    if (body.imageBase64.length > MAX_UPLOAD_BASE64_LENGTH) {
      return Response.json(
        { success: false, error: 'Uploaded asset exceeds maximum allowed payload size' },
        { status: 413 }
      );
    }

    const stored = storeProductAssetBase64(workspace.workspaceId, body.imageBase64);
    return Response.json({
      success: true,
      asset: stored,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Asset upload failed';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 400;
    return Response.json({ success: false, error: message }, { status });
  }
}
