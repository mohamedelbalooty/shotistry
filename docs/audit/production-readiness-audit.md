# Shotistry — Independent Production-Readiness Audit Report (Stage A)

**Repository:** `https://github.com/mohamedelbalooty/shotistry`  
**Baseline Branch:** `main`  
**Audit Branch:** `audit/production-readiness`  
**Baseline Commit SHA:** `95fb12ab6d9a16277a93df14db1eba03b860c968` (`95fb12a`)  
**Audit Date:** 2026-11-05  
**Audit Status:** Stage A Complete — Baseline Critical Blockers Identified (Remediation Required in Stage B)

---

## 1. Executive Summary & Baseline Assessment

An independent, zero-trust code and infrastructure audit was conducted against commit `95fb12ab6d9a16277a93df14db1eba03b860c968` on `main`. While the previous development report (`project-status.md`) claimed that all 9 phases were `COMPLETED` and production-ready, **independent inspection of the source tree proves that core production paths are unimplemented placeholders, client-side simulations, or fail-open endpoints.**

At baseline commit `95fb12a`, Shotistry is **NOT production-ready**:
1. **Product Photo Transformation Does Not Use Customer Images (CRITICAL):** The Studio page (`src/app/studio/page.tsx`) reads the uploaded image via `FileReader` for local preview only, instantiates `new GeminiClient()` directly inside the browser (`'use client'`), never passes the uploaded image to `generateProductPhoto`, never calls `/api/photoshoots/generate`, and returns hardcoded Unsplash stock URLs when `GEMINI_API_KEY` is absent. Even when `GEMINI_API_KEY` is provided, `GeminiClient` calls a shut-down text-to-image model (`imagen-3.0-generate-002`) without passing `referenceImageBase64` or `maskImageBase64`.
2. **Product Fidelity Pipeline Is Unimplemented & UI Claims Are False (CRITICAL):** Zero lines of the 4-stage product isolation, alpha-matting, mask-guided inpainting, or light-wrapping composite pipeline described in `docs/ai/product-fidelity-strategy.md` exist in the repository. Meanwhile, `gemini-client.ts` hardcodes `synthIdDetected: true` on Unsplash fallback images, and `/studio` displays *"Verified Product Fidelity with SynthID Provenance"*.
3. **Paymob Webhook Fails Open & Has Zero Database Persistence (CRITICAL):** `src/app/api/webhooks/paymob/route.ts` falls back to `'placeholder_hmac_secret_sha512'`, skips HMAC enforcement whenever `NODE_ENV !== 'production'`, returns `200 OK` on unsigned/unrecognized payloads, does not check `body.success === true`, does not deduplicate `eventId`, and never updates `Subscription`, `PaymentTransaction`, `WebhookEvent`, or `CreditLedger`. Furthermore, `src/app/pricing/page.tsx` grants credits purely in client-side React state (`addCredits`).
4. **Zero Database Connectivity Across All Application Code (CRITICAL):** Although `prisma/schema.prisma` defines 14 models, `@prisma/client` is never imported or instantiated anywhere in `src/`, and no migrations exist.
5. **Admin Metrics & Credit Adjustments Are Hardcoded Client/Demo Stubs (HIGH):** `src/app/api/admin/metrics/route.ts` returns static numbers (`totalUsers: 1480`, `mrrUsd: 5880`), and `src/app/admin/page.tsx` does not even call the route—it hardcodes the same demo figures in `useState` and mutates local browser credits without recording an `AdminAuditLog`.
6. **Obsolete / Shut-Down AI Models Referenced Across Code & Docs (HIGH):** Official Google AI Studio documentation (as of November 2026) confirms that `imagen-3.0-generate-002` (shut down Nov 10, 2025) and `imagen-4.0-*` (shut down Aug 17, 2026) are permanently retired, and `gemini-2.5-flash` / `gemini-2.5-flash-image` are deprecated. The active official image generation & reference-editing models on the Interactions API (`ai.interactions.create`) are **`gemini-nano-banana-2.1`**, **`gemini-3.1-flash-lite-image`**, and **`gemini-3-pro-image`**.

---

## 2. Independent Verification of Preliminary Findings (A–G)

