# Pre-Production Release Criteria & Verification Matrix

## 1. Strict Verification Classification Standard
Every release requirement is evaluated using two independent dimensions:
- **Gate Status:** `PASS` | `FAIL` | `BLOCKED` | `NOT TESTED`
- **Verification Scope:** `UNIT TESTED` | `CONTRACT TESTED (MOCKED)` | `INTEGRATION TESTED` | `END-TO-END TESTED` | `LIVE API TESTED` | `NOT TESTED`

| Gate ID | Release Gate Requirement | Gate Status | Verification Scope | Automated Test / Evidence |
|---|---|---|---|---|
| **RC-001** | **Official Gemini API Model IDs (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`)** | **PASS** | `UNIT TESTED` + `CONTRACT TESTED` | `tests/prompt-synthesizer.test.mjs`, `tests/gemini-client.test.mjs` — verifies `gemini-nano-banana-2.1` and retired Imagen IDs normalize to `gemini-3.1-flash-image`. |
| **RC-002** | **Google Gemini Interactions API Schema Compatibility (`response_format`, `output_image.data`, `steps`, `usage`)** | **PASS** | `CONTRACT TESTED (MOCKED)` | `tests/gemini-client.test.mjs` — verifies `input` blocks, `response_format`, Lite `1K` clamping, and output extraction. |
| **RC-003** | **Real PNG, JPEG, and WebP Pixel Decoding & Genuine Final-Image Fidelity Verification** | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` + `CONTRACT TESTED` | `tests/image-pipeline.test.mjs`, `tests/gemini-client.test.mjs` — Sharp decoding + EXIF `.rotate()`, exterior border BFS isolation across all 6 difficult categories, `verifyDeliveredImageFidelity` on the actual delivered `imageUrl`, and `lockProductForeground` compositing. |
| **RC-004** | **Model-Specific Unit Economics, Plan Entitlements & Regional Profitability (`EGP` / `SAR`)** | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` | `tests/pricing.test.mjs`, `tests/admin-metrics.test.mjs`, `tests/api-photoshoots.test.mjs` — verifies `$0.071050` standard Flash 1K actual COGS (never Lite's `$0.0336`), `standard`/`batch`/`flex`/`priority` separation, `403` plan resolution/model gating, weighted credits, and SQL COGS telemetry. |
| **RC-005** | **PostgreSQL Migration & ACID Concurrency (`SERIALIZABLE` + `SELECT ... FOR UPDATE`)** | **PASS** | `INTEGRATION TESTED (POSTGRESQL)` | `tests/postgres-ledger.test.mjs` — applies 17 tables + 7 enums to `shotistry_audit_test` and verifies 5-way concurrent double-spend prevention. |
| **RC-006** | **Fail-Closed Paymob HMAC-SHA512 & Idempotent Webhook Persistence** | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` | `tests/paymob.test.mjs`, `tests/paymob-webhook.test.mjs` — rejects missing/invalid HMAC (`401`/`503`), deduplicates replays, updates `Subscription`, grants credits once. |
| **RC-007** | **Authenticated Workspace Isolation & Signed Asset URLs (`/api/assets/*`, `/api/photoshoots/generate`)** | **PASS** | `INTEGRATION TESTED` | `tests/api-photoshoots.test.mjs`, `tests/e2e-workflow.test.mjs` — `403` cross-tenant block, signed download expiry/tamper protection, zero-loss failure release. |
| **RC-008** | **Real SQL Admin Metrics & Audit Log (`/api/admin/metrics`, `/api/admin/credits/adjust`)** | **PASS** | `INTEGRATION TESTED` | `tests/admin-metrics.test.mjs` — SQL aggregates with real model-cost lookup (`calculateModelGenerationCost`). |
| **RC-009** | **Full Customer Journey E2E Workflow** | **PASS** | `END-TO-END TESTED` | `tests/e2e-workflow.test.mjs` — session -> upload -> generation -> job poll -> signed download -> Paymob webhook -> admin metrics. |
| **RC-010** | **Live Google Gemini API Network Execution (`GEMINI_API_KEY`)** | **BLOCKED** | `NOT TESTED` | `tests/live-external-smoke.test.mjs` — Blocked by missing `GEMINI_API_KEY` credential in local audit environment. |
| **RC-011** | **Live Paymob Sandbox Network Checkout (`PAYMOB_API_KEY` / `PAYMOB_SECRET_KEY`)** | **BLOCKED** | `NOT TESTED` | `tests/live-external-smoke.test.mjs` — Blocked by missing external Paymob merchant credentials in local audit environment. |
| **RC-012** | **Cloudflare R2 Live Bucket Upload (`R2_*`)** | **BLOCKED** | `NOT TESTED` | Blocked by missing external Cloudflare R2 credentials in local audit environment. |

---

## 2. Production Database Implementation & Deployment Requirements
1. **Database Engine:** PostgreSQL 15+ (Neon Serverless Postgres, Supabase Postgres, or AWS RDS PostgreSQL).
2. **Schema & Migrations:** Managed via Prisma (`prisma/schema.prisma` and `prisma/migrations/20261105000000_init/migration.sql` creating 17 tables and 7 enums). Deploy via `npx prisma migrate deploy`.
3. **ACID Concurrency Architecture (`src/lib/ledger/postgres-ledger-service.ts`):** Uses `Prisma.TransactionIsolationLevel.Serializable` + `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR UPDATE` with retry on SQLSTATE `40001` (`P2034`). Enable via `DATABASE_URL="postgresql://..."` and `SHOTISTRY_DB_DRIVER="postgres"`.

---

## 3. Final Release Decision
- **Code, Unit Economics, Genuine Product Fidelity & PostgreSQL Readiness:** **PASS** (73 passing tests across 12 functional suites — 69 in sandboxed `npm test` + 4 real PostgreSQL tests via `REQUIRE_POSTGRES_TESTS=1`; `0` failures; `npx tsc --noEmit` and `npm run build` clean).
- **Production Release Gate Status:** **BLOCKED ON EXTERNAL CREDENTIALS (`RC-010`, `RC-011`, `RC-012`)** — Keep `audit/production-readiness` isolated; do **not** merge into `main` or deploy to production until staging credentials (`GEMINI_API_KEY`, `PAYMOB_*`, `R2_*`) are provisioned and `tests/live-external-smoke.test.mjs` passes (`LIVE API TESTED`).
