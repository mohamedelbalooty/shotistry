# Pre-Production Release Checklist

## 1. AI, Unit Economics & Product Fidelity Gate
- [x] Official `@google/genai` SDK configured with official Gemini Interactions API model identifiers (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) — **PASS (`UNIT TESTED` + `CONTRACT TESTED`)**.
- [x] Marketing alias `gemini-nano-banana-2.1` and shut-down Imagen 3/4 identifiers normalized to `gemini-3.1-flash-image` — **PASS (`UNIT TESTED`)**.
- [x] Centralized model-specific cost engine (`src/lib/pricing/model-costs.ts`) separates `standard`, `batch`, `flex`, and `priority` pricing and never conflates Lite's `$0.0336` rate with standard Flash — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Every subscription plan (`FREE`, `STARTER`, `PRO`, `AGENCY`) declares `defaultModel`, `maxImageSize`, and `allowedModels`, with `403` gating & weighted credits (`1`/`2`/`3`/`4`) enforced in `/api/photoshoots/generate` — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Real PNG, JPEG, and WebP pixel decoding (`sharp` + EXIF `.rotate()`), exterior border BFS isolation across all 6 difficult categories, `verifyDeliveredImageFidelity` on the actual delivered `imageUrl`, and optional `lockProductForeground` scene compositing — **PASS (`UNIT TESTED` + `INTEGRATION TESTED` + `CONTRACT TESTED`)**.
- [ ] Live `GEMINI_API_KEY` network smoke test (`tests/live-external-smoke.test.mjs`) — **BLOCKED (`NOT TESTED` — requires external `GEMINI_API_KEY`)**.

## 2. Database, Ledger & Billing Gate
- [x] All 3 PostgreSQL migrations (`20261105000000_init`, `20261108000000_sessions_rbac`, `20261109000000_auth_security_hardening`) validate cleanly against `prisma/schema.prisma` (**21 models / 9 enums**).
- [x] `CreditLedgerService` & `CreditReservation` atomic reservation, settlement, release, single-trial anti-farming, and `idempotencyKey` deduplication verified — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Paymob webhook fails closed when `PAYMOB_HMAC_SECRET` is missing (`503`) or invalid (`401`), never auto-creates missing workspaces (`400`/`404`), and processes signed webhooks idempotently — **PASS (`INTEGRATION TESTED`)**.
- [x] `/api/admin/metrics` computes real SQL COGS from actual `GenerationJob` / `GeneratedImage` models & resolutions via `calculateModelGenerationCost` — **PASS (`INTEGRATION TESTED`)**.
- [x] Live PostgreSQL 16 CI suite (`npm run test:pg`) executed on real PostgreSQL 16 host verifying all 21 tables, 9 enums, ACID concurrency, and double-spending prevention — **PASS (`14/14 TESTS GREEN`)**.
- [ ] Live Paymob Sandbox network checkout session test — **BLOCKED (`NOT TESTED` — requires external `PAYMOB_SECRET_KEY` / `PAYMOB_API_KEY`)**.
- [ ] Live Cloudflare R2 bucket upload & signed URL verification — **BLOCKED (`NOT TESTED` — requires external `R2_*` credentials and adapter)**.

## 3. System Actors, Option A Session Security & Multi-Tier RBAC Gate
- [x] Database-backed opaque `Session` tokens (`crypto.randomBytes(32)` stored only as SHA-256 `tokenHash`) with `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, explicit expiration, and `__Host-` + `Secure` in production — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Full lifecycle implemented & tested: login/register rotation (`ROTATED_ON_AUTH`), sliding 7d idle + 30d absolute expiration, logout, multi-device list & single-device/bulk revocation, workspace switching, and full session invalidation on password change (`PASSWORD_CHANGED`) — **PASS (`INTEGRATION TESTED`)**.
- [x] Legacy identity headers (`x-user-id`, `x-user-role`, `x-workspace-id`), unsigned identity cookies, anonymous auto-provisioning, and HTTP admin creation completely eliminated and regression-tested (`tests/auth-security.test.mjs`, `tests/rbac-routes.test.mjs`) — **PASS (`INTEGRATION TESTED`)**.
- [x] Strict multi-tier RBAC separation (`PlatformRole` vs `WorkspaceRole`) enforced live from SQL across all 27 API routes — **PASS (`INTEGRATION TESTED`)**.
- [x] Native Node 24 Argon2id password hashing with asynchronous semaphore (`SHOTISTRY_MAX_CONCURRENT_HASHES=4`) to prevent serverless OOM, bounded verify, and transparent migration from legacy scrypt — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Distributed fail-closed Fixed Window Counter rate limiting with rolling expiration backed by Upstash Redis REST and PostgreSQL ACID store with client IP extraction and IPv6 `/64` CIDR grouping — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Transactional email transport (Resend API + in-memory fallback), bilingual (`ar`/`en`) templates, single-use action tokens (`AuthActionToken`), and `#token=` URL fragment leakage prevention — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Anti-enumeration account recovery (`/api/auth/forgot-password`, `/api/auth/reset-password`) with uniform 202 response, ~50ms timing floor, and privileged account exclusion — **PASS (`INTEGRATION TESTED`)**.
- [x] Verified-email gating (ADR-007) and identity-bound workspace invites (`WorkspaceInvite`) — **PASS (`INTEGRATION TESTED`)**.
- [x] Layered CSRF protection (`SameSite=Lax`, `application/json` pre-auth, `validateSameOrigin`, session-bound timing-safe `x-csrf-token`), and out-of-band CLI admin bootstrap/rotation (`scripts/bootstrap-admin.mjs`) — **PASS (`INTEGRATION TESTED`)**.
- [ ] Configure production secrets (`ASSET_SIGNING_SECRET`, `PAYMOB_HMAC_SECRET`, `SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` during bootstrap only, `RESEND_API_KEY`, `UPSTASH_*`) and execute bootstrap once against production DB.
