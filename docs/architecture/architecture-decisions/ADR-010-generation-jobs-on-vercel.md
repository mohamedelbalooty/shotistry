# ADR-010: Asynchronous Recoverable Generation Jobs & Reaper on Vercel Fluid Compute

## Status: ACCEPTED (Supersedes ADR-003)
**Deciders:** Solutions Architect, Backend Engineer, DevOps Lead  
**Date:** November 2026  

---

## 1. Context & Problem Statement
Commercial product photography generation using multimodal models (`gemini-3.1-flash-image`, `gemini-3-pro-image`) requires between 4 and 15 seconds per photoshoot depending on requested resolution (1K vs 4K), prompt complexity, and Sharp foreground verification.

Holding a synchronous HTTP connection open for 15 seconds presents significant reliability risks:
1. Client network drops or mobile browser timeouts disconnect the response while the serverless function continues running.
2. If the client disconnects before the response completes, credits may be deducted or held in limbo without the merchant receiving the generated deliverable.
3. Rapid UI interactions or merchant double-clicks risk triggering duplicate reservations and deducting multiple credits.

ADR-003 originally suggested using Upstash QStash, but introducing an external queue vendor adds unnecessary recurring infrastructure cost, additional points of failure, and latency overhead during staging and beta phases.

---

## 2. Decision
1. **Asynchronous Execution via Next.js `after()` on Vercel Fluid Compute:**
   - The generation request handler (`POST /api/photoshoots/generate`) executes input validation, synthesizes the studio prompt, checks plan entitlements, creates the `GenerationJob` in `QUEUED` state, and atomically reserves credits inside an ACID transaction.
   - For asynchronous requests (`Prefer: respond-async` header or default async flow), the endpoint returns **HTTP 202 Accepted** `{ success: true, jobId, status: 'QUEUED' }` within ~50ms.
   - The AI transformation pipeline is scheduled via Next.js `after()`, allowing background compute to run with extended duration (`maxDuration: 60` in `vercel.json`) while the client immediately receives its job ID.
2. **Idempotency Key Enforcement:**
   - Clients must send an `Idempotency-Key` header with each photoshoot request.
   - If an existing job with the same idempotency key exists in the workspace, the system returns the existing `jobId` and status without creating duplicate reservations or double-charging credits.
3. **Strict State Machine & Double-Entry Ledger Protection:**
   - States: `QUEUED` → `PROCESSING` → `COMPLETED` | `FAILED`.
   - Exactly-once ledger settlement:
     - On completion: `settleReservation(reservationId)` executes atomically in a serializable transaction, marking the reservation `SETTLED` and writing a `JOB_SETTLEMENT` entry.
     - On terminal failure: `releaseReservation(reservationId)` executes atomically, marking the reservation `RELEASED`, restoring available credits to the merchant.
4. **Scheduled Reaper Cron (`/api/cron/generation-reaper`):**
   - Runs every 5 minutes (via Vercel Cron).
   - Authenticated with timing-safe `CRON_SECRET` bearer check.
   - Inspects `GenerationJob` records in `PROCESSING` status whose `startedAt` or `heartbeatAt` is older than 10 minutes.
   - Marks the stale job as `FAILED` (`lastErrorCode: 'TIMEOUT_STALE_HEARTBEAT'`) and releases the pending credit reservation so no customer ever loses credits due to serverless timeouts or container crashes.
5. **Client Polling & Observability:**
   - The frontend studio polls `GET /api/jobs/{id}` at an interval of 1.5s to 3s with exponential backoff.
   - Cross-workspace access to `/api/jobs/{id}` is strictly forbidden (HTTP 403/404).

---

## 3. Consequences
- **Positive:** Fast UI response times (<100ms); zero stuck reservations; zero lost credits; double-spend prevention through database-level idempotency; no external message queue subscription costs.
- **Negative:** Requires background worker execution and reaper cron monitoring.

