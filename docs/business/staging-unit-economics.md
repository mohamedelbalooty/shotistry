# Shotistry — Staging Unit Economics & Financial Configuration Analysis

**Document Version:** 1.0.0  
**Phase:** Phase 10 — Milestone M6  
**Status:** COMPLETE / FOUNDER REVIEW REQUIRED  
**Reference Configuration:** `src/lib/pricing/financial-config.ts`, `src/lib/pricing/model-costs.ts`, `src/lib/pricing/plans.ts`  
**Pricing Baseline Date:** 2026-11-09  

---

## 1. Executive Summary & Financial Problem Statement

Shotistry operates as a cross-border AI SaaS with a structural currency asymmetry:
- **Cost of Goods Sold (COGS):** 100% denominated in **US Dollars (USD)** (Google Gemini Interactions API, Cloudflare R2 storage, Vercel, Neon, Resend).
- **Revenue:** Collected in local fiat currencies via Paymob: **Egyptian Pounds (EGP)** for Egypt and **Saudi Riyals (SAR)** for Saudi Arabia.

### Key Findings:
1. **Saudi Arabia (SAR) is High Margin & Robust:**
   - At the official SAMA peg of **3.75 SAR/USD**, all plans generate **64% to 69% gross margins at 100% credit utilization** and **75% to 79% gross margins at expected 65% utilization**.
   - Top-up packs generate **56% to 62% worst-case gross margins**.
2. **Egypt (EGP) High-Volume Offers are at Severe Risk (Negative or Razor-Thin Margins):**
   - At an FX rate of **50.0 EGP/USD**, generating one 1K commercial product image with `gemini-3.1-flash-image` costs **~$0.07105 USD ≈ 3.553 EGP** (including direct API tokens, Cloudflare storage, and a 3% retry buffer).
   - **EG Top-Up Pack 500 (`pack_500`):** Sells 500 credits for **1,499 EGP** (net **3.00 EGP / credit**). At 100% utilization, COGS + Paymob fees equal **1,820.72 EGP**, creating an immediate **loss of −321.72 EGP (−21.5% gross margin)**.
   - **EG Agency Plan (`AGENCY`):** Sells 500 credits for **1,899 EGP** (net **3.80 EGP / credit**). At 100% utilization, gross profit is only **67.28 EGP (3.6% gross margin)**. Any modest EGP devaluation or customer retry surge immediately drives this tier into cash deficit.
3. **Current In-Code Invariant:**
   - In accordance with founder directives, **no in-code subscription prices or credit amounts have been changed**.
   - This document establishes the centralized configuration and scenario models so the founder can approve adjustments prior to live commercial onboarding.

---

## 2. Centralized Financial Configuration Baseline

All financial constants are centralized in `src/lib/pricing/financial-config.ts`:

### 2.1 Foreign Exchange (FX) Rates
| Region | Currency | Baseline Rate (per USD) | Source & Benchmark | Verification Date |
|---|---|---|---|---|
| **Egypt (EG)** | EGP | **50.00** | Central Bank of Egypt / Market Reference Rate | 2026-11-09 |
| **Saudi Arabia (SA)** | SAR | **3.75** | Saudi Central Bank (SAMA) Official Fixed Peg | 2026-11-09 |

### 2.2 Payment Gateway Fee Schedule (Paymob)
| Region | Payment Method | Variable Fee | Fixed Transaction Fee | Effective Note |
|---|---|---|---|---|
| **Egypt (EG)** | Visa / Mastercard | 2.75% | 3.00 EGP | Default blended schedule |
| **Egypt (EG)** | Mobile Wallets | 2.00% | 2.00 EGP | Vodafone Cash, Orange, WE, Etisalat |
| **Egypt (EG)** | Meeza Debit | 2.75% | 3.00 EGP | Domestic card scheme |
| **Saudi Arabia (SA)** | Mada Domestic Debit | 1.00% | 1.00 SAR | Low interchange debit |
| **Saudi Arabia (SA)** | Visa / Mastercard | 2.70% | 1.00 SAR | International credit cards |
| **Saudi Arabia (SA)** | Apple Pay | 2.70% | 1.00 SAR | Routed via network |
| **Saudi Arabia (SA)** | Blended Default | 2.50% | 1.00 SAR | Standard blended rate |

