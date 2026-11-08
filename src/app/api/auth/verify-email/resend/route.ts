import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import {
  getClientIp,
  enforceRateLimitPolicies,
} from '../../../../../lib/security/rate-limit.ts';
import { getAuthRepository } from '../../../../../lib/db/repositories/auth-repository.ts';
import { createActionToken } from '../../../../../lib/auth/action-tokens.ts';
import {
  getEmailTransport,
  renderVerifyEmailTemplate,
  EmailTransportUnavailableError,
  EmailRateLimitedError,
} from '../../../../../lib/email/index.ts';

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

    const clientIp = getClientIp(request);
    const ipBlocked = await enforceRateLimitPolicies(
      request,
      'auth:verify_email:resend:ip',
      { ip: clientIp }
    );
    if (ipBlocked) return ipBlocked;

    const emailBlocked = await enforceRateLimitPolicies(
      request,
      'auth:verify_email:resend:email',
      { email: session.email }
    );
    if (emailBlocked) return emailBlocked;

    const authRepo = getAuthRepository();
    const user = await authRepo.findUserById(session.userId);
    if (!user) {
      return Response.json(
        { success: false, error: 'User account not found' },
        { status: 404 }
      );
    }

    if (user.emailVerifiedAt) {
      return Response.json(
        { success: true, alreadyVerified: true },
        { status: 200, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const { rawToken } = await createActionToken({
      userId: user.id,
      type: 'EMAIL_VERIFY',
      targetEmail: user.email,
      ttlMinutes: 30,
      revokeReason: 'USER_RESEND_VERIFICATION',
    });

    try {
      const transport = getEmailTransport();
      const template = renderVerifyEmailTemplate({
        name: user.name,
        targetEmail: user.email,
        token: rawToken,
        locale: user.locale,
      });

      await transport.send({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        idempotencyKey: `email:verify:resend:${user.id}:${Date.now()}`,
      });
    } catch (err: unknown) {
      if (err instanceof EmailTransportUnavailableError) {
        return Response.json(
          {
            success: false,
            code: 'EMAIL_SERVICE_UNAVAILABLE',
            error: 'Transactional email service is unavailable',
          },
          { status: 503, headers: { 'Cache-Control': 'no-store' } }
        );
      }
      if (err instanceof EmailRateLimitedError) {
        return Response.json(
          {
            success: false,
            code: 'EMAIL_RATE_LIMITED',
            error: 'Email delivery rate limit exceeded',
          },
          {
            status: 429,
            headers: {
              'Retry-After': String(err.retryAfterSeconds),
              'Cache-Control': 'no-store',
            },
          }
        );
      }
      throw err;
    }

    return Response.json(
      { success: true, sent: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Resend verification failed';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
