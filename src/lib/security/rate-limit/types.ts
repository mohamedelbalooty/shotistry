/**
 * Types and interfaces for multi-backend distributed rate limiting.
 */

export type RateLimitBackend = 'upstash' | 'postgres' | 'memory' | 'unavailable';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
  backend: RateLimitBackend;
}

export interface RateLimitStore {
  readonly backend: RateLimitBackend;
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision>;
}

export class RateLimitBackendUnavailableError extends Error {
  readonly code: string = 'RATE_LIMITER_UNAVAILABLE';
  readonly retryAfterSeconds: number = 5;

  constructor(
    message = 'Rate limiting backend is unavailable or unconfigured in production',
    retryAfterSeconds = 5
  ) {
    super(message);
    this.name = 'RateLimitBackendUnavailableError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
