# Shotistry — Project Status & Production-Readiness Verification

**Last Updated:** 2026-11-05  
**Current Branch:** `audit/production-readiness`  
**Audited Baseline Commit:** `95fb12ab6d9a16277a93df14db1eba03b860c968` (`main`)

---

## 1. Independent Audit & Remediation Status

| Domain / Subsystem | Baseline (`95fb12a`) Status | Remediated Status (`audit/production-readiness`) | Verification Tier |
| :--- | :--- | :--- | :--- |
| **Customer Product Image Transformation** | ❌ Unused `referenceImageBase64`; Studio called `new GeminiClient()` in browser and returned Unsplash stock URLs. | ✅ Mandatory `rawImageBase64`; pure-Node RGBA PNG decoder, foreground alpha mask isolation, studio pedestal/shadow compositing, and `ai.interactions.create` integration (`src/lib/ai/image-processor.ts`, `src/lib/ai/gemini-client.ts`). | `UNIT TESTED` + `INTEGRATION TESTED` + `END-TO-END TESTED` |
| **Product Fidelity & SynthID Provenance** | ❌ 0% implemented; hardcoded `synthIdDetected: true` on stock photos. | ✅ Real pixel-level foreground preservation score (`verifyProductFidelity`), binary alpha mask & isolated product inspection UI, and truthful `synthIdDetected` (`false` in sandbox mode, `true` only on live Gemini output). | `UNIT TESTED` + `INTEGRATION TESTED` + `END-TO-END TESTED` |
| **Gemini Model Architecture** | ❌ Referenced shut-down `imagen-3.0-generate-002` (retired Nov 10, 2025) and deprecated `gemini-2.5-flash`. | ✅ Updated to active official models: `gemini-nano-banana-2.1` (default, $0.0336/1K), `gemini-3-pro-image` (4K Pro), and `gemini-3.1-flash-lite-image`, with automatic legacy model normalization. | `UNIT TESTED` + `INTEGRATION TESTED` |
| **Database Persistence & Atomic Credit Ledger** | ❌ `@prisma/client` was never imported in `src/`; no migrations existed. | ✅ Initial Prisma migration (`prisma/migrations/20261105000000_init/migration.sql`) + ACID SQL persistence (`src/lib/db/prisma.ts`, `src/lib/ledger/credit-ledger-service.ts`) enforcing `SERIALIZABLE` locking, concurrent double-spend prevention, settlement, and automatic release on failure. | `UNIT TESTED` + `INTEGRATION TESTED` + `END-TO-END TESTED` |
| **Paymob Webhooks & Subscriptions** | ❌ Failed open in non-production, used placeholder secret, returned `200 OK` on unsigned requests, 0 DB writes. | ✅ Fails closed (`503`/`401`) in **all** environments (`src/app/api/webhooks/paymob/route.ts`), deduplicates `WebhookEvent.eventId`, checks `success === true`, updates `Subscription` lifecycle (`ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELED`), and grants credits atomically. | `UNIT TESTED` + `INTEGRATION TESTED` + `END-TO-END TESTED` |
| **Administration Metrics & Audit Log** | ❌ Hardcoded static demo JSON (`totalUsers: 1480`, `mrrUsd: 5880`). | ✅ Real SQL aggregates (`src/app/api/admin/metrics/route.ts`) and audited credit adjustments (`src/app/api/admin/credits/adjust/route.ts`) writing immutable `AdminAuditLog` records. | `INTEGRATION TESTED` + `END-TO-END TESTED` |
| **Live External Provider Credentials** | ❌ Unconfigured in local workspace. | ⚠️ Code pathways implemented and fail-closed; live external execution requires production `GEMINI_API_KEY`, `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, and managed PostgreSQL `DATABASE_URL`. | `NOT TESTED` (External Credential Blocker) |

---

## 2. Explicit Test Integrity Classification

In accordance with the Final Truth Standard, automated verification is strictly separated by execution tier:

### A. `UNIT TESTED`
- `tests/prompt-synthesizer.test.mjs` — 10-component prompt synthesis, regional presets, and normalization of retired Imagen/Flash models to `gemini-nano-banana-2.1`.
- `tests/image-pipeline.test.mjs` — RGBA PNG decoding/encoding, foreground alpha mask extraction, studio pedestal/contact-shadow compositing, and pixel-preservation `fidelityScore` cross-product verification.
- `tests/gemini-client.test.mjs` — Mandatory `referenceImageBase64` enforcement, aspect ratio resolution mapping (`1:1`, `4:5`, `9:16`, `16:9`), and truthful sandbox telemetry (`synthIdDetected: false`).
- `tests/ledger.test.mjs` — Pure double-entry ledger state reducer invariants.
- `tests/paymob.test.mjs` — Independent known HMAC-SHA512 hex vector verification (`064b84c0034fef1dc8e97f879ab190393befade208498c8ecad8614b577cc701484762f875e7c49efd3eba90ff7c534d879249ea1acfcac0acafa13dc9a611a2`), tamper detection, and currency subunit conversion.
- `tests/pricing.test.mjs` — Regional EGP and SAR pricing plans, volume top-up packs, and bilingual currency formatting.

### B. `INTEGRATION TESTED` (Real SQL Persistence & Route Handlers)
- `tests/db-ledger.test.mjs` — Idempotent workspace provisioning (`5` free trial credits), atomic credit reservation/settlement/release, concurrent 8-way race condition protection (`Promise.allSettled`), and `idempotencyKey` deduplication.
- `tests/api-photoshoots.test.mjs` — `POST /api/photoshoots/generate` and `GET /api/jobs/[id]` validation, credit reservation/settlement, automatic credit refund on corrupt/failed image processing, cross-workspace `403 Forbidden` isolation, and HMAC-SHA256 signed asset download URLs.
- `tests/paymob-webhook.test.mjs` — `POST /api/webhooks/paymob` and `POST /api/billing/checkout-intent` fail-closed enforcement (`503`/`401`), replay idempotency (`WebhookEvent`), failed payment rejection (`success: false` -> `0` credits), and subscription state transitions (`ACTIVE` -> `PAST_DUE` -> `CANCELED`).
- `tests/admin-metrics.test.mjs` — `GET /api/admin/metrics` and `POST /api/admin/credits/adjust` role authorization (`403`), real SQL financial/job telemetry, and `AdminAuditLog` persistence.

### C. `END-TO-END TESTED`
- `tests/e2e-workflow.test.mjs` — Full merchant & admin lifecycle across session creation, product image upload & signed download, studio transformation, job status polling, Paymob subscription checkout + signed webhook settlement, and admin audit verification.
- Live HTTP Server E2E verification against running Next.js server (`npm run build && npm run start`).

### D. `LIVE API TESTED` / `NOT TESTED` (External Credential Blockers)
- **Live Google Gemini API (`GEMINI_API_KEY`)**: `NOT TESTED` in this local environment because no live Google AI Studio billing key is provisioned in `.env`. When `GEMINI_API_KEY` is absent, the platform explicitly operates in `LOCAL_COMPOSITE_SANDBOX` mode (`synthIdDetected: false`).
- **Live Paymob Gateway (`PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`)**: `NOT TESTED` against remote Paymob servers because live merchant credentials are not provisioned in `.env`. The webhook endpoint fails closed (`503`/`401`) unless a real `PAYMOB_HMAC_SECRET` is configured.
- **External Managed PostgreSQL (`DATABASE_URL`)**: Prisma schema and SQL migration (`prisma/migrations/20261105000000_init/migration.sql`) are generated and verified; local execution runs against Node.js 24's built-in ACID SQLite engine (`node:sqlite` `DatabaseSync` with `BEGIN IMMEDIATE` serializable transactions) because the macOS sandbox blocks System V `shmget` required by the local `postgres` daemon.
