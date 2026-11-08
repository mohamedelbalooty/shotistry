import crypto from 'node:crypto';
import { getAuthRepository } from '../db/repositories/auth-repository.ts';
import { getAdminRepository } from '../db/repositories/admin-repository.ts';
import { hashPassword, validatePasswordStrength } from './password.ts';

const MIN_BOOTSTRAP_SECRET_LENGTH = 24;

function isPlaceholderSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes('placeholder') ||
    lower.includes('changeme') ||
    lower.includes('your_') ||
    lower === 'secret'
  );
}

/**
 * Secure one-time bootstrap procedure for the initial Platform Super Administrator (`ADMIN`).
 * Never exposed via HTTP. Requires `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` (>= 24 chars),
 * refuses weak passwords (< 12 chars), and fails closed if any `ADMIN` already exists.
 */
export async function bootstrapPlatformAdmin(input: {
  email: string;
  password: string;
  name?: string;
  bootstrapSecret: string;
}): Promise<{
  userId: string;
  email: string;
  role: 'ADMIN';
  auditLogId: string;
}> {
  const configuredSecret = process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET?.trim() ?? '';
  if (
    configuredSecret.length < MIN_BOOTSTRAP_SECRET_LENGTH ||
    isPlaceholderSecret(configuredSecret)
  ) {
    throw new Error(
      'BOOTSTRAP_SECRET_INVALID: SHOTISTRY_ADMIN_BOOTSTRAP_SECRET is not configured securely (min 24 chars)'
    );
  }

  const providedSecret = input.bootstrapSecret?.trim() ?? '';
  if (providedSecret.length < MIN_BOOTSTRAP_SECRET_LENGTH) {
    throw new Error('BOOTSTRAP_SECRET_INVALID: Provided bootstrap secret rejected');
  }

  const expectedDigest = crypto.createHash('sha256').update(configuredSecret, 'utf8').digest();
  const providedDigest = crypto.createHash('sha256').update(providedSecret, 'utf8').digest();
  if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
    throw new Error('BOOTSTRAP_SECRET_INVALID: Bootstrap secret mismatch');
  }

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Valid administrator email is required');
  }

  const pwCheck = validatePasswordStrength(input.password, 12);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.reason || 'Admin password does not meet strength requirements');
  }

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim() || 'Platform Administrator';
  const userId = `admin-${crypto.randomUUID()}`;
  const auditLogId = `audit-${crypto.randomUUID()}`;

  const authRepo = getAuthRepository();
  const res = await authRepo.createPrivilegedUser({
    userId,
    email,
    name,
    passwordHash,
    role: 'ADMIN',
    auditLogId,
    auditDetails: JSON.stringify({ email, role: 'ADMIN' }),
  });

  return {
    userId: res.userId,
    email: res.email,
    role: 'ADMIN',
    auditLogId: res.auditLogId,
  };
}

/**
 * Creates a platform Customer Support Operator (`SUPPORT`) strictly under the authority
 * of an already-authenticated database `ADMIN`.
 */
export async function createSupportOperatorByAdmin(input: {
  adminUserId: string;
  email: string;
  password: string;
  name?: string;
}): Promise<{ userId: string; email: string; role: 'SUPPORT' }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) {
    throw new Error('Valid support email is required');
  }
  const pwCheck = validatePasswordStrength(input.password, 10);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.reason || 'Support password does not meet strength requirements');
  }

  const authRepo = getAuthRepository();
  const actingAdmin = await authRepo.findUserById(input.adminUserId);
  if (!actingAdmin || actingAdmin.role !== 'ADMIN') {
    throw new Error('FORBIDDEN: Only an existing platform ADMIN may create SUPPORT operators');
  }

  const passwordHash = await hashPassword(input.password);
  const name = input.name?.trim() || 'Customer Support Operator';
  const userId = `support-${crypto.randomUUID()}`;
  const auditLogId = `audit-${crypto.randomUUID()}`;

  const res = await authRepo.createPrivilegedUser({
    userId,
    email,
    name,
    passwordHash,
    role: 'SUPPORT',
    auditLogId,
    auditDetails: JSON.stringify({ email }),
  });

  return { userId: res.userId, email: res.email, role: 'SUPPORT' };
}

/**
 * Rotates an existing Platform Super Administrator (`ADMIN`) password strictly via CLI.
 * Requires `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` validation, enforces min 12-char password strength,
 * hashes with Argon2id, revokes all existing sessions, and logs to `AdminAuditLog`.
 */
