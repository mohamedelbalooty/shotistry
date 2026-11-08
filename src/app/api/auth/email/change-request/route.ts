import { z } from 'zod';
import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import { enforceRateLimitPolicies } from '../../../../../lib/security/rate-limit.ts';
import { getAuthRepository } from '../../../../../lib/db/repositories/auth-repository.ts';
import { verifyPassword } from '../../../../../lib/auth/password.ts';
import { createActionToken } from '../../../../../lib/auth/action-tokens.ts';
import {
  getEmailTransport,
  renderEmailChangeConfirmTemplate,
  renderEmailChangeNoticeTemplate,
} from '../../../../../lib/email/index.ts';

const changeRequestSchema = z.object({
  newEmail: z.string().trim().email().max(254),
  currentPassword: z.string().min(1).max(128),
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
      'auth:email_change:userId',
      { userId: session.userId }
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

    const parsed = changeRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: 'Valid new email address and current password are required' },
        { status: 400 }
      );
    }

    const authRepo = getAuthRepository();
    const user = await authRepo.findUserById(session.userId);
    if (!user || !user.passwordHash) {
      return Response.json(
        { success: false, error: 'User account not found' },
        { status: 404 }
      );
    }

    const validPassword = await verifyPassword(
      parsed.data.currentPassword,
      user.passwordHash
    );
    if (!validPassword) {
      return Response.json(
        { success: false, error: 'Current password is incorrect' },
        { status: 401 }
      );
    }

    const normalizedNewEmail = parsed.data.newEmail.trim().toLowerCase();
    if (normalizedNewEmail === user.email.trim().toLowerCase()) {
      return Response.json(
        { success: false, error: 'New email address cannot be identical to current email' },
        { status: 400 }
      );
    }

    // Check if new email is already allocated to another account
    const existingOther = await authRepo.findUserByEmail(normalizedNewEmail);
    if (existingOther) {
      // Anti-enumeration: return uniform 202 without issuing token or sending email
      return Response.json(
        {
          success: true,
          accepted: true,
          message:
            'If the email address is eligible, confirmation instructions have been sent.',
        },
        { status: 202, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Issue EMAIL_CHANGE token (15 minute TTL)
    const { rawToken } = await createActionToken({
      userId: user.id,
      type: 'EMAIL_CHANGE',
      targetEmail: normalizedNewEmail,
      ttlMinutes: 15,
      revokeReason: 'NEW_EMAIL_CHANGE_REQUESTED',
    });

    try {
      const transport = getEmailTransport();

      // 1. Send confirmation link strictly to the NEW email
      const confirmTemplate = renderEmailChangeConfirmTemplate({
        name: user.name,
        targetEmail: normalizedNewEmail,
        token: rawToken,
        locale: user.locale,
      });

      await transport.send({
        to: normalizedNewEmail,
        subject: confirmTemplate.subject,
        html: confirmTemplate.html,
        text: confirmTemplate.text,
        idempotencyKey: `email:change:confirm:${user.id}:${rawToken.slice(0, 16)}`,
      });

      // 2. Send security notice to CURRENT email (NO link or token)
      const noticeTemplate = renderEmailChangeNoticeTemplate({
        name: user.name,
        currentEmail: user.email,
        newEmail: normalizedNewEmail,
        locale: user.locale,
      });

      await transport.send({
        to: user.email,
        subject: noticeTemplate.subject,
        html: noticeTemplate.html,
        text: noticeTemplate.text,
        idempotencyKey: `email:change:notice:${user.id}:${rawToken.slice(0, 16)}`,
      });
    } catch (emailErr) {
      console.error('Failed to dispatch email change messages:', emailErr);
    }

    return Response.json(
      {
        success: true,
        accepted: true,
        message:
          'If the email address is eligible, confirmation instructions have been sent.',
      },
      { status: 202, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Email change request failed';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
