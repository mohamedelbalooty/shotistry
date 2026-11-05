import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseImageInput } from '../ai/image-processor.ts';

function getSigningSecret(): string {
  return (
    process.env.ASSET_SIGNING_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    'shotistry-local-asset-signing-key-hmac-sha256'
  );
}

export interface SignedAssetUrl {
  key: string;
  expires: number;
  signature: string;
  url: string;
}

export function signAssetUrl(key: string, ttlSeconds = 3600): SignedAssetUrl {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${key}:${expires}`;
  const signature = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payload)
    .digest('hex');

  const url = `/api/assets/download?key=${encodeURIComponent(key)}&expires=${expires}&sig=${signature}`;
  return { key, expires, signature, url };
}

export function verifySignedAssetUrl(
  key: string,
  expires: number | string,
  signature: string
): { valid: boolean; reason?: string } {
  const expNum = Number(expires);
  if (!key || !Number.isFinite(expNum) || !signature) {
    return { valid: false, reason: 'Missing key, expiration, or signature' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (expNum < nowSec) {
    return { valid: false, reason: 'Signed URL has expired' };
  }

  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`${key}:${expNum}`)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'utf8');
  const expBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'Invalid signature' };
  }

  return { valid: true };
}

function getAssetsBaseDir(): string {
  const dir = path.join(process.cwd(), '.data', 'assets');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function storeProductAssetBase64(
  workspaceId: string,
  base64OrDataUrl: string
): {
  key: string;
  mimeType: string;
  fileSize: number;
  signedUrl: string;
} {
  const { buffer, mimeType } = parseImageInput(base64OrDataUrl);
  const ext = mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png';
  const safeWs = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const key = `${safeWs}/${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(getAssetsBaseDir(), key);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);

  const signed = signAssetUrl(key, 3600);
  return {
    key,
    mimeType,
    fileSize: buffer.length,
    signedUrl: signed.url,
  };
}

export function readStoredAsset(key: string): { buffer: Buffer; mimeType: string } | null {
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(getAssetsBaseDir(), normalized);
  if (!fullPath.startsWith(getAssetsBaseDir()) || !fs.existsSync(fullPath)) {
    return null;
  }
  const buffer = fs.readFileSync(fullPath);
  const mimeType = normalized.endsWith('.jpg')
    ? 'image/jpeg'
    : normalized.endsWith('.webp')
      ? 'image/webp'
      : 'image/png';
  return { buffer, mimeType };
}
