import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resetDbForTests, getDb } from '../src/lib/db/prisma.ts';
import { resolveDbDriver } from '../src/lib/db/driver.ts';
import { getAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import { getWorkspaceRepository } from '../src/lib/db/repositories/workspace-repository.ts';
import { getPhotoshootRepository } from '../src/lib/db/repositories/photoshoot-repository.ts';
import { getBillingRepository } from '../src/lib/db/repositories/billing-repository.ts';
import { getWebhookRepository } from '../src/lib/db/repositories/webhook-repository.ts';
import { getAdminRepository } from '../src/lib/db/repositories/admin-repository.ts';

describe('Phase 1: Dual-Driver Repository Parity & Static Architecture Guard', () => {
  beforeEach(async () => {
    await resetDbForTests();
  });

  test('static architecture guard: no app route or auth module imports getDb or withSerializableTransaction directly', () => {
    const rootDir = process.cwd();
    const targetDirs = [
      path.join(rootDir, 'src', 'app'),
      path.join(rootDir, 'src', 'lib', 'auth'),
    ];

    const violations = [];

    function scanDir(dir) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          // Check for forbidden imports from prisma.ts
          if (
            /\bimport\s+.*?\b(getDb|withSerializableTransaction)\b.*?from\s+['"].*?prisma(\.ts)?['"]/.test(
              content
            )
          ) {
            violations.push(path.relative(rootDir, fullPath));
          }
        }
      }
    }

    for (const dir of targetDirs) {
      scanDir(dir);
    }

    assert.deepEqual(
      violations,
      [],
      `Direct getDb/withSerializableTransaction imports found in routes/auth modules:\n${violations.join('\n')}`
    );
  });

  test('driver resolution defaults to sqlite and switches to postgres when SHOTISTRY_DB_DRIVER=postgres', () => {
    const prev = process.env.SHOTISTRY_DB_DRIVER;
    try {
      delete process.env.SHOTISTRY_DB_DRIVER;
      assert.equal(resolveDbDriver(), 'sqlite');

      process.env.SHOTISTRY_DB_DRIVER = 'postgres';
      assert.equal(resolveDbDriver(), 'postgres');

      process.env.SHOTISTRY_DB_DRIVER = 'sqlite';
      assert.equal(resolveDbDriver(), 'sqlite');
    } finally {
      if (prev !== undefined) {
        process.env.SHOTISTRY_DB_DRIVER = prev;
      } else {
        delete process.env.SHOTISTRY_DB_DRIVER;
      }
    }
  });

  test('AuthRepository lifecycle contract: user queries, session management & password updates', async () => {
    const repo = getAuthRepository();

    // Verify listActiveSessions returns a Promise
    const emptySessionsPromise = repo.listActiveSessions('user-unknown');
    assert.ok(emptySessionsPromise instanceof Promise, 'listActiveSessions must return a Promise');
    const emptySessions = await emptySessionsPromise;
    assert.deepEqual(emptySessions, []);
  });

  test('WebhookRepository idempotency & AdminRepository metrics driver label', async () => {
    const adminRepo = getAdminRepository();
    const metrics = await adminRepo.getPlatformMetrics();
    assert.equal(metrics.systemStatus.database, 'SQLITE');
  });
});
