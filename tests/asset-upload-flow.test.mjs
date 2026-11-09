import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { POST as uploadIntentPost } from '../src/app/api/assets/upload-intent/route.ts';
import { POST as finalizePost } from '../src/app/api/assets/finalize/route.ts';
import { GET as assetUrlGet } from '../src/app/api/assets/url/route.ts';
import { POST as cronCleanupPost } from '../src/app/api/cron/storage-cleanup/route.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { createSession } from '../src/lib/auth/session.ts';
import { hashPassword } from '../src/lib/auth/password.ts';
import { getObjectStorage } from '../src/lib/storage/object-storage.ts';

describe('Milestone M2 — Direct Asset Upload Intent, Finalize & Access Control', () => {
  const originalEnv = { ...process.env };
  let merchantSession;
  let foreignSession;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = 'test_cron_secret_for_storage_cleanup_123';

    const ledger = new CreditLedgerService();
    const reg1 = await ledger.registerMerchantWithInitialWorkspace({
      email: `m2_merchant_${Date.now()}@example.com`,
      passwordHash: await hashPassword('StrongPassword123!'),
      country: 'EG',
      locale: 'en',
      workspaceName: 'Studio M2 Alpha',
    });

    const s1 = await createSession({
      userId: reg1.user.id,
      activeWorkspaceId: reg1.workspace.workspaceId,
    });
    merchantSession = {
      token: s1.rawToken,
      csrfToken: s1.session.csrfToken,
      workspaceId: reg1.workspace.workspaceId,
    };

    const reg2 = await ledger.registerMerchantWithInitialWorkspace({
      email: `m2_foreign_${Date.now()}@example.com`,
      passwordHash: await hashPassword('StrongPassword123!'),
      country: 'SA',
      locale: 'ar',
      workspaceName: 'Studio M2 Beta',
    });

    const s2 = await createSession({
      userId: reg2.user.id,
      activeWorkspaceId: reg2.workspace.workspaceId,
    });
    foreignSession = {
      token: s2.rawToken,
      csrfToken: s2.session.csrfToken,
      workspaceId: reg2.workspace.workspaceId,
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('POST /api/assets/upload-intent returns presigned upload URL and validates content type and size', async () => {
    // 1. Rejects invalid content-type
    const badTypeReq = new Request('http://localhost:3000/api/assets/upload-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
      },
      body: JSON.stringify({
        contentType: 'application/pdf',
        fileSize: 1024,
      }),
    });

    const badTypeRes = await uploadIntentPost(badTypeReq);
    assert.equal(badTypeRes.status, 400);

    // 2. Rejects oversize (> 15 MB)
    const oversizeReq = new Request('http://localhost:3000/api/assets/upload-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
      },
      body: JSON.stringify({
        contentType: 'image/png',
        fileSize: 20 * 1024 * 1024,
      }),
    });

    const oversizeRes = await uploadIntentPost(oversizeReq);
    assert.equal(oversizeRes.status, 413);

    // 3. Valid intent returns presigned URL and workspace-scoped key
    const validReq = new Request('http://localhost:3000/api/assets/upload-intent', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
      },
      body: JSON.stringify({
        contentType: 'image/png',
        fileSize: 500 * 1024,
      }),
    });

    const validRes = await uploadIntentPost(validReq);
    assert.equal(validRes.status, 200);
    const body = await validRes.json();
    assert.equal(body.success, true);
    assert.ok(body.key.startsWith(`ws/${merchantSession.workspaceId}/uploads/`));
    assert.ok(body.uploadUrl);
  });

  test('POST /api/assets/finalize verifies uploaded image integrity and dimensions', async () => {
    // Seed an actual valid image into the storage location under the merchant's key
    const storage = getObjectStorage();
    const fixturePath = path.resolve('tests/fixtures/product-ruby.png');
    const imageBytes = fs.readFileSync(fixturePath);
    const testKey = `ws/${merchantSession.workspaceId}/uploads/test-ruby-upload.png`;

    await storage.put(testKey, imageBytes, 'image/png');

    const finalizeReq = new Request('http://localhost:3000/api/assets/finalize', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: `shotistry_session=${merchantSession.token}`,
        'x-csrf-token': merchantSession.csrfToken,
      },
      body: JSON.stringify({ key: testKey }),
    });

    const finalizeRes = await finalizePost(finalizeReq);
    assert.equal(finalizeRes.status, 200);
    const body = await finalizeRes.json();
    assert.equal(body.success, true);
    assert.equal(body.key, testKey);
    assert.ok(body.width > 0 && body.height > 0);
    assert.equal(body.mimeType, 'image/png');
    assert.ok(body.url);
  });

  test('GET /api/assets/url strictly prevents cross-workspace asset retrieval (returns 404)', async () => {
    const storage = getObjectStorage();
    const testKey = `ws/${merchantSession.workspaceId}/uploads/confidential-product.png`;
    await storage.put(testKey, Buffer.from('confidential-bytes'), 'image/png');

    // 1. Merchant accessing their own asset -> 200 with URL
    const ownReq = new Request(
      `http://localhost:3000/api/assets/url?key=${encodeURIComponent(testKey)}`,
      {
        headers: {
          cookie: `shotistry_session=${merchantSession.token}`,
        },
      }
    );
    const ownRes = await assetUrlGet(ownReq);
    assert.equal(ownRes.status, 200);
    const ownBody = await ownRes.json();
    assert.ok(ownBody.url);

    // 2. Foreign workspace attempting to access the asset -> 404 Not Found (no cross-tenant leakage)
    const foreignReq = new Request(
      `http://localhost:3000/api/assets/url?key=${encodeURIComponent(testKey)}`,
      {
        headers: {
          cookie: `shotistry_session=${foreignSession.token}`,
        },
      }
    );
    const foreignRes = await assetUrlGet(foreignReq);
    assert.equal(foreignRes.status, 404);
  });

  test('POST /api/cron/storage-cleanup requires CRON_SECRET and reports cleaned entries', async () => {
    // 1. Unauthorized request without bearer secret -> 401
    const unauthReq = new Request('http://localhost:3000/api/cron/storage-cleanup', {
      method: 'POST',
    });
    const unauthRes = await cronCleanupPost(unauthReq);
    assert.equal(unauthRes.status, 401);

    // 2. Authorized request -> 200
    const authReq = new Request('http://localhost:3000/api/cron/storage-cleanup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_cron_secret_for_storage_cleanup_123',
      },
    });
    const authRes = await cronCleanupPost(authReq);
    assert.equal(authRes.status, 200);
    const body = await authRes.json();
    assert.equal(body.success, true);
    assert.equal(typeof body.cleanedCount, 'number');
  });
});
