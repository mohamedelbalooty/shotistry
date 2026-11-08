# Handoff — Authentication Security Hardening Implementation & Current Repository State

**For:** The next implementing model, reviewer, or engineer
**Reconciliation & Verification Date:** November 8, 2026
**Repository:** `https://github.com/mohamedelbalooty/shotistry`
**Current Branch:** `audit/production-readiness`
**Current HEAD SHA:** `f7ce154a5cff8f5496f08bbb65a13b15b84bd4f0`
**Git Working Tree Status:** **DIRTY / UNCOMMITTED** (43 modified tracked files + 83 untracked files). **Nothing has been committed, pushed, merged, or deployed.**

---

## 1. Important Warning: Uncommitted Working-Tree State

> [!CAUTION]
> **ALL CODE IMPLEMENTED IN THIS HARNESS RESIDES CURRENTLY IN THE LOCAL WORKING TREE AND HAS NOT BEEN COMMITTED TO GIT HISTORY.**
> Do **NOT** run `git reset`, `git checkout -- .`, `git clean -fd`, `git stash drop`, or any command that discards or overwrites local files.
> All 9 implementation phases, 24 test files, 3 Prisma migrations, and comprehensive documentation are actively present in the working tree.
> The founder / user has explicitly directed: **Do not commit, push, merge, or deploy.**

### Working Tree File Breakdown:
- **Modified Tracked Files (43):**
  - Next.js application & API routes: `package.json`, `prisma/schema.prisma`, `next.config.ts`, `src/context/AppContext.tsx`, `src/components/{Navbar,Footer}.tsx`, `src/app/{admin,pricing,studio}/page.tsx`, `src/app/api/admin/{credits/adjust,metrics}/route.ts`, `src/app/api/assets/upload/route.ts`, `src/app/api/billing/checkout-intent/route.ts`, `src/app/api/jobs/[id]/route.ts`, `src/app/api/photoshoots/generate/route.ts`, `src/app/api/webhooks/paymob/route.ts`, `src/app/api/workspace/session/route.ts`.
  - Core libraries: `src/lib/auth/session.ts`, `src/lib/db/prisma.ts`, `src/lib/i18n/translations.ts`, `src/lib/ledger/{credit-ledger-service,postgres-ledger-service}.ts`, `src/lib/storage/asset-storage.ts`, `src/lib/types/index.ts`.
  - Documentation: `CHANGELOG.md`, `project-status.md`, `docs/architecture/{api-specification,database-design,system-architecture}.md`, `docs/audit/production-readiness-audit.md`, `docs/operations/{deployment-guide,environment-setup}.md`, `docs/qa/{release-checklist,test-results,test-strategy}.md`, `docs/security/{security-checklist,threat-model}.md`.
  - Tests: `tests/{admin-metrics,api-photoshoots,e2e-workflow,live-external-smoke,paymob-webhook,postgres-ledger}.test.mjs`.
- **Untracked Files (83):**
  - Architecture decisions & specifications: `docs/architecture/architecture-decisions/ADR-00{4..8}-*.md`, `docs/architecture/auth-security-hardening-design.md`, `docs/implementation/{auth-security-hardening-plan,handoff-next-model}.md`, `docs/product/{system-actors,use-case-specification}.md`, `docs/security/{authentication-authorization,rbac-matrix}.md`, `docs/superpowers/{plans,specs}/*.md`, `docs/qa/test-data.md`.
  - Audit artifact: `docs/audit/final-implementation-state.md`.
  - Migrations: `prisma/migrations/20261108000000_sessions_rbac/`, `prisma/migrations/20261109000000_auth_security_hardening/`.
  - Configuration: `next.config.ts`.
  - Frontend pages & auth routes: `src/app/account/`, `src/app/account/confirm-email/`, `src/app/api/auth/`, `src/app/api/workspace/switch/`, `src/app/api/workspaces/`, `src/app/forgot-password/`, `src/app/invites/accept/`, `src/app/login/`, `src/app/register/`, `src/app/reset-password/`, `src/app/verify-email/`.
  - Library subsystems: `src/lib/auth/{action-tokens,admin-bootstrap,email-verification-guard,hash-semaphore,password,rbac}.ts`, `src/lib/db/driver.ts`, `src/lib/db/repositories/*`, `src/lib/email/*`, `src/lib/security/csrf.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/rate-limit/*`, `src/types/node-argon2.d.ts`.
  - Operational scripts: `scripts/{benchmark-password-hashing,bootstrap-admin,check-docs,seed-test-accounts}.mjs`.
  - Test suites & helpers: `tests/{account-recovery,auth-security,email-transport,email-verification,password-hashing,postgres-auth,rate-limit-distributed,rbac-routes,repositories,verified-email-gating,workspace-invites}.test.mjs`, `tests/helpers/{pg-migrate,verify-email}.mjs`.

