import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getClientIp,
  normalizeIpForRateLimit,
} from '../src/lib/security/rate-limit/client-ip.ts';
import {
  buildRateLimitKey,
  RATE_LIMIT_POLICIES,
} from '../src/lib/security/rate-limit/policies.ts';
import {
  RateLimitBackendUnavailableError,
} from '../src/lib/security/rate-limit/types.ts';
import {
  createUpstashRateLimitStore,
} from '../src/lib/security/rate-limit/upstash-store.ts';
import {
  consumeRateLimit,
  resolveRateLimitStore,
  resetRateLimitsForTests,
  enforceRateLimitPolicies,
} from '../src/lib/security/rate-limit.ts';
import { POST as loginRoute } from '../src/app/api/auth/login/route.ts';

describe('Distributed Rate Limiting (Phase 3)', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...origEnv };
    resetRateLimitsForTests();
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  test('getClientIp prioritizes Vercel header when VERCEL=1 and ignores spoofed xff', () => {
    process.env.VERCEL = '1';
    const req = new Request('http://localhost:3000/api/auth/login', {
      headers: {
        'x-vercel-forwarded-for': '198.51.100.25',
        'x-forwarded-for': '1.2.3.4, 5.6.7.8',
      },
    });

    const ip = getClientIp(req);
    assert.equal(ip, '198.51.100.25');
  });

  test('getClientIp filters private proxy hops from x-forwarded-for', () => {
    delete process.env.VERCEL;
    const req = new Request('http://localhost:3000/api/auth/login', {
      headers: {
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
      },
    });

    const ip = getClientIp(req);
    assert.equal(ip, '203.0.113.9');
  });

  test('normalizeIpForRateLimit groups IPv6 into /64 network prefixes', () => {
    const ip1 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    const ip2 = '2001:db8:85a3::1';
    const normalized1 = normalizeIpForRateLimit(ip1);
    const normalized2 = normalizeIpForRateLimit(ip2);

    assert.equal(normalized1, '2001:0db8:85a3:0000::/64');
    assert.equal(normalized2, '2001:0db8:85a3:0000::/64');
    assert.equal(normalized1, normalized2, 'Same /64 prefix must produce identical buckets');
  });

  test('buildRateLimitKey produces PII-free SHA-256 hashed keys without raw email', () => {
    const rawEmail = 'merchant.confidential@riyadh.sa';
    const key = buildRateLimitKey('auth:login:email_lock', rawEmail);

    assert.ok(
      key.startsWith('shotistry:rl:v1:auth:login:email_lock:'),
      `Key has unexpected prefix: ${key}`
    );
    assert.ok(!key.includes('@'), 'Key must not contain raw email');
    assert.ok(!key.includes('riyadh'), 'Key must not leak email domain');

    // 24-character hex hash suffix
    const suffix = key.split(':').pop();
    assert.equal(suffix?.length, 24);
  });

  test('MemoryRateLimitStore sliding window tracks and expires counts', async () => {
    const key = 'test:sliding:key';
    const limit = 2;
    const windowMs = 50;

    const r1 = await consumeRateLimit(key, limit, windowMs);
    const r2 = await consumeRateLimit(key, limit, windowMs);
    const r3 = await consumeRateLimit(key, limit, windowMs);

    assert.equal(r1.allowed, true);
    assert.equal(r1.remaining, 1);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remaining, 0);
    assert.equal(r3.allowed, false);
    assert.ok(r3.retryAfterSeconds >= 1);

    // Wait for window expiration
    await new Promise((r) => setTimeout(r, 60));

    const r4 = await consumeRateLimit(key, limit, windowMs);
    assert.equal(r4.allowed, true);
  });

  test('UpstashRateLimitStore executes atomic Lua script via REST and handles responses', async () => {
    let capturedUrl = '';
    let capturedHeaders = {};
    let capturedBody = null;

    const mockFetch = async (url, options) => {
      capturedUrl = String(url);
      capturedHeaders = options.headers;
      capturedBody = JSON.parse(options.body);

      return {
        ok: true,
        status: 200,
        json: async () => ({
          result: [1, 55000], // [count, pttl]
        }),
      };
    };

    const store = createUpstashRateLimitStore({
      url: 'https://test-upstash.upstash.io',
      token: 'valid-test-token-abc',
      fetchImpl: mockFetch,
    });

    const res = await store.consume('test-key', 5, 60000);
    assert.equal(res.allowed, true);
    assert.equal(res.remaining, 4);
    assert.equal(res.backend, 'upstash');

    assert.equal(capturedUrl, 'https://test-upstash.upstash.io/eval');
    assert.equal(capturedHeaders['Authorization'], 'Bearer valid-test-token-abc');
    assert.equal(capturedBody[1], 1); // 1 key
    assert.equal(capturedBody[2], 'test-key');
  });

  test('UpstashRateLimitStore throws RateLimitBackendUnavailableError on 5xx or timeout', async () => {
    const failingFetch = async () => ({
      ok: false,
      status: 503,
      statusText: 'Service Unavailable',
    });

    const store = createUpstashRateLimitStore({
      url: 'https://test-upstash.upstash.io',
      token: 'valid-token',
      fetchImpl: failingFetch,
    });

    await assert.rejects(
      () => store.consume('any-key', 5, 60000),
      (err) => {
        assert.ok(err instanceof RateLimitBackendUnavailableError);
        assert.equal(err.code, 'RATE_LIMITER_UNAVAILABLE');
        return true;
      }
    );
  });

  test('Production fails closed when rate limit backend is unconfigured or memory is requested', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.SHOTISTRY_DB_DRIVER;

    // Production with no backend throws
    await assert.rejects(
      () => consumeRateLimit('any-key', 5, 60000),
      RateLimitBackendUnavailableError
    );

    // Production with placeholder Upstash throws
    process.env.UPSTASH_REDIS_REST_URL = 'https://your-upstash-redis.upstash.io';
    process.env.UPSTASH_REDIS_REST_TOKEN = 'changeme';
    await assert.rejects(
      () => consumeRateLimit('any-key', 5, 60000),
      RateLimitBackendUnavailableError
    );

    // Production with explicit memory backend throws
    process.env.SHOTISTRY_RATE_LIMIT_BACKEND = 'memory';
    await assert.rejects(
      () => consumeRateLimit('any-key', 5, 60000),
      RateLimitBackendUnavailableError
    );

    // resetRateLimitsForTests throws under production
    assert.throws(
      () => resetRateLimitsForTests(),
      /cannot reset rate limits in production/i
    );
  });

  test('login route returns HTTP 503 RATE_LIMITER_UNAVAILABLE when backend fails in production', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.SHOTISTRY_DB_DRIVER;

    const req = new Request('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({
        email: 'merchant@test.sa',
        password: 'ValidPassword123!',
      }),
    });

    const res = await loginRoute(req);
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('retry-after'), '5');
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.code, 'RATE_LIMITER_UNAVAILABLE');
  });
});
