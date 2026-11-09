import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildUploadAssetKey,
  buildGeneratedImageKey,
  validateWorkspaceKeyAccess,
} from '../src/lib/storage/keys.ts';
import {
  getObjectStorage,
  LocalFsObjectStorage,
  R2ObjectStorage,
} from '../src/lib/storage/object-storage.ts';

describe('Milestone M2 — Cloudflare R2 / S3 Object Storage & Key Isolation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('buildUploadAssetKey creates workspace-scoped keys and sanitizes inputs', () => {
    const wsId = 'ws-test-123';
    const key = buildUploadAssetKey(wsId, 'png');

    assert.ok(key.startsWith('ws/ws-test-123/uploads/'));
    assert.ok(key.endsWith('.png'));
    assert.ok(validateWorkspaceKeyAccess(wsId, key));

    // Must block foreign workspace access
    assert.equal(validateWorkspaceKeyAccess('ws-other-456', key), false);
  });

  test('buildGeneratedImageKey creates workspace and job-scoped keys', () => {
    const wsId = 'ws-prod-789';
    const jobId = 'job-abc-123';
    const key = buildGeneratedImageKey(wsId, jobId, 'webp');

    assert.ok(key.startsWith(`ws/${wsId}/outputs/${jobId}/`));
    assert.ok(key.endsWith('.webp'));
    assert.ok(validateWorkspaceKeyAccess(wsId, key));
    assert.equal(validateWorkspaceKeyAccess('ws-foreign', key), false);
  });

  test('validateWorkspaceKeyAccess strictly blocks path traversal and null bytes', () => {
    const wsId = 'ws-legit-001';

    assert.equal(validateWorkspaceKeyAccess(wsId, `ws/${wsId}/uploads/../../../etc/passwd`), false);
    assert.equal(validateWorkspaceKeyAccess(wsId, `ws/${wsId}/uploads/file.png\0.malicious`), false);
    assert.equal(validateWorkspaceKeyAccess(wsId, `ws/${wsId}/..\\outputs\\file.png`), false);
    assert.equal(validateWorkspaceKeyAccess(wsId, ''), false);
    assert.equal(validateWorkspaceKeyAccess(wsId, '/etc/shadow'), false);
    assert.equal(validateWorkspaceKeyAccess(wsId, `ws/ws-legit-001-imposter/uploads/file.png`), false);
  });

  test('LocalFsObjectStorage implements full ObjectStorage lifecycle (put, head, presign, get, delete)', async () => {
    const storage = new LocalFsObjectStorage();
    const wsId = 'ws-unit-test';
    const key = buildUploadAssetKey(wsId, 'png');
    const testBuffer = Buffer.from('fake-png-pixel-data-for-testing', 'utf8');

    // 1. Put
    await storage.put(key, testBuffer, 'image/png');

    // 2. Head
    const meta = await storage.head(key);
    assert.ok(meta);
    assert.equal(meta.key, key);
    assert.equal(meta.contentLength, testBuffer.length);
    assert.equal(meta.contentType, 'image/png');

    // 3. Get buffer
    const fetched = await storage.getBuffer(key);
    assert.ok(fetched);
    assert.equal(fetched.buffer.toString('utf8'), 'fake-png-pixel-data-for-testing');
    assert.equal(fetched.contentType, 'image/png');

    // 4. Presign GET
    const getUrl = await storage.presignGet({ key, expiresInSeconds: 60 });
    assert.ok(getUrl);
    assert.ok(getUrl.includes('/api/assets/download'));
    assert.ok(getUrl.includes('key='));

    // 5. Presign PUT
    const putPresigned = await storage.presignPut({
      key,
      contentType: 'image/png',
      contentLength: 1024,
      expiresInSeconds: 300,
    });
    assert.ok(putPresigned.url);

    // 6. Delete
    await storage.delete(key);
    const deletedMeta = await storage.head(key);
    assert.equal(deletedMeta, null);
  });

  test('getObjectStorage resolves R2ObjectStorage when credentials are configured, LocalFs in local/test, and throws in staging without R2', () => {
    // 1. Local/Test mode without credentials -> LocalFsObjectStorage
    process.env.SHOTISTRY_DEPLOY_ENV = 'test';
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET_NAME;

    const devStorage = getObjectStorage();
    assert.ok(devStorage instanceof LocalFsObjectStorage);

    // 2. Staging mode without credentials -> Throws Configuration Error (Fail-Closed)
    process.env.SHOTISTRY_DEPLOY_ENV = 'staging';
    assert.throws(
      () => getObjectStorage(),
      /Cloudflare R2 storage credentials are required in staging and production/
    );

    // 3. Configured credentials -> R2ObjectStorage
    process.env.R2_ACCOUNT_ID = 'test_account_id_hex123';
    process.env.R2_ACCESS_KEY_ID = 'test_access_key_456';
    process.env.R2_SECRET_ACCESS_KEY = 'test_secret_key_789';
    process.env.R2_BUCKET_NAME = 'shotistry-staging-assets';

    const r2Storage = getObjectStorage();
    assert.ok(r2Storage instanceof R2ObjectStorage);
  });
});

