import crypto from 'node:crypto';
import {
  withHashSemaphore,
  PasswordHasherBusyError,
} from './hash-semaphore.ts';

// OWASP Recommended Argon2id Default Configuration (RFC 9106)
const ARGON2_M = 19456; // 19 MiB
const ARGON2_T = 2; // 2 passes
const ARGON2_P = 1; // 1 thread
const ARGON2_TAG_LENGTH = 32; // 256 bits
const ARGON2_SALT_BYTES = 16; // 128 bits

// Strict parameter bounds for defense against DoS / memory-exhaustion
const MIN_ARGON2_M = 8192;
const MAX_ARGON2_M = 65536;
const MIN_ARGON2_T = 1;
const MAX_ARGON2_T = 10;
const MIN_ARGON2_P = 1;
const MAX_ARGON2_P = 4;
const MIN_SALT_BYTES = 16;
const MAX_SALT_BYTES = 32;

// Legacy scrypt bounds
const MIN_SCRYPT_N = 16384;
const MAX_SCRYPT_N = 131072;

let dummyHashPromise: Promise<string> | null = null;

function argon2Async(
  algorithm: 'argon2id',
  parameters: crypto.Argon2Parameters
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.argon2(algorithm, parameters, (err, derivedKey) => {
      if (err) {
        reject(err);
      } else {
        resolve(derivedKey);
      }
    });
  });
}

function scryptAsync(
  password: string,
  saltHex: string,
  n: number,
  r: number,
  p: number,
  keylen: number
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      saltHex,
      keylen,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) {
          reject(err);
        } else {
          resolve(derivedKey);
        }
      }
    );
  });
}

/**
 * Validates password strength policy for merchant registration and changes.
 */
export function validatePasswordStrength(
  password: string,
  minLength = 8
): { valid: boolean; reason?: string } {
  if (typeof password !== 'string') {
    return { valid: false, reason: 'Password must be a string' };
  }
  if (password.length < minLength) {
    return {
      valid: false,
      reason: `Password must be at least ${minLength} characters long`,
    };
  }
  if (password.length > 128) {
    return { valid: false, reason: 'Password must not exceed 128 characters' };
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return {
      valid: false,
      reason: 'Password must contain at least one letter and one number',
    };
  }
  return { valid: true };
}

/**
 * Hash a password using native Node 24 Argon2id with OWASP parameters.
 * Output format adheres to the standard PHC string specification:
 * $argon2id$v=19$m=19456,t=2,p=1$<b64_salt>$<b64_hash>
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length === 0) {
    throw new Error('Password must be a non-empty string');
  }
  if (password.length > 128) {
    throw new Error('Password must not exceed 128 characters');
  }

  return withHashSemaphore(async () => {
    const salt = crypto.randomBytes(ARGON2_SALT_BYTES);
    const derived = await argon2Async('argon2id', {
      message: password,
      nonce: salt,
      parallelism: ARGON2_P,
      memory: ARGON2_M,
      passes: ARGON2_T,
      tagLength: ARGON2_TAG_LENGTH,
    });

    const saltB64 = salt.toString('base64').replace(/=+$/, '');
    const hashB64 = derived.toString('base64').replace(/=+$/, '');

    return (
      `$argon2id$v=19$m=${ARGON2_M},t=${ARGON2_T},p=${ARGON2_P}$` +
      `${saltB64}$${hashB64}`
    );
  });
}

/**
 * Verify a password against a stored PHC Argon2id or legacy scrypt hash.
 * Enforces parameter bounds to prevent denial-of-service / memory exhaustion.
 */
export async function verifyPassword(
  password: string,
  storedHash: string | null | undefined
): Promise<boolean> {
  if (
    !password ||
    typeof password !== 'string' ||
    password.length > 128 ||
    !storedHash ||
    typeof storedHash !== 'string'
  ) {
    return false;
  }

  if (storedHash.startsWith('$argon2id$')) {
    return verifyArgon2id(password, storedHash);
  }

  if (storedHash.startsWith('scrypt$')) {
    return verifyLegacyScrypt(password, storedHash);
  }

  return false;
}

const ARGON2_PHC_REGEX =
  /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$([A-Za-z0-9+/]+)\$([A-Za-z0-9+/]+)$/;

