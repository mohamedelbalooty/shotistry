import {
  verifySignedAssetUrl,
  readStoredAsset,
} from '../../../../lib/storage/asset-storage.ts';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  const expires = url.searchParams.get('expires') || '';
  const sig = url.searchParams.get('sig') || '';

  const verification = verifySignedAssetUrl(key, expires, sig);
  if (!verification.valid) {
    return Response.json(
      { success: false, error: verification.reason || 'Forbidden' },
      { status: 403 }
    );
  }

  const asset = readStoredAsset(key);
  if (!asset) {
    return Response.json({ success: false, error: 'Asset not found' }, { status: 404 });
  }

  return new Response(new Uint8Array(asset.buffer), {
    status: 200,
    headers: {
      'content-type': asset.mimeType,
      'cache-control': 'private, max-age=3600',
    },
  });
}
