# Pricing Strategy: Egypt (EGP) and Saudi Arabia (SAR)

## 1. Regional Pricing Philosophy
We reject the one-size-fits-all USD pricing model of Western competitors ($19–$39/mo on Stripe). Instead, Shotistry employs purchasing-power-adjusted, localized pricing designed to maximize market penetration while guaranteeing high gross margins.

---

## 2. Subscription Package Architecture (Synchronized with `src/lib/pricing/plans.ts`)

### A. Egyptian Market (Billed in EGP via Paymob)

| Plan Tier | Price (Monthly) | Included Credits | USD Equiv. | Effective Cost / Credit | Target Customer | Key Features Included |
|---|---|---|---|---|---|---|
| **Free Trial** | **0 EGP** | 5 Credits | $0.00 | 0.00 EGP | New signups | 5 trial credits, 1K resolution, 1 Brand profile |
| **Starter** | **349 EGP / mo** | 80 Credits | ~$6.98 | 4.36 EGP | Solo Instagram / TikTok sellers | 80 monthly credits, HD export, zero watermarks, commercial license |
| **Pro (Recommended)** | **899 EGP / mo** | 200 Credits | ~$17.98 | 4.50 EGP | Active e-commerce boutiques | 200 monthly credits, 4K export, 3 Brand profiles, regional presets |
| **Agency / Studio** | **1,899 EGP / mo** | 500 Credits | ~$37.98 | 3.80 EGP | Marketing agencies & top brands | 500 monthly credits, 4K export, unlimited brands, 5 team seats |

### B. Saudi Arabian Market (Billed in SAR via Paymob)

| Plan Tier | Price (Monthly) | Included Credits | USD Equiv. | Effective Cost / Credit | Target Customer | Key Features Included |
|---|---|---|---|---|---|---|
| **Free Trial** | **0 SAR** | 5 Credits | $0.00 | 0.00 SAR | New store testing | 5 trial credits, 1K resolution, 1 Brand profile |
| **Starter** | **79 SAR / mo** | 80 Credits | ~$21.07 | 0.99 SAR | Emerging Salla & Zid stores | 80 monthly credits, HD export, zero watermarks, commercial license |
| **Pro (Recommended)** | **189 SAR / mo** | 200 Credits | ~$50.40 | 0.95 SAR | Growing e-commerce brands | 200 monthly credits, 4K export, 3 Brand profiles, regional presets |
| **Agency / Studio** | **399 SAR / mo** | 500 Credits | ~$106.40 | 0.80 SAR | Agencies & multi-brand retailers | 500 monthly credits, 4K export, unlimited brands, 5 team seats |

---

## 3. On-Demand Top-Up Credit Packs (No Expiration)

| Top-Up Pack | Egypt Price (EGP) | Saudi Arabia Price (SAR) | Effective Price / Credit |
|---|---|---|---|
| **50 Extra Credits (`pack_50`)** | 249 EGP | 49 SAR | ~4.98 EGP / ~0.98 SAR |
| **150 Extra Credits (`pack_150`)** | 599 EGP | 119 SAR | ~3.99 EGP / ~0.79 SAR |
| **500 Extra Credits (`pack_500`)** | 1,499 EGP | 299 SAR | ~3.00 EGP / ~0.60 SAR |

---

## 4. Upgrade, Downgrade & Cancellation Policies
- **Upgrades:** Immediate activation upon verified Paymob HMAC-SHA512 webhook receipt.
- **Downgrades:** Takes effect at the end of the current 30-day billing period.
- **Cancellations:** Self-serve cancellation sets `Subscription.status = 'CANCELED'` and `cancelAtPeriodEnd = true` via webhook lifecycle handling.
- **Zero-Loss Failed Generation Guarantee:** Every generation job reserves credits in `CreditReservation` (`PENDING`) before calling the AI pipeline; if generation fails for any reason, `releaseReservation` automatically releases the hold so the customer loses **0 credits**.
