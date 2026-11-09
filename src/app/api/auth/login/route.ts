import { z } from 'zod';
import { getAuthRepository } from '../../../../lib/db/repositories/auth-repository.ts';
import {
  verifyPassword,
  hashPassword,
  needsPasswordRehash,
  constantTimeDummyVerify,
} from '../../../../lib/auth/password.ts';
import { PasswordHasherBusyError } from '../../../../lib/auth/hash-semaphore.ts';
import {
  createSession,
  extractSessionToken,
  getWorkspacesForUser,
} from '../../../../lib/auth/session.ts';
import { CreditLedgerService } from '../../../../lib/ledger/credit-ledger-service.ts';
import { validateSameOrigin } from '../../../../lib/security/csrf.ts';
import {
  getClientIp,
  enforceRateLimitPolicies,
} from '../../../../lib/security/rate-limit.ts';
import type { PlatformRole } from '../../../../lib/types/index.ts';
import { createScopedLogger } from '../../../../lib/observability/logger.ts';

const logger = createScopedLogger('auth:login');

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

const GENERIC_LOGIN_ERROR = 'Invalid email or password';

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get('content-type')?.toLowerCase() ?? '';
    if (!contentType.includes('application/json')) {
      return Response.json(
        { success: false, error: 'Content-Type must be application/json' },
        { status: 415 }
      );
    }

    const originCheck = validateSameOrigin(request);
    if (!originCheck.valid) {
      return Response.json(
        { success: false, error: originCheck.reason || 'Forbidden origin' },
        { status: 403 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const parsed = loginSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: GENERIC_LOGIN_ERROR },
        { status: 400 }
      );
    }

    const clientIp = getClientIp(request);
    const normalizedEmail = parsed.data.email.trim().toLowerCase();

    const ipBlocked = await enforceRateLimitPolicies(request, 'auth:login:ip', {
      ip: clientIp,
    });
    if (ipBlocked) return ipBlocked;

    const acctBlocked = await enforceRateLimitPolicies(
      request,
      'auth:login:acct',
      { ip: clientIp, email: normalizedEmail }
    );
    if (acctBlocked) return acctBlocked;

    const emailLocked = await enforceRateLimitPolicies(
      request,
      'auth:login:email_lock',
      { email: normalizedEmail }
    );
    if (emailLocked) return emailLocked;

    const authRepo = getAuthRepository();
    const userRow = await authRepo.findUserByEmail(normalizedEmail);

    if (!userRow || !userRow.passwordHash) {
      await constantTimeDummyVerify(parsed.data.password);
      return Response.json(
        { success: false, error: GENERIC_LOGIN_ERROR },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const validPassword = await verifyPassword(
      parsed.data.password,
      String(userRow.passwordHash)
    );
    if (!validPassword) {
      return Response.json(
        { success: false, error: GENERIC_LOGIN_ERROR },
        { status: 401, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const userId = String(userRow.id);

    if (needsPasswordRehash(String(userRow.passwordHash))) {
      try {
        const upgradedHash = await hashPassword(parsed.data.password);
        await authRepo.updatePasswordHash(userId, upgradedHash, {
          bumpPasswordUpdatedAt: false,
        });
      } catch (rehashError) {
        // Transparent rehash error must not fail user login
        logger.error('Failed to transparently rehash password', rehashError);
      }
    }

    const rawRole = String(userRow.role || 'USER').toUpperCase();
    const platformRole: PlatformRole =
      rawRole === 'ADMIN' || rawRole === 'SUPPORT' ? (rawRole as PlatformRole) : 'USER';

    const workspaces = await getWorkspacesForUser(userId);
    const initialWorkspace = workspaces[0] ?? null;

    const priorRawToken = extractSessionToken(request);
    const createdSession = await createSession({
      userId,
      activeWorkspaceId: initialWorkspace?.workspaceId ?? null,
      userAgent: request.headers.get('user-agent'),
      ipAddress: clientIp,
      rotateFromRawToken: priorRawToken,
    });

    const activeWorkspace = initialWorkspace
      ? await new CreditLedgerService().getWorkspaceBalance(initialWorkspace.workspaceId)
      : null;

    return Response.json(
      {
        success: true,
        user: {
          id: userId,
          email: String(userRow.email),
          name: userRow.name ? String(userRow.name) : null,
          phone: userRow.phone ? String(userRow.phone) : null,
          role: platformRole,
          country: String(userRow.country || 'EG') === 'SA' ? 'SA' : 'EG',
          locale: String(userRow.locale || 'ar') === 'en' ? 'en' : 'ar',
          emailVerified: Boolean(userRow.emailVerifiedAt),
          createdAt: String(userRow.createdAt),
        },
        activeWorkspace,
        workspaceRole: initialWorkspace?.role ?? null,
        workspaces,
        csrfToken: createdSession.session.csrfToken,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': createdSession.cookieHeader,
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    if (error instanceof PasswordHasherBusyError) {
      return Response.json(
        {
          success: false,
          code: error.code,
          error: error.message,
        },
        {
          status: 503,
          headers: {
            'Retry-After': String(error.retryAfterSeconds),
            'Cache-Control': 'no-store',
          },
        }
      );
    }
    const message = error instanceof Error ? error.message : 'Authentication failed';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