### Finding A: Image Generation and Product Upload
| Check | Baseline Evidence (`95fb12a`) | Verdict | Severity |
| :--- | :--- | :--- | :--- |
| `GeminiClient` default model | `src/lib/ai/gemini-client.ts:28` defaults to `'imagen-3.0-generate-002'` (shut down Nov 10, 2025). | **CONFIRMED DEFECT** | CRITICAL |
| `referenceImageBase64` & `maskImageBase64` usage | Declared in `GenerateImageOptions` (`src/lib/ai/gemini-client.ts:8-9`), but **never read or passed** anywhere in `generateProductPhoto`. | **CONFIRMED DEFECT** | CRITICAL |
| Studio page image upload flow | `src/app/studio/page.tsx:58-68` uses `FileReader.readAsDataURL` into `uploadedImage`, which is only rendered in an `<img>` tag (`line 221`) and never sent to any API or method. | **CONFIRMED DEFECT** | CRITICAL |
| Studio page `GeminiClient` execution | `src/app/studio/page.tsx:5,97` directly imports and executes `new GeminiClient()` in a `'use client'` component instead of calling `POST /api/photoshoots/generate`. | **CONFIRMED DEFECT** | CRITICAL |
| `/api/photoshoots/generate` route | `src/app/api/photoshoots/generate/route.ts:10-49` runs synchronously, does not accept `rawImageBase64` or `assetId`, does not authenticate the user/workspace, and does not reserve or settle credits. | **CONFIRMED DEFECT** | CRITICAL |
| Aspect ratio resolution mapping bug | `src/lib/ai/gemini-client.ts:70,101` maps `'9:16'` to `'1080x1350'` (`4:5`) instead of `'1080x1920'` (`9:16`). | **CONFIRMED DEFECT** | MEDIUM |

### Finding B: Product Fidelity
| Check | Baseline Evidence (`95fb12a`) | Verdict | Severity |
| :--- | :--- | :--- | :--- |
| Segmentation, masking, inpainting & compositing | Documented in `docs/ai/product-fidelity-strategy.md`, but **0% implemented** in `src/`. No foreground extraction, alpha mask generation, or pixel compositing exists. | **CONFIRMED DEFECT** | CRITICAL |
| Unverified fidelity & SynthID claims | `src/lib/ai/gemini-client.ts:69` returns `synthIdDetected: true` for hardcoded Unsplash URLs. `src/app/studio/page.tsx:86-87,368,384` unconditionally displays *"Fidelity Lock"* and *"Verified Product Fidelity with SynthID Provenance"*. | **CONFIRMED DEFECT** | CRITICAL |

### Finding C: Paymob Integration, Webhooks & Credit Ledger
| Check | Baseline Evidence (`95fb12a`) | Verdict | Severity |
| :--- | :--- | :--- | :--- |
| Fail-closed authentication | `src/app/api/webhooks/paymob/route.ts:15` defaults secret to `'placeholder_hmac_secret_sha512'`. Lines 21 & 44 only return `401` if `process.env.NODE_ENV === 'production'`. Line 57 returns `200 OK` if `trigger_type` and `receivedHmac` are omitted. | **CONFIRMED DEFECT** | CRITICAL |
| Webhook persistence & idempotency | `route.ts` performs zero database reads/writes. `WebhookEvent` is never queried or inserted; duplicate webhooks are re-processed without idempotency. | **CONFIRMED DEFECT** | CRITICAL |
| Transaction success verification | `route.ts:39-54` verifies HMAC on `body.id` but never checks `body.success === true`, `is_voided`, or `is_refunded`. | **CONFIRMED DEFECT** | CRITICAL |
| Credit grant & subscription lifecycle | `route.ts` never invokes `CreditLedgerEngine` or updates `Subscription` / `PaymentTransaction`. Credits are granted purely on the client side in `src/app/pricing/page.tsx:34,51`. | **CONFIRMED DEFECT** | CRITICAL |
| Pricing plan documentation vs code drift | `docs/business/pricing-strategy.md` specifies SAR monthly credits as `100 / 300 / 800`, whereas `src/lib/pricing/plans.ts` defines `80 / 200 / 500` for both EGP and SAR. | **CONFIRMED DEFECT** | MEDIUM |

### Finding D: Administration
| Check | Baseline Evidence (`95fb12a`) | Verdict | Severity |
| :--- | :--- | :--- | :--- |
| Real database metrics in `/api/admin/metrics` | `src/app/api/admin/metrics/route.ts:7-32` returns hardcoded static JSON (`totalUsers: 1480`, `mrrUsd: 5880`, etc.) with no auth check and no database queries. | **CONFIRMED DEFECT** | HIGH |
| Admin dashboard (`src/app/admin/page.tsx`) | Hardcodes the same static metrics in `useState`, hardcodes `recentJobs`, and applies credit adjustments to the admin's own browser `AppContext` without writing to `CreditLedger` or `AdminAuditLog`. | **CONFIRMED DEFECT** | HIGH |