---

## 2. Key References (Repository-Relative Only)

1. [AGENTS.md](../../AGENTS.md) — Superpowers engineering methodology and invariants.
2. [auth-security-hardening-design.md](../architecture/auth-security-hardening-design.md) — Architectural design for authentication security hardening (Scopes A–F).
3. [auth-security-hardening-plan.md](auth-security-hardening-plan.md) — Full 9-phase implementation plan with verification statuses.
4. [ADR-004](../architecture/architecture-decisions/ADR-004-argon2id-password-hashing-and-migration.md) — Native Argon2id Password Hashing & Migration.
5. [ADR-005](../architecture/architecture-decisions/ADR-005-distributed-rate-limiting-and-fail-closed-policy.md) — Distributed Rate Limiting & Fail-Closed Policy.
6. [ADR-006](../architecture/architecture-decisions/ADR-006-transactional-email-adapter-and-action-tokens.md) — Transactional Email Adapter & Action Tokens.
7. [ADR-007](../architecture/architecture-decisions/ADR-007-verified-email-gating-and-workspace-invites.md) — Verified-Email Gating & Workspace Invites.
8. [ADR-008](../architecture/architecture-decisions/ADR-008-postgres-auth-repository-and-actor-taxonomy-cleanup.md) — PostgreSQL Auth Repository & Actor Taxonomy Cleanup.
9. [final-implementation-state.md](../audit/final-implementation-state.md) — Standalone final implementation status and truthful capability matrix.
10. [production-readiness-audit.md](../audit/production-readiness-audit.md) — Production readiness audit report.
11. [project-status.md](../../project-status.md) — High-level project status tracking.

---

## 3. Existing Authentication & RBAC Architecture

The application implements a hardened, multi-tenant authentication and authorization architecture:

1. **Option A Database-Backed Sessions (`src/lib/auth/session.ts`):**
   - 256-bit cryptographically random tokens (`crypto.randomBytes(32)`), stored strictly as SHA-256 hashes (`tokenHash`) in the `Session` table.
   - Delivered via `__Host-shotistry_session` cookies in production (`Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`).
   - Session lifecycle: rotation on authentication (`ROTATED_ON_AUTH`), sliding 7-day idle expiration, 30-day absolute expiration, multi-device session listing, single-device revocation, bulk revocation (`REVOKED_ALL`), and complete revocation on password change or reset (`PASSWORD_CHANGED`, `PASSWORD_RESET`).
2. **Multi-Tier RBAC Architecture (`src/lib/auth/rbac.ts`):**
   - Strictly decouples platform-level administrative privileges (`PlatformRole`: `ADMIN`, `SUPPORT`, `MERCHANT_OPERATOR`, `USER`) from tenant-level permissions (`WorkspaceRole`: `OWNER`, `ADMIN`, `MEMBER`, `VIEWER`).
   - Platform `ADMIN` has no automatic tenant bypass and cannot perform merchant actions without explicit membership; cannot be created via public HTTP endpoints.
   - Enforced live from SQL persistence across all 27 protected API routes.
