# Pricing Strategy: Egypt (EGP) and Saudi Arabia (SAR)

## 1. Regional Pricing Philosophy
We reject the one-size-fits-all USD pricing model of Western competitors ($19–$39/mo on Stripe). Instead, Shotistry employs purchasing-power-adjusted, localized pricing in **EGP** and **SAR** backed by model- and resolution-weighted credits (`src/lib/pricing/model-costs.ts`) to protect gross margins across both standard interactive shoots and Pro 4K generations.

---

## 2. Subscription Package Architecture & Model Entitlements (Synchronized with `src/lib/pricing/plans.ts`)

### A. Egyptian Market (Billed in EGP via Paymob @ `50.00 EGP/USD`)

| Plan Tier | Price (Monthly) | Credits | Default Model & Size | Max Size | Allowed Models | Effective / Credit | Target Customer |
|---|---|---|---|---|---|---|---|
| **Free Trial (`FREE`)** | **0 EGP** | 5 | `gemini-3.1-flash-image` (`1K`) | `1K` | `Flash`, `Flash Lite` | 0.00 EGP | New signups (1 Brand profile) |
| **Starter (`STARTER`)** | **349 EGP / mo** | 80 | `gemini-3.1-flash-image` (`1K`) | `1K` | `Flash`, `Flash Lite` | 4.36 EGP | Solo Instagram / TikTok sellers |
| **Pro Studio (`PRO`)** | **899 EGP / mo** | 200 | `gemini-3.1-flash-image` (`1K`) | `4K` | `Flash`, `Flash Lite`, `Pro` | 4.50 EGP | Active e-commerce boutiques (3 brands) |
| **Agency Scale (`AGENCY`)** | **1,899 EGP / mo** | 500 | `gemini-3.1-flash-image` (`1K`) | `4K` | `Flash`, `Flash Lite`, `Pro` | 3.80 EGP | Marketing agencies (5 seats, bulk Batch) |

### B. Saudi Arabian Market (Billed in SAR via Paymob @ `3.75 SAR/USD`)

| Plan Tier | Price (Monthly) | Credits | Default Model & Size | Max Size | Allowed Models | Effective / Credit | Target Customer |
|---|---|---|---|---|---|---|---|
| **Free Trial (`FREE`)** | **0 SAR** | 5 | `gemini-3.1-flash-image` (`1K`) | `1K` | `Flash`, `Flash Lite` | 0.00 SAR | New store testing (1 Brand profile) |
| **Starter (`STARTER`)** | **79 SAR / mo** | 80 | `gemini-3.1-flash-image` (`1K`) | `1K` | `Flash`, `Flash Lite` | 0.99 SAR | Emerging Salla & Zid stores |
| **Pro Studio (`PRO`)** | **189 SAR / mo** | 200 | `gemini-3.1-flash-image` (`1K`) | `4K` | `Flash`, `Flash Lite`, `Pro` | 0.95 SAR | Growing e-commerce brands (3 brands) |
| **Agency Scale (`AGENCY`)** | **399 SAR / mo** | 500 | `gemini-3.1-flash-image` (`1K`) | `4K` | `Flash`, `Flash Lite`, `Pro` | 0.80 SAR | Agencies & multi-brand retailers (5 seats) |

---

## 3. Model & Resolution Credit Weight Schedule (`getCreditWeightForGeneration`)

To guarantee that every redeemed credit maintains positive gross margin across EGP and SAR pricing:

| Model ID | Resolution | Credits Deducted | Standard Actual Cost (USD) | Cost per Credit Deducted (USD) | Plan Gate (`validatePlanModelEntitlement`) |
|---|---|---|---|---|---|
| `gemini-3.1-flash-lite-image` | `1K` | **1 Credit** | `$0.035775` | `$0.035775` | All plans (`FREE`–`AGENCY`) |
| `gemini-3.1-flash-image` | `512` | **1 Credit** | `$0.047998` | `$0.047998` | All plans (`FREE`–`AGENCY`) |
| `gemini-3.1-flash-image` *(Default)* | `1K` | **1 Credit** | `$0.071050` | `$0.071050` | All plans (`FREE`–`AGENCY`) |
| `gemini-3.1-flash-image` | `2K` | **2 Credits** | `$0.105658` | `$0.052829` | `PRO` & `AGENCY` (`403` on `FREE`/`STARTER`) |
| `gemini-3.1-flash-image` | `4K` | **3 Credits** | `$0.157570` | `$0.052523` | `PRO` & `AGENCY` (`403` on `FREE`/`STARTER`) |
| `gemini-3-pro-image` | `1K` / `2K` | **2 Credits** | `$0.141960` | `$0.070980` | `PRO` & `AGENCY` (`403` on `FREE`/`STARTER`) |
| `gemini-3-pro-image` | `4K` | **4 Credits** | `$0.250728` | `$0.062682` | `PRO` & `AGENCY` (`403` on `FREE`/`STARTER`) |

---

## 4. On-Demand Top-Up Credit Packs (No Expiration)

| Top-Up Pack | Egypt Price (EGP) | Saudi Arabia Price (SAR) | Effective Price / Credit | Unit Economics Note |
|---|---|---|---|---|
| **50 Extra Credits (`pack_50`)** | `249 EGP` | `49 SAR` | `4.98 EGP` / `0.98 SAR` | Positive margin in both EG (`24.7%`) and SA (`68.3%`). |
| **150 Extra Credits (`pack_150`)** | `599 EGP` | `119 SAR` | `3.99 EGP` / `0.79 SAR` | Positive margin in both EG (`7.8%`) and SA (`63.1%`). |
| **500 Extra Credits (`pack_500`)** | `1,499 EGP` | `299 SAR` | `3.00 EGP` / `0.60 SAR` | SA margin `52.6%`; **EG requires Batch API (`37.4%` margin) or repricing `>= 2,199 EGP`**, since Standard 1K COGS is `3.5525 EGP`. |

---

## 5. Upgrade, Downgrade & Cancellation Policies
- **Upgrades:** Immediate activation upon verified Paymob HMAC-SHA512 webhook receipt.
- **Downgrades:** Takes effect at the end of the current 30-day billing period.
- **Cancellations:** Self-serve cancellation sets `Subscription.status = 'CANCELED'` and `cancelAtPeriodEnd = true` via webhook lifecycle handling.
- **Zero-Loss Failed Generation Guarantee:** Every generation job reserves weighted credits in `CreditReservation` (`PENDING`) before calling the AI pipeline; if generation fails for any reason, `releaseReservation` automatically releases the hold so the customer loses **0 credits**.
