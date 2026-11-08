import { resolveDbDriver } from '../db/driver.ts';
import type {
  RateLimitBackend,
  RateLimitDecision,
  RateLimitStore,
} from './rate-limit/types.ts';
import { RateLimitBackendUnavailableError } from './rate-limit/types.ts';
import { getClientIp, normalizeIpForRateLimit } from './rate-limit/client-ip.ts';
import {
  RATE_LIMIT_POLICIES,
  buildRateLimitKey,
} from './rate-limit/policies.ts';
import type { RateLimitPolicyName } from './rate-limit/policies.ts';
import {
  MemoryRateLimitStore,
  resetMemoryRateLimitStore,
} from './rate-limit/memory-store.ts';
import {
  UpstashRateLimitStore,
  createUpstashRateLimitStore,
} from './rate-limit/upstash-store.ts';
import { PostgresRateLimitStore } from './rate-limit/postgres-store.ts';

export * from './rate-limit/types.ts';
export * from './rate-limit/client-ip.ts';
export * from './rate-limit/policies.ts';

function isValidUpstashConfig(url?: string, token?: string): boolean {
  if (!url || !token) return false;
  if (!url.startsWith('https://')) return false;
  if (
    url.includes('your-upstash') ||
    url.includes('placeholder') ||
    url.includes('changeme')
  ) {
    return false;
  }
  if (token === 'changeme' || token.length < 8) {
    return false;
  }
  return true;
}

/**
 * Resolves the active RateLimitStore implementation according to ADR-005 precedence.
 */
export function resolveRateLimitStore(): RateLimitStore {
  const override = process.env.SHOTISTRY_RATE_LIMIT_BACKEND;

  if (override === 'memory') {
    if (process.env.NODE_ENV === 'production') {
      throw new RateLimitBackendUnavailableError(
        'In-memory rate limiter is strictly forbidden in production environments'
      );
    }
    return new MemoryRateLimitStore();
  }

  if (override === 'upstash') {
    return createUpstashRateLimitStore();
  }

  if (override === 'postgres') {
    return new PostgresRateLimitStore();
  }

  // Precedence 1: Upstash Redis (if configured with valid non-placeholder values)
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (isValidUpstashConfig(upstashUrl, upstashToken)) {
    return createUpstashRateLimitStore();
  }

  // Precedence 2: PostgreSQL distributed rate limiting
  if (resolveDbDriver() === 'postgres') {
    return new PostgresRateLimitStore();
  }

  // Precedence 3: Memory rate limiting (development and testing ONLY)
  if (process.env.NODE_ENV !== 'production') {
    return new MemoryRateLimitStore();
  }

  // Fail-closed in production
  throw new RateLimitBackendUnavailableError(
    'Rate limiting backend is unconfigured or unavailable in production'
  );
}

/**
 * Consumes a rate limit bucket using the active backend store.
 */
export async function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitDecision> {
  const store = resolveRateLimitStore();
  return store.consume(key, limit, windowMs);
}

export interface PolicyIdentities {
  ip?: string;
  email?: string;
  userId?: string;
  workspaceId?: string;
}

/**
 * Enforces a defined rate limit policy against a request.
 * Returns a Response (429 or 503) if rate limit is exhausted or backend fails,
 * or null if the request is permitted.
 */
export async function enforceRateLimitPolicies(
  request: Request,
  policyName: RateLimitPolicyName,
  identities: PolicyIdentities = {}
): Promise<Response | null> {
  const policy = RATE_LIMIT_POLICIES[policyName];
  if (!policy) {
    return null;
  }

  const clientIp = identities.ip ?? getClientIp(request);
  const normalizedIp = normalizeIpForRateLimit(clientIp);

  let identity = '';
  switch (policyName) {
    case 'auth:login:ip':
    case 'auth:register:ip':
    case 'auth:verify_email:resend:ip':
    case 'auth:forgot_password:ip':
    case 'auth:reset_password:ip':
      identity = normalizedIp;
      break;
    case 'auth:login:acct':
      identity = `${normalizedIp}:${identities.email ?? ''}`;
      break;
    case 'auth:login:email_lock':
    case 'auth:verify_email:resend:email':
    case 'auth:forgot_password:email':
      identity = identities.email ?? '';
      break;
    case 'auth:password:userId':
    case 'auth:email_change:userId':
    case 'admin:credits:adjust:actor':
    case 'admin:metrics:actor':
      identity = identities.userId ?? '';
      break;
    case 'photoshoots:generate:ws':
    case 'billing:checkout_intent:ws':
      identity = identities.workspaceId ?? '';
      break;
    default:
      identity = normalizedIp;
  }

  const key = buildRateLimitKey(policyName, identity);

  try {
    const decision = await consumeRateLimit(key, policy.limit, policy.windowMs);
    if (!decision.allowed) {
      return Response.json(
        {
          success: false,
          error: 'Too many requests. Please try again later.',
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(decision.retryAfterSeconds),
            'Cache-Control': 'no-store',
          },
        }
      );
    }
    return null;
  } catch (err: unknown) {
    if (err instanceof RateLimitBackendUnavailableError) {
      if (process.env.NODE_ENV === 'production') {
        return Response.json(
          {
            success: false,
            code: err.code,
            error: 'Rate limiting service is unavailable',
          },
          {
            status: 503,
            headers: {
              'Retry-After': String(err.retryAfterSeconds),
              'Cache-Control': 'no-store',
            },
          }
        );
      }
    }
    throw err;
  }
}

/**
 * Returns current status of rate limiter infrastructure for admin metrics.
 */
export function getRateLimiterStatus(): RateLimitBackend {
  try {
    const store = resolveRateLimitStore();
    return store.backend;
  } catch {
    return 'unavailable';
  }
}

/**
 * Resets the active rate limit store for tests.
 * Throws in production.
 */
export function resetRateLimitsForTests(): void {
  resetMemoryRateLimitStore();
}
