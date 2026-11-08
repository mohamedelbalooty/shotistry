import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requirePlatformPermission } from '../../../../lib/auth/rbac.ts';
import { getAdminRepository } from '../../../../lib/db/repositories/admin-repository.ts';
import {
  enforceRateLimitPolicies,
  getRateLimiterStatus,
} from '../../../../lib/security/rate-limit.ts';

export async function GET(request: Request) {
  try {
    const session = await resolveAuthenticatedSession(request);
    requirePlatformPermission(session, 'platform:metrics:read');

    const rateBlocked = await enforceRateLimitPolicies(
      request,
      'admin:metrics:actor',
      { userId: session.userId }
    );
    if (rateBlocked) return rateBlocked;

    const adminRepo = getAdminRepository();
    const metrics = await adminRepo.getPlatformMetrics();

    return Response.json({
      ...metrics,
      infrastructure: {
        rateLimiter: getRateLimiterStatus(),
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch platform metrics';
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ error: message }, { status });
  }
}
