import { z } from 'zod';
import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import { getAuthRepository } from '../../../../../lib/db/repositories/auth-repository.ts';
import { consumeActionToken } from '../../../../../lib/auth/action-tokens.ts';

const changeConfirmSchema = z.object({
  token: z.string().trim().min(20).max(256),
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON body' },
        { status: 400 }
      );
    }

    const parsed = changeConfirmSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Email change token is required and must be valid format',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const tokenRecord = await consumeActionToken({
      rawToken: parsed.data.token,
      expectedType: 'EMAIL_CHANGE',
    });

    if (!tokenRecord) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Email change token is invalid, expired, or has already been used',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (tokenRecord.userId !== session.userId) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Email change token does not belong to the current authenticated account',
        },
        { status: 403, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const targetEmail = tokenRecord.targetEmail;
    if (!targetEmail) {
      return Response.json(
        { success: false, error: 'Target email is missing on token' },
        { status: 400 }
      );
    }

    const authRepo = getAuthRepository();
    const existingOther = await authRepo.findUserByEmail(targetEmail);
    if (existingOther && existingOther.id !== session.userId) {
      return Response.json(
        {
          success: false,
          code: 'EMAIL_UNAVAILABLE',
          error: 'This email address was recently registered by another account',
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Atomically update user email and set emailVerifiedAt = now
    await authRepo.updateUserEmail(session.userId, targetEmail);

    // Keep current session active; revoke all other sessions with reason EMAIL_CHANGED
    await authRepo.revokeAllUserSessions(
      session.userId,
      'EMAIL_CHANGED',
      session.sessionId
    );

    return Response.json(
      {
        success: true,
        email: targetEmail,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Email change confirmation failed';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