### 2.3 Value Added Tax (VAT) Treatment
| Region | Tax Scheme | Standard Rate | Display Treatment |
|---|---|---|---|
| **Egypt (EG)** | Egyptian VAT (Law 67/2016) | 14% | Display prices currently treated as VAT-inclusive (`pricesIncludeVat: true`). |
| **Saudi Arabia (SA)** | Saudi ZATCA VAT | 15% | Display prices currently treated as VAT-inclusive (`pricesIncludeVat: true`). |

> [!IMPORTANT]
> If prices are strictly gross (VAT-inclusive), net merchant revenue is `Gross / (1 + VAT)`. This further compresses Egypt gross margins unless VAT is collected on top or accounted for in B2B tax invoicing.

### 2.4 Infrastructure & Cloud Storage Costs
- **Cloudflare R2 Object Storage:**
  - Storage: **$0.015 / GB-month** (~$0.000015 / 1 MB image-month).
  - Data Egress: **$0.00 (Zero Egress Fees)**.
  - Per-image delivery & storage amortized estimate: **$0.0005 USD**.
- **Vercel Pro:** **$20.00 / month**.
- **Neon Managed PostgreSQL:** **$0.00 / month** (Launch/Free Tier for staging; ~$19/mo scaled).
- **Resend Transactional Email:** **$0.00 / month** (Free tier up to 3,000 emails/month).
- **Sentry Error Monitoring:** **$0.00 / month** (Developer Free tier).
- **Total Fixed Staging Overhead:** **$20.00 USD / month** (~1,000 EGP or 75 SAR).

---

## 3. Unit COGS Breakdown per Commercial Image

Every commercial photoshoot generation consumes the following unit costs (based on official Google Gemini Developer API pricing):

| Cost Component | Standard 1K Flash (`gemini-3.1-flash-image`) | Lite 1K Preview (`gemini-3.1-flash-lite-image`) | Studio Pro 1K/2K (`gemini-3-pro-image`) | Studio Pro 4K (`gemini-3-pro-image`) |
|---|---|---|---|---|
| **Input Product Images (2x)** | $0.001120 (2,240 tokens @ $0.50/M) | $0.000560 (2,240 tokens @ $0.25/M) | $0.002240 (1,120 tokens @ $2.00/M) | $0.002240 (1,120 tokens @ $2.00/M) |
| **Text Prompt Directives** | $0.000175 (350 tokens @ $0.50/M) | $0.000088 (350 tokens @ $0.25/M) | $0.000700 (350 tokens @ $2.00/M) | $0.000700 (350 tokens @ $2.00/M) |
| **Image Generation Output** | $0.067200 (1,120 tokens @ $60/M) | $0.033600 (1,120 tokens @ $30/M) | $0.134400 (1,120 tokens @ $120/M) | $0.240000 (2,000 tokens @ $120/M) |
| **Direct API Subtotal** | **$0.068495** | **$0.034248** | **$0.137340** | **$0.242940** |
| **Retry Buffer (3%)** | $0.002055 | $0.001027 | $0.004120 | $0.007288 |
| **Storage & Delivery (R2)** | $0.000500 | $0.000500 | $0.000500 | $0.000500 |
| **Total Delivered COGS ($USD)** | **$0.071050** | **$0.035775** | **$0.141960** | **$0.250728** |
| **COGS in EGP (@ 50.0 EGP/$)** | **3.553 EGP** | **1.789 EGP** | **7.098 EGP** | **12.536 EGP** |
| **COGS in SAR (@ 3.75 SAR/$)** | **0.266 SAR** | **0.134 SAR** | **0.532 SAR** | **0.940 SAR** |
| **Credit Consumption Weight** | **1 credit** | **1 credit** | **2 credits** | **4 credits** |

> [!NOTE]
> Pro models consume 2 credits (1K/2K) or 4 credits (4K). This ensures that heavy Pro rendering does not deplete unit economics, maintaining parity with the Flash base rate.

---

## 4. Subscription Plan Profitability & Scenario Modeling

### 4.1 Egypt (EGP) Subscription Plans
*FX Baseline: 50.0 EGP / USD. Default Model: `gemini-3.1-flash-image` (1K).*

