import type {
  RateLimitStore,
  RateLimitDecision,
} from './types.ts';
import { RateLimitBackendUnavailableError } from './types.ts';

const LUA_RATE_LIMIT_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local pttl = redis.call('PTTL', KEYS[1])
if pttl < 0 then
  redis.call('PEXPIRE', KEYS[1], ARGV[1])
  pttl = tonumber(ARGV[1])
end
return { current, pttl }
`.trim();

export interface UpstashRateLimitStoreOptions {
  url?: string;
  token?: string;
  fetchImpl?: typeof fetch;
}

export class UpstashRateLimitStore implements RateLimitStore {
  readonly backend = 'upstash' as const;
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: UpstashRateLimitStoreOptions = {}) {
    const rawUrl = options.url ?? process.env.UPSTASH_REDIS_REST_URL ?? '';
    const rawToken = options.token ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? '';

    this.url = rawUrl.replace(/\/+$/, '');
    this.token = rawToken;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async consume(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitDecision> {
    if (!this.url || !this.token) {
      throw new RateLimitBackendUnavailableError(
        'Upstash Redis REST URL or Token is missing'
      );
    }

    try {
      const response = await this.fetchImpl(`${this.url}/eval`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([LUA_RATE_LIMIT_SCRIPT, 1, key, String(windowMs)]),
        signal: AbortSignal.timeout(1500),
      });

      if (!response.ok) {
        throw new Error(
          `Upstash HTTP error: ${response.status} ${response.statusText}`
        );
      }

      const data = (await response.json()) as {
        result?: [number, number];
        error?: string;
      };

      if (!data || !Array.isArray(data.result) || data.result.length < 2) {
        throw new Error(data?.error || 'Invalid Upstash /eval response structure');
      }

      const [count, pttl] = data.result;
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const retryAfterSeconds = Math.max(1, Math.ceil(pttl / 1000));

      return {
        allowed,
        remaining,
        retryAfterSeconds,
        backend: this.backend,
      };
    } catch (err: unknown) {
      if (err instanceof RateLimitBackendUnavailableError) {
        throw err;
      }
      throw new RateLimitBackendUnavailableError(
        `Upstash rate limiting failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}

export function createUpstashRateLimitStore(
  options: UpstashRateLimitStoreOptions = {}
): UpstashRateLimitStore {
  return new UpstashRateLimitStore(options);
}
