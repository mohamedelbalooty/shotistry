# Project Status — Shotistry (Authentication Security Hardening & PostgreSQL 16 Verification)

- **Original Baseline Commit (`main`):** `95fb12ab6d9a16277a93df14db1eba03b860c968` (Untouched)
- **Active Audit & Remediation Branch:** `audit/production-readiness` (Isolated; not merged or deployed)
- **Current Release State:** **v0.4.0 — Authentication Security Hardening, PostgreSQL 16 CI Gate, Distributed Rate Limiting, Action Tokens & Actor Taxonomy COMPLETE & VERIFIED**
- **Test Suite Execution (Sandbox):** **155 tests across 27 describe suites in 21 test files: 137 PASSED, 0 FAILED, 18 SKIPPED** (14 PG socket sandbox blocks, 4 external credential gates).
- **PostgreSQL 16 CI Gate (`npm run test:pg`):** **14/14 PASSED with zero skips** against real `PostgreSQL 16.15 (Homebrew) on aarch64-apple-darwin25.6.0`.
- **Production Build:** **0 errors, 40/40 routes compiled and optimized cleanly** with Next.js 15.5.29.
- **Production Blockers Remaining:** External API credentials (`RESEND_API_KEY`, `UPSTASH_*`, `PAYMOB_*`, `GEMINI_API_KEY`), production `DATABASE_URL`, and sending-domain DNS records (SPF, DKIM, DMARC).

---

## 1. Remediation & Verification Matrix

| Area | Finding / Requirement | Implementation Verified | Gate Status | Verification Scope |
|---|---|---|---|---|
| **1. Dual-Driver Repositories (Phase 1)** | Abstract all direct SQLite/Prisma calls behind unified repository interfaces (`AuthRepository`, `WorkspaceRepository`, `WebhookRepository`, `AdminRepository`). | Implemented dual drivers for SQLite and PostgreSQL with strict static architectural guard (`tests/repositories.test.mjs`). | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` |
| **2. Native Argon2id Password Hashing (Phase 2)** | Upgrade from sub-standard scrypt to OWASP-recommended Argon2id with concurrency control. | Implemented native Node 24 `crypto.argon2('argon2id')` (`m=19456`, `t=2`, `p=1`) with asynchronous semaphore (`SHOTISTRY_MAX_CONCURRENT_HASHES=4`) mapping to 503 `SERVICE_BUSY`, bounded verification, and transparent migration from legacy scrypt (`tests/password-hashing.test.mjs`). | **PASS** | `UNIT TESTED` + `BENCHMARKED` |
| **3. Distributed Fail-Closed Rate Limiting (Phase 3)** | Replace process-local rate limiting with distributed, fail-closed enforcement across serverless instances. | Implemented `UpstashRateLimitStore` (atomic Lua over REST) and `PostgresRateLimitStore` (`RateLimitBucket` table) enforcing an atomic Fixed Window Counter algorithm with rolling reset, client IP extraction, IPv6 `/64` CIDR grouping, PII-free SHA-256 hashed keys, and fail-closed 503 behavior in production (`tests/rate-limit-distributed.test.mjs`). | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` |
| **4. Transactional Email Transport (Phase 4)** | Reliable bilingual email delivery with token fragment links. | Implemented `ResendEmailTransport` and `MemoryEmailTransport`, rendering strict bilingual (`ar`/`en`) RTL/LTR email templates for verification, reset, change confirmation, security notices, and workspace invitations with `#token=` fragments (`tests/email-transport.test.mjs`). | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` |
| **5. Action Token Lifecycle & Gating (Phase 5 & 7)** | Enforce email verification (ADR-007) and single-use action tokens. | Implemented `AuthActionToken` (24h verify, 15m reset, 1h email change) with atomic consumption (`UPDATE ... RETURNING *`). Gated checkout intent, workspace creation, and member invites behind `requireVerifiedEmail` (`tests/email-verification.test.mjs`, `tests/verified-email-gating.test.mjs`). | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` |
| **6. Hardened Account Recovery (Phase 6)** | Anti-enumeration forgot/reset password with full session revocation. | Uniform 202 response with ~50ms timing floor; privileged roles (`ADMIN`, `SUPPORT`) receive no emails and record `PRIVILEGED_RESET_ATTEMPT` audit rows; reset pre-validates before token consumption and revokes all active sessions (`PASSWORD_RESET`); global security headers in `next.config.ts` (`tests/account-recovery.test.mjs`). | **PASS** | `INTEGRATION TESTED` |
| **7. Identity-Bound Workspace Invites (Phase 7)** | Eliminate unauthenticated/arbitrary member addition with identity-bound invites. | Implemented `WorkspaceInvite` repository and routes. `POST /api/workspaces/invites/accept` enforces strict identity match `session.email === invite.invitedEmail` (403 on mismatch without consuming invite) (`tests/workspace-invites.test.mjs`). | **PASS** | `INTEGRATION TESTED` |
| **8. PostgreSQL 16 CI Gate (Phase 8)** | Verify all 3 migrations and ACID concurrency on real PostgreSQL 16. | Created `tests/helpers/pg-migrate.mjs` and `tests/postgres-auth.test.mjs`. Ran `npm run test:pg` on PostgreSQL 16.15: 14/14 tests pass covering registrations, trial grants, logins, rate limiting, and token races. | **PASS** | `LIVE PG TESTED` |
| **9. Actor Taxonomy & Documentation (Phase 9)** | Standardize actor IDs (`CLI_OPERATOR`), reclassify Signed-Capability Bearer, isolate `SYS_*` subsystems. | Updated `system-actors.md`, `use-case-specification.md`, `rbac-matrix.md`, architecture, security, and QA docs. | **PASS** | `DOC-SYNCED` |

