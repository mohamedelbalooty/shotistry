import crypto from 'node:crypto';

/**
 * Endpoint Rate-Limit Policies adhering strictly to the architecture specification.
 */
export const RATE_LIMIT_POLICIES = {
  'auth:login:ip': { limit: 15, windowMs: 15 * 60 * 1000 },
  'auth:login:acct': { limit: 7, windowMs: 15 * 60 * 1000 },
  'auth:login:email_lock': { limit: 20, windowMs: 60 * 60 * 1000 },
  'auth:register:ip': { limit: 6, windowMs: 60 * 60 * 1000 },
  'auth:password:userId': { limit: 5, windowMs: 15 * 60 * 1000 },
  'auth:verify_email:resend:ip': { limit: 5, windowMs: 60 * 60 * 1000 },
  'auth:verify_email:resend:email': { limit: 3, windowMs: 60 * 60 * 1000 },
  'auth:forgot_password:ip': { limit: 5, windowMs: 15 * 60 * 1000 },
  'auth:forgot_password:email': { limit: 3, windowMs: 15 * 60 * 1000 },
  'auth:reset_password:ip': { limit: 10, windowMs: 15 * 60 * 1000 },
  'auth:email_change:userId': { limit: 3, windowMs: 60 * 60 * 1000 },
  'admin:credits:adjust:actor': { limit: 30, windowMs: 60 * 1000 },
  'admin:metrics:actor': { limit: 60, windowMs: 60 * 1000 },
  'photoshoots:generate:ws': { limit: 30, windowMs: 60 * 1000 },
  'billing:checkout_intent:ws': { limit: 10, windowMs: 5 * 60 * 1000 },
} as const;

export type RateLimitPolicyName = keyof typeof RATE_LIMIT_POLICIES;

/**
 * Builds a PII-free bucket key using SHA-256 (prefix 24 hex chars).
 */
export function buildRateLimitKey(
  policyName: string,
  normalizedIdentity: string
): string {
  const hash = crypto
    .createHash('sha256')
    .update(normalizedIdentity.trim().toLowerCase())
    .digest('hex')
    .slice(0, 24);

  return `shotistry:rl:v1:${policyName}:${hash}`;
}