| Plan | Price (EGP) | Monthly Credits | Revenue/Credit | Paymob Fee | Worst-Case COGS (100% util) | Worst-Case Margin (%) | Expected COGS (65% util) | Expected Margin (%) | Conservative Margin (40%) |
|---|---|---|---|---|---|---|---|---|---|
| **STARTER** | 349 EGP | 80 | 4.36 EGP | 12.60 EGP | 284.20 EGP | **14.9%** | 184.73 EGP | **43.5%** | **63.5%** |
| **PRO** | 899 EGP | 200 | 4.50 EGP | 27.72 EGP | 710.50 EGP | **17.9%** | 461.83 EGP | **45.5%** | **64.8%** |
| **AGENCY** | 1,899 EGP | 500 | 3.80 EGP | 55.22 EGP | 1,776.25 EGP | **3.6%** | 1,154.56 EGP | **36.3%** | **59.1%** |

### 4.2 Saudi Arabia (SAR) Subscription Plans
*FX Baseline: 3.75 SAR / USD. Default Model: `gemini-3.1-flash-image` (1K).*

| Plan | Price (SAR) | Monthly Credits | Revenue/Credit | Paymob Fee | Worst-Case COGS (100% util) | Worst-Case Margin (%) | Expected COGS (65% util) | Expected Margin (%) | Conservative Margin (40%) |
|---|---|---|---|---|---|---|---|---|---|
| **STARTER** | 79 SAR | 80 | 0.99 SAR | 2.98 SAR | 21.32 SAR | **69.2%** | 13.86 SAR | **78.7%** | **85.4%** |
| **PRO** | 189 SAR | 200 | 0.95 SAR | 5.73 SAR | 53.29 SAR | **68.8%** | 34.64 SAR | **78.6%** | **85.3%** |
| **AGENCY** | 399 SAR | 500 | 0.80 SAR | 10.98 SAR | 133.22 SAR | **64.0%** | 86.59 SAR | **75.4%** | **83.1%** |

---

## 5. Top-Up Credit Packs Profitability Analysis

Top-up credits **do not expire**, meaning merchants can consume them gradually or in large bursts. In SaaS financial accounting, non-expiring credits must be evaluated assuming high or complete redemption over time.

### 5.1 Egypt (EGP) Top-Up Packs
| Pack ID | Credits | Price (EGP) | Revenue / Credit | Paymob Fee | Worst-Case Cost (100%) | Worst-Case Gross Profit | Worst-Case Margin (%) | Expected Margin (65%) |
|---|---|---|---|---|---|---|---|---|
| `pack_50` | 50 | 249 EGP | 4.98 EGP | 9.85 EGP | 187.48 EGP | +61.52 EGP | **+24.7%** | **+50.3%** |
| `pack_150` | 150 | 599 EGP | 3.99 EGP | 19.47 EGP | 552.35 EGP | +46.65 EGP | **+7.8%** | **+38.5%** |
| `pack_500` | 500 | 1,499 EGP | 3.00 EGP | 44.22 EGP | 1,820.47 EGP | **−321.47 EGP** | **−21.4% (DEFICIT)** | **+19.5%** |

> [!CAUTION]
> **Deficit Warning on `pack_500` (Egypt):**
> A merchant buying `pack_500` for 1,499 EGP pays only 3.00 EGP per image. Google charges Shotistry 3.553 EGP per image delivered. At 100% redemption, Shotistry loses **321 EGP on every package sold**. Even at 85% utilization, gross profit is near zero.

### 5.2 Saudi Arabia (SAR) Top-Up Packs
| Pack ID | Credits | Price (SAR) | Revenue / Credit | Paymob Fee | Worst-Case Cost (100%) | Worst-Case Gross Profit | Worst-Case Margin (%) | Expected Margin (65%) |
|---|---|---|---|---|---|---|---|---|
| `pack_50` | 50 | 49 SAR | 0.98 SAR | 2.23 SAR | 15.55 SAR | +33.45 SAR | **+68.3%** | **+78.2%** |
| `pack_150` | 150 | 119 SAR | 0.79 SAR | 3.98 SAR | 43.95 SAR | +75.05 SAR | **+63.1%** | **+74.7%** |
| `pack_500` | 500 | 299 SAR | 0.60 SAR | 8.48 SAR | 141.70 SAR | +157.30 SAR | **+52.6%** | **+67.5%** |

