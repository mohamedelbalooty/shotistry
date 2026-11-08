import { z } from 'zod';
import { CreditLedgerService } from '../../../../lib/ledger/credit-ledger-service.ts';
import { hashPassword, validatePasswordStrength } from '../../../../lib/auth/password.ts';
import { PasswordHasherBusyError } from '../../../../lib/auth/hash-semaphore.ts';
import { createSession, extractSessionToken, getWorkspacesForUser } from '../../../../lib/auth/session.ts';
import { createActionToken } from '../../../../lib/auth/action-tokens.ts';
import {
  getEmailTransport,
  renderVerifyEmailTemplate,
} from '../../../../lib/email/index.ts';
import { validateSameOrigin } from '../../../../lib/security/csrf.ts';
import {
  getClientIp,
  enforceRateLimitPolicies,
} from '../../../../lib/security/rate-limit.ts';

const registerSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  name: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  country: z.enum(['EG', 'SA']).optional().default('EG'),
  locale: z.enum(['ar', 'en']).optional().default('ar'),
  workspaceName: z.string().trim().min(2).max(120).optional(),
});

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

    const clientIp = getClientIp(request);
    const rateBlocked = await enforceRateLimitPolicies(
      request,
      'auth:register:ip',
      { ip: clientIp }
    );
    if (rateBlocked) return rateBlocked;

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    if (rawBody && typeof rawBody === 'object') {
      const candidate = rawBody as Record<string, unknown>;
      if (candidate.role !== undefined || candidate.platformRole !== undefined) {
        return Response.json(
          { success: false, error: 'FORBIDDEN: Client-supplied role attributes are rejected' },
          { status: 403 }
        );
      }
    }

    const parsed = registerSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          error: parsed.error.issues[0]?.message || 'Invalid registration details',
        },
        { status: 400 }
      );
    }

    const pwStrength = validatePasswordStrength(parsed.data.password, 8);
    if (!pwStrength.valid) {
      return Response.json(
        { success: false, error: pwStrength.reason || 'Weak password' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const ledger = new CreditLedgerService();

    const { user, workspace } = await ledger.registerMerchantWithInitialWorkspace({
      email: parsed.data.email,
      passwordHash,
      name: parsed.data.name,
      phone: parsed.data.phone,
      country: parsed.data.country,
      locale: parsed.data.locale,
      workspaceName: parsed.data.workspaceName,
    });

    const priorRawToken = extractSessionToken(request);
    const createdSession = await createSession({
      userId: user.id,
      activeWorkspaceId: workspace.workspaceId,
      userAgent: request.headers.get('user-agent'),
      ipAddress: clientIp,
      rotateFromRawToken: priorRawToken,
    });

    const workspaces = await getWorkspacesForUser(user.id);

    let verificationEmailSent = false;
    try {
      const { rawToken } = await createActionToken({
        userId: user.id,
        type: 'EMAIL_VERIFY',
        targetEmail: user.email,
        ttlMinutes: 30,
      });

      const transport = getEmailTransport();
      const template = renderVerifyEmailTemplate({
        name: user.name,
        targetEmail: user.email,
        token: rawToken,
        locale: parsed.data.locale ?? 'ar',
      });

      await transport.send({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
        idempotencyKey: `email:verify:initial:${user.id}`,
      });
      verificationEmailSent = true;
    } catch (emailErr) {
      // Registration succeeds even if email transport fails or is unconfigured
      console.error('Failed to dispatch initial verification email:', emailErr);
    }

    return Response.json(
      {
        success: true,
        user,
        activeWorkspace: workspace,
        workspaceRole: 'OWNER',
        workspaces,
        csrfToken: createdSession.session.csrfToken,
        verificationEmailSent,
      },
      {
        status: 201,
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
    const message = error instanceof Error ? error.message : 'Registration failed';
    if (message.startsWith('CONFLICT:')) {
      return Response.json(
        {
          success: false,
          error: 'An account could not be created with the provided email address.',
        },
        { status: 409 }
      );
    }
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
