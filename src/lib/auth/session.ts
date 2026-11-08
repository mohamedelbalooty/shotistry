import crypto from 'node:crypto';
import { getAuthRepository } from '../db/repositories/auth-repository.ts';
import {
  CreditLedgerService,
  type PublicUserRecord,
  type WorkspaceBalanceSummary,
} from '../ledger/credit-ledger-service.ts';
import type { Country, PlatformRole, WorkspaceRole } from '../types/index.ts';

export const SESSION_COOKIE_DEV = 'shotistry_session';
export const SESSION_COOKIE_PROD = '__Host-shotistry_session';
const DEFAULT_IDLE_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_ABSOLUTE_TTL_SECONDS = 30 * 24 * 60 * 60;

export interface SessionRecord {
  id: string;
  userId: string;
  activeWorkspaceId: string | null;
  csrfToken: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActivityAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
}

export interface WorkspaceMembershipSummary {
  workspaceId: string;
  workspaceName: string;
  slug: string;
  role: WorkspaceRole;
  country: Country;
  currency: string;
  planTier: string;
  subscriptionStatus: string;
  availableCredits: number;
}

export interface UserSessionSummary {
  id: string;
  activeWorkspaceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastActivityAt: string;
  idleExpiresAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

export interface AuthenticatedSessionContext {
  sessionId: string;
  userId: string;
  email: string;
  emailVerified: boolean;
  platformRole: PlatformRole;
  user: PublicUserRecord;
  csrfToken: string;
  activeWorkspaceId: string | null;
  workspaceRole: WorkspaceRole | null;
  activeWorkspace: WorkspaceBalanceSummary | null;
  workspaces: WorkspaceMembershipSummary[];
  country: Country;
  expiresAt: string;
  idleExpiresAt: string;
}

export function getSessionCookieName(
  isProduction = process.env.NODE_ENV === 'production'
): string {
  return isProduction ? SESSION_COOKIE_PROD : SESSION_COOKIE_DEV;
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

function getIdleTtlSeconds(override?: number): number {
  if (typeof override === 'number' && override > 0) return override;
  const fromEnv = Number(process.env.SESSION_IDLE_TTL_SECONDS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_IDLE_TTL_SECONDS;
}

function getAbsoluteTtlSeconds(override?: number): number {
  if (typeof override === 'number' && override > 0) return override;
  const fromEnv = Number(process.env.SESSION_ABSOLUTE_TTL_SECONDS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : DEFAULT_ABSOLUTE_TTL_SECONDS;
}

export function buildSessionCookieHeader(
  rawToken: string,
  expiresAt: Date,
  isProduction = process.env.NODE_ENV === 'production'
): string {
  const name = getSessionCookieName(isProduction);
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  const parts = [
    `${name}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];
  if (isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function buildClearSessionCookieHeader(
  isProduction = process.env.NODE_ENV === 'production'
): string {
  const name = getSessionCookieName(isProduction);
  const parts = [
    `${name}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];
  if (isProduction) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawVal = part.slice(eqIndex + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(rawVal);
    } catch {
      result[key] = rawVal;
    }
  }
  return result;
}

export function extractSessionToken(
  request: Request,
  isProduction = process.env.NODE_ENV === 'production'
): string | null {
  const cookies = parseCookieHeader(request.headers.get('cookie'));
  if (isProduction) {
    const token = cookies[SESSION_COOKIE_PROD]?.trim();
    return token && token.length > 0 ? token : null;
  }
  const token = (cookies[SESSION_COOKIE_DEV] ?? cookies[SESSION_COOKIE_PROD])?.trim();
  return token && token.length > 0 ? token : null;
}

export async function createSession(params: {
  userId: string;
  activeWorkspaceId?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
  rotateFromRawToken?: string | null;
  idleTtlSeconds?: number;
  absoluteTtlSeconds?: number;
  isProduction?: boolean;
}): Promise<{
  rawToken: string;
  cookieHeader: string;
  session: SessionRecord;
}> {
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(rawToken);
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const idleTtlSec = getIdleTtlSeconds(params.idleTtlSeconds);
  const absTtlSec = getAbsoluteTtlSeconds(params.absoluteTtlSeconds);
  const expiresAtDate = new Date(nowMs + absTtlSec * 1000);
  const idleExpiresAtDate = new Date(Math.min(nowMs + idleTtlSec * 1000, expiresAtDate.getTime()));
  const expiresAt = expiresAtDate.toISOString();
  const idleExpiresAt = idleExpiresAtDate.toISOString();
  const sessionId = `sess-${crypto.randomUUID()}`;

  const authRepo = getAuthRepository();
  const session = await authRepo.createSession({
    id: sessionId,
    userId: params.userId,
    activeWorkspaceId: params.activeWorkspaceId ?? null,
    tokenHash,
    csrfToken,
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
    nowIso,
    idleExpiresAt,
    expiresAt,
    rotateFromTokenHash: params.rotateFromRawToken
      ? hashSessionToken(params.rotateFromRawToken)
      : null,
  });

  const cookieHeader = buildSessionCookieHeader(rawToken, expiresAtDate, params.isProduction);
  return { rawToken, cookieHeader, session };
}

export async function getWorkspacesForUser(userId: string): Promise<WorkspaceMembershipSummary[]> {
  const authRepo = getAuthRepository();
  return authRepo.getWorkspacesForUser(userId);
}

export async function resolveOptionalSession(
  request: Request,
  options?: { isProduction?: boolean; touchActivity?: boolean }
): Promise<AuthenticatedSessionContext | null> {
  const rawToken = extractSessionToken(request, options?.isProduction);
  if (!rawToken) {
    return null;
  }

  const tokenHash = hashSessionToken(rawToken);
  const authRepo = getAuthRepository();
  const row = await authRepo.findSessionByTokenHash(tokenHash);

  if (!row || row.revokedAt) {
    return null;
  }

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const expiresAtMs = Date.parse(String(row.expiresAt));
  const idleExpiresAtMs = Date.parse(String(row.idleExpiresAt));

  if (!Number.isFinite(expiresAtMs) || nowMs > expiresAtMs) {
    await authRepo.revokeSessionById(row.sessionId, row.userId, 'ABSOLUTE_EXPIRED');
    return null;
  }

  if (!Number.isFinite(idleExpiresAtMs) || nowMs > idleExpiresAtMs) {
    await authRepo.revokeSessionById(row.sessionId, row.userId, 'IDLE_EXPIRED');
    return null;
  }

  let updatedIdleExpiresAt = String(row.idleExpiresAt);
  if (options?.touchActivity !== false) {
    const nextIdleMs = Math.min(nowMs + getIdleTtlSeconds() * 1000, expiresAtMs);
    updatedIdleExpiresAt = new Date(nextIdleMs).toISOString();
    await authRepo.touchSession(row.sessionId, nowIso, updatedIdleExpiresAt);
  }

  const userId = String(row.userId);
  const platformRole = row.userRole;

  const user: PublicUserRecord = {
    id: userId,
    email: String(row.email),
    name: row.name ? String(row.name) : null,
    phone: row.phone ? String(row.phone) : null,
    role: platformRole,
    country: row.userCountry,
    locale: row.userLocale,
    emailVerified: Boolean(row.emailVerifiedAt),
    createdAt: String(row.userCreatedAt),
  };

  const workspaces = await getWorkspacesForUser(userId);
  const requestedActiveWsId = row.activeWorkspaceId ? String(row.activeWorkspaceId) : null;
  let workspaceRole: WorkspaceRole | null = null;
  let activeWorkspace: WorkspaceBalanceSummary | null = null;
  let activeWorkspaceId: string | null = requestedActiveWsId;

  if (requestedActiveWsId) {
    const matchedMembership = workspaces.find((w) => w.workspaceId === requestedActiveWsId);
    if (matchedMembership) {
      workspaceRole = matchedMembership.role;
      const ledger = new CreditLedgerService();
      activeWorkspace = await ledger.getWorkspaceBalance(requestedActiveWsId);
    }
  } else if (workspaces.length > 0 && platformRole === 'USER') {
    const first = workspaces[0];
    activeWorkspaceId = first.workspaceId;
    workspaceRole = first.role;
    const ledger = new CreditLedgerService();
    activeWorkspace = await ledger.getWorkspaceBalance(first.workspaceId);
  }

  const country: Country =
    activeWorkspace?.country === 'SA' || (!activeWorkspace && user.country === 'SA')
      ? 'SA'
      : 'EG';

  return {
    sessionId: String(row.sessionId),
    userId,
    email: user.email,
    emailVerified: user.emailVerified,
    platformRole,
    user,
    csrfToken: String(row.csrfToken),
    activeWorkspaceId,
    workspaceRole,
    activeWorkspace,
    workspaces,
    country,
    expiresAt: String(row.expiresAt),
    idleExpiresAt: updatedIdleExpiresAt,
  };
}

export async function resolveAuthenticatedSession(
  request: Request,
  options?: { requireWorkspace?: boolean; isProduction?: boolean; touchActivity?: boolean }
): Promise<AuthenticatedSessionContext> {
  const session = await resolveOptionalSession(request, options);
  if (!session) {
    throw new Error('UNAUTHORIZED: Authentication required');
  }
  if (
    options?.requireWorkspace &&
    (!session.activeWorkspaceId || !session.activeWorkspace || !session.workspaceRole)
  ) {
    throw new Error('FORBIDDEN: Active workspace membership is required');
  }
  return session;
}

export async function revokeSessionByRawToken(
  rawToken: string,
  reason = 'LOGOUT'
): Promise<boolean> {
  if (!rawToken) return false;
  const tokenHash = hashSessionToken(rawToken);
  const authRepo = getAuthRepository();
  return authRepo.revokeSessionByTokenHash(tokenHash, reason);
}

export async function revokeSessionById(
  sessionId: string,
  ownerUserId: string,
  reason = 'USER_REVOKED'
): Promise<boolean> {
  const authRepo = getAuthRepository();
  return authRepo.revokeSessionById(sessionId, ownerUserId, reason);
}

export async function revokeAllUserSessions(
  userId: string,
  reason = 'REVOKE_ALL',
  exceptSessionId?: string
): Promise<number> {
  const authRepo = getAuthRepository();
  return authRepo.revokeAllUserSessions(userId, reason, exceptSessionId);
}

export async function listActiveUserSessions(
  userId: string,
  currentSessionId?: string
): Promise<UserSessionSummary[]> {
  const authRepo = getAuthRepository();
  return authRepo.listActiveSessions(userId, currentSessionId);
}

export async function switchSessionActiveWorkspace(
  sessionId: string,
  userId: string,
  targetWorkspaceId: string
): Promise<WorkspaceBalanceSummary> {
  const authRepo = getAuthRepository();
  const workspaces = await authRepo.getWorkspacesForUser(userId);
  const membership = workspaces.find((w) => w.workspaceId === targetWorkspaceId);

  if (!membership) {
    throw new Error(`FORBIDDEN: User ${userId} is not a member of workspace ${targetWorkspaceId}`);
  }

  await authRepo.setActiveWorkspace(sessionId, userId, targetWorkspaceId);

  const ledger = new CreditLedgerService();
  return ledger.getWorkspaceBalance(targetWorkspaceId);
}
