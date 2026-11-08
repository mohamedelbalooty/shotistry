import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  needsPasswordRehash,
  constantTimeDummyVerify,
} from '../src/lib/auth/password.ts';
import {
  PasswordHasherBusyError,
  withHashSemaphore,
  resetHashSemaphoreForTests,
} from '../src/lib/auth/hash-semaphore.ts';
import { CreditLedgerService } from '../src/lib/ledger/credit-ledger-service.ts';
import { getAuthRepository } from '../src/lib/db/repositories/auth-repository.ts';
import { POST as loginRoute } from '../src/app/api/auth/login/route.ts';
import { createSession, listActiveUserSessions } from '../src/lib/auth/session.ts';
import { resetDbForTests } from '../src/lib/db/prisma.ts';
import { resetRateLimitsForTests } from '../src/lib/security/rate-limit.ts';

describe('Password Hashing & Argon2id Migration (Phase 2)', () => {
  beforeEach(async () => {
    await resetDbForTests();
    resetRateLimitsForTests();
    resetHashSemaphoreForTests();
  });

  test('hashPassword produces standard PHC Argon2id format with expected parameters', async () => {
    const password = 'MerchantSecret2026!';
    const hashA = await hashPassword(password);
    const hashB = await hashPassword(password);

    assert.ok(
      hashA.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'),
      `Hash does not have expected prefix: ${hashA}`
    );
    assert.notEqual(hashA, hashB, 'Unique salts must produce different hashes');

    const parts = hashA.split('$');
    // Format: ["", "argon2id", "v=19", "m=19456,t=2,p=1", salt, hash]
    assert.equal(parts.length, 6);
    assert.equal(parts[1], 'argon2id');
    assert.equal(parts[2], 'v=19');
    assert.equal(parts[3], 'm=19456,t=2,p=1');

    const saltB64 = parts[4];
    const hashB64 = parts[5];

    // Salt and hash must be unpadded base64 (no '=' characters)
    assert.ok(!saltB64.includes('='), 'Salt base64 must not have padding');
    assert.ok(!hashB64.includes('='), 'Hash base64 must not have padding');

    const salt = Buffer.from(saltB64, 'base64');
    const derived = Buffer.from(hashB64, 'base64');
    assert.equal(salt.length, 16, 'Salt must be 16 bytes');
    assert.equal(derived.length, 32, 'Derived key must be 32 bytes');
  });

  test('verifyPassword round-trips correctly and rejects wrong password', async () => {
    const password = 'MerchantPassword2026!';
    const hash = await hashPassword(password);

    const match = await verifyPassword(password, hash);
    assert.equal(match, true);

    const wrongMatch = await verifyPassword('WrongPassword123!', hash);
    assert.equal(wrongMatch, false);
  });

  test('verifyPassword rejects passwords exceeding 128 characters without hashing', async () => {
    const longPassword = 'A'.repeat(129) + '1!';
    const normalHash = await hashPassword('ValidPass123!');

    const result = await verifyPassword(longPassword, normalHash);
    assert.equal(result, false);

    // Also assert hashPassword rejects passwords exceeding 128 characters
    await assert.rejects(
      () => hashPassword(longPassword),
      /128 characters/i
    );
  });

  test('verifyPassword rejects null, undefined, empty, or non-string inputs', async () => {
    const hash = await hashPassword('ValidPass123!');
    assert.equal(await verifyPassword('', hash), false);
    assert.equal(await verifyPassword(null, hash), false);
    assert.equal(await verifyPassword(undefined, hash), false);
    assert.equal(await verifyPassword('ValidPass123!', ''), false);
    assert.equal(await verifyPassword('ValidPass123!', null), false);
    assert.equal(await verifyPassword('ValidPass123!', undefined), false);
    assert.equal(await verifyPassword('ValidPass123!', 'garbage$format'), false);
  });

  test('verifyPassword defends against DoS with strict bounds on stored Argon2id parameters', async () => {
    const validSalt = crypto.randomBytes(16).toString('base64').replace(/=+$/, '');
    const validTag = crypto.randomBytes(32).toString('base64').replace(/=+$/, '');

    // Oversized memory: m=4194304 (4 GiB attack vector)
    const oversizedMemHash = `$argon2id$v=19$m=4194304,t=2,p=1$${validSalt}$${validTag}`;
    assert.equal(await verifyPassword('TestPass1!', oversizedMemHash), false);

    // Memory too low: m=4096 (< 8192)
    const undersizedMemHash = `$argon2id$v=19$m=4096,t=2,p=1$${validSalt}$${validTag}`;
    assert.equal(await verifyPassword('TestPass1!', undersizedMemHash), false);

    // Too many passes: t=50 (> 10)
    const excessivePassesHash = `$argon2id$v=19$m=19456,t=50,p=1$${validSalt}$${validTag}`;
    assert.equal(await verifyPassword('TestPass1!', excessivePassesHash), false);

    // Zero passes: t=0
    const zeroPassesHash = `$argon2id$v=19$m=19456,t=0,p=1$${validSalt}$${validTag}`;
    assert.equal(await verifyPassword('TestPass1!', zeroPassesHash), false);

    // Too many threads: p=16 (> 4)
    const excessiveThreadsHash = `$argon2id$v=19$m=19456,t=2,p=16$${validSalt}$${validTag}`;
    assert.equal(await verifyPassword('TestPass1!', excessiveThreadsHash), false);

    // Invalid salt length (8 bytes)
    const shortSalt = crypto.randomBytes(8).toString('base64').replace(/=+$/, '');
    const badSaltHash = `$argon2id$v=19$m=19456,t=2,p=1$${shortSalt}$${validTag}`;
    assert.equal(await verifyPassword('TestPass1!', badSaltHash), false);

    // Invalid tag length (16 bytes instead of 32)
    const shortTag = crypto.randomBytes(16).toString('base64').replace(/=+$/, '');
    const badTagHash = `$argon2id$v=19$m=19456,t=2,p=1$${validSalt}$${shortTag}`;
    assert.equal(await verifyPassword('TestPass1!', badTagHash), false);
  });

  test('verifyPassword validates legacy scrypt hashes and identifies them for rehash', async () => {
    const password = 'LegacyMerchant2026!';
    const saltHex = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, saltHex, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const legacyHash = `scrypt$16384$8$1$${saltHex}$${derivedKey.toString('hex')}`;

    assert.equal(await verifyPassword(password, legacyHash), true);
    assert.equal(await verifyPassword('WrongPassword123!', legacyHash), false);

    assert.equal(needsPasswordRehash(legacyHash), true);

    const currentHash = await hashPassword(password);
    assert.equal(needsPasswordRehash(currentHash), false);

    // Weaker Argon2id hash requires rehash
    const weakSalt = saltHex.slice(0, 22);
    const weakTag = derivedKey.toString('base64').replace(/=+$/, '').slice(0, 43);
    const weakArgon2idHash = `$argon2id$v=19$m=8192,t=1,p=1$${weakSalt}$${weakTag}`;
    assert.equal(needsPasswordRehash(weakArgon2idHash), true);
  });

  test('constantTimeDummyVerify executes without error', async () => {
    await constantTimeDummyVerify('AnyPasswordAttempt!');
    await constantTimeDummyVerify('');
  });

  test('hash semaphore caps concurrency and throws PasswordHasherBusyError on timeout', async () => {
    let releaseHold;
    const holdPromise = new Promise((resolve) => {
      releaseHold = resolve;
    });

    // Run one operation with a small timeout holding the permit
    const op1 = withHashSemaphore(async () => {
      await holdPromise;
      return 'done-1';
    }, 500);

    // With concurrency limit = 1 and holding the permit, a second operation times out quickly
    const op2Promise = withHashSemaphore(async () => 'done-2', 50, 1);

    await assert.rejects(
      op2Promise,
      (err) => {
        assert.ok(err instanceof PasswordHasherBusyError);
        assert.equal(err.code, 'SERVICE_BUSY');
        return true;
      }
    );

    releaseHold();
    const result1 = await op1;
    assert.equal(result1, 'done-1');
  });

  test('transparent scrypt migration on login updates passwordHash to Argon2id without bumping passwordUpdatedAt', async () => {
    const authRepo = getAuthRepository();
    const password = 'MigrateMe2026!';
    const saltHex = crypto.randomBytes(16).toString('hex');
    const derivedKey = crypto.scryptSync(password, saltHex, 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    const legacyHash = `scrypt$16384$8$1$${saltHex}$${derivedKey.toString('hex')}`;

    const ledger = new CreditLedgerService();
    const { user } = await ledger.registerMerchantWithInitialWorkspace({
      email: 'migrate.user@example.com',
      passwordHash: legacyHash,
      country: 'EG',
      locale: 'ar',
      workspaceName: 'Migrate Studio',
    });

    const userBefore = await authRepo.findUserById(user.id);
    assert.ok(userBefore);

    // Create an existing active session for this user to verify it is NOT revoked
    const existingSession = await createSession({
      userId: user.id,
      userAgent: 'Legacy-Agent',
      ipAddress: '192.168.1.100',
    });

    const activeBefore = await listActiveUserSessions(user.id);
    assert.equal(activeBefore.length, 1);

    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email: 'migrate.user@example.com',
        password,
      }),
    });

    const res = await loginRoute(loginReq);
    assert.equal(res.status, 200);

    // Verify DB user record
    const updatedUser = await authRepo.findUserById(user.id);
    assert.ok(updatedUser);
    assert.ok(
      updatedUser.passwordHash.startsWith('$argon2id$v=19$m=19456,t=2,p=1$'),
      `Hash was not upgraded to Argon2id: ${updatedUser.passwordHash}`
    );
    assert.equal(
      updatedUser.passwordUpdatedAt,
      userBefore.passwordUpdatedAt,
      'passwordUpdatedAt must NOT be bumped on transparent migration'
    );

    // Verify existing session remains active
    const activeAfter = await listActiveUserSessions(user.id);
    // Should now have 2 active sessions (the prior one + the new login)
    assert.equal(activeAfter.length, 2);
    const foundOld = activeAfter.find((s) => s.id === existingSession.session.id);
    assert.ok(foundOld, 'Prior session must not be revoked during transparent rehash');
  });

  test('login route maps PasswordHasherBusyError to 503 SERVICE_BUSY with Retry-After header', async () => {
    process.env.SHOTISTRY_MAX_CONCURRENT_HASHES = '1';
    process.env.SHOTISTRY_HASH_SEMAPHORE_TIMEOUT_MS = '50';

    let releaseHold;
    const holdPromise = new Promise((resolve) => {
      releaseHold = resolve;
    });

    // Hold the single available permit
    const held = withHashSemaphore(async () => {
      await holdPromise;
      return 'held-done';
    });

    const loginReq = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email: 'anyone@example.com',
        password: 'ValidPassword123!',
      }),
    });

    const res = await loginRoute(loginReq);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '2');
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code, 'SERVICE_BUSY');

    releaseHold();
    await held;
    delete process.env.SHOTISTRY_MAX_CONCURRENT_HASHES;
    delete process.env.SHOTISTRY_HASH_SEMAPHORE_TIMEOUT_MS;
  });
});
