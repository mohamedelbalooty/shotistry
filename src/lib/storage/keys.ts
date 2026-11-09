import crypto from 'node:crypto';

const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

function sanitizeIdentifier(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function sanitizeExtension(ext: string): string {
  const clean = ext.replace(/^\./, '').toLowerCase().trim();
  if (ALLOWED_EXTENSIONS.has(clean)) {
    return clean === 'jpeg' ? 'jpg' : clean;
  }
  return 'png';
}

/**
 * Builds a workspace-scoped storage key for merchant uploaded original assets.
 * Structure: `ws/{workspaceId}/uploads/{uuid}.{ext}`
 */
export function buildUploadAssetKey(workspaceId: string, extension = 'png'): string {
  const safeWs = sanitizeIdentifier(workspaceId.trim());
  const safeExt = sanitizeExtension(extension);
  const uuid = crypto.randomUUID();
  return `ws/${safeWs}/uploads/${uuid}.${safeExt}`;
}

/**
 * Builds a workspace and job-scoped storage key for generated output images.
 * Structure: `ws/{workspaceId}/outputs/{jobId}/{uuid}.{ext}`
 */
export function buildGeneratedImageKey(
  workspaceId: string,
  jobId: string,
  extension = 'png'
): string {
  const safeWs = sanitizeIdentifier(workspaceId.trim());
  const safeJob = sanitizeIdentifier(jobId.trim());
  const safeExt = sanitizeExtension(extension);
  const uuid = crypto.randomUUID();
  return `ws/${safeWs}/outputs/${safeJob}/${uuid}.${safeExt}`;
}

/**
 * Validates that a requested storage key belongs strictly to the authenticated workspace
 * and prevents any directory traversal, null-byte injection, or cross-tenant access.
 */
export function validateWorkspaceKeyAccess(workspaceId: string, key: string): boolean {
  if (!workspaceId || !key || typeof key !== 'string') {
    return false;
  }

  // Defend against null-bytes, backslashes, and path traversal
  if (key.includes('\0') || key.includes('\\') || key.includes('..')) {
    return false;
  }

  const safeWs = sanitizeIdentifier(workspaceId.trim());
  const expectedPrefix = `ws/${safeWs}/`;

  if (!key.startsWith(expectedPrefix)) {
    return false;
  }

  const segments = key.split('/');
  // Must have: ['ws', workspaceId, 'uploads' | 'outputs', ...filename]
  if (segments.length < 4) {
    return false;
  }

  const category = segments[2];
  if (category !== 'uploads' && category !== 'outputs') {
    return false;
  }

  return true;
}