---

## 2. Automated Test Suite Summary (24 Files / 27 Suites / 155 Tests: 137 Passed, 0 Failed, 18 Skipped)
- `tests/auth-security.test.mjs` (`12/12` PASS) — Schema parity, rate limiting, CSRF, `__Host-` cookie, SHA-256 `Session` lifecycle, RBAC matrix, single-trial guarantee, CLI admin bootstrap, fail-closed `ASSET_SIGNING_SECRET`.
- `tests/password-hashing.test.mjs` (`10/10` PASS) — Argon2id PHC format, round-trip, parameter bounds, legacy scrypt verification, transparent upgrade on login, semaphore concurrency & 503 `SERVICE_BUSY`.
- `tests/repositories.test.mjs` (`4/4` PASS) — Phase 1 dual-driver contracts & static import guard.
- `tests/rate-limit-distributed.test.mjs` (`9/9` PASS) — Phase 3 distributed rate limiting (Fixed Window Counter with rolling reset via Upstash Lua REST, Postgres store, client IP, IPv6 /64, fail-closed 503).
- `tests/email-transport.test.mjs` (`8/8` PASS) — Phase 4 transactional email transport, bilingual templates, HTML escaping, `#token=` links.
- `tests/email-verification.test.mjs` (`8/8` PASS) — Phase 5 action token lifecycle, SHA-256 hash, atomic single-use consumption, email verification & email change routes.
- `tests/account-recovery.test.mjs` (`8/8` PASS) — Phase 6 anti-enumeration forgot-password, ~50ms timing floor, privileged account exclusion, reset session revocation, CLI password rotation, `next.config.ts` headers.
- `tests/verified-email-gating.test.mjs` (`3/3` PASS) — Phase 7 verified-email gating on checkout and workspace creation; trial generation permitted.
- `tests/workspace-invites.test.mjs` (`3/3` PASS) — Phase 7 identity-bound workspace invites, email matching check, invite revocation.
- `tests/rbac-routes.test.mjs` (`8/8` PASS) — End-to-end HTTP cookie/CSRF enforcement, guest boundary, logout, multi-device, cross-workspace IDOR, role separation.
- `tests/admin-metrics.test.mjs` (`4/4` PASS) — Authenticated `ADMIN`/`SUPPORT` SQL KPIs & immutable audit logs.
- `tests/api-photoshoots.test.mjs` (`6/6` PASS) — Generation route auth/CSRF/RBAC, 402/403 gating, signed URLs.
- `tests/db-ledger.test.mjs` (`5/5` PASS) — SQL ledger lifecycle & concurrency.
- `tests/e2e-workflow.test.mjs` (`1/1` PASS) — Full merchant + Paymob webhook + `ADMIN` journey.
- `tests/gemini-client.test.mjs` (`8/8` PASS) — Interactions API contract, delivered-image fidelity, `lockProductForeground`.
- `tests/image-pipeline.test.mjs` (`13/13` PASS) — Real Sharp PNG/JPEG/WebP decoding, EXIF rotation & 6 difficult categories.
- `tests/ledger.test.mjs` (`7/7` PASS) — Double-entry accounting invariants.
- `tests/paymob-webhook.test.mjs` (`6/6` PASS) — Fail-closed HMAC (`503`/`401`), replay dedup, unknown workspace 404, subscription transitions.
- `tests/paymob.test.mjs` (`5/5` PASS) — Independent HMAC-SHA512 vector & currency subunits.
- `tests/pricing.test.mjs` (`8/8` PASS) — Model-specific costs, EG/SA margins, credit weights.
- `tests/prompt-synthesizer.test.mjs` (`6/6` PASS) — Regional presets & model normalization.
- `tests/postgres-auth.test.mjs` (`10/10` PASS live on PostgreSQL 16; sandbox skipped) — Migrations, sessions, concurrent registrations, atomic provisioning, trial idempotency, 20 concurrent logins, RBAC persistence, 50 rate limiters, token races, admin bootstrap.
- `tests/postgres-ledger.test.mjs` (`4/4` PASS live on PostgreSQL 16; sandbox skipped) — 21 tables, 9 enums, `SERIALIZABLE` concurrency, row-level locking.
- `tests/live-external-smoke.test.mjs` (`4/4` BLOCKED / SKIPPED) — Requires live third-party keys (`GEMINI_API_KEY`, `PAYMOB_*`, `UPSTASH_*`, `RESEND_*`).

