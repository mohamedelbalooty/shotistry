# Shotistry (شوتيستري) — AI Commercial Product Photography SaaS

> **Transform Ordinary Smartphone Product Photos into Commercial Studio-Grade Imagery in Seconds.**  
> Built for e-commerce brands, solo-entrepreneurs, and marketing agencies across **Egypt (EGP)** and **Saudi Arabia (SAR)**.

---

## 🚀 Key Highlights & Architectural Strengths

- **AI Engine:** Powered by Google Gemini and Imagen 3 (`@google/genai`) with dual-stage masked inpainting and light-wrapping to guarantee **100% genuine product fidelity** (zero distorted logos or hallucinated text).
- **Regionalized Payments:** Deep integration with **Paymob**, supporting local recurring subscriptions and top-up packages in **Egyptian Pounds (EGP)** (Visa, Mastercard, Meeza, Mobile Wallets) and **Saudi Riyals (SAR)** (Mada, Apple Pay, Cards).
- **Double-Entry Credit Ledger:** Auditable financial accounting system with 3-phase atomic reservation (`RESERVE` $\to$ `SETTLE` / `RELEASE`), eliminating concurrency race conditions and credit loss.
- **Bilingual Experience:** Native Arabic RTL and English LTR user interface tailored with regional typography (`Cairo`), cultural presets (Gulf Luxury, Ramadan & Eid, Desert Dunes, Modern Cairo Boutique), and instant multi-aspect exports (Salla, Zid, Instagram, TikTok).
- **Full-Stack Performance:** Built on Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, Prisma ORM, and PostgreSQL, optimized for Vercel serverless deployment.

---

## 📁 Project Architecture & Documentation

- `docs/research/`: Market research, competitor benchmarking (Pebblely, Flair, Photoroom, Laqta), customer personas, and verified source register.
- `docs/business/`: Business model, localized pricing strategy, unit economics, profitability analysis, and 18-month financial forecast.
- `docs/ai/`: Gemini & Imagen 3 model evaluation, cost tracking, prompt synthesizer architecture, regional preset library, and product fidelity strategy.
- `docs/payments/`: Paymob API research, HMAC-SHA512 webhook security, recurring subscription state machine, and payment architecture.
- `docs/architecture/`: System architecture, Prisma database schema, REST API specifications, and Architecture Decision Records (ADRs).
- `docs/product/`: PRD, user journeys, RICE feature prioritization, and product roadmap.
- `docs/security/`: STRIDE threat model, KSA PDPL / Egyptian Data Protection compliance, and production security checklist.
- `docs/qa/`: Test strategy, test execution results, and pre-production release checklist.
- `docs/operations/`: Vercel deployment guide, environment setup, and monitoring runbook.

---

## 🛠️ Getting Started

### Prerequisites
- Node.js 20+ LTS (Tested on Node 24)
- PostgreSQL database (Local or Cloud e.g. Neon/Supabase)

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
```bash
cp .env.example .env.local
# Configure your DATABASE_URL, GEMINI_API_KEY, PAYMOB keys, etc.
```

### 3. Database Migration & Seeding
```bash
npx prisma db push
# or npx prisma migrate dev
```

### 4. Running the Development Server
```bash
npm run dev
```
Open `http://localhost:3000` to access the Shotistry studio.

### 5. Running Automated Tests
```bash
npm test
```

