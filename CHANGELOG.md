# Changelog — Shotistry Platform

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [0.5.0] - 2026-11-10 (Phase 10: Staging Hardening, Multi-Region Paymob, Cloudflare R2, Async Jobs, Observability & Closed Beta Readiness)
### Added
- **Hermetic Test Environment & Verification Command (Milestone M0):**
  - Added `tests/.env.test` and hermetic test runner `--import ./tests/helpers/env-guard.mjs` ensuring local developer `.env` placeholders never leak into unit test assertions.
  - Added single canonical verification npm script `"verify": "npx prisma validate && npm run typecheck && npm run lint && npm test && npm run build"`.
- **Deployment Environment Model & Health Endpoint (Milestone M1):**
  - Added `src/lib/config/env.ts` with strict Zod schema enforcing environment classification (`production`, `staging`, `preview`, `development`, `test`).
  - Implemented `GET /api/health` providing deep system status checks (database, storage, rate limiter) with zero credential leaks.
- **Cloudflare R2 Object Storage & Direct Upload Intent Flow (Milestone M2):**
  - Implemented S3-compatible R2 storage adapter (`src/lib/storage/object-storage.ts`) using `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner`.
  - Added `POST /api/assets/upload-intent` issuing time-limited presigned PUT URLs with content-type and size validation.
  - Added `POST /api/assets/finalize` verifying file dimensions, magic-byte MIME headers, and image integrity via Sharp before activating assets.
  - Added `GET /api/assets/url` for secure, time-limited signed delivery with cross-workspace isolation.
  - Added `POST /api/cron/storage-cleanup` protected by `CRON_SECRET` for automated storage maintenance.
- **Asynchronous Recoverable Generation Jobs & Reaper Cron (Milestone M3):**
  - Decoupled photoshoot generation: `POST /api/photoshoots/generate` returns HTTP 202 Accepted with a unique `jobId` and reserves credits in escrow.
  - Added `/api/jobs/[id]` polling endpoint with strict workspace membership checks.
  - Added `POST /api/cron/generation-reaper` automatically reclaiming stale jobs lingering past 300 seconds and atomically releasing reserved credits (`RELEASE_FAIL_SAFE`).
- **Gemini Interactions Client Hardening & Error Taxonomy (Milestone M4):**
  - Added `src/lib/ai/gemini-errors.ts` classifying Gemini API errors (`TRANSIENT_5XX`, `RATE_LIMIT_429`, `INVALID_PROMPT`, `CONTENT_POLICY_VIOLATION`, `UNAUTHORIZED`).
  - Added bounded exponential backoff with full jitter (up to 3 attempts) for transient errors and 429 rate limits.
  - Added micro-dollar and token cost capture on `GenerationJob`.
- **Real-World Commercial Image Quality Benchmark Specification (Milestone M5):**
  - Created `docs/ai/benchmark/rubric.md` establishing 8 objective quality dimensions with a zero-tolerance gate on altered logos and hallucinated text.
  - Created `docs/ai/benchmark/manifest.json` spanning 8 regional commercial product categories.
  - Created automated benchmark runner (`scripts/benchmark/run-image-benchmark.mjs`) with strict $0 spending safety cap.
- **Centralized Financial Configuration & Unit Economics Model (Milestone M6):**
  - Created `src/lib/pricing/financial-config.ts` defining centralized FX rates (EG 50.0 EGP/USD, SA 3.75 SAR/USD), regional Paymob fee schedules, and VAT rules.
  - Implemented `checkFinancialGuardrails()` and `runFxSensitivityAnalysis()` evaluating pack profitability and currency devaluation scenarios.
- **Paymob Sandbox Multi-Region Integration & Zero-Trust Webhooks (Milestone M7):**
  - Implemented ADR-011 architecture: Unified Checkout Intention API client (`POST /v1/intention/`) with regional config separation (`PAYMOB_EG_*`, `PAYMOB_SA_*`).
  - Implemented zero-trust webhook intention matching: resolving transactions strictly by `specialReference` or `order.id` against database intent records, completely eliminating unsigned parameter tampering (Security Finding C5).
  - Added compensating refund reversals (`REFUND_REVERSAL`) to the double-entry credit ledger.