### Finding E: Infrastructure & Persistence
| Check | Baseline Evidence (`95fb12a`) | Verdict | Severity |
| :--- | :--- | :--- | :--- |
| Database & Prisma integration | `prisma/schema.prisma` exists, but `@prisma/client` is never imported in `src/`. No `prisma/migrations/` directory exists. | **CONFIRMED DEFECT** | CRITICAL |
| Authentication & workspace isolation | No session/workspace resolution exists in `src/`. All state lives in browser `localStorage` (`src/context/AppContext.tsx`). | **CONFIRMED DEFECT** | HIGH |
| Asset upload, storage & signed URLs | No upload endpoint, storage driver, or signed URL generator exists in `src/`. | **CONFIRMED DEFECT** | HIGH |
| Job status tracking, retries & recovery | No `/api/jobs/[id]` endpoint or persistent `GenerationJob` state transitions (`QUEUED -> PROCESSING -> COMPLETED / FAILED`) exist. | **CONFIRMED DEFECT** | HIGH |
| Subscription checkout intent | No `/api/billing/checkout-intent` endpoint exists. | **CONFIRMED DEFECT** | HIGH |

### Finding F: Test Integrity Matrix (Baseline `95fb12a`)
All 26 baseline tests in `tests/*.test.mjs` are pure in-memory unit tests. Zero database, HTTP route, live API, or browser E2E tests exist at baseline.

| Test File / Area | Baseline Classification | Findings & Gaps |
| :--- | :--- | :--- |
| `tests/prompt-synthesizer.test.mjs` | `UNIT TESTED` | Tests string concatenation only; asserts shut-down model `imagen-3.0-generate-002`. |
| `tests/gemini-client.test.mjs` | `UNIT TESTED` (Mock/Fallback only) | Tests only the hardcoded Unsplash fallback when `GEMINI_API_KEY` is unset; asserts buggy `1080x1350` resolution for `9:16`. |
| `tests/ledger.test.mjs` | `UNIT TESTED` (In-memory array only) | Tests `CreditLedgerEngine` pure array methods; does not test PostgreSQL transactions or concurrency locks. |
| `tests/paymob.test.mjs` | `UNIT TESTED` (Self-signed only) | Computes HMAC with `calculateSubscriptionHmac` and passes it to `verifySubscriptionWebhook`. Does not test independent vectors or `/api/webhooks/paymob`. |
| `tests/pricing.test.mjs` & `tests/pricing.test.js` | `UNIT TESTED` | Duplicate test files (`pricing.test.js` uses CommonJS `require` in ESM project and is ignored by `npm test`). |
| Database / Prisma Persistence | `NOT TESTED` | Zero database tests exist at baseline. |
| API Route Handlers (`/api/**`) | `NOT TESTED` | Zero route handler integration tests exist at baseline. |
| Live Gemini / Paymob External APIs | `NOT TESTED` | Requires external production API credentials (`GEMINI_API_KEY`, `PAYMOB_*`). |
| Browser End-to-End Flows | `NOT TESTED` | Zero browser/E2E tests exist at baseline. |

### Finding G: Official Google Model Verification (November 2026)
Verified against official Google AI Studio & Gemini API documentation (`documents/aistudio.google.com/docs/deprecations`, `docs/models`, `docs/pricing`, `docs/image-generation`):