async function verifyArgon2id(
  password: string,
  storedHash: string
): Promise<boolean> {
  const match = ARGON2_PHC_REGEX.exec(storedHash);
  if (!match) {
    return false;
  }

  const m = Number.parseInt(match[1], 10);
  const t = Number.parseInt(match[2], 10);
  const p = Number.parseInt(match[3], 10);
  const saltB64 = match[4];
  const hashB64 = match[5];

  if (
    !Number.isInteger(m) ||
    m < MIN_ARGON2_M ||
    m > MAX_ARGON2_M ||
    m < 8 * p ||
    !Number.isInteger(t) ||
    t < MIN_ARGON2_T ||
    t > MAX_ARGON2_T ||
    !Number.isInteger(p) ||
    p < MIN_ARGON2_P ||
    p > MAX_ARGON2_P
  ) {
    return false;
  }

  const salt = Buffer.from(saltB64, 'base64');
  const expectedTag = Buffer.from(hashB64, 'base64');

  if (
    salt.length < MIN_SALT_BYTES ||
    salt.length > MAX_SALT_BYTES ||
    expectedTag.length !== ARGON2_TAG_LENGTH
  ) {
    return false;
  }

  try {
    return await withHashSemaphore(async () => {
      const derived = await argon2Async('argon2id', {
        message: password,
        nonce: salt,
        parallelism: p,
        memory: m,
        passes: t,
        tagLength: expectedTag.length,
      });

      if (derived.length !== expectedTag.length) {
        return false;
      }
      return crypto.timingSafeEqual(derived, expectedTag);
    });
  } catch (err) {
    if (err instanceof PasswordHasherBusyError) {
      throw err;
    }
    return false;
  }
}

async function verifyLegacyScrypt(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltHex = parts[4];
  const expectedHex = parts[5];

  if (
    !Number.isInteger(n) ||
    n < MIN_SCRYPT_N ||
    n > MAX_SCRYPT_N ||
    (n & (n - 1)) !== 0 ||
    !Number.isInteger(r) ||
    r < 1 ||
    r > 16 ||
    !Number.isInteger(p) ||
    p < 1 ||
    p > 4 ||
    !saltHex ||
    saltHex.length < 32 ||
    saltHex.length % 2 !== 0 ||
    !expectedHex ||
    expectedHex.length % 2 !== 0 ||
    (expectedHex.length !== 64 && expectedHex.length !== 128)
  ) {
    return false;
  }

  try {
    return await withHashSemaphore(async () => {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const derived = await scryptAsync(
        password,
        saltHex,
        n,
        r,
        p,
        expectedBuf.length
      );

      if (derived.length !== expectedBuf.length) {
        return false;
      }
      return crypto.timingSafeEqual(derived, expectedBuf);
    });
  } catch (err) {
    if (err instanceof PasswordHasherBusyError) {
      throw err;
    }
    return false;
  }
}

/**
 * Returns true if the stored hash uses legacy scrypt or weaker Argon2id
 * parameters than the current standard (m=19456, t=2, p=1).
 */
export function needsPasswordRehash(
  storedHash: string | null | undefined
): boolean {
  if (!storedHash || typeof storedHash !== 'string') {
    return false;
  }

  if (storedHash.startsWith('scrypt$')) {
    const parts = storedHash.split('$');
    return parts.length === 6 && parts[0] === 'scrypt';
  }

  if (storedHash.startsWith('$argon2id$')) {
    const match = ARGON2_PHC_REGEX.exec(storedHash);
    if (!match) {
      return false;
    }
    const m = Number.parseInt(match[1], 10);
    const t = Number.parseInt(match[2], 10);
    const p = Number.parseInt(match[3], 10);
    return m < ARGON2_M || t < ARGON2_T || p < ARGON2_P;
  }

  return false;
}

/**
 * Performs a constant-time dummy verify operation for non-existent users
 * to defend against timing-based user enumeration attacks.
 */
export async function constantTimeDummyVerify(password: string): Promise<void> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('ShotistryDummyTimingDefense!2026');
  }
  const dummyHash = await dummyHashPromise;
  await verifyPassword(password || 'dummy', dummyHash);
}
