import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { parseImageInput } from '../ai/image-processor.ts';

const globalForStorage = globalThis as unknown as {
  __ephemeralAssetSigningKey?: string;
};

function getSigningSecret(): string {
  const configured = process.env.ASSET_SIGNING_SECRET?.trim() ?? '';
  const isInvalidOrPlaceholder =
    configured.length < 16 ||
    configured.toLowerCase().includes('placeholder') ||
    configured.toLowerCase().includes('changeme');

  if (!isInvalidOrPlaceholder) {
    return configured;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ASSET_SIGNING_SECRET must be configured with at least 16 characters in production'
    );
  }

  if (!globalForStorage.__ephemeralAssetSigningKey) {
    globalForStorage.__ephemeralAssetSigningKey = crypto.randomBytes(32).toString('hex');
  }
  return globalForStorage.__ephemeralAssetSigningKey;
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
  if (!key || key.includes('\0')) {
    return null;
  }
  const baseDir = path.resolve(getAssetsBaseDir());
  const normalized = path.normalize(key).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.resolve(baseDir, normalized);
  if (!fullPath.startsWith(baseDir + path.sep) || !fs.existsSync(fullPath)) {
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
