# Superpowers Implementation Plan — Shotistry Production-Readiness Remediation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` and `superpowers:test-driven-development` to implement this plan task-by-task. Every code change MUST start with a failing automated test (RED), minimal implementation to pass (GREEN), and cleanup (REFACTOR).

**Goal:** Remediate all CRITICAL and HIGH production-readiness audit findings across database persistence, atomic credit ledger, real product-image transformation & compositing, Gemini Nano Banana 2.1 integration, fail-closed idempotent Paymob webhooks, and real database-backed admin telemetry.

**Architecture:** Next.js 15 App Router + TypeScript strict mode + PostgreSQL via Prisma ORM (`@prisma/client`) with `SERIALIZABLE` / row-locking ledger transactions, pure-Node PNG/JPEG pixel isolation & studio compositing pipeline paired with `@google/genai` Interactions API (`gemini-nano-banana-2.1`), HMAC-SHA512 fail-closed webhook processing, and signed asset URLs.

---

### Task 1: Provision Local PostgreSQL, Prisma Migrations & Atomic Database Credit Ledger
- **Files:**
  - Create: `src/lib/db/prisma.ts`
  - Create: `src/lib/ledger/credit-ledger-service.ts`
  - Modify: `src/lib/ledger/credit-ledger.ts`
  - Test: `tests/db-ledger.test.mjs`
- **Behavioral Expectations:**
  - Local PostgreSQL cluster is initialized and running; `prisma/schema.prisma` is migrated cleanly (`prisma/migrations/`).
  - `CreditLedgerService` provisions a workspace with 5 trial credits idempotently, reserves credits atomically under concurrent contention, settles reservations into `GENERATION_DEBIT` ledger entries, and releases reservations on job failure.
- **TDD Validation:**
  - Write `tests/db-ledger.test.mjs` first (RED), run `node --test tests/db-ledger.test.mjs`, implement `prisma.ts` and `credit-ledger-service.ts` (GREEN), verify concurrent `Promise.all` reservation test passes.

### Task 2: Real Product Image Isolation, Studio Compositing & Gemini Nano Banana 2.1 Client
- **Files:**
  - Create: `src/lib/ai/image-processor.ts`
  - Modify: `src/lib/ai/prompt-synthesizer.ts`
  - Modify: `src/lib/ai/gemini-client.ts`
  - Modify: `src/lib/types/index.ts`
  - Test: `tests/image-pipeline.test.mjs`, `tests/gemini-client.test.mjs`, `tests/prompt-synthesizer.test.mjs`
- **Behavioral Expectations:**
  - `image-processor.ts` decodes uploaded product images (PNG/JPEG/BMP/SVG data URLs), extracts a real foreground alpha mask by isolating non-background pixels, composites the exact customer product pixels onto a studio lighting/pedestal/contact-shadow canvas, and computes a real pixel-level `fidelityScore` (`0.0–1.0`).
  - `PromptSynthesizer` defaults to `gemini-nano-banana-2.1` (and supports `gemini-3-pro-image` and `gemini-3.1-flash-lite-image`).
  - `GeminiClient` requires and uses `referenceImageBase64`, maps aspect ratios accurately (`1:1` -> `1024x1024`, `4:5` -> `1080x1350`, `9:16` -> `1080x1920`, `16:9` -> `1920x1080`), calls `ai.interactions.create` when a live API key is configured, and runs the real pixel compositor in sandbox mode with `synthIdDetected: false` and `executionMode: 'LOCAL_COMPOSITE_SANDBOX'`.
- **TDD Validation:**
  - Write failing tests in `tests/image-pipeline.test.mjs`, `tests/gemini-client.test.mjs`, and `tests/prompt-synthesizer.test.mjs` (RED), implement changes (GREEN).

### Task 3: Workspace Auth, Signed Asset Storage & Server-Side Studio Generation Pipeline
- **Files:**
  - Create: `src/lib/auth/session.ts`
  - Create: `src/lib/storage/asset-storage.ts`
  - Create: `src/app/api/workspace/session/route.ts`
  - Create: `src/app/api/assets/upload/route.ts`
  - Create: `src/app/api/assets/download/route.ts`
  - Create: `src/app/api/jobs/[id]/route.ts`
  - Modify: `src/app/api/photoshoots/generate/route.ts`
  - Modify: `src/context/AppContext.tsx`
  - Modify: `src/app/studio/page.tsx`
  - Modify: `src/lib/i18n/translations.ts`
  - Test: `tests/api-photoshoots.test.mjs`
