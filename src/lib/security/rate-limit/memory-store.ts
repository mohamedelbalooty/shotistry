import type { RateLimitStore, RateLimitDecision } from './types.ts';

interface BucketEntry {
  count: number;
  windowStart: number;
  expiresAt: number;
}

const memoryStore = new Map<string, BucketEntry>();

export class MemoryRateLimitStore implements RateLimitStore {
  readonly backend = 'memory' as const;

  async consume(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    const existing = memoryStore.get(key);

    if (!existing || now >= existing.expiresAt) {
      const expiresAt = now + windowMs;
      memoryStore.set(key, {
        count: 1,
        windowStart: now,
        expiresAt,
      });
      return {
        allowed: true,
        remaining: Math.max(0, limit - 1),
        retryAfterSeconds: Math.ceil(windowMs / 1000),
        backend: this.backend,
      };
    }

    existing.count++;
    const allowed = existing.count <= limit;
    const remaining = Math.max(0, limit - existing.count);
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.expiresAt - now) / 1000));

    return {
      allowed,
      remaining,
      retryAfterSeconds,
      backend: this.backend,
    };
  }
}

/**
 * Resets the in-memory rate limit store for test isolation.
 * Throws an error in production environments.
 */
export function resetMemoryRateLimitStore(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Security Violation: Cannot reset rate limits in production');
  }
  memoryStore.clear();
}