3. **Native Argon2id Password Cryptography (`src/lib/auth/password.ts`):**
   - Implements OWASP RFC 9106 recommended parameters: `$argon2id$v=19$m=19456,t=2,p=1$`.
   - Asynchronous concurrency control semaphore (`src/lib/auth/hash-semaphore.ts`, `SHOTISTRY_MAX_CONCURRENT_HASHES=4`) failing closed gracefully with HTTP 503 `SERVICE_BUSY` under extreme load.
   - Bounded password verification (rejects $>128$ characters before hashing; bounds memory parameters $\le 64\,\text{MB}$).
   - Transparent migration: verifies legacy scrypt hashes and rehashes to Argon2id transparently upon successful login.
4. **Dual-Driver Repositories (`src/lib/db/driver.ts`, `src/lib/db/repositories/*`):**
   - Unified repository interfaces (`AuthRepository`, `WorkspaceRepository`, `WebhookRepository`, `AdminRepository`, `InviteRepository`, `ActionTokenRepository`, `PhotoshootRepository`, `BillingRepository`) with implementations for both SQLite (`node:sqlite`) and PostgreSQL (`@prisma/client`).
   - Static architecture guard prevents direct imports of `getDb` or transaction helpers in application routes.
5. **Distributed Rate Limiting (`src/lib/security/rate-limit.ts`):**
   - Backends: `UpstashRateLimitStore` (atomic Lua script over REST), `PostgresRateLimitStore` (`RateLimitBucket` row upsert locking), `MemoryRateLimitStore` (dev/test only; throws in production).
   - Enforces an atomic **Fixed Window Counter** with rolling expiration (TTL set on the first increment).
   - Client IP extraction with IPv6 `/64` CIDR aggregation; PII-free SHA-256 hashed keys.
   - Fail-closed policy: unconfigured or failing backend in production returns HTTP 503 `RATE_LIMITER_UNAVAILABLE` with `Retry-After: 5`.
6. **Action Tokens & Verified-Email Gating (`src/lib/auth/action-tokens.ts`, `src/lib/auth/email-verification-guard.ts`):**
   - Single-use 256-bit action tokens stored as SHA-256 hashes (`AuthActionToken`) with atomic SQL consumption (`UPDATE ... RETURNING *`).
   - Token leakage mitigation: all email links use `#token=` URL fragments that are immediately scrubbed from browser history via `history.replaceState`.
   - ADR-007 verified-email gating: commercial checkout intent and workspace creation require a verified email address; free trial photoshoot generation is permitted before verification.
7. **Identity-Bound Workspace Invites (`src/lib/db/repositories/invite-repository.ts`):**
   - Replaced instant member addition with `WorkspaceInvite`.
   - `POST /api/workspaces/invites/accept` enforces strict identity match: `session.email === invite.invitedEmail` (403 on mismatch without consuming the invite).
8. **Security Headers (`next.config.ts`):**
   - Global: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
   - Sensitive auth routes (`/verify-email`, `/reset-password`, `/account/confirm-email`, `/invites/accept`, `/api/auth/:path*`): `Referrer-Policy: no-referrer`, `Cache-Control: no-store`.

---

## 4. Nine Completed Implementation Phases

All 9 phases of the Authentication Security Hardening plan have been implemented and verified:

