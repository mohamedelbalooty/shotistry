import { z } from 'zod';
import { getAuthRepository } from '../../../../lib/db/repositories/auth-repository.ts';
import {
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
} from '../../../../lib/auth/password.ts';
import { PasswordHasherBusyError } from '../../../../lib/auth/hash-semaphore.ts';
import {
  createSession,
  resolveAuthenticatedSession,
} from '../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';
import { enforceRateLimitPolicies } from '../../../../lib/security/rate-limit.ts';
import { getClientIp } from '../../../../lib/security/rate-limit/client-ip.ts';
import { getEmailTransport } from '../../../../lib/email/index.ts';
import { renderPasswordChangedNoticeTemplate } from '../../../../lib/email/templates.ts';
import { createScopedLogger } from '../../../../lib/observability/logger.ts';

const logger = createScopedLogger('auth:password');

const passwordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const rateBlocked = await enforceRateLimitPolicies(
      request,
      'auth:password:userId',
      { userId: session.userId }
    );
    if (rateBlocked) return rateBlocked;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const parsed = passwordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid password input' },
        { status: 400 }
      );
    }

    const minLen = session.platformRole === 'ADMIN' ? 12 : 8;
    const strength = validatePasswordStrength(parsed.data.newPassword, minLen);
    if (!strength.valid) {
      return Response.json(
        { success: false, error: strength.reason || 'Weak password' },
        { status: 400 }
      );
    }

    const authRepo = getAuthRepository();
    const row = await authRepo.findUserById(session.userId);

    if (!row?.passwordHash || !(await verifyPassword(parsed.data.currentPassword, row.passwordHash))) {
      return Response.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    const newHash = await hashPassword(parsed.data.newPassword);

    await authRepo.updatePasswordHash(session.userId, newHash, {
      bumpPasswordUpdatedAt: true,
      revokeSessionsReason: 'PASSWORD_CHANGED',
    });

    const rotated = await createSession({
      userId: session.userId,
      activeWorkspaceId: session.activeWorkspaceId,
      userAgent: request.headers.get('user-agent'),
    });

    try {
      const emailTransport = getEmailTransport();
      const rendered = renderPasswordChangedNoticeTemplate({
        name: row.name,
        targetEmail: row.email,
        locale: 'en',
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
      });
      await emailTransport.send({
        to: row.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `pw-changed:${session.userId}:${Date.now()}`,
      });
    } catch (emailErr) {
      logger.error('Failed to dispatch password changed notice email', emailErr);
    }

    return Response.json(
      {
        success: true,
        csrfToken: rotated.session.csrfToken,
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': rotated.cookieHeader,
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
    const message = error instanceof Error ? error.message : 'Failed to change password';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