- **Transactional Email Transport Hardening (Milestone M8):**
  - Hardened `ResendEmailTransport` with bounded retries for 5xx/429 errors and immediate fail-fast on 4xx client errors.
  - Added deliverability guide `docs/operations/email-deliverability.md` covering DNS records (SPF, DKIM, DMARC, MX) for `mail.staging.shotistry.com`.
- **Structured Observability, Secret Redaction & Incident Runbook (Milestone M9):**
  - Created `src/lib/observability/request-context.ts` (Node.js `AsyncLocalStorage`) and `src/lib/observability/logger.ts`.
  - Implemented deep recursive redaction of passwords, tokens, API keys, cookies, HMAC, S3 signatures, raw 64-hex tokens, and circular references.
  - Replaced un-redacted `console.error` calls across all routes with structured scoped logger.
  - Added operational admin telemetry (job queue status, payment events, stuck jobs).
  - Created `docs/operations/incident-response.md` including Neon PITR drill instructions.
- **Playwright Browser E2E Suite & Staging Deployment Guide (Milestone M10):**
  - Configured `@playwright/test` (`playwright.config.ts`) with 30 E2E browser test specs in `tests/e2e/staging-smoke.spec.ts` testing ar/RTL and en/LTR across Desktop and Mobile viewports.
  - Created `docs/operations/staging-deployment-guide.md` specifying Vercel Preview staging deployment and instant rollback procedures.
- **Closed Beta Readiness & Operational Plan (Milestone M11):**
  - Added invite-only registration gating (`SHOTISTRY_BETA_INVITE_REQUIRED=1`) backed by `BetaInviteCode` and `BetaInviteRedemption`.
  - Added per-image merchant feedback API (`POST /api/images/[id]/feedback`) backed by `ImageFeedback` table with cross-workspace authorization.
  - Added beta funnel telemetry in `AdminRepository` (`funnelMetrics`).
  - Created `docs/business/closed-beta-plan.md` defining merchant cohort criteria, WhatsApp/email SLA, and launch exit gates.
- **Staging Validation Audit & Release Decision Gate (Milestone M12):**
  - Created `docs/audit/staging-validation-report.md` evaluating all 12 Go/No-Go criteria and documenting external prerequisite checklist.

## [0.4.0] - 2026-11-08 (Authentication Security Hardening, PostgreSQL 16 CI Gate, Distributed Rate Limiting & Action Tokens)
### Added
- **Dual-Driver Database Repositories (Phase 1):**
  - Implemented `AuthRepository`, `WorkspaceRepository`, `WebhookRepository`, and `AdminRepository` with full dual-driver parity for SQLite (`node:sqlite`) and PostgreSQL (`@prisma/client`).
  - Added strict static architecture guard (`tests/repositories.test.mjs`) ensuring zero application routes or auth modules import low-level database primitives directly.
- **Native Node 24 Argon2id Password Hashing & Concurrency Semaphore (Phase 2):**
  - Upgraded password hashing from sub-standard scrypt to native Node.js 24 Argon2id (`crypto.argon2('argon2id')`, `m=19456`, `t=2`, `p=1`, `tagLength=32`, `salt=16 bytes`) conforming to OWASP RFC 9106 standards.
  - Implemented asynchronous concurrency semaphore (`SHOTISTRY_MAX_CONCURRENT_HASHES=4`) to prevent serverless OOM, failing closed gracefully with HTTP `503 SERVICE_BUSY` when overloaded.
  - Added bounded parameter validation and transparent login re-hashing from legacy scrypt.
- **Fail-Closed Distributed Rate Limiting (Phase 3):**
  - Implemented `UpstashRateLimitStore` executing atomic Lua scripts via REST, and `PostgresRateLimitStore` backed by ACID `RateLimitBucket` table.
  - Added client IP extraction with trusted proxy filtering (`SHOTISTRY_TRUSTED_PROXY_COUNT`), IPv6 `/64` CIDR grouping, PII-free SHA-256 hashed keys, and fail-closed `503 RATE_LIMITER_UNAVAILABLE` in production.
