import { z } from 'zod';
import { getAuthRepository } from '../../../../../lib/db/repositories/auth-repository.ts';
import { consumeActionToken } from '../../../../../lib/auth/action-tokens.ts';
import { validateSameOrigin } from '../../../../../lib/security/csrf.ts';

const confirmSchema = z.object({
  token: z.string().trim().min(20).max(256),
});

export async function POST(request: Request) {
  try {
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

    const parsed = confirmSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Verification token is required and must be valid format',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const tokenRecord = await consumeActionToken({
      rawToken: parsed.data.token,
      expectedType: 'EMAIL_VERIFY',
    });

    if (!tokenRecord) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Verification token is invalid, expired, or has already been used',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const authRepo = getAuthRepository();
    const user = await authRepo.findUserById(tokenRecord.userId);
    if (!user) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Associated user account not found',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (
      tokenRecord.targetEmail &&
      user.email.trim().toLowerCase() !== tokenRecord.targetEmail.trim().toLowerCase()
    ) {
      return Response.json(
        {
          success: false,
          code: 'INVALID_OR_EXPIRED_TOKEN',
          error: 'Verification token does not match user account email',
        },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    await authRepo.markEmailVerified(user.id);

    return Response.json(
      { success: true, verified: true },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
