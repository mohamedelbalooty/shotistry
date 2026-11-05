# Project Status — Shotistry (Independent Audit & Final Blocker Remediation)

- **Original Baseline Commit (`main`):** `95fb12ab6d9a16277a93df14db1eba03b860c968` (Untouched)
- **Active Audit & Remediation Branch:** `audit/production-readiness`
- **Audit Status:** Stage A (Independent Audit) + Stage B (TDD Remediation) + Final Critical Blocker Remediation **COMPLETE**
- **Production Release Decision:** **BLOCKED ON EXTERNAL CREDENTIALS** (All local unit, contract, Sharp PNG/JPEG/WebP, PostgreSQL migration/concurrency, and E2E gates **PASS**; live Gemini/Paymob/R2 network calls are **NOT TESTED / BLOCKED** pending external credentials).

---

## 1. Final Blocker Remediation Matrix

| Area | Finding | Remediation Implemented | Gate Status | Verification Scope |
|---|---|---|---|---|
| **1. Gemini Model Identifiers** | `gemini-nano-banana-2.1` marketing alias was used instead of official API model IDs. | Replaced with official API model IDs: **`gemini-3.1-flash-image`** (default), **`gemini-3.1-flash-lite-image`** (1K fast), and **`gemini-3-pro-image`** (4K Pro). `normalizeGeminiImageModel()` normalizes `gemini-nano-banana-2.1` and retired Imagen IDs to `gemini-3.1-flash-image`. | **PASS** | `UNIT TESTED` + `CONTRACT TESTED` |
| **2. Gemini Interactions API Schema** | Request used deprecated `response_modalities` / `generation_config` and read `interaction.outputs`. | Updated `src/lib/ai/gemini-client.ts` to send official `response_format: { type: 'image', mime_type, aspect_ratio, image_size }` (uppercase `K`, Lite clamped to `1K`), extract `interaction.output_image.data` (with `steps[].content[]` fallback), and parse `interaction.usage`. | **PASS** | `CONTRACT TESTED (MOCKED)` |
| **3. PNG, JPEG & WebP Image Processing** | Non-PNG inputs fell back to a synthetic SHA-256 hash image. | Removed SHA-256 synthetic fallback. Implemented `decodeProductImage()` in `src/lib/ai/image-processor.ts` using **Sharp (`libvips`)** for real PNG, JPEG, and WebP pixel decoding + EXIF auto-orientation, with real fixtures (`tests/fixtures/*.png`, `*.jpg`, `*.webp`) and clear validation errors for unsupported/corrupt files. | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` |
| **4. PostgreSQL Migration & Concurrency** | Only SQLite `BEGIN IMMEDIATE` was exercised in tests. | Implemented `PostgresCreditLedgerService` (`src/lib/ledger/postgres-ledger-service.ts`) using `@prisma/client` (`SERIALIZABLE` + `SELECT ... FOR UPDATE`), applied `prisma/migrations/20261105000000_init/migration.sql` to PostgreSQL (`shotistry_audit_test`), and verified 5-way concurrent double-spend prevention in `tests/postgres-ledger.test.mjs`. | **PASS** | `INTEGRATION TESTED (POSTGRESQL)` |
| **5. Paymob Webhook & Admin Metrics** | Fail-open HMAC and hardcoded demo metrics in `95fb12a`. | Fail-closed HMAC-SHA512 (`503`/`401`), idempotent `WebhookEvent` + `Subscription` + `CreditLedger` persistence, and real SQL admin metrics. | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` |
| **6. Live External APIs (Gemini, Paymob, R2)** | Requires external live API keys. | Added `tests/live-external-smoke.test.mjs`; reports exact external credential blockers when `GEMINI_API_KEY` / `PAYMOB_*` are unset. | **BLOCKED** | `NOT TESTED` |

---

## 2. Automated Test Suite Summary (13 Suites / 62 Tests: 60 Passing, 2 Blocked on Live Credentials)
- `tests/prompt-synthesizer.test.mjs` — **PASS** (`UNIT TESTED`: official `gemini-3.1-flash-image` default & alias normalization)
- `tests/gemini-client.test.mjs` — **PASS** (`UNIT TESTED` + `CONTRACT TESTED (MOCKED)`: official Interactions API `response_format`, `output_image.data`, `steps` fallback, error handling)
- `tests/image-pipeline.test.mjs` — **PASS** (`INTEGRATION TESTED`: real Sharp PNG, JPEG, WebP fixture decoding, EXIF orientation, foreground isolation, studio compositing, fidelity verification, and unsupported/corrupt format rejection)
- `tests/postgres-ledger.test.mjs` — **PASS** (`INTEGRATION TESTED (POSTGRESQL)`: 17-table + 7-enum migration on `shotistry_audit_test`, reservation/settlement/release lifecycle, and 5-way concurrent double-spend prevention)
- `tests/db-ledger.test.mjs` — **PASS** (`INTEGRATION TESTED`: SQL ledger lifecycle & concurrency)
- `tests/ledger.test.mjs` — **PASS** (`UNIT TESTED`: double-entry accounting invariants)
- `tests/pricing.test.mjs` — **PASS** (`UNIT TESTED`: regional EGP/SAR pricing and credit package invariants)
- `tests/paymob-hmac.test.mjs` — **PASS** (`UNIT TESTED`: independent HMAC-SHA512 fixture vector)
- `tests/webhook-paymob.test.mjs` — **PASS** (`INTEGRATION TESTED`: fail-closed auth, replay deduplication, subscription & credit grant)
- `tests/api-photoshoots.test.mjs` — **PASS** (`INTEGRATION TESTED`: generation route, `402` insufficient credits, `403` cross-workspace isolation, automatic reservation release)
- `tests/admin-metrics.test.mjs` — **PASS** (`INTEGRATION TESTED`: real SQL metrics & `AdminAuditLog`)
- `tests/asset-storage.test.mjs` — **PASS** (`INTEGRATION TESTED`: signed asset upload & download verification)
- `tests/e2e-workflow.test.mjs` — **PASS** (`END-TO-END TESTED`: full customer & webhook journey)
- `tests/live-external-smoke.test.mjs` — **BLOCKED / SKIPPED** (`NOT TESTED`: requires live `GEMINI_API_KEY` and `PAYMOB_SECRET_KEY`)
