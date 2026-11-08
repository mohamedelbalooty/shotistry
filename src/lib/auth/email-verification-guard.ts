import type { AuthenticatedSessionContext } from './session.ts';

/**
 * Enforces email verification gating (ADR-007).
 * Runs after authentication and CSRF checks, before business logic.
 * Returns HTTP 403 Response if email is unverified, or null if allowed.
 */
export function requireVerifiedEmail(
  session: AuthenticatedSessionContext
): Response | null {
  if (!session.emailVerified && !session.user?.emailVerified) {
    return Response.json(
      {
        success: false,
        code: 'EMAIL_VERIFICATION_REQUIRED',
        error:
          'Email verification is required before performing this operation',
      },
      {
        status: 403,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
  return null;
}
