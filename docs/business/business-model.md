# Shotistry Business Model & Monetization Strategy

## 1. Business Model Overview
Shotistry operates as a hybrid **B2B SaaS subscription and usage-based platform** designed specifically for e-commerce brands, solo-entrepreneurs, and digital marketing agencies across Egypt and Saudi Arabia.

```
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
3. **Credit Accounting & Safety Invariant:**
   - 1 Generated Image = 1 Credit consumed.
   - Failed, timed-out, or policy-rejected generations automatically refund the reserved credit in real-time via the double-entry credit ledger.
   - Zero risk of silent credit burn.

---

## 3. Customer Acquisition & Growth Mechanics
1. **Free Value-First Trial:**
   - 5 free credits upon email and phone verification.
   - Watermarked exports with standard resolution to showcase photo-realism without commercial exploitation.
2. **Platform Ecosystem Partnerships:**
   - Deep app-store integration with **Salla (سلة)** and **Zid (زد)** App Stores in Saudi Arabia.
   - Referral program: Existing merchants earn 25 bonus credits for every paying store referred.
3. **Agency Partner Program:**
   - Agencies receive volume tiering, multiple brand workspaces, team access, and a 15% revenue share on client subscriptions they manage.

