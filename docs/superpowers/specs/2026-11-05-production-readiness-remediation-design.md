# Superpowers Design Specification — Shotistry Production-Readiness Remediation

**Date:** 2026-11-05  
**Branch:** `audit/production-readiness`  
**Baseline Commit:** `95fb12ab6d9a16277a93df14db1eba03b860c968`  
**Audit Reference:** [`docs/audit/production-readiness-audit.md`](file:///Users/tasawk/StudioProjects/shotistry/docs/audit/production-readiness-audit.md)

---

## 1. Architectural Invariants & Remediation Goals

1. **Real Customer Product Image Participation & Fidelity Pipeline:**
   - Every photoshoot generation request **MUST** require and process the customer's uploaded product image (`rawImageBase64` or uploaded asset).
   - Implement a real pixel-level image processing & compositing module (`src/lib/ai/image-processor.ts`) using pure Node.js `zlib` / PNG/BMP/JPEG/SVG decoding & PNG encoding (zero native binary compilation issues) that:
     1. Decodes the uploaded customer product image and validates dimensions/format.
     2. Performs foreground product isolation (alpha matting / background segmentation to extract the product foreground mask and bounding box).
     3. Computes a verifiable **Foreground Pixel Preservation Score** (`fidelityScore`: `0.0` to `1.0`) by comparing the isolated product foreground pixels against the final composited output.
   - In **`GeminiClient` (`src/lib/ai/gemini-client.ts`)**:
     - Target official active Gemini Interactions API models (`gemini-3.1-flash-image` default, `gemini-3-pro-image` for 4K studio pro, `gemini-3.1-flash-lite-image` for fast previews) via `ai.interactions.create`, passing the actual customer product image (`{ type: 'image', mime_type, data }`), isolated foreground mask/reference, synthesized studio prompt, and `response_format: { type: 'image', mime_type, aspect_ratio, image_size }`.
     - When `GEMINI_API_KEY` is configured and live, execute the live Gemini Interactions API call, then composite/verify the original product foreground to guarantee logo and label preservation, reporting `executionMode: 'LIVE_GEMINI_API'` and `synthIdDetected: true`.
     - When `GEMINI_API_KEY` is absent or in local/sandbox mode, execute the **Local Studio Compositor (`executionMode: 'LOCAL_COMPOSITE_SANDBOX'`)**: procedurally render the preset's studio lighting environment, horizon, pedestal, and contact shadow, and composite the **actual isolated customer product pixels** onto the studio scene, returning a valid PNG data URL containing the user's real product, with `synthIdDetected: false` (never claiming SynthID on non-Gemini outputs!).

2. **Database Persistence & Atomic Credit Ledger (`PostgreSQL` + `Prisma`):**
   - Instantiate a singleton Prisma Client (`src/lib/db/prisma.ts`) connected to PostgreSQL.
   - Implement `CreditLedgerService` (`src/lib/ledger/credit-ledger-service.ts`) backed by PostgreSQL `SERIALIZABLE` / row-locked (`SELECT ... FOR UPDATE`) transactions:
     - Provision default user & workspace with 5 free trial credits (`TRIAL_GRANT`) idempotently.
     - `reserveCredits`: locks the workspace row, computes sum of `CreditLedger.amount` minus `PENDING` `CreditReservation.amount`, rejects with `Insufficient credits` if available balance is less than required, and inserts a `PENDING` `CreditReservation`.
     - `settleReservation`: transitions reservation to `SETTLED` and appends a negative `GENERATION_DEBIT` entry to `CreditLedger` with `idempotencyKey`.
     - `releaseReservation`: transitions reservation to `RELEASED` on generation failure so the customer loses zero credits.

3. **Authenticated Workspace Session, Asset Storage & Server-Side Studio Pipeline:**
   - Implement workspace session resolution (`src/lib/auth/session.ts` and `GET /api/workspace/session`) supporting authenticated user headers/cookies and default workspace provisioning, enforcing workspace ownership isolation.
   - Implement asset storage & signed URL verification (`src/lib/storage/asset-storage.ts`, `POST /api/assets/upload`, `GET /api/assets/download`) using HMAC-SHA256 signed URLs with expiration enforcement.
   - Refactor `POST /api/photoshoots/generate` and add `GET /api/jobs/[id]`:
     - Authenticate workspace ownership.
     - Require `rawImageBase64` (or `assetId`).
     - Atomically reserve credits in PostgreSQL before AI execution.
     - Persist `Photoshoot`, `GenerationJob` (`QUEUED -> PROCESSING -> COMPLETED/FAILED`), and `GeneratedImage`.
     - Settle credits on completion or release reservation on failure.
   - Refactor `src/app/studio/page.tsx`:
     - Remove direct `GeminiClient` browser import.
     - Send the uploaded product photo (`uploadedImage`) to `POST /api/photoshoots/generate`.
     - Sync real credit balances and job history from the backend.
     - Display truthful provenance telemetry (`LIVE_GEMINI_API` vs `LOCAL_COMPOSITE_SANDBOX`, actual measured `fidelityScore`, and conditional SynthID badge).

4. **Fail-Closed, Idempotent Paymob Webhooks & Server Checkout Intent:**
   - Refactor `src/app/api/webhooks/paymob/route.ts`:
     - **Fail closed in all environments**: if `PAYMOB_HMAC_SECRET` is missing or equals `'placeholder_hmac_secret_sha512'`, return `500` configuration error; if HMAC is missing or invalid, return `401 Unauthorized` regardless of `NODE_ENV`.
     - Reject payloads that lack a valid transaction or subscription structure (`400 Bad Request`).
     - Persist incoming events in `WebhookEvent` with unique `eventId` and SHA-256 `payloadHash`. If an `eventId` was already `PROCESSED`, return `200 OK` `{ received: true, duplicate: true }` without re-granting credits.
     - For transaction webhooks, verify `body.success === true`, `!body.is_voided`, and `!body.is_refunded` before granting credits and recording a `SUCCEEDED` `PaymentTransaction`. Failed transactions record `FAILED` status and grant `0` credits.
     - For subscription webhooks (`Subscription Created`, `renewed`, `payment_failed`, `suspended`, `canceled`), update `Subscription` status in PostgreSQL (`ACTIVE`, `PAST_DUE`, `CANCELED`) and grant plan credits once per billing cycle event.
   - Implement `POST /api/billing/checkout-intent` to create a server-side pending `PaymentTransaction` / checkout session, and update `src/app/pricing/page.tsx` so production checkout goes through the server API rather than client-side `addCredits`.

5. **Database-Backed Admin Metrics & Audited Credit Adjustments:**
   - Refactor `GET /api/admin/metrics` to query real PostgreSQL aggregates from `User`, `Workspace`, `Subscription`, `PaymentTransaction`, `GenerationJob`, `CreditLedger`, and `AdminAuditLog` — zero hardcoded demo constants.
   - Implement `POST /api/admin/credits/adjust` requiring admin authorization, atomically inserting an `ADMIN_ADJUSTMENT` ledger record and an `AdminAuditLog` row (`adminId`, `action`, `targetType`, `targetId`, `metadata`).
   - Refactor `src/app/admin/page.tsx` to load live data from `GET /api/admin/metrics` and submit credit adjustments to `POST /api/admin/credits/adjust`.