---

## 6. Foreign Exchange (EGP) Stress Testing & Sensitivity Analysis

Because AI costs are settled in USD, devaluation of the Egyptian Pound compresses gross margins linearly unless local prices are dynamically indexed.

The table below models Egypt gross margins across potential EGP devaluation scenarios (at 100% credit utilization):

| Plan / Pack | Baseline (50 EGP/$) | Stress 1 (+10% / 55 EGP) | Stress 2 (+20% / 60 EGP) | Stress 3 (+30% / 65 EGP) | Break-Even FX Rate |
|---|---|---|---|---|---|
| **EG STARTER** (349 EGP / 80 cr) | +14.9% | +6.7% | **−1.4% (loss)** | −9.5% | **59.2 EGP / USD** |
| **EG PRO** (899 EGP / 200 cr) | +17.9% | +10.0% | +2.1% | **−5.8% (loss)** | **61.3 EGP / USD** |
| **EG AGENCY** (1,899 EGP / 500 cr) | +3.6% | **−5.7% (loss)** | −15.0% | −24.4% | **51.9 EGP / USD** |
| **EG `pack_150`** (599 EGP / 150 cr) | +7.8% | **−1.1% (loss)** | −10.0% | −18.9% | **54.4 EGP / USD** |
| **EG `pack_500`** (1,499 EGP / 500 cr) | **−21.4% (loss)** | −33.3% | −45.1% | −57.0% | **40.9 EGP / USD** |

---

## 7. Fixed Infrastructure Overhead & Break-Even Targets

- **Staging & Early Beta Fixed Cost:** **$20.00 / month** (~1,000 EGP or ~75 SAR).
- **Production Scaled Fixed Cost (est.):**
  - Vercel Pro: $20.00 / mo
  - Neon Postgres Pro: $19.00 / mo
  - Sentry Team: $26.00 / mo
  - Resend Pro: $20.00 / mo
  - **Total Production Overhead:** **$85.00 / month** (~4,250 EGP or ~319 SAR).

### Subscribers Needed to Cover Fixed Costs (at expected 65% utilization):
| Region & Tier | Gross Profit per Sub / Month | Subs to Cover Staging ($20/mo) | Subs to Cover Production ($85/mo) |
|---|---|---|---|
| **EG STARTER** | ~151.7 EGP (~$3.03 USD) | 7 subscribers | 28 subscribers |
| **EG PRO** | ~409.5 EGP (~$8.19 USD) | 3 subscribers | 11 subscribers |
| **SA STARTER** | ~62.2 SAR (~$16.57 USD) | 2 subscribers | 6 subscribers |
| **SA PRO** | ~148.6 SAR (~$39.63 USD) | 1 subscriber | 3 subscribers |

---

## 8. Strategic Recommendations for the Founder

Prior to launching the public commercial rollout, the following adjustments are recommended for founder authorization:

1. **Phase 10 Beta Protection:**
   - Keep current prices for closed beta merchants to validate quality and customer demand.
   - Restrict beta merchants in Egypt to **STARTER** and **PRO** tiers, or enforce an invite-only quota on `pack_500`.
2. **Post-Beta Pricing Adjustments for Egypt (EGP):**
   - **`pack_500`:** Increase price from 1,499 EGP to **2,199 EGP** (4.40 EGP/credit). This restores gross margin to **+17% worst-case** and **+45% expected**.
   - **`pack_150`:** Increase price from 599 EGP to **749 EGP** (4.99 EGP/credit) to achieve **+26% worst-case margin**.
   - **`AGENCY`:** Increase price from 1,899 EGP to **2,499 EGP** (5.00 EGP/credit) to achieve **+24% worst-case margin** and provide insulation against FX fluctuations.
3. **Credit Weighting as Margin Protection:**
   - The established credit weighting in `src/lib/pricing/model-costs.ts` (Pro 1K/2K = 2 credits, Pro 4K = 4 credits) effectively hedges against premium model costs and should be strictly retained.
4. **Automated Financial Margin Guardrails:**
   - The test suite `tests/unit-economics.test.mjs` and guardrail checker `checkFinancialGuardrails()` actively monitor any price or catalog changes to ensure no new package inadvertently introduces negative margins.

