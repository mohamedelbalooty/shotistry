# ADR-005: Distributed Rate Limiting & Fail-Closed Policy

## Status: ACCEPTED (Design) — NOT YET IMPLEMENTED
**Deciders:** Principal Security Architect, Staff Backend Engineer, DevOps Lead
**Date:** November 8, 2026
**Design Reference:** [auth-security-hardening-design.md §4](../auth-security-hardening-design.md)

---

## 1. Context & Problem Statement
`src/lib/security/rate-limit.ts` keeps counters in a process-local `Map`. On Vercel, each instance has its own map and cold starts reset it, so limits are not enforced across the fleet. `getClientIp()` trusts the first `x-forwarded-for` hop, which clients can spoof.

---

## 2. Decision Drivers
- Atomic counters shared across all serverless instances.
- Vercel compatibility (HTTP-based client, no long-lived TCP).
- Security controls must never silently turn off.
- No raw PII (emails) in rate-limit keys.

---

## 3. Considered Alternatives
- **Option A:** Upstash Redis REST with an atomic Lua script via `POST /eval` [SELECTED — primary].
- **Option B:** PostgreSQL `RateLimitBucket` single-statement `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` under `READ COMMITTED` [SELECTED — fallback when `SHOTISTRY_DB_DRIVER=postgres` and Upstash is not configured].
- **Option C:** Upstash `/pipeline` (Rejected: not atomic, per Upstash docs checked 2026-11-08).
- **Option D:** `@upstash/ratelimit` SDK (Deferred: viable, but the single Lua script is small, dependency-free and easy to test with an injected `fetch`).
- **Option E:** Keep the in-memory map in production (Rejected).

---

## 4. Decision
1. Async `RateLimitStore` interface with `UpstashRateLimitStore`, `PostgresRateLimitStore`, `MemoryRateLimitStore`.
2. Selection order: Upstash (valid `https://` URL + non-placeholder token) → Postgres (when driver is postgres) → Memory (**only** when `NODE_ENV !== 'production'`).
3. **Fail closed:** in production, no valid backend or any backend error/timeout (1500 ms) → `503 RATE_LIMITER_UNAVAILABLE` with `Retry-After`. Never fail open.
4. `resetRateLimitsForTests()` throws in production.
5. Keys: `shotistry:rl:v1:<policy>:<sha256-prefix(identity)>`; IPv6 grouped to `/64`.
6. Trusted IP extraction prefers `x-vercel-forwarded-for` (when `VERCEL=1`), then `cf-connecting-ip`, `x-real-ip`, then `x-forwarded-for` according to `SHOTISTRY_TRUSTED_PROXY_COUNT`.
7. Named policies cover login (IP, IP+email, email), registration, verification resend/confirm, forgot/reset password, email change, password change, invite create/accept, admin credit adjust, admin metrics, generation and checkout. The Paymob webhook is excluded (HMAC-protected).

---

## 5. Consequences
- **Positive:** Fleet-wide enforcement; a security control that cannot be silently bypassed; zero-new-SaaS fallback for Postgres deployments.
- **Negative:** If Upstash is down, auth endpoints return 503 (availability is traded for safety, by design). The Postgres fallback adds one write per protected request; it needs bounded cleanup of expired rows.
- **Blocked:** live Upstash verification requires `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`.
