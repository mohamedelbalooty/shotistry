# Pre-Production Release Criteria & Verification Matrix

## 1. Strict Verification Classification Standard
Every release requirement is evaluated using two independent dimensions:
- **Gate Status:** `PASS` | `FAIL` | `BLOCKED` | `NOT TESTED`
- **Verification Scope:** `UNIT TESTED` | `CONTRACT TESTED (MOCKED)` | `INTEGRATION TESTED` | `END-TO-END TESTED` | `LIVE API TESTED` | `NOT TESTED`

| Gate ID | Release Gate Requirement | Gate Status | Verification Scope | Automated Test / Evidence |
|---|---|---|---|---|
| **RC-001** | **Official Gemini API Model IDs (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`)** | **PASS** | `UNIT TESTED` + `CONTRACT TESTED` | `tests/prompt-synthesizer.test.mjs`, `tests/gemini-client.test.mjs` — verifies `gemini-nano-banana-2.1` and retired Imagen IDs are normalized to `gemini-3.1-flash-image` and never sent in API requests. |
| **RC-002** | **Google Gemini Interactions API Schema Compatibility (`response_format`, `output_image.data`, `steps`, `usage`)** | **PASS** | `CONTRACT TESTED (MOCKED)` | `tests/gemini-client.test.mjs` — verifies exact request payload (`input` blocks + `response_format: { type: 'image', mime_type, aspect_ratio, image_size }`), uppercase `1K`/`2K`/`4K` normalization, Lite `1K` clamping, and `interaction.output_image.data` / `steps[].content[]` extraction. |
| **RC-003** | **Real PNG, JPEG, and WebP Pixel Decoding & Studio Compositing (Zero Hash Synthesis)** | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` | `tests/image-pipeline.test.mjs` — decodes real `tests/fixtures/*.png`, `*.jpg`, `*.webp` and EXIF-oriented phone JPEG files via `sharp` (`libvips`), isolates foreground pixels, verifies `fidelityScore >= 0.95`, and rejects unsupported/corrupt formats (`PDF`, `GIF`, `HEIC`, truncated JPEG). |
| **RC-004** | **PostgreSQL Migration & ACID Concurrency (`SERIALIZABLE` + `SELECT ... FOR UPDATE`)** | **PASS** | `INTEGRATION TESTED (POSTGRESQL)` | `tests/postgres-ledger.test.mjs` — applies `prisma/migrations/20261105000000_init/migration.sql` (17 tables, 7 enums) to isolated PostgreSQL database `shotistry_audit_test` and verifies reservation, settlement, release, and 5-way concurrent double-spend prevention via `PostgresCreditLedgerService`. |
| **RC-005** | **Fail-Closed Paymob HMAC-SHA512 & Idempotent Webhook Persistence** | **PASS** | `UNIT TESTED` + `INTEGRATION TESTED` | `tests/paymob-hmac.test.mjs`, `tests/webhook-paymob.test.mjs` — rejects missing/invalid HMAC (`401`/`503`), deduplicates via `WebhookEvent`, updates `Subscription`, and grants credits exactly once. |
| **RC-006** | **Authenticated Workspace Isolation (`403` Cross-Tenant Enforcement)** | **PASS** | `INTEGRATION TESTED` | `tests/api-photoshoots.test.mjs`, `tests/e2e-workflow.test.mjs` |
| **RC-007** | **Signed Upload & Download Asset URLs (`/api/assets/upload`, `/api/assets/download`)** | **PASS** | `INTEGRATION TESTED` | `tests/asset-storage.test.mjs` |
| **RC-008** | **Real SQL Admin Metrics & Audit Log (`/api/admin/metrics`, `/api/admin/credits/adjust`)** | **PASS** | `INTEGRATION TESTED` | `tests/admin-metrics.test.mjs` |
| **RC-009** | **Full Customer Journey E2E Workflow** | **PASS** | `END-TO-END TESTED` | `tests/e2e-workflow.test.mjs` |
| **RC-010** | **Live Google Gemini API Network Execution (`GEMINI_API_KEY`)** | **BLOCKED** | `NOT TESTED` | `tests/live-external-smoke.test.mjs` — Blocked by missing external `GEMINI_API_KEY` credential in local audit environment. |
| **RC-011** | **Live Paymob Sandbox Network Checkout (`PAYMOB_API_KEY` / `PAYMOB_SECRET_KEY`)** | **BLOCKED** | `NOT TESTED` | `tests/live-external-smoke.test.mjs` — Blocked by missing external Paymob merchant credentials in local audit environment. |
| **RC-012** | **Cloudflare R2 Live Bucket Upload (`R2_*`)** | **BLOCKED** | `NOT TESTED` | Blocked by missing external Cloudflare R2 credentials in local audit environment. |

---

## 2. Production Database Implementation & Deployment Requirements
1. **Database Engine:** PostgreSQL 15+ (Neon Serverless Postgres, Supabase Postgres, or AWS RDS PostgreSQL).
2. **Schema & Migrations:** Managed via Prisma (`prisma/schema.prisma` and `prisma/migrations/20261105000000_init/migration.sql` creating 17 tables and 7 enums). Deploy in CI/CD via `npx prisma migrate deploy`.
3. **ACID Concurrency Architecture (`src/lib/ledger/postgres-ledger-service.ts`):**
   - Uses `Prisma.TransactionIsolationLevel.Serializable` paired with an explicit `SELECT "id" FROM "Workspace" WHERE "id" = $1 FOR UPDATE` row-level pessimistic lock on the parent `Workspace` record and bounded automatic retry on PostgreSQL SQLSTATE `40001` (`P2034`).
   - Enable PostgreSQL mode in production by setting `DATABASE_URL="postgresql://..."` and `SHOTISTRY_DB_DRIVER="postgres"`.

---

## 3. Final Release Decision
- **Code, Schema, Image Pipeline & PostgreSQL Readiness:** **PASS** (All 60 automated unit, contract, integration, PostgreSQL, and E2E tests pass across 12 suites; 2 live external API smoke tests in `tests/live-external-smoke.test.mjs` are skipped/blocked pending external credentials; `tsc --noEmit` and `next build` succeed with 0 errors).
- **Production Release Gate Status:** **BLOCKED ON EXTERNAL CREDENTIALS (`RC-010`, `RC-011`, `RC-012`)** — Do **not** merge `audit/production-readiness` into `main` or deploy to production until live `GEMINI_API_KEY` and Paymob Sandbox credentials are provisioned in staging and `tests/live-external-smoke.test.mjs` passes (`LIVE API TESTED`).