- **Transactional Email Transport & Bilingual Templates (Phase 4):**
  - Added `ResendEmailTransport` (outbound HTTPS to `https://api.resend.com/emails`) and `MemoryEmailTransport` for test/offline use.
  - Added bilingual (`ar`/`en`) RTL/LTR email templates for verification, password reset, email change, password changed notice, and workspace invitations with strict HTML sanitization.
- **Single-Use Action Token Lifecycle & Verified-Email Gating (Phase 5 & 7):**
  - Added `AuthActionToken` table and repository (`EMAIL_VERIFY`, `PASSWORD_RESET`, `EMAIL_CHANGE`) with atomic single-use SQL consumption.
  - Implemented ADR-007 verified-email gating (`requireVerifiedEmail`) blocking commercial checkout, workspace creation, and member invites for unverified users with HTTP `403 EMAIL_VERIFICATION_REQUIRED`.
- **Hardened Account Recovery & Token-Leakage Mitigation (Phase 6):**
  - Created `/api/auth/forgot-password` with anti-enumeration uniform `202 Accepted` response, ~50 ms constant-time floor padding, and privileged role (`ADMIN`, `SUPPORT`) exclusion with `PRIVILEGED_RESET_ATTEMPT` audit logging.
  - Created `/api/auth/reset-password` pre-validating password strength before token consumption, revoking all active sessions (`PASSWORD_RESET`), invalidating outstanding tokens, and clearing session cookies.
  - Created `next.config.ts` enforcing `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and strict `no-referrer` + `no-store` on all token-handling paths.
- **Identity-Bound Workspace Invites & Frontend UI (Phase 7):**
  - Added `WorkspaceInvite` table, repository, and invite acceptance route (`POST /api/workspaces/invites/accept`) enforcing strict identity matching `session.email === invite.invitedEmail`.
  - Created bilingual RTL/LTR frontend pages: `/verify-email`, `/forgot-password`, `/reset-password`, `/invites/accept`, and `/account/confirm-email`, reading `#token=` from URL fragments and immediately scrubbing via `window.history.replaceState`.
- **PostgreSQL 16 Verification Suite & CI Gate (Phase 8):**
  - Added `tests/helpers/pg-migrate.mjs` applying all 3 migrations (`20261105000000_init`, `20261108000000_sessions_rbac`, `20261109000000_auth_security_hardening`) with PostgreSQL advisory locks and test database safety guards (`_test` name assertion).
  - Added `tests/postgres-auth.test.mjs` and `"test:pg"` npm script. Verified all 14 PostgreSQL tests green on live `PostgreSQL 16.15`.
- **Actor Taxonomy Cleanup & Documentation Sync (Phase 9):**
  - Replaced abbreviated `CLIOP` with readable `CLI_OPERATOR` across all diagrams and prose.
  - Reclassified `EXT_SIGNED_ASSET_BEARER` under a dedicated Signed-Capability Bearer category, and clearly separated internal `SYS_*` subsystems from external system actors.
  - Synchronized all security, architecture, operations, QA, and project status documentation.

## [0.3.0] - 2026-11-08 (System Actors, Multi-Tier RBAC & Option A Session Security)
### Added
- **Option A — Database-Backed Opaque Session Architecture (`src/lib/auth/session.ts`, `prisma/schema.prisma`, `prisma/migrations/20261108000000_sessions_rbac/migration.sql`):**
  - Added `Session` model and `WorkspaceRole` enum (`OWNER | ADMIN | MEMBER | VIEWER`), expanding schema to **18 models** and **8 enums**, plus `User.emailVerifiedAt`, `User.trialGrantedAt`, and `User.passwordUpdatedAt`.
  - Implemented 256-bit `crypto.randomBytes(32)` tokens stored strictly as SHA-256 `tokenHash`, delivered via `HttpOnly`, `SameSite=Lax`, `Path=/`, no `Domain`, `__Host-shotistry_session` + `Secure` cookie in production.
  - Added complete session lifecycle APIs: `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/session`, `GET /api/auth/sessions`, `DELETE /api/auth/sessions/[id]`, `POST /api/auth/sessions/revoke-all`, and `POST /api/auth/password` (revoking all device sessions upon password change).
