# Project Status: Shotistry AI SaaS Platform

**Current Phase:** Phase 0 & Phase 1 — Comprehensive Discovery, Market/Financial Research & Architectural Specification  
**Last Updated:** November 2026  
**Status:** Active Execution  

---

## 1. Roadmap & Phase Tracker

| Phase | Description | Status | Deliverables & Artifacts |
|---|---|---|---|
| **Phase 0** | Market, Competitor, AI & Payment Research | 🟡 In Progress | `docs/research/`, `docs/business/`, `docs/ai/`, `docs/payments/` |
| **Phase 1** | Product Discovery, UX & Architecture Specification | 🟡 In Progress | `docs/product/`, `docs/architecture/`, `docs/security/`, `docs/qa/` |
| **Phase 2** | Technical Foundation & Core Infrastructure | ⚪ Planned | Next.js 15, Prisma/PostgreSQL, Auth, Storage, Billing Core |
| **Phase 3** | AI Generation Engine & Prompt System | ⚪ Planned | `@google/genai`, Prompt Engineering Library, Fidelity Pipeline |
| **Phase 4** | Customer Experience & Creative Studio | ⚪ Planned | Studio UI, Bilingual RTL/LTR, Upload, Presets, Canvas, History |
| **Phase 5** | Paymob Payment & Credit Ledger Engine | ⚪ Planned | Subscription lifecycle, HMAC webhooks, Double-entry credit ledger |
| **Phase 6** | Admin Portal & Business Intelligence | ⚪ Planned | Metrics, Plan manager, User audit, Generation telemetry |
| **Phase 7** | Quality Assurance, Hardening & Security | ⚪ Planned | Unit tests, Integration tests, E2E tests, Vulnerability scan |
| **Phase 8** | Production Deployment & Release Handover | ⚪ Planned | Vercel deployment, CI/CD, Documentation handover |

---

## 2. Key Architecture & Business Decisions Log

1. **AI Image Generation Engine:** Selected `@google/genai` with hybrid model routing:
   - High-throughput / quick iteration: `gemini-2.5-flash-image` / `gemini-3.1-flash-image` with multimodal image-to-image conditioning.
   - Ultra-premium studio output: `imagen-3.0-generate-002` / `imagen-4.0-generate-001` with explicit mask inpainting to guarantee 100% product fidelity (zero hallucinated logos or distorted labels).
2. **Payments & Subscriptions:** Paymob Unified Checkout & Subscriptions API with 30-day billing cycle for recurring subscriptions and one-off packs for top-ups. Webhook verification using HMAC-SHA512 (`${trigger_type}for${subscriptionId}` for subscriptions; concatenated field payload for transactions).
3. **Credit Management:** Immutable double-entry ledger with 3-step state machine: `RESERVED` $\to$ `SETTLED` (on generation success) or `RELEASED` (on generation failure/timeout). Strict prevention of race conditions and overspending.
4. **Markets & Pricing:** Dual-currency localization: Egyptian Pounds (`EGP`) for Egypt and Saudi Riyals (`SAR`) for Saudi Arabia, matching purchasing power and regional market expectations while ensuring a 75%+ gross margin target.
5. **Localization:** Arabic-first and English bilingual support with native RTL typography and terminology tailored to regional merchants in Cairo, Riyadh, and Jeddah.

---

## 3. Active Blockers & External Dependencies
- Live Gemini API Key: Required for production execution (sandbox mock and simulation engines configured for automated test pipelines).
- Live Paymob Merchant Account & HMAC Secret: Required for production transactions (sandbox mock and HMAC verification simulator implemented for test suites).