---

## 3. Production Readiness & Rollout Status

### Completed Milestones
1. **Option A Database-Backed Sessions:** 256-bit opaque tokens, SHA-256 hashed storage, `__Host-` cookies, complete lifecycle.
2. **Native Argon2id Hashing:** OWASP RFC 9106 parameters, bounded verify, concurrency semaphore (`SHOTISTRY_MAX_CONCURRENT_HASHES=4`).
3. **Fail-Closed Distributed Rate Limiting:** Fixed Window Counter with rolling reset backed by Upstash Redis REST + PostgreSQL ACID store with client IP extraction and IPv6 /64 aggregation.
4. **Action Token Lifecycle & Recovery:** Single-use tokens, anti-enumeration forgot-password with ~50ms floor padding, privileged account exclusion, full session invalidation on reset.
5. **Verified-Email Gating & Workspace Invites (ADR-007):** Commercial actions gated by email verification; identity-bound member invites.
6. **Token-Leakage Defense:** URL fragments (`#token=`) scrubbed immediately via `history.replaceState`; security headers in `next.config.ts`.
7. **PostgreSQL 16 Concurrency Gate:** All 3 migrations applied and tested with concurrency on PostgreSQL 16.15.

### Pre-Deployment Checklist
- [ ] Configure production credentials in Vercel / server environment:
  - `SHOTISTRY_DB_DRIVER="postgres"`
  - `DATABASE_URL` (direct/pooled PostgreSQL 16 URL)
  - `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`
  - `RESEND_API_KEY`, `EMAIL_FROM`, `APP_BASE_URL`
  - `ASSET_SIGNING_SECRET` (>= 32 random bytes)
  - `PAYMOB_HMAC_SECRET`, `PAYMOB_SECRET_KEY`, `PAYMOB_API_KEY`, `PAYMOB_PUBLIC_KEY`
  - `GEMINI_API_KEY`
- [ ] Verify sending-domain DNS records in Resend (SPF TXT, DKIM CNAMEs, DMARC `v=DMARC1; p=quarantine`).
- [ ] Run `prisma migrate deploy` on production database.
- [ ] Execute out-of-band admin bootstrap: `node --experimental-strip-types scripts/bootstrap-admin.mjs`.
- [ ] Run live external smoke tests: `npm test tests/live-external-smoke.test.mjs`.
