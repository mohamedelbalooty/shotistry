import crypto from 'node:crypto';
import { z } from 'zod';
import { getAuthRepository } from '../../../../lib/db/repositories/auth-repository.ts';
import { getAdminRepository } from '../../../../lib/db/repositories/admin-repository.ts';
import { createActionToken } from '../../../../lib/auth/action-tokens.ts';
import { enforceRateLimitPolicies } from '../../../../lib/security/rate-limit.ts';
import { getClientIp } from '../../../../lib/security/rate-limit/client-ip.ts';
import { getEmailTransport } from '../../../../lib/email/index.ts';
import { renderPasswordResetTemplate } from '../../../../lib/email/templates.ts';
import { createScopedLogger } from '../../../../lib/observability/logger.ts';

const logger = createScopedLogger('auth:forgot-password');

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(255),
});

const TIMING_FLOOR_MS = 50;

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const parsed = forgotPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Valid email is required',
        },
        { status: 400 }
      );
    }

    const normalizedEmail = parsed.data.email.toLowerCase();

    // 1. Rate limiting by IP and Email
    const ipBlocked = await enforceRateLimitPolicies(
      request,
      'auth:forgot_password:ip'
    );
    if (ipBlocked) return ipBlocked;

    const emailBlocked = await enforceRateLimitPolicies(
      request,
      'auth:forgot_password:email',
      { email: normalizedEmail }
    );
    if (emailBlocked) return emailBlocked;

    // 2. User lookup
    const authRepo = getAuthRepository();
    const user = await authRepo.findUserByEmail(normalizedEmail);

    if (user) {
      if (user.role === 'USER') {
        const { rawToken } = await createActionToken({
          userId: user.id,
          type: 'PASSWORD_RESET',
          targetEmail: user.email,
          ttlMinutes: 15,
        });

        try {
          const transport = getEmailTransport();
          const rendered = renderPasswordResetTemplate({
            name: user.name,
            targetEmail: user.email,
            token: rawToken,
            locale: 'en',
          });
          await transport.send({
            to: user.email,
            subject: rendered.subject,
            html: rendered.html,
            text: rendered.text,
            idempotencyKey: `pw-reset:${user.id}:${rawToken.slice(0, 16)}`,
          });
        } catch (emailErr) {
          logger.error('Failed to send password reset email', emailErr);
        }
      } else if (user.role === 'ADMIN' || user.role === 'SUPPORT') {
        // Privileged roles cannot reset password via self-service email flow
        const auditLogId = `audit-${crypto.randomUUID()}`;
        const adminRepo = getAdminRepository();
        await adminRepo.recordAuditLog({
          auditLogId,
          userId: user.id,
          action: 'PRIVILEGED_RESET_ATTEMPT',
          targetId: user.id,
          details: {
            email: user.email,
            role: user.role,
            ipAddress: getClientIp(request),
            userAgent: request.headers.get('user-agent'),
            attemptedAt: new Date().toISOString(),
          },
          ipAddress: getClientIp(request),
        });
      }
    } else {
      // Dummy work for non-existent account timing equivalence
      crypto
        .createHash('sha256')
        .update(crypto.randomBytes(32))
        .digest('hex');
    }

    // 3. Constant-time floor padding
    const elapsed = Date.now() - startTime;
    if (elapsed < TIMING_FLOOR_MS) {
      await new Promise((resolve) => setTimeout(resolve, TIMING_FLOOR_MS - elapsed));
    }

    return Response.json(
      {
        success: true,
        message:
          'If an account exists with this email, password reset instructions have been sent.',
      },
      {
        status: 202,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    if (elapsed < TIMING_FLOOR_MS) {
      await new Promise((resolve) => setTimeout(resolve, TIMING_FLOOR_MS - elapsed));
    }
    const message =
      error instanceof Error ? error.message : 'Failed to process request';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
