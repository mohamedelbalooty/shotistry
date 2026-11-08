# Pre-Production Release Checklist

## 1. AI, Unit Economics & Product Fidelity Gate
- [x] Official `@google/genai` SDK configured with official Gemini Interactions API model identifiers (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) — **PASS (`UNIT TESTED` + `CONTRACT TESTED`)**.
- [x] Marketing alias `gemini-nano-banana-2.1` and shut-down Imagen 3/4 identifiers normalized to `gemini-3.1-flash-image` — **PASS (`UNIT TESTED`)**.
- [x] Centralized model-specific cost engine (`src/lib/pricing/model-costs.ts`) separates `standard` (`gemini-3.1-flash-image` 1K `$0.0672` output / `$0.071050` actual), `batch`, `flex`, and `priority` pricing and never conflates Lite's `$0.0336` rate with standard Flash — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Every subscription plan (`FREE`, `STARTER`, `PRO`, `AGENCY`) declares `defaultModel`, `maxImageSize`, and `allowedModels`, with `403` gating & weighted credits (`1`/`2`/`3`/`4`) enforced in `/api/photoshoots/generate` — **PASS (`UNIT TESTED` + `INTEGRATION TESTED`)**.
- [x] Real PNG, JPEG, and WebP pixel decoding (`sharp` + EXIF `.rotate()`), exterior border BFS isolation across all 6 difficult categories, `verifyDeliveredImageFidelity` on the actual delivered `imageUrl`, and optional `lockProductForeground` scene compositing — **PASS (`UNIT TESTED` + `INTEGRATION TESTED` + `CONTRACT TESTED`)**.
- [ ] Live `GEMINI_API_KEY` network smoke test (`tests/live-external-smoke.test.mjs`) — **BLOCKED (`NOT TESTED` — requires external `GEMINI_API_KEY`)**.

## 2. Database, Ledger & Billing Gate
- [x] PostgreSQL migration (`prisma/migrations/20261105000000_init/migration.sql`) applied and verified against real PostgreSQL (`shotistry_audit_test`) — **PASS (`INTEGRATION TESTED`)**.
- [x] `PostgresCreditLedgerService` verified for reservation, settlement, release, and 5-way concurrent double-spend prevention (`SERIALIZABLE` + `SELECT ... FOR UPDATE`) — **PASS (`INTEGRATION TESTED`)**.
- [x] Paymob webhook fails closed when `PAYMOB_HMAC_SECRET` is missing (`503`) or invalid (`401`) and processes signed webhooks idempotently — **PASS (`INTEGRATION TESTED`)**.
- [x] `/api/admin/metrics` computes real SQL COGS from actual `GenerationJob` / `GeneratedImage` models & resolutions via `calculateModelGenerationCost` — **PASS (`INTEGRATION TESTED`)**.
- [ ] Live Paymob Sandbox network checkout session test — **BLOCKED (`NOT TESTED` — requires external `PAYMOB_SECRET_KEY` / `PAYMOB_API_KEY`)**.
- [ ] Live Cloudflare R2 bucket upload & signed URL verification — **BLOCKED (`NOT TESTED` — requires external `R2_*` credentials)**.
