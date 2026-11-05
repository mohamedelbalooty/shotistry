# Unit Economics & Cost Structure

## 1. Direct Cost Per Generated Image (COGS Breakdown)

All calculations use official, verified API pricing and current regional exchange rates:
- **Baseline Exchange Rates:** $1.00 USD = 49.00 EGP | $1.00 USD = 3.75 SAR.

| Cost Component | Pricing Specification | Cost per Image (USD) | Cost in EGP | Cost in SAR |
|---|---|---|---|---|
| **Google Imagen 3 / Gemini Image API** | ~$0.030 per generated 1K image (standard endpoint) | $0.03000 | 1.4700 EGP | 0.11250 SAR |
| **Multimodal Prompt Reasoning & Inpainting** | Gemini 2.5 Flash input/output tokens | $0.00100 | 0.0490 EGP | 0.00375 SAR |
| **Cloudflare R2 Storage & CDN Delivery** | $0.015/GB/mo storage; $0 egress fee | $0.00050 | 0.0245 EGP | 0.00188 SAR |
| **Failed Generation & Retry Reserve** | Estimated 3% failure/retry rate absorbed by platform | $0.00100 | 0.0490 EGP | 0.00375 SAR |
| **Total Direct Production Cost per Image** | | **$0.03250** | **~1.5925 EGP** | **~0.12188 SAR** |

---

## 2. Payment Gateway Fees (Paymob Benchmark)
- **Egypt (Debit/Credit/Meeza/Wallets):** 2.75% + 3.00 EGP per transaction.
- **Saudi Arabia (Mada/Visa/Mastercard/Apple Pay):** 2.50% + 1.00 SAR per transaction.

---

## 3. Plan-Level Unit Economics & Margin Calculations

### A. Egypt Market (EGP)

#### 1. Starter Plan (349 EGP / mo, 80 Credits)
- **Revenue:** 349.00 EGP
- **Paymob Fee:** $(349 \times 0.0275) + 3.00 = 12.60\text{ EGP}$
- **Worst-Case COGS (100% Credit Consumption = 80 images):** $80 \times 1.5925 = 127.40\text{ EGP}$
  - Total Cost: $127.40 + 12.60 = 140.00\text{ EGP}$
  - Gross Profit: $349.00 - 140.00 = 209.00\text{ EGP}$
  - **Worst-Case Gross Margin: 59.9%**
- **Expected-Case COGS (65% Credit Consumption = 52 images):** $52 \times 1.5925 = 82.81\text{ EGP}$
  - Total Cost: $82.81 + 12.60 = 95.41\text{ EGP}$
  - Gross Profit: $349.00 - 95.41 = 253.59\text{ EGP}$
  - **Expected Gross Margin: 72.7%** ✅

#### 2. Pro Plan (899 EGP / mo, 200 Credits)
- **Revenue:** 899.00 EGP
- **Paymob Fee:** $(899 \times 0.0275) + 3.00 = 27.72\text{ EGP}$
- **Worst-Case COGS (100% Consumption = 200 images):** $200 \times 1.5925 = 318.50\text{ EGP}$
  - Total Cost: $318.50 + 27.72 = 346.22\text{ EGP}$
  - Gross Profit: $899.00 - 346.22 = 552.78\text{ EGP}$
  - **Worst-Case Gross Margin: 61.5%**
- **Expected-Case COGS (65% Consumption = 130 images):** $130 \times 1.5925 = 207.03\text{ EGP}$
  - Total Cost: $207.03 + 27.72 = 234.75\text{ EGP}$
  - Gross Profit: $899.00 - 234.75 = 664.25\text{ EGP}$
  - **Expected Gross Margin: 73.9%** ✅

#### 3. Agency Plan (1,899 EGP / mo, 500 Credits)
- **Revenue:** 1,899.00 EGP
- **Paymob Fee:** $(1,899 \times 0.0275) + 3.00 = 55.22\text{ EGP}$
- **Worst-Case COGS (100% Consumption = 500 images):** $500 \times 1.5925 = 796.25\text{ EGP}$
  - Total Cost: $796.25 + 55.22 = 851.47\text{ EGP}$
  - Gross Profit: $1,899.00 - 851.47 = 1,047.53\text{ EGP}$
  - **Worst-Case Gross Margin: 55.2%**
- **Expected-Case COGS (65% Consumption = 325 images):** $325 \times 1.5925 = 517.56\text{ EGP}$
  - Total Cost: $517.56 + 55.22 = 572.78\text{ EGP}$
  - Gross Profit: $1,899.00 - 572.78 = 1,326.22\text{ EGP}$
  - **Expected Gross Margin: 69.8%** ✅

---

### B. Saudi Arabia Market (SAR)

#### 1. Starter Plan (79 SAR / mo, 100 Credits)
- **Revenue:** 79.00 SAR
- **Paymob Fee:** $(79 \times 0.025) + 1.00 = 2.98\text{ SAR}$
- **Worst-Case COGS (100% Consumption = 100 images):** $100 \times 0.12188 = 12.19\text{ SAR}$
  - Total Cost: $12.19 + 2.98 = 15.17\text{ SAR}$
  - Gross Profit: $79.00 - 15.17 = 63.83\text{ SAR}$
  - **Worst-Case Gross Margin: 80.8%** ✅
- **Expected-Case COGS (65% Consumption = 65 images):** $65 \times 0.12188 = 7.92\text{ SAR}$
  - Total Cost: $7.92 + 2.98 = 10.90\text{ SAR}$
  - Gross Profit: $79.00 - 10.90 = 68.10\text{ SAR}$
  - **Expected Gross Margin: 86.2%** ✅

#### 2. Pro Plan (189 SAR / mo, 300 Credits)
- **Revenue:** 189.00 SAR
- **Paymob Fee:** $(189 \times 0.025) + 1.00 = 5.73\text{ SAR}$
- **Worst-Case COGS (100% Consumption = 300 images):** $300 \times 0.12188 = 36.56\text{ SAR}$
  - Total Cost: $36.56 + 5.73 = 42.29\text{ SAR}$
  - Gross Profit: $189.00 - 42.29 = 146.71\text{ SAR}$
  - **Worst-Case Gross Margin: 77.6%** ✅
- **Expected-Case COGS (65% Consumption = 195 images):** $195 \times 0.12188 = 23.77\text{ SAR}$
  - Total Cost: $23.77 + 5.73 = 29.50\text{ SAR}$
  - Gross Profit: $189.00 - 29.50 = 159.50\text{ SAR}$
  - **Expected Gross Margin: 84.4%** ✅

#### 3. Agency Plan (399 SAR / mo, 800 Credits)
- **Revenue:** 399.00 SAR
- **Paymob Fee:** $(399 \times 0.025) + 1.00 = 10.98\text{ SAR}$
- **Worst-Case COGS (100% Consumption = 800 images):** $800 \times 0.12188 = 97.50\text{ SAR}$
  - Total Cost: $97.50 + 10.98 = 108.48\text{ SAR}$
  - Gross Profit: $399.00 - 108.48 = 290.52\text{ SAR}$
  - **Worst-Case Gross Margin: 72.8%** ✅
- **Expected-Case COGS (65% Consumption = 520 images):** $520 \times 0.12188 = 63.38\text{ SAR}$
  - Total Cost: $63.38 + 10.98 = 74.36\text{ SAR}$
  - Gross Profit: $399.00 - 74.36 = 324.64\text{ SAR}$
  - **Expected Gross Margin: 81.4%** ✅