- **Cryptographic Passwords, Rate Limiting & Multi-Layer CSRF (`src/lib/auth/password.ts`, `src/lib/security/rate-limit.ts`, `src/lib/security/csrf.ts`):**
  - Implemented native `crypto.scrypt` (`N=16384,r=8,p=1`) + `crypto.timingSafeEqual` + `constantTimeDummyVerify` anti-enumeration.
  - Added sliding-window rate limits (`10/15m` register & login, `5/15m` password update) and four-layer CSRF validation (`SameSite=Lax`, JSON pre-auth check, `Sec-Fetch-Site` + `Origin`/`Referer`, and timing-safe session-bound `x-csrf-token`).
- **Multi-Tier RBAC & Out-of-Band CLI Admin Bootstrap (`src/lib/auth/rbac.ts`, `src/lib/auth/admin-bootstrap.ts`, `scripts/bootstrap-admin.mjs`):**
  - Separated `PlatformRole` (`USER | SUPPORT | ADMIN`) from `WorkspaceRole` (`OWNER | ADMIN | MEMBER | VIEWER`) loaded live from SQL on every request.
  - Added `/api/workspaces`, `/api/workspace/switch`, and `/api/workspaces/[id]/members` with hierarchical delegation caps (`canManageWorkspaceMemberRole`), `OWNER`-only billing checkout, bounded `SUPPORT` goodwill credits (`+1..+200`), and one-time CLI admin bootstrap (`SHOTISTRY_ADMIN_BOOTSTRAP_SECRET` >= 24 chars).
- **Frontend Auth, Account Hub & Workspace Controls (`src/context/AppContext.tsx`, `src/components/Navbar.tsx`, `src/app/{login,register,account,studio,pricing,admin}/page.tsx`):**
  - Removed forged `x-user-*` headers; added cookie+CSRF `authorizedFetch()`, bilingual `/login`, `/register`, and `/account` (workspace switcher, member manager, multi-device session manager, password update, verification status).
- **System Actor, RBAC, Use Case & Security Docs + Test Suites (`tests/auth-security.test.mjs`, `tests/rbac-routes.test.mjs`):**
  - Authored `docs/product/system-actors.md`, `docs/product/use-case-specification.md`, `docs/security/rbac-matrix.md`, and `docs/security/authentication-authorization.md` with Mermaid diagrams, and added 20 security/RBAC tests (**89 active passing / 0 failing / 6 skipped across 15 test files**).

### Changed & Fixed
- **Eliminated Legacy Auth Bypasses & Anonymous Auto-Provisioning:**
  - Stopped defaulting unauthenticated callers to `ADMIN`, stopped silent auto-creation of default merchants/workspaces/trial credits on anonymous or webhook requests, enforced `trialGrantedAt` single-trial anti-farming (`0` credits on additional workspaces), and removed implicit `ADMIN` cross-tenant bypass on `/api/jobs/[id]`.
  - Required `ASSET_SIGNING_SECRET` (>=16 chars, fail-closed in production) and `baseDir + path.sep` directory traversal protection in `src/lib/storage/asset-storage.ts`.

## [0.2.2] - 2026-11-08 (Final Financial Accuracy & Genuine Final-Image Fidelity Verification)
### Added
- **Centralized Model-Specific Cost Configuration (`src/lib/pricing/model-costs.ts`, `tests/pricing.test.mjs`):**
  - Added `MODEL_PRICING_CATALOG`, `calculateModelGenerationCost`, `getAllModelResolutionCosts`, `calculatePlanProfitability`, `getAllPlansProfitabilityMatrix`, `getCreditWeightForGeneration`, and `validatePlanModelEntitlement` covering `gemini-3.1-flash-image` (`512`, `1K`, `2K`, `4K`), `gemini-3.1-flash-lite-image` (`1K`), and `gemini-3-pro-image` (`1K`, `2K`, `4K`) across `standard`, `batch`, `flex` (Vertex AI only), and `priority` (Vertex AI only) tiers.
  - Explicitly computes all 6 cost components per image (input image cost, text input cost, generated image output cost, Cloudflare R2 storage & CDN delivery `$0.0005`, `3%` retry allowance, and actual cost per successful image).
