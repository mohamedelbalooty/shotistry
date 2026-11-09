import { z } from 'zod';
import { getAuthRepository } from '../../../../lib/db/repositories/auth-repository.ts';
import { getActionTokenRepository } from '../../../../lib/db/repositories/action-token-repository.ts';
import { consumeActionToken } from '../../../../lib/auth/action-tokens.ts';
import { hashPassword, validatePasswordStrength } from '../../../../lib/auth/password.ts';
import { PasswordHasherBusyError } from '../../../../lib/auth/hash-semaphore.ts';
import { buildClearSessionCookieHeader } from '../../../../lib/auth/session.ts';
import { enforceRateLimitPolicies } from '../../../../lib/security/rate-limit.ts';
import { getClientIp } from '../../../../lib/security/rate-limit/client-ip.ts';
import { getEmailTransport } from '../../../../lib/email/index.ts';
import { renderPasswordChangedNoticeTemplate } from '../../../../lib/email/templates.ts';
import { createScopedLogger } from '../../../../lib/observability/logger.ts';

const logger = createScopedLogger('auth:reset-password');

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  newPassword: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  try {
    const ipBlocked = await enforceRateLimitPolicies(
      request,
      'auth:reset_password:ip'
    );
    if (ipBlocked) return ipBlocked;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid input parameters',
        },
        { status: 400 }
      );
    }

    // 1. Password strength validation (BEFORE token consumption)
    const strength = validatePasswordStrength(parsed.data.newPassword, 8);
    if (!strength.valid) {
      return Response.json(
        {
          success: false,
          error: strength.reason || 'Password does not meet strength requirements',
        },
        { status: 400 }
      );
    }

    // 2. Pre-hash password so hash concurrency limits don't burn tokens
    const passwordHash = await hashPassword(parsed.data.newPassword);

    // 3. Atomically consume token
    const tokenRecord = await consumeActionToken({
      rawToken: parsed.data.token,
      expectedType: 'PASSWORD_RESET',
    });

    if (!tokenRecord) {
      return Response.json(
        {
          success: false,
          error:
            'INVALID_OR_EXPIRED_TOKEN: Password reset token is invalid, expired, or has already been used',
        },
        { status: 400 }
      );
    }

    // 4. Update user password and revoke all sessions
    const authRepo = getAuthRepository();
    const user = await authRepo.findUserById(tokenRecord.userId);
    if (!user) {
      return Response.json(
        { success: false, error: 'User account not found' },
        { status: 400 }
      );
    }

    await authRepo.updatePasswordHash(user.id, passwordHash, {
      bumpPasswordUpdatedAt: true,
      revokeSessionsReason: 'PASSWORD_RESET',
    });

    // 5. Revoke outstanding password reset and email change tokens for user
    const actionTokenRepo = getActionTokenRepository();
    await actionTokenRepo.revokeActiveTokensForUser(
      user.id,
      'PASSWORD_RESET',
      'PASSWORD_RESET_COMPLETED'
    );
    await actionTokenRepo.revokeActiveTokensForUser(
      user.id,
      'EMAIL_CHANGE',
      'PASSWORD_RESET_COMPLETED'
    );

    // 6. Send security notice email
    try {
      const transport = getEmailTransport();
      const rendered = renderPasswordChangedNoticeTemplate({
        name: user.name,
        targetEmail: user.email,
        locale: 'en',
        ipAddress: getClientIp(request),
        userAgent: request.headers.get('user-agent'),
      });
      await transport.send({
        to: user.email,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        idempotencyKey: `pw-reset-notice:${user.id}:${Date.now()}`,
      });
    } catch (emailErr) {
      logger.error('Failed to send password changed notice email', emailErr);
    }

    const clearCookie = buildClearSessionCookieHeader();

    return Response.json(
      {
        success: true,
        message: 'Password has been reset successfully.',
      },
      {
        status: 200,
        headers: {
          'Set-Cookie': clearCookie,
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
    const message =
      error instanceof Error ? error.message : 'Failed to reset password';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