export async function rotateAdminPasswordViaCli(input: {
  email: string;
  newPassword: string;
  bootstrapSecret: string;
}): Promise<{
  userId: string;
  email: string;
  role: 'ADMIN';
  auditLogId: string;
}> {
  const configuredSecret = process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET?.trim() ?? '';
  if (
    configuredSecret.length < MIN_BOOTSTRAP_SECRET_LENGTH ||
    isPlaceholderSecret(configuredSecret)
  ) {
    throw new Error(
      'BOOTSTRAP_SECRET_INVALID: SHOTISTRY_ADMIN_BOOTSTRAP_SECRET is not configured securely (min 24 chars)'
    );
  }

  const providedSecret = input.bootstrapSecret?.trim() ?? '';
  if (providedSecret.length < MIN_BOOTSTRAP_SECRET_LENGTH) {
    throw new Error('BOOTSTRAP_SECRET_INVALID: Provided bootstrap secret rejected');
  }

  const expectedDigest = crypto.createHash('sha256').update(configuredSecret, 'utf8').digest();
  const providedDigest = crypto.createHash('sha256').update(providedSecret, 'utf8').digest();
  if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
    throw new Error('BOOTSTRAP_SECRET_INVALID: Bootstrap secret mismatch');
  }

  const pwCheck = validatePasswordStrength(input.newPassword, 12);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.reason || 'Admin password does not meet strength requirements');
  }

  const email = input.email.trim().toLowerCase();
  const authRepo = getAuthRepository();
  const user = await authRepo.findUserByEmail(email);
  if (!user || user.role !== 'ADMIN') {
    throw new Error('ADMIN_NOT_FOUND: Administrator account not found');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await authRepo.updatePasswordHash(user.id, passwordHash, {
    bumpPasswordUpdatedAt: true,
    revokeSessionsReason: 'ADMIN_CLI_PASSWORD_ROTATED',
  });

  const auditLogId = `audit-${crypto.randomUUID()}`;
  const adminRepo = getAdminRepository();
  await adminRepo.recordAuditLog({
    auditLogId,
    userId: user.id,
    action: 'ADMIN_PASSWORD_ROTATED_CLI',
    targetId: user.id,
    details: { email, role: 'ADMIN' },
  });

  return {
    userId: user.id,
    email: user.email,
    role: 'ADMIN',
    auditLogId,
  };
}

/**
 * Rotates an existing Customer Support Operator (`SUPPORT`) password either via CLI
 * with the bootstrap secret, or by an authenticated `ADMIN`.
 */
export async function rotateSupportOperatorPassword(input: {
  adminUserId?: string;
  bootstrapSecret?: string;
  email: string;
  newPassword: string;
}): Promise<{
  userId: string;
  email: string;
  role: 'SUPPORT';
  auditLogId: string;
}> {
  let authorized = false;

  if (input.bootstrapSecret) {
    const configuredSecret = process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET?.trim() ?? '';
    if (
      configuredSecret.length >= MIN_BOOTSTRAP_SECRET_LENGTH &&
      !isPlaceholderSecret(configuredSecret) &&
      input.bootstrapSecret.trim().length >= MIN_BOOTSTRAP_SECRET_LENGTH
    ) {
      const expectedDigest = crypto.createHash('sha256').update(configuredSecret, 'utf8').digest();
      const providedDigest = crypto.createHash('sha256').update(input.bootstrapSecret.trim(), 'utf8').digest();
      if (crypto.timingSafeEqual(expectedDigest, providedDigest)) {
        authorized = true;
      }
    }
  }

  const authRepo = getAuthRepository();
  if (!authorized && input.adminUserId) {
    const actingAdmin = await authRepo.findUserById(input.adminUserId);
    if (actingAdmin && actingAdmin.role === 'ADMIN') {
      authorized = true;
    }
  }

  if (!authorized) {
    throw new Error('FORBIDDEN: Requires bootstrap secret or authenticated ADMIN');
  }

  const pwCheck = validatePasswordStrength(input.newPassword, 10);
  if (!pwCheck.valid) {
    throw new Error(pwCheck.reason || 'Support password does not meet strength requirements');
  }

  const email = input.email.trim().toLowerCase();
  const user = await authRepo.findUserByEmail(email);
  if (!user || user.role !== 'SUPPORT') {
    throw new Error('SUPPORT_NOT_FOUND: Support operator account not found');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await authRepo.updatePasswordHash(user.id, passwordHash, {
    bumpPasswordUpdatedAt: true,
    revokeSessionsReason: 'SUPPORT_PASSWORD_ROTATED',
  });

  const auditLogId = `audit-${crypto.randomUUID()}`;
  const adminRepo = getAdminRepository();
  await adminRepo.recordAuditLog({
    auditLogId,
    userId: user.id,
    action: 'SUPPORT_PASSWORD_ROTATED',
    targetId: user.id,
    details: { email, role: 'SUPPORT', actor: input.adminUserId ? 'ADMIN' : 'CLI' },
  });

  return {
    userId: user.id,
    email: user.email,
    role: 'SUPPORT',
    auditLogId,
  };
}
