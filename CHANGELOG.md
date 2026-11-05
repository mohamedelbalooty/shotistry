# Changelog — Shotistry Platform

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