| Phase | Description | Implementation Status | Scope Verified | Key Artifacts |
|---|---|---|---|---|
| **Phase 1** | Schema Parity, Migrations & Dual-Driver Repositories | `IMPLEMENTED & VERIFIED` | Unit + Static Guard + Live PG | `src/lib/db/driver.ts`, `src/lib/db/repositories/*`, `prisma/migrations/20261109000000_auth_security_hardening/migration.sql`, `tests/repositories.test.mjs`. |
| **Phase 2** | Native Argon2id Hashing, Semaphore & Transparent Rehash | `IMPLEMENTED & VERIFIED` | Unit + Benchmark | `src/lib/auth/password.ts`, `src/lib/auth/hash-semaphore.ts`, `src/types/node-argon2.d.ts`, `tests/password-hashing.test.mjs`. |
| **Phase 3** | Distributed Rate Limiting (Fail-Closed) | `IMPLEMENTED & VERIFIED` (Code & Postgres) / `PARTIALLY VERIFIED` (Live Upstash Cloud `BLOCKED`) | Unit + Concurrency + Live PG | `src/lib/security/rate-limit/*`, `tests/rate-limit-distributed.test.mjs`, `tests/postgres-auth.test.mjs`. |
| **Phase 4** | Transactional Email Adapter & Templates | `IMPLEMENTED & VERIFIED` (Code & Memory) / `PARTIALLY VERIFIED` (Live Resend Delivery `BLOCKED`) | Unit + Mock | `src/lib/email/*`, `tests/email-transport.test.mjs`. |
| **Phase 5** | Action Tokens, Email Verification & Email Change | `IMPLEMENTED & VERIFIED` | Unit + Live PG Race | `src/lib/auth/action-tokens.ts`, `src/app/api/auth/verify-email/*`, `src/app/api/auth/email/*`, `tests/email-verification.test.mjs`. |
| **Phase 6** | Anti-Enumeration Account Recovery & Security Headers | `IMPLEMENTED & VERIFIED` | Unit + Build | `src/app/api/auth/forgot-password/route.ts`, `src/app/api/auth/reset-password/route.ts`, `next.config.ts`, `scripts/bootstrap-admin.mjs`, `tests/account-recovery.test.mjs`. |
| **Phase 7** | Verified-Email Gating, Workspace Invites & Frontend | `IMPLEMENTED & VERIFIED` | Integration + UI Build | `src/lib/auth/email-verification-guard.ts`, `src/app/api/workspaces/*`, `src/app/{verify-email,forgot-password,reset-password,invites/accept}/page.tsx`, `tests/verified-email-gating.test.mjs`, `tests/workspace-invites.test.mjs`. |
| **Phase 8** | PostgreSQL 16 Verification & Concurrency CI Gate | `IMPLEMENTED & VERIFIED` (Host PostgreSQL 16 Environment) | Live PG 16 Concurrency | `tests/helpers/pg-migrate.mjs`, `tests/postgres-auth.test.mjs`, `tests/postgres-ledger.test.mjs`, `npm run test:pg` (14/14 pass). |
| **Phase 9** | Actor Taxonomy Cleanup & Documentation Sync | `IMPLEMENTED & VERIFIED` | Doc Lint (62 files) | `docs/product/system-actors.md`, `docs/security/rbac-matrix.md`, `docs/product/use-case-specification.md`, ADRs 004–008, `project-status.md`. |

---

## 5. Exact Verification Results

### 1. Standard Test Suite (`npm test`)
- **Execution:** `node --experimental-strip-types --test tests/*.test.mjs`
- **Total Tests:** **155**
- **Describe Suites:** **27**
- **Test Files:** **24**
- **Passed:** **137**
- **Failed:** **0**
- **Skipped:** **18**
- **Duration:** ~2.18s

#### Detailed Itemization and Exact Reasons for the 18 Skipped Tests:
1. `tests/live-external-smoke.test.mjs`: `LIVE API GATE: Gemini Interactions API (gemini-3.1-flash-image) reference-image smoke test`
   - **Reason:** `GEMINI_API_KEY` is not set in environment.
2. `tests/live-external-smoke.test.mjs`: `LIVE API GATE: Paymob Sandbox API checkout session creation`
   - **Reason:** `PAYMOB_SECRET_KEY` / `PAYMOB_API_KEY` is not set in environment.