| Model ID in Repo / Docs | Official Status (Nov 2026) | Official Replacement & Pricing |
| :--- | :--- | :--- |
| `imagen-3.0-generate-002` | **SHUT DOWN** (Nov 10, 2025) | Replaced by **`gemini-nano-banana-2.1`** via Interactions API (`ai.interactions.create`). |
| `imagen-4.0-generate-001` / `ultra` / `fast` | **SHUT DOWN** (Aug 17, 2026) | *"Imagen is shut down and no longer available through the Gemini API. Use Nano Banana for image generation and editing."* |
| `gemini-2.5-flash` | **DEPRECATED** (Routes to `gemini-3.5-flash-lite` on Dec 1, 2026; shuts down Mar 15, 2027) | Use **`gemini-3.8-flash`** ($0.75/1M in, $3.75/1M out) or **`gemini-3.5-flash-lite`** ($0.30/1M in, $2.50/1M out). |
| `gemini-2.5-flash-image` | **DEPRECATED** (Shuts down Mar 15, 2027) | Use **`gemini-nano-banana-2.1`** or **`gemini-3.1-flash-lite-image`**. |
| `gemini-3.1-flash-image` | **LEGACY / PREVIOUS GEN** ($0.067 / 1K image) | Superseded by **`gemini-nano-banana-2.1`** ($0.0336 / 1K image — 50% lower cost, higher fidelity). |
| **`gemini-nano-banana-2.1`** | **ACTIVE RECOMMENDED DEFAULT** | Multimodal image generation & up to 14 reference images (`ai.interactions.create`). $1.50/1M input tokens; $30/1M output image tokens (**$0.0336 / 1K image**, $0.0504 / 2K, $0.113 / 4K). |
| **`gemini-3.1-flash-lite-image`** | **ACTIVE FAST / HIGH-VOLUME** | High-efficiency 1K image generation ($0.25/1M input, $30/1M image output = **$0.0336 / 1K image**, batch $0.0168). |
| **`gemini-3-pro-image`** | **ACTIVE STUDIO PRO (4K)** | Reasoning-driven 4K commercial design & typography model (up to 6 object references + 3 style references). |

---

## 3. Remediation Scope & Stage B Verification Summary

All CRITICAL and HIGH findings above were remediated via strict TDD (`RED -> GREEN -> REFACTOR`) on branch `audit/production-readiness`, governed by:
- Design Specification: [`docs/superpowers/specs/2026-11-05-production-readiness-remediation-design.md`](file:///Users/tasawk/StudioProjects/shotistry/docs/superpowers/specs/2026-11-05-production-readiness-remediation-design.md)
- Implementation Plan: [`docs/superpowers/plans/2026-11-05-production-readiness-remediation.md`](file:///Users/tasawk/StudioProjects/shotistry/docs/superpowers/plans/2026-11-05-production-readiness-remediation.md)

### Stage B Verification Results (50 / 50 Automated Tests Passing across 11 Suites)
1. **Product Image Transformation & Fidelity (`tests/image-pipeline.test.mjs`, `tests/gemini-client.test.mjs`, `tests/prompt-synthesizer.test.mjs`):**
   - `rawImageBase64` / `referenceImageBase64` is mandatory; missing product images are rejected (`400`).
   - `isolateProductForeground` extracts a binary alpha mask and isolated product RGBA layer; `compositeProductOnStudioScene` places the customer's exact product pixels onto the studio pedestal with elliptical contact shadows; `verifyProductFidelity` computes a real pixel-preservation score (`fidelityScore >= 0.95`, cross-product substitution fails `< 0.50`).
   - `PromptSynthesizer` and `GeminiClient` target active official models (`gemini-nano-banana-2.1`, `gemini-3-pro-image`, `gemini-3.1-flash-lite-image`) and report `synthIdDetected: false` in `LOCAL_COMPOSITE_SANDBOX` mode.
2. **Database Persistence & Atomic Credit Ledger (`tests/db-ledger.test.mjs`, `tests/api-photoshoots.test.mjs`):**
   - `CreditLedgerService` enforces `SERIALIZABLE` SQL locking (`BEGIN IMMEDIATE`), preventing concurrent race-condition double-spending across 8 simultaneous reservation requests, settling credits on job completion, and releasing reservations with 0 credit loss on generation failure.
3. **Paymob Fail-Closed & Idempotent Webhooks (`tests/paymob.test.mjs`, `tests/paymob-webhook.test.mjs`):**
   - Verified against an independent known HMAC-SHA512 hex vector (`064b84c0034fef1dc8e97f879ab190393befade208498c8ecad8614b577cc701484762f875e7c49efd3eba90ff7c534d879249ea1acfcac0acafa13dc9a611a2`).
   - `/api/webhooks/paymob` fails closed (`503`/`401`) in all environments, persists `WebhookEvent` rows, deduplicates webhook replays, enforces `body.success === true`, and updates `Subscription` lifecycle states (`ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED`).
4. **Admin SQL Telemetry & Audit Log (`tests/admin-metrics.test.mjs`, `tests/e2e-workflow.test.mjs`):**
   - `/api/admin/metrics` computes all KPIs directly from SQL tables (`0` on fresh DB; accurate MRR, subscriber count, and AI expenses after transactions/jobs), and `POST /api/admin/credits/adjust` records immutable `AdminAuditLog` entries.