- **Behavioral Expectations:**
  - `POST /api/photoshoots/generate` validates workspace ownership, rejects requests missing a product image (`400`), atomically reserves 1 credit (`402` if insufficient), persists `Photoshoot` + `GenerationJob` + `GeneratedImage` in PostgreSQL, settles the credit reservation on success, and releases the credit reservation if generation fails.
  - `src/app/studio/page.tsx` no longer imports `GeminiClient`; it submits the uploaded product image to `POST /api/photoshoots/generate`, refreshes workspace credits from PostgreSQL, and displays truthful fidelity/SynthID badges.
- **TDD Validation:**
  - Write `tests/api-photoshoots.test.mjs` testing missing image rejection, credit reservation/settlement, automatic credit refund on failure, and `/api/jobs/[id]` retrieval (RED -> GREEN).

### Task 4: Fail-Closed, Idempotent Paymob Webhook & Checkout Intent API
- **Files:**
  - Modify: `src/lib/paymob/paymob-hmac.ts`
  - Modify: `src/app/api/webhooks/paymob/route.ts`
  - Create: `src/app/api/billing/checkout-intent/route.ts`
  - Modify: `src/app/pricing/page.tsx`
  - Modify: `src/lib/pricing/plans.ts`
  - Test: `tests/paymob.test.mjs`, `tests/paymob-webhook.test.mjs`, `tests/pricing.test.mjs` (remove duplicate `tests/pricing.test.js`)
- **Behavioral Expectations:**
  - `/api/webhooks/paymob` fails closed (`401`/`500`) in all environments whenever `PAYMOB_HMAC_SECRET` is missing/placeholder or HMAC verification fails.
  - Persists events in `WebhookEvent`, prevents duplicate credit grants on replayed webhooks, verifies `body.success === true` on transactions, updates `Subscription` lifecycle states (`ACTIVE`, `PAST_DUE`, `CANCELED`), and grants credits atomically in `CreditLedger`.
- **TDD Validation:**
  - Write `tests/paymob-webhook.test.mjs` with independent HMAC vectors, fail-closed checks, replay idempotency, failed payment handling, and subscription lifecycle persistence (RED -> GREEN).

### Task 5: Real Database-Backed Admin Metrics & Audited Credit Adjustments
- **Files:**
  - Modify: `src/app/api/admin/metrics/route.ts`
  - Create: `src/app/api/admin/credits/adjust/route.ts`
  - Modify: `src/app/admin/page.tsx`
  - Test: `tests/admin-metrics.test.mjs`
- **Behavioral Expectations:**
  - `GET /api/admin/metrics` computes all metrics directly from PostgreSQL tables (`User`, `Subscription`, `PaymentTransaction`, `GenerationJob`, `CreditLedger`, `AdminAuditLog`) and requires admin authorization.
  - `POST /api/admin/credits/adjust` atomically records an `ADMIN_ADJUSTMENT` in `CreditLedger` and creates an `AdminAuditLog` entry.
- **TDD Validation:**
  - Write `tests/admin-metrics.test.mjs` verifying database-derived metrics, unauthorized rejection (`403`), and audited credit adjustment persistence (RED -> GREEN).

### Task 6: End-to-End Verification & Documentation Synchronization
- **Files:**
  - Create: `tests/e2e-workflow.test.mjs`
  - Modify: `AGENTS.md`, `project-status.md`, `README.md`, `risk-register.md`, `CHANGELOG.md`, `docs/ai/*`, `docs/architecture/*`, `docs/business/pricing-strategy.md`, `docs/payments/*`, `docs/qa/*`
- **Behavioral Expectations:**
  - Full test suite (`npm test`), typecheck (`npx tsc --noEmit`), production build (`npm run build`), and live HTTP server E2E workflow pass with 0 errors.
  - All documentation accurately reflects active Gemini Nano Banana models (`gemini-nano-banana-2.1`, `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`, `gemini-3.8-flash`) and distinguishes unit, integration, E2E, and live credential tests.
