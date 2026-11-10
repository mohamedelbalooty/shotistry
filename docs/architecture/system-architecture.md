# Shotistry System Architecture Specification

## 1. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT / BROWSER LAYER                            │
│  Next.js 15 App Router | React 19 | Tailwind CSS | Bilingual RTL/LTR (AR/EN)│
│  Creative Studio | Brand Manager | Photoshoot Wizard | Billing Portal       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / REST / Polling
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER (VERCEL SERVERLESS)                 │
│  Next.js Route Handlers & Server Actions                                    │
│  ┌───────────────────────┬───────────────────────┬───────────────────────┐  │
│  │ Auth & Token Service  │ Photoshoot Orchestr.  │ Paymob & Billing Svc  │  │
│  │ (Argon2id, Beta Gate) │ (Async Jobs & Reaper) │ (Zero-Trust Intent)   │  │
│  └───────────────────────┴───────────────────────┴───────────────────────┘  │
│  ┌───────────────────────┬───────────────────────┬───────────────────────┐  │
│  │ Double-Entry Ledger   │ Distributed Limiter   │ Email & Observability │  │
│  │ (ACID Transactions)   │ (Upstash Redis / SQL) │ (Resend & Redact Log) │  │
│  └───────────────────────┴───────────────────────┴───────────────────────┘  │
└───────┬──────────────┬──────────────┬──────────────────┬─────────────────┘
        │              │              │                  │
        ▼              ▼              ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────────────┐
│ PERSISTENCE  │ │ AI INFERENCE │ │ COMMUNICATIONS│ │ OBJECT STORAGE       │
│ PostgreSQL 16│ │ Google GenAI │ │ Resend API    │ │ Cloudflare R2 (S3)   │
│ Prisma ORM   │ │ gemini-3.1   │ │ Bilingual     │ │ Direct Upload Intent │
│ Dual SQLite  │ │ SynthID / ΔE │ │ RTL/LTR Email │ │ Presigned Signed URLs│
└──────────────┘ └──────────────┘ └───────────────┘ └──────────────────────┘
```

---

## 2. Core Architectural Invariants

1. **Decoupled Asynchronous Job Execution & Reaper Automation:**
   - Image generation is never executed synchronously within a blocking client HTTP request.
   - Client submits generation requests with an `Idempotency-Key` header, returning HTTP 202 Accepted and a `jobId`.
   - Credit escrow reservations (`CreditReservation`) lock funds during processing.
   - If image generation succeeds, the reservation is atomically settled (`JOB_SETTLEMENT`).
   - If image generation fails, the reservation is atomically released (`RELEASE_FAIL_SAFE`).
   - An automated reaper cron (`POST /api/cron/generation-reaper`, protected by `CRON_SECRET`) runs periodically to detect and release any stale jobs lingering past 300 seconds.

2. **Immutable Double-Entry Credit Accounting:**
   - User balances are never stored as mutable scalar integers.
   - Every credit mutation is recorded as a debit or credit row in `CreditLedger` inside atomic database transactions (`withSerializableTransaction` in SQLite; `SERIALIZABLE` isolation in PostgreSQL).
   - The ledger enforces zero double-spending, non-negative available balances, and exact reconciliation between subscriptions, top-up packages, reservations, and refund reversals.

3. **Cloudflare R2 Direct Client Storage & Access Control:**
   - Client browsers upload source product images directly to Cloudflare R2 via short-lived (15-minute) S3 presigned PUT URLs (`POST /api/assets/upload-intent`).
   - Upload completion is verified via `POST /api/assets/finalize` which inspects real file dimensions, magic byte MIME headers, and file integrity via Sharp before activating the asset.
   - Delivered studio images are accessed strictly through time-limited HMAC-SHA256 signed URLs (`GET /api/assets/url`), strictly preventing cross-workspace IDOR access.

4. **Zero-Trust Paymob Webhook Resolution (ADR-011):**
   - The backend stores client checkout intents in `PaymentTransaction` with a cryptographically random `specialReference` prior to redirecting the merchant to Paymob.
   - When Paymob webhook events arrive, the transaction is resolved strictly by matching `specialReference` or `order.id` against database intent records.
   - Credits, plan tier, currency, and workspace allocation are derived from the pre-persisted intent record—completely ignoring unauthenticated or spoofed client-supplied parameters.
   - Compensating refund reversals (`REFUND_REVERSAL`) allow negative ledger balances if a merchant consumed credits prior to a payment reversal.

5. **Structured Observability & Zero-Secret Logging:**
   - All server log entries are emitted as single-line structured JSON with standard schema (`timestamp`, `level`, `message`, `scope`, `requestId`, `traceId`, `workspaceId`, `userId`, `metadata`, `error`).
   - Request context is bound across async execution call stacks using Node.js `AsyncLocalStorage`.
   - The logging pipeline strictly redacts authorization headers, session cookies, passwords, API keys, client secrets, HMAC signatures, S3 presigned signatures, raw 64-hex action tokens, and URL `#token=` fragments, while safeguarding against circular object references.

6. **Closed Beta Invite Gating & Merchant Feedback:**
   - Registration can be gated via feature flag `SHOTISTRY_BETA_INVITE_REQUIRED=1`, requiring a valid, unexpired, and unexhausted `BetaInviteCode`.
   - Merchants can submit 1-click evaluations (`THUMBS_UP` / `THUMBS_DOWN`) with categorized quality tags (`POOR_LIGHTING`, `BLURRY_FOREGROUND`, `HALLUCINATED_TEXT`, `STYLE_MISMATCH`, `DISTORTED_PRODUCT`) via `POST /api/images/[id]/feedback` with strict cross-workspace authorization.
   - Administrative telemetry tracks complete beta funnel progression: registrations → verified users → photoshoot creation → completed generation → paid subscription conversion.