- **Delivered-Asset Fidelity Verification & Foreground Lock Scene Compositing (`src/lib/ai/image-processor.ts`, `src/lib/ai/gemini-client.ts`, `src/app/studio/page.tsx`):**
  - Added `verifyDeliveredImageFidelity` to decode and verify pixel preservation directly on the actual final delivered `imageUrl` (`fidelityScore`, `exactPixelMatchRatio`, `meanChannelError`, `fidelityVerified`).
  - Added `compositeProductOnSceneImage` and `lockProductForeground` option allowing Gemini-generated studio scenes to receive bit-exact original isolated product foreground compositing.

### Changed & Fixed
- **Strict Separation of Flash vs Flash Lite COGS (`src/lib/pricing/plans.ts`, `src/app/api/admin/metrics/route.ts`, `src/app/api/billing/plans/route.ts`, `src/app/api/photoshoots/generate/route.ts`):**
  - Fixed AI COGS calculation (`gemini-3.1-flash-image` 1K Standard = `$0.0672` output / **`$0.071050`** actual cost = `3.5525 EGP` / `0.2664 SAR`, no longer conflated with Lite's `$0.0336` output rate), fixed `GeneratedImage."generationJobId"` SQL join in `/api/admin/metrics`, and added explicit plan model/resolution entitlements (`403` enforcement) and credit weights (`1`/`2`/`3`/`4` credits).
- **Difficult Product Category Isolation & Truthful Fidelity UI (`src/lib/ai/image-processor.ts`, `src/lib/i18n/translations.ts`, `src/app/page.tsx`, `src/app/studio/page.tsx`):**
  - Upgraded `isolateProductForeground` with adaptive contrast thresholds, contour gap closing, and 4-connected exterior border BFS flood-fill so interior white packaging logos, white-on-white ceramics, transparent glass bottles, reflective chrome highlights, and 2px atomizer edges are preserved without interior holes.
  - Eliminated misleading live fidelity scoring on intermediate local composites when returning a different Gemini output; removed unverified `100%` static fidelity copy and wired dynamic fidelity badges in Studio UI.
- **Financial, AI & QA Documentation (`docs/ai/*`, `docs/business/*`, `docs/audit/*`, `docs/qa/*`, `docs/research/*`, `project-status.md`):**
  - Synchronized all model pricing tables, Egypt/Saudi plan profitability calculations (`100%` worst-case and `65%` expected utilization), FX sensitivity (`50.0` -> `62.50 EGP`), Egypt `pack_500` Batch mitigation, and full test evidence (`73` verified passing, `2` external `BLOCKED`).

## [0.2.1] - 2026-11-05 (Final Critical Blocker Remediation & PostgreSQL Gate)
### Changed & Fixed
- **Official Gemini API Model Identifiers (`src/lib/ai/prompt-synthesizer.ts`, `src/lib/ai/gemini-client.ts`, `prisma/schema.prisma`):**
  - Replaced product marketing alias `gemini-nano-banana-2.1` with the official API model identifier `gemini-3.1-flash-image` across all API requests, defaults, and database schemas (`SUPPORTED_GEMINI_IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']`).
- **Google Gemini Interactions API Schema Compatibility (`src/lib/ai/gemini-client.ts`, `tests/gemini-client.test.mjs`):**
  - Updated `ai.interactions.create` requests to use official `response_format: { type: 'image', mime_type, aspect_ratio, image_size }` (removing deprecated `response_modalities` and `generation_config.image_config`), enforced uppercase `image_size` (`512`, `1K`, `2K`, `4K`) and per-model resolution clamping (`gemini-3.1-flash-lite-image` -> `1K`), and implemented extraction from `interaction.output_image.data` with `interaction.steps` `model_output` fallback and `interaction.usage` metadata.
- **Real PNG, JPEG, and WebP Pixel Decoding via Sharp (`src/lib/ai/image-processor.ts`, `tests/image-pipeline.test.mjs`):**
  - Removed the SHA-256 synthetic rasterizer fallback and implemented real image decoding for PNG, JPEG, and WebP using `sharp` (`libvips` + `mozjpeg` + `libwebp`) with phone-camera EXIF orientation normalization (`.rotate()`) and strict rejection of unsupported/corrupt formats.
- **PostgreSQL Migration & Concurrency Validation (`src/lib/ledger/postgres-ledger-service.ts`, `tests/postgres-ledger.test.mjs`):**
  - Implemented `PostgresCreditLedgerService` using `@prisma/client` with `Prisma.TransactionIsolationLevel.Serializable` + `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR UPDATE` row-level locking, and verified all 17 PostgreSQL tables, 7 PostgreSQL enums, and 5-way concurrent double-spend prevention against a real isolated PostgreSQL database (`shotistry_audit_test`).

## [0.2.0] - 2026-11-05 (Production-Readiness Audit & Full TDD Remediation)
### Added
- **Independent Audit & Superpowers Artifacts:**
  - `docs/audit/production-readiness-audit.md`, `docs/superpowers/specs/2026-11-05-production-readiness-remediation-design.md`, and `docs/superpowers/plans/2026-11-05-production-readiness-remediation.md`.
- **Real Product Image Isolation, Studio Compositing & Fidelity Verification (`src/lib/ai/image-processor.ts`):**
  - Border background color estimation, Euclidean foreground alpha-mask extraction (`isolateProductForeground`), studio backdrop/pedestal/contact-shadow compositor (`compositeProductOnStudioScene`), and quantitative pixel-level fidelity verification (`verifyProductFidelity`).
- **ACID SQL Persistence & Atomic Credit Ledger Service (`src/lib/db/prisma.ts`, `src/lib/ledger/credit-ledger-service.ts`, `prisma/migrations/20261105000000_init/migration.sql`):**
  - Full 17-table SQL schema with `SERIALIZABLE` transaction isolation, concurrent double-spend prevention, reservation/settlement/release lifecycle, and `idempotencyKey` deduplication.
- **Workspace Session, Signed Asset Storage & Job Status Endpoints:**
  - `GET /api/workspace/session`, `POST /api/assets/upload`, `GET /api/assets/download` (HMAC-SHA256 signed URLs), `GET /api/jobs/[id]`, `POST /api/billing/checkout-intent`, and `POST /api/admin/credits/adjust`.

### Changed & Fixed
- **Active Google Gemini Image Models (`src/lib/ai/prompt-synthesizer.ts`, `src/lib/ai/gemini-client.ts`):**
  - Replaced shut-down `imagen-3.0-generate-002` (retired Nov 10, 2025) with `gemini-3.1-flash-image` (default), `gemini-3-pro-image`, and `gemini-3.1-flash-lite-image` via `@google/genai` `ai.interactions.create`.
  - Enforced mandatory `referenceImageBase64` on all generation calls and fixed `9:16` resolution mapping (`1080x1920`).
  - Removed direct browser `GeminiClient` execution from `src/app/studio/page.tsx` and eliminated false `synthIdDetected: true` claims in sandbox mode.
- **Fail-Closed, Idempotent Paymob Webhook (`src/app/api/webhooks/paymob/route.ts`):**
  - Removed placeholder HMAC secret fallback and fail-open non-production bypass; added `WebhookEvent` deduplication, `success === true` validation, `Subscription` state transitions, and atomic `CreditLedger` grants.
- **Real SQL Admin Metrics & Audit Log (`src/app/api/admin/metrics/route.ts`, `src/app/admin/page.tsx`):**
  - Replaced hardcoded demo numbers (`1480` users, `$5880` MRR) with live SQL aggregates and `AdminAuditLog` records.

## [0.1.0] - 2026-11-05
### Added
- Initial repository baseline (`95fb12a`).
