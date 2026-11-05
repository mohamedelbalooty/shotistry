# AGENTS.md — Shotistry Development Methodology & Operational Rules

## 1. Project Overview & Mission
**Shotistry** is an enterprise-grade, AI-powered commercial product photography SaaS platform tailored for e-commerce brands, social-commerce merchants, and marketing agencies in **Egypt (EGP)** and **Saudi Arabia (SAR)**.
It transforms raw, phone-captured product photos into ultra-realistic commercial studio photography using official Google Gemini Interactions API image models (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) via `@google/genai` (`ai.interactions.create`), monetized through Paymob recurring subscriptions and credit packages, deployed on Vercel with Next.js, TypeScript, PostgreSQL/SQLite ACID persistence, and an immutable double-entry credit ledger.

---

## 2. Superpowers Development Framework
This project strictly enforces the **Superpowers** engineering methodology (Jesse Vincent / `obra/superpowers`). Every agent working on this repository MUST abide by the following operational disciplines:

### Phase 1: Brainstorming & Requirement Invariants
- Never write production code without an established specification or architectural invariant.
- Explore design trade-offs, edge cases, failure modes, and user friction points before execution.
- Maintain persistent architectural and domain decisions in `docs/architecture/`.

### Phase 2: Implementation Planning (`writing-plans`)
- Break every feature or refactoring task into granular, testable steps.
- Each task step must declare:
  1. Target files and interfaces.
  2. Concrete behavioral expectations.
  3. Pre-conditions and post-conditions.
  4. Red-Green-Refactor test validation steps.

### Phase 3: Test-Driven Development (The Iron Law of TDD)
- **NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST.**
- Write the failing unit, integration, or contract test first (RED).
- Verify the test fails for the expected reason.
- Implement the minimal correct code to make the test pass (GREEN).
- Refactor for clarity, modularity, performance, and type safety (REFACTOR).

### Phase 4: Systematic Debugging
- Never guess or apply speculative patches.
- Formulate a testable hypothesis, reproduce the issue with an isolated test case, inspect logs and traces, fix the root cause, and verify resolution.

### Phase 5: Verification Before Completion
- Never claim a task, feature, or integration is complete without automated test evidence and execution verification.
- Document any remaining manual, external, or credential blockers clearly.

---

## 3. Engineering & Technical Stack Invariants
- **Runtime:** Node.js 24+ LTS.
- **Frontend / Framework:** Next.js 15+ (App Router), React 19, TypeScript (strict mode enabled).
- **Styling & UI:** Tailwind CSS, Radix UI / Lucide React, bilingual RTL/LTR layout primitives (`dir="rtl"` / `dir="ltr"`).
- **Database & Persistence:** PostgreSQL with Prisma ORM / raw typed SQL for high-concurrency ledger operations.
- **AI Engine:** Google Gemini Interactions API (`@google/genai` `ai.interactions.create`) using official API model IDs `gemini-3.1-flash-image` (default multimodal product reference & mask generation), `gemini-3.1-flash-lite-image` (high-efficiency 1K previews), and `gemini-3-pro-image` (4K studio rendering) with `response_format: { type: 'image', mime_type, aspect_ratio, image_size }` and `interaction.output_image.data`, paired with Sharp (`libvips`) PNG/JPEG/WebP foreground product isolation and pixel-fidelity verification (`src/lib/ai/image-processor.ts`). Note: Product marketing aliases (`gemini-nano-banana-2.1`) and retired Imagen models (`imagen-3.0-generate-002` shut down Nov 10, 2025; `imagen-4.0-*` shut down Aug 17, 2026) must never be sent in API requests.
- **Payments:** Paymob Unified Checkout & Subscriptions API with HMAC-SHA512 webhook authentication and idempotent execution.
- **Storage:** Cloudflare R2 / S3-compatible object storage with signed upload and CDN delivery.
- **Credit & Ledger:** Double-entry credit reservation/settlement/refund engine. Mutations must run inside atomic database transactions (`SERIALIZABLE` or `SELECT FOR UPDATE`).

---

## 4. Internationalization & Regional Rules
- All user-facing interfaces must support English (`en`) and Arabic (`ar`) natively with proper RTL typography and directional alignment (`Cairo` / `IBM Plex Sans Arabic` fonts).
- Pricing must be dynamically formatted: Egyptian Pounds (`EGP`) for Egypt, Saudi Riyals (`SAR`) for Saudi Arabia.
- Local payment nuances: Support Mada, Apple Pay, Visa, Mastercard, Meeza, and mobile wallets through Paymob.

