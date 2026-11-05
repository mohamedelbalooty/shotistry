import { resolveWorkspaceSession } from '../../../../lib/auth/session.ts';
import { storeProductAssetBase64 } from '../../../../lib/storage/asset-storage.ts';

export async function POST(request: Request) {
  try {
    const session = await resolveWorkspaceSession(request);
    const body = await request.json();

    if (!body?.imageBase64 || typeof body.imageBase64 !== 'string') {
      return Response.json(
        { success: false, error: 'imageBase64 is required for asset upload' },
        { status: 400 }
      );
    }

    const stored = storeProductAssetBase64(session.workspaceId, body.imageBase64);
    return Response.json({
      success: true,
      asset: stored,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Asset upload failed';
    const status = message.startsWith('FORBIDDEN:') ? 403 : 400;
    return Response.json({ success: false, error: message }, { status });
  }
}
