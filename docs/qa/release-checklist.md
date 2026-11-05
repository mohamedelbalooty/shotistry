# Pre-Production Release Checklist

## 1. AI & Product Fidelity Gate
- [x] Official `@google/genai` SDK configured with official Gemini Interactions API model identifiers (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) — **PASS (`UNIT TESTED` + `CONTRACT TESTED`)**.
- [x] Marketing alias `gemini-nano-banana-2.1` and shut-down Imagen 3/4 identifiers removed from API requests and normalized to `gemini-3.1-flash-image` — **PASS (`UNIT TESTED`)**.
- [x] Real PNG, JPEG, and WebP pixel decoding implemented via `sharp` (`libvips`) with phone-camera EXIF orientation normalization and zero SHA-256 hash synthesis — **PASS (`INTEGRATION TESTED`)**.
- [ ] Live `GEMINI_API_KEY` network smoke test (`tests/live-external-smoke.test.mjs`) — **BLOCKED (`NOT TESTED` — requires external `GEMINI_API_KEY`)**.

## 2. Database, Ledger & Billing Gate
- [x] PostgreSQL migration (`prisma/migrations/20261105000000_init/migration.sql`) applied and verified against real PostgreSQL (`shotistry_audit_test`) — **PASS (`INTEGRATION TESTED`)**.
- [x] `PostgresCreditLedgerService` verified for reservation, settlement, release, and 5-way concurrent double-spend prevention (`SERIALIZABLE` + `SELECT ... FOR UPDATE`) — **PASS (`INTEGRATION TESTED`)**.
- [x] Paymob webhook fails closed when `PAYMOB_HMAC_SECRET` is missing (`503`) or invalid (`401`) and processes signed webhooks idempotently — **PASS (`INTEGRATION TESTED`)**.
- [ ] Live Paymob Sandbox network checkout session test — **BLOCKED (`NOT TESTED` — requires external `PAYMOB_SECRET_KEY` / `PAYMOB_API_KEY`)**.