3. `tests/live-external-smoke.test.mjs`: `LIVE API GATE: Upstash Redis REST atomic rate limiting`
   - **Reason:** `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are not set in environment.
4. `tests/live-external-smoke.test.mjs`: `LIVE API GATE: Resend Transactional Email dispatch`
   - **Reason:** `RESEND_API_KEY` and `LIVE_EMAIL_TO` are not set in environment.
5. `tests/postgres-auth.test.mjs`: Tests 1–10 (10 tests)
   - **Reason:** The standard macOS command sandbox profile prevents outbound TCP network socket access to `localhost:5432`.
6. `tests/postgres-ledger.test.mjs`: Tests 1–4 (4 tests)
   - **Reason:** The standard macOS command sandbox profile prevents outbound TCP network socket access to `localhost:5432`.

### 2. Dedicated PostgreSQL 16 CI Gate (`npm run test:pg`)
- **Execution:** `POSTGRES_TEST_URL="postgresql://tasawk@localhost:5432/shotistry_audit_test?schema=public" npm run test:pg` (Executed with host socket permission outside sandbox).
- **Environment:** Real `PostgreSQL 16.15 (Homebrew) on aarch64-apple-darwin25.6.0`, database `shotistry_audit_test`.
- **Total Tests:** **14**
- **Total Suites:** 2 (`tests/postgres-auth.test.mjs` + `tests/postgres-ledger.test.mjs`)
- **Passed:** **14**
- **Failed:** **0**
- **Skipped:** **0**
- **Duration:** 642 ms
- **Scope Verified:**
  - 3 migrations applied cleanly in order (`20261105000000_init`, `20261108000000_sessions_rbac`, `20261109000000_auth_security_hardening`), establishing 21 application tables, `_prisma_migrations`, and 9 PostgreSQL enums.
  - 10 concurrent registrations with identical email -> exactly 1 success.
  - Atomic workspace provisioning with complete rollback on failure.
  - Trial credit idempotency (`trial:grant:user:<id>`) under concurrency.
  - 20 concurrent logins for the same user without deadlocks; bulk session revocation.
  - 50 concurrent `PostgresRateLimitStore.consume` increments -> exact count and window tracking.
  - Concurrent action token consumption race -> exactly 1 winner.
  - Out-of-band CLI admin bootstrap and password rotation in PostgreSQL mode.
  - Double-spending prevention on credit reservations under concurrency using `SERIALIZABLE` + `SELECT FOR UPDATE`.

### 3. Build & Static Analysis Verification
- `npx prisma validate`: **Exit 0** (Schema valid with 21 models and 9 enums).
- `npx prisma generate`: **Exit 0** (Generated `@prisma/client` v5.22.0).
- `npx tsc --noEmit`: **Exit 0** (Zero TypeScript errors).
- `npm run build`: **Exit 0** (Compiled in 3.0s; 40 static & dynamic routes generated cleanly).
- `node scripts/check-docs.mjs`: **Exit 0** (Passed cleanly across 62 markdown files).

---

## 6. Rate Limiting Algorithm Verification & Safety Findings

Both the Upstash Redis and PostgreSQL implementations were audited for algorithm classification and concurrency behavior:

1. **Upstash Redis REST Store (`src/lib/security/rate-limit/upstash-store.ts`):**
   - **Algorithm:** **Fixed Window Counter** with rolling window reset (TTL set on the first increment via `INCR` + conditional `PEXPIRE` inside an atomic Lua script).
   - **Characteristics:** It is **not** a continuous sliding log or interpolated sliding window. A client may burst up to 2x the limit across adjacent window boundaries (e.g., at $t=59\text{s}$ and $t=61\text{s}$ for a 60s window).
   - **Concurrency:** Strictly serialized and atomic via Redis Lua script execution.
2. **PostgreSQL Rate Limit Store (`src/lib/security/rate-limit/postgres-store.ts`):**
   - **Algorithm:** **Fixed Window Counter** via atomic upsert (`INSERT INTO "RateLimitBucket" ... ON CONFLICT ("key") DO UPDATE SET count = CASE WHEN "expiresAt" <= EXCLUDED."windowStart" THEN 1 ELSE "count" + 1 END`).
   - **Characteristics:** Identical boundary burst behavior to Upstash.
   - **Concurrency:** Strictly atomic per key via PostgreSQL row-level locks on the conflict target.
3. **Fail-Closed Policy:**
   - In production (`NODE_ENV=production`), missing configuration or failure of the backend store throws `RateLimitBackendUnavailableError`, immediately generating HTTP 503 `RATE_LIMITER_UNAVAILABLE` with `Retry-After: 5`.
   - Memory store is strictly forbidden in production.
4. **Store Switching:**
   - Counters are isolated to their respective backends (Redis keys vs SQL rows). Switching backends in flight resets active counters.

---

## 7. PostgreSQL Test Reset Safety Hardening

`tests/helpers/pg-migrate.mjs` enforces the following fail-closed protections:
- **Environment Gate:** Fails closed if `process.env.NODE_ENV === 'production'`.
- **Protected Database Blocklist:** Immediately aborts if the database name is in `PROTECTED_DATABASE_NAMES` (`postgres`, `template0`, `template1`, `defaultdb`, `production`, `prod`, `shotistry`, `shotistry_prod`, `main`).
- **Production Substring Check:** Immediately aborts if the database name contains `prod` or `production`.
- **Target Database Suffix:** Strictly requires that the target database name ends with `_test`.
- **SQL Database Introspection:** Introspects `SELECT current_database()` via SQL rather than trusting raw client connection strings.
- **Advisory Lock:** Serializes migration execution across concurrent test processes using `pg_advisory_lock(84729103)`.

---

## 8. Required Environment Variables Matrix

The following environment variables govern the operation, security, and persistence of the application:

| Variable | Required In Production | Allowed Values / Format | Description & Behavior |
|---|---|---|---|
| `SHOTISTRY_DB_DRIVER` | **Yes** | `postgres` \| `sqlite` | Selects database driver. Must be set to `postgres` in production; defaults to `sqlite` in local development. |
| `DATABASE_URL` | **Yes** | `postgresql://...` | Connection string for PostgreSQL 16. In production, use pooled connection URL (with `?pgbouncer=true` if using PgBouncer). |
| `UPSTASH_REDIS_REST_URL` | Recommended | `https://...` | Upstash Redis REST URL for primary distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended | String ($\ge 8$ chars) | Upstash Redis REST bearer token. Non-placeholder required. |
| `SHOTISTRY_RATE_LIMIT_BACKEND` | Optional | `upstash` \| `postgres` \| `memory` | Overrides rate limit backend selection. `memory` is strictly rejected in production. |
| `SHOTISTRY_MAX_CONCURRENT_HASHES` | Optional | Integer ($\ge 1$, default `4`) | Limits concurrent Argon2id hashing operations via semaphore to prevent serverless OOM. Excess requests receive HTTP 503 `SERVICE_BUSY`. |
| `SHOTISTRY_TRUSTED_PROXY_COUNT` | Optional | Integer (default `1`) | Number of trusted reverse proxies when parsing `x-forwarded-for` client IPs. |
| `RESEND_API_KEY` | **Yes** | `re_...` | API key for Resend transactional email delivery. |
| `EMAIL_FROM` | **Yes** | `Name <email@domain>` | Sender email address for transactional emails. Must be a verified domain in Resend. |
| `EMAIL_REPLY_TO` | Optional | Email address | Reply-to address for outgoing transactional emails. |
| `APP_BASE_URL` | **Yes** | `https://...` | Base URL used to construct `#token=` links in emails (e.g. `https://shotistry.com`). |
| `ASSET_SIGNING_SECRET` | **Yes** | String ($\ge 32$ bytes) | Secret key for signing and verifying time-limited asset download URLs. Fails closed with 500 if unset. |
| `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` | During bootstrap only | String ($\ge 24$ chars) | Shared secret required for one-time CLI admin bootstrap and password rotation (`scripts/bootstrap-admin.mjs`). Must be removed after execution. |
| `PAYMOB_SECRET_KEY` | **Yes** | String | Secret key for Paymob Unified Checkout API. |
| `PAYMOB_API_KEY` | **Yes** | String | Legacy / secondary API key for Paymob authentication. |
| `PAYMOB_HMAC_SECRET` | **Yes** | String | Secret key for validating Paymob transaction webhooks via HMAC-SHA512. Fails closed with 503 if unset. |
| `PAYMOB_PUBLIC_KEY` | **Yes** | `PKG_...` | Public key used in Paymob Unified Checkout client widget. |
| `GEMINI_API_KEY` | **Yes** | String | Google AI API key for Gemini Interactions API (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`). |
| `R2_ACCOUNT_ID` | Optional / Storage | String | Cloudflare R2 account identifier for object storage. |
| `R2_ACCESS_KEY_ID` | Optional / Storage | String | Cloudflare R2 S3-compatible access key ID. |
| `R2_SECRET_ACCESS_KEY` | Optional / Storage | String | Cloudflare R2 S3-compatible secret access key. |
| `R2_BUCKET_NAME` | Optional / Storage | String | Cloudflare R2 storage bucket name. |

---

## 9. Remaining External Blockers (Require Real Cloud Services)

The following capabilities are implemented in code and tested with stubs/mocks, but cannot be verified against live third-party cloud infrastructure without external credentials:

| Service / Provider | Missing Credential / Configuration | Current Test Status | Action Needed for Production |
|---|---|---|---|
| **Google Gemini API** | `GEMINI_API_KEY` | Mock tested; live smoke skipped | Provision Gemini API key; run `tests/live-external-smoke.test.mjs`. |
| **Paymob Checkout** | `PAYMOB_SECRET_KEY`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_PUBLIC_KEY` | HMAC/mock tested; live network checkout skipped | Provision sandbox credentials; run live smoke checkout. |
| **Upstash Redis** | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Lua mocked / PG fallback tested; live Upstash network skipped | Create Upstash database; set credentials in Vercel. |
| **Resend Email** | `RESEND_API_KEY`, `EMAIL_FROM`, DNS (SPF, DKIM, DMARC) | Memory transport tested; live Resend delivery skipped | Verify domain DNS in Resend; test real email dispatch. |
| **Cloudflare R2** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` | Mocked local storage tested; remote R2 bucket untested | Create R2 bucket and configure credentials. |
| **Production PostgreSQL** | Production `DATABASE_URL` | Local PG 16.15 verified; production host untested | Provision managed PostgreSQL 16 database (Neon, Supabase, RDS). |
| **Production Secrets** | `ASSET_SIGNING_SECRET`, `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` | Validated in test harness; production secrets unconfigured | Generate 32-byte secure random secrets for production deployment. |

---

## 10. Exact Commands for Continued Verification

To verify the working tree state independently without changing any code:

```bash
# 1. Run full unit and integration test suite (sandboxed)
npm test

# 2. Run PostgreSQL 16 integration suite (requires host access to localhost:5432)
POSTGRES_TEST_URL="postgresql://tasawk@localhost:5432/shotistry_audit_test?schema=public" npm run test:pg

# 3. Validate Prisma schema & generate client
DATABASE_URL="postgresql://tasawk@localhost:5432/shotistry_audit_test?schema=public" npx prisma validate
DATABASE_URL="postgresql://tasawk@localhost:5432/shotistry_audit_test?schema=public" npx prisma generate

# 4. TypeScript type checking
npx tsc --noEmit

# 5. Production Next.js build
npm run build

# 6. Documentation cross-reference check
node scripts/check-docs.mjs

# 7. Password hashing benchmark
node --experimental-strip-types scripts/benchmark-password-hashing.mjs --concurrency 1,4,8,16,25 --iterations 50
```

---

## 11. Next Recommended Engineering Actions

1. **Working-Tree Checkpoint Commit:** Once authorized by the founder, commit all 43 modified tracked files and 83 untracked files on branch `audit/production-readiness` as a single, clean checkpoint commit.
2. **External Cloud Credentials Provisioning:** When cloud credentials become available, configure environment variables and execute `tests/live-external-smoke.test.mjs` against live providers (Gemini, Paymob, Upstash, Resend).
3. **Staging Preview Deployment:** Deploy branch `audit/production-readiness` to a Vercel staging preview environment with a managed PostgreSQL 16 database, run `npx prisma migrate deploy`, execute out-of-band admin bootstrap, and verify end-to-end user journeys.
