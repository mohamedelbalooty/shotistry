# Changelog — Shotistry Platform

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
