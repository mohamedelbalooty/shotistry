# Shotistry System Architecture Specification

## 1. High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT / BROWSER LAYER                            │
│  Next.js 15 App Router | React 19 | Tailwind CSS | Bilingual RTL/LTR (AR/EN)│
│  Creative Studio | Brand Manager | Photoshoot Wizard | Billing Portal       │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │ HTTPS / WSS / SSE
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                       APPLICATION LAYER (VERCEL SERVERLESS)                 │
│  Next.js Route Handlers & Server Actions                                    │
│  ┌───────────────────────┬───────────────────────┬───────────────────────┐  │
│  │ Auth & Token Service  │ Photoshoot Orchestr.  │ Paymob & Billing Svc  │  │
│  └───────────────────────┴───────────────────────┴───────────────────────┘  │
│  ┌───────────────────────┬───────────────────────┬───────────────────────┐  │
│  │ Double-Entry Ledger   │ Distributed Limiter   │ Email Dispatcher      │  │
│  └───────────────────────┴───────────────────────┴───────────────────────┘  │
└───────┬──────────────┬──────────────┬──────────────────┬─────────────────┘
        │              │              │                  │
        ▼              ▼              ▼                  ▼
┌──────────────┐ ┌──────────────┐ ┌───────────────┐ ┌──────────────────────┐
│ PERSISTENCE  │ │ AI INFERENCE │ │ COMMUNICATIONS│ │ DISTRIBUTED LIMITER  │
│ PostgreSQL 16│ │ Google GenAI │ │ Resend API    │ │ Upstash Redis Cluster│
│ Prisma ORM   │ │ gemini-3.1   │ │ Bilingual     │ │ Atomic Lua Scripts   │
│ ACID / Locks │ │ SynthID      │ │ RTL/LTR Email │ │ Fail-closed fallback │
└──────────────┘ └──────────────┘ └───────────────┘ └──────────────────────┘
```

---

## 2. Core Architectural Invariants

1. **Decoupled Asynchronous Job Execution:**
   - Image generation is never executed synchronously within a client HTTP request.
   - Requests initiate a `GenerationJob` record with status `PENDING`, reserve the requisite credits in the ledger, and return a 202 Accepted with a unique `jobId`.
   - Dedicated job processing handles AI API invocation, fallback retries, and result persistence.
   - Client tracks job progress via Server-Sent Events (SSE) or client polling at `/api/jobs/[id]`.
2. **Immutable Double-Entry Credit Accounting:**
   - User balances are never stored as simple mutable integers.
   - Every balance mutation is backed by a debit or credit record in `CreditLedger` tied to an audit reason (`SUBSCRIPTION_GRANT`, `RESERVATION_HOLD`, `RESERVATION_SETTLE`, `RESERVATION_RELEASE`, `TOP_UP_PACK`).
3. **Stateless Scalability:**
   - Zero local server disk dependencies. All assets reside in S3/R2 object storage with signed URL access.
   - Application servers can scale from 0 to hundreds of instances seamlessly on Vercel.
