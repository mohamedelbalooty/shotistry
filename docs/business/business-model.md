# Shotistry Business Model & Monetization Strategy

## 1. Business Model Overview
Shotistry operates as a hybrid **B2B SaaS subscription and usage-based platform** designed specifically for e-commerce brands, solo-entrepreneurs, and digital marketing agencies across Egypt and Saudi Arabia.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                        SHOTISTRY MONETIZATION ENGINE                       │
├───────────────────────────────┬────────────────────────────────────────────┤
│   RECURRING SUBSCRIPTION      │       TOP-UP CREDIT PACKS (NON-EXPIRING)   │
│ • Starter (EGP 349 / SAR 79)  │ • 50 Credits (EGP 249 / SAR 49)            │
│ • Pro (EGP 899 / SAR 189)     │ • 150 Credits (EGP 599 / SAR 119)          │
│ • Agency (EGP 1,899 / SAR 399)│ • 500 Credits (EGP 1,499 / SAR 299)        │
├───────────────────────────────┴────────────────────────────────────────────┤
│                        ENTERPRISE / HIGH VOLUME API                        │
│ • Catalog Batch Processing & Custom Dedicated Fine-Tuned Styles            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Subscription Engine & Credit Lifecycle
1. **Recurring Monthly Subscription:**
   - Billed every 30 days via Paymob tokenized card debit.
   - Allocates monthly plan credits immediately upon confirmed server-side webhook execution.
   - Monthly base credits expire at the end of each 30-day billing cycle to prevent unbounded credit hoarding, while encouraging regular active usage.
2. **On-Demand Credit Top-Ups:**
   - Available exclusively to active paid subscribers or trial users needing immediate burst capacity.
   - Top-up credits **never expire** as long as the user account remains in good standing.
3. **Weighted Credit Accounting & Safety Invariant:**
   - Standard `1K` generation (`gemini-3.1-flash-image` / `gemini-3.1-flash-lite-image`) = **1 Credit consumed**.
   - High-resolution & Pro studio tiers consume weighted credits (`2` credits for `2K` Flash or `1K`/`2K` Pro, `3` credits for `4K` Flash, `4` credits for `4K` Pro) enforced server-side (`src/lib/pricing/model-costs.ts`) to protect regional gross margins.
   - Failed, timed-out, or policy-rejected generations automatically release the `CreditReservation` in real-time via the double-entry credit ledger — **zero loss on failure**.

---

## 3. Customer Acquisition & Growth Mechanics
1. **Free Value-First Trial:**
   - 5 free credits upon workspace provisioning (`1K` max, `Flash`/`Lite` models).
2. **Platform Ecosystem Partnerships:**
   - Planned app-store integrations with **Salla (سلة)** and **Zid (زد)** App Stores in Saudi Arabia.
   - Referral program: Existing merchants earn 25 bonus credits for every paying store referred.
3. **Agency Partner Program:**
   - Agencies receive volume tiering, unlimited brand workspaces, 5 team collaboration seats, and asynchronous Batch API processing.
