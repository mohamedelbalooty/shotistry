# Unit Economics & Cost Structure (Verified November 2026)

> **Single Source of Truth:** Programmatically enforced in [`src/lib/pricing/model-costs.ts`](../../src/lib/pricing/model-costs.ts) and [`src/lib/pricing/plans.ts`](../../src/lib/pricing/plans.ts), audited against official Google Gemini API & Vertex AI pricing.

---

## 1. Official Direct Cost Per Successful Image (6-Component COGS Breakdown)

All calculations use verified November 2026 Google Gemini Interactions API pricing and baseline regional FX rates:
- **Baseline Exchange Rates:** `$1.00 USD = 50.00 EGP` | `$1.00 USD = 3.75 SAR`
- **Request Baseline:** 2 input images (customer reference photo + binary foreground mask) + 350 text prompt tokens + Cloudflare R2 storage & CDN delivery (`$0.000500`) + 3% platform-absorbed failure/retry allowance on direct API spend.
- **Strict Model Pricing Separation:** **`gemini-3.1-flash-image`** (Platform Default) bills **`$60.00 / 1M` image output tokens (`$0.067200` / 1K image)** on Standard tier. It NEVER uses `gemini-3.1-flash-lite-image`'s `$0.033600` (`$30.00 / 1M`) output rate.

### A. Default Studio Engine (`gemini-3.1-flash-image` 1K, Standard Tier)

| Cost Component | Pricing Specification | Cost per Image (USD) | Cost in EGP (`50.0`) | Cost in SAR (`3.75`) |
|---|---|---|---|---|
| **1. Input Image Cost** | 2 images × 1,120 tokens = 2,240 tok @ `$0.50 / 1M` | `$0.001120` | `0.0560 EGP` | `0.004200 SAR` |
| **2. Text Input Cost** | 350 prompt tokens @ `$0.50 / 1M` | `$0.000175` | `0.0088 EGP` | `0.000656 SAR` |
| **3. Generated Image Output Cost** | 1,120 tokens (`1K`) @ `$60.00 / 1M` | `$0.067200` | `3.3600 EGP` | `0.252000 SAR` |
| **4. Storage & CDN Delivery Cost** | Cloudflare R2 storage + signed asset delivery | `$0.000500` | `0.0250 EGP` | `0.001875 SAR` |
| **5. Retry Allowance (3%)** | `0.03 × ($0.001120 + $0.000175 + $0.067200)` | `$0.002055` | `0.1027 EGP` | `0.007706 SAR` |
| **6. Actual Cost per Successful Image** | Sum of Components 1–5 | **`$0.071050`** | **`3.5525 EGP`** | **`0.266438 SAR`** |

### B. Full Model, Resolution & Service-Tier Matrix (Actual Cost per Successful Image in USD)

| Model ID | Resolution | Credits | Input Img | Text In | Img Out | R2 + CDN | Retry (3%) | **Standard (Interactive)** | **Batch / Vertex Flex (-50%)** | **Vertex Priority (1.8×)** |
|---|---|---|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | `512` (747 out tok) | 1 | $0.001120 | $0.000175 | $0.044820 | $0.000500 | $0.001383 | **$0.047998** | `$0.024250` | `$0.085997` |
| **`gemini-3.1-flash-image`** *(Default)* | `1K` (1,120 out tok) | 1 | $0.001120 | $0.000175 | $0.067200 | $0.000500 | $0.002055 | **$0.071050** | `$0.035775` | `$0.127490` |
| **`gemini-3.1-flash-image`** | `2K` (1,680 out tok) | 2 | $0.001120 | $0.000175 | $0.100800 | $0.000500 | $0.003063 | **$0.105658** | `$0.053079` | `$0.189784` |
| **`gemini-3.1-flash-image`** | `4K` (2,520 out tok) | 3 | $0.001120 | $0.000175 | $0.151200 | $0.000500 | $0.004575 | **$0.157570** | `$0.079035` | `$0.283226` |
| **`gemini-3.1-flash-lite-image`** | `1K` only (1,120 out tok) | 1 | $0.000560 | $0.000088 | $0.033600 | $0.000500 | $0.001027 | **$0.035775** | `$0.018138` | `$0.063995` |
| **`gemini-3-pro-image`** | `1K` (1,120 out tok) | 2 | $0.002240 | $0.000700 | $0.134400 | $0.000500 | $0.004120 | **$0.141960** | `$0.071230` | `$0.255128` |
| **`gemini-3-pro-image`** | `2K` (1,120 out tok) | 2 | $0.002240 | $0.000700 | $0.134400 | $0.000500 | $0.004120 | **$0.141960** | `$0.071230` | `$0.255128` |
| **`gemini-3-pro-image`** | `4K` (2,000 out tok) | 4 | $0.002240 | $0.000700 | $0.240000 | $0.000500 | $0.007288 | **$0.250728** | `$0.125614` | `$0.450911` |

*Platform Support Note:* Both `standard` and `batch` run on the Gemini Developer API and Vertex AI. `flex` (50% discount) and `priority` (1.8× Standard) are Vertex AI PayGo tiers (`geminiApiSupported: false`, `vertexAiSupported: true`).

---

## 2. Payment Gateway Fees (Paymob Benchmark)
- **Egypt (`EGP` — Meeza / Visa / Mastercard / Wallets):** `2.75% + 3.00 EGP` per transaction.
- **Saudi Arabia (`SAR` — Mada / Apple Pay / Visa / Mastercard):** `2.50% + 1.00 SAR` per transaction.

---

## 3. Plan-Level Unit Economics & Margin Calculations (`gemini-3.1-flash-image` 1K Standard Default)

Every paid plan defaults to **`gemini-3.1-flash-image` (`1K`)**. Worst-case assumes `100%` monthly credit consumption; Expected-case assumes `65%` utilization. (`FREE`: 5 credits, max `1K`, `Flash`/`Lite` only — onboarding CAC).

### A. Egypt Market (`EGP`, `3.5525 EGP` per 1K Flash Standard image)

#### 1. Starter Plan (`349.00 EGP / mo`, `80 Credits`, max `1K`, `Flash`/`Lite`)
- **Revenue:** `349.00 EGP` (`$6.98 USD`)
- **Paymob Fee:** `(349 × 0.0275) + 3.00 = 12.60 EGP`
- **Worst-Case (100% = 80 images):** COGS `80 × 3.5525 = 284.20 EGP` → Total Cost `296.80 EGP` → Gross Profit `52.20 EGP` → **Worst-Case Gross Margin: `15.0%`**
- **Expected-Case (65% = 52 images):** COGS `52 × 3.5525 = 184.73 EGP` → Total Cost `197.33 EGP` → Gross Profit `151.67 EGP` → **Expected Gross Margin: `43.5%`** ✅

#### 2. Pro Studio Plan (`899.00 EGP / mo`, `200 Credits`, up to `4K`, `Flash`/`Lite`/`Pro`)
- **Revenue:** `899.00 EGP` (`$17.98 USD`)
- **Paymob Fee:** `(899 × 0.0275) + 3.00 = 27.72 EGP`
- **Worst-Case (100% = 200 images):** COGS `200 × 3.5525 = 710.50 EGP` → Total Cost `738.22 EGP` → Gross Profit `160.78 EGP` → **Worst-Case Gross Margin: `17.9%`**
- **Expected-Case (65% = 130 images):** COGS `130 × 3.5525 = 461.83 EGP` → Total Cost `489.55 EGP` → Gross Profit `409.45 EGP` → **Expected Gross Margin: `45.5%`** ✅

#### 3. Agency Scale Plan (`1,899.00 EGP / mo`, `500 Credits`, up to `4K`, `Flash`/`Lite`/`Pro`)
- **Revenue:** `1,899.00 EGP` (`$37.98 USD`)
- **Paymob Fee:** `(1,899 × 0.0275) + 3.00 = 55.22 EGP`
- **Interactive Standard Worst-Case (100% = 500 images):** COGS `500 × 3.5525 = 1,776.25 EGP` → Total Cost `1,831.47 EGP` → Gross Profit `67.53 EGP` → **Worst-Case Gross Margin: `3.6%`** ⚠️ *(Thin buffer under FX shock on interactive Standard)*
- **Interactive Standard Expected-Case (65% = 325 images):** COGS `325 × 3.5525 = 1,154.56 EGP` → Total Cost `1,209.79 EGP` → Gross Profit `689.21 EGP` → **Expected Gross Margin: `36.3%`**
- **Batch API Mitigation for Agency Bulk Catalogs (`batch` @ `$0.035775` = `1.7888 EGP/img`):**
  - Worst-Case (500 images): COGS `894.38 EGP` → Total Cost `949.60 EGP` → Gross Profit `949.40 EGP` → **Margin: `50.0%`** ✅
  - Expected-Case (325 images): COGS `581.34 EGP` → Total Cost `636.57 EGP` → Gross Profit `1,262.43 EGP` → **Margin: `66.5%`** ✅

---

### B. Saudi Arabia Market (`SAR`, `0.266438 SAR` per 1K Flash Standard image)

#### 1. Starter Plan (`79.00 SAR / mo`, `80 Credits`, max `1K`, `Flash`/`Lite`)
- **Revenue:** `79.00 SAR` (`$21.07 USD`)
- **Paymob Fee:** `(79 × 0.025) + 1.00 = 2.98 SAR` (`2.975 SAR` exact)
- **Worst-Case (100% = 80 images):** COGS `21.32 SAR` → Total Cost `24.29 SAR` → Gross Profit `54.71 SAR` → **Worst-Case Gross Margin: `69.3%`** ✅
- **Expected-Case (65% = 52 images):** COGS `13.85 SAR` → Total Cost `16.83 SAR` → Gross Profit `62.17 SAR` → **Expected Gross Margin: `78.7%`** ✅

#### 2. Pro Studio Plan (`189.00 SAR / mo`, `200 Credits`, up to `4K`, `Flash`/`Lite`/`Pro`)
- **Revenue:** `189.00 SAR` (`$50.40 USD`)
- **Paymob Fee:** `(189 × 0.025) + 1.00 = 5.73 SAR` (`5.725 SAR` exact)
- **Worst-Case (100% = 200 images):** COGS `53.29 SAR` → Total Cost `59.01 SAR` → Gross Profit `129.99 SAR` → **Worst-Case Gross Margin: `68.8%`** ✅
- **Expected-Case (65% = 130 images):** COGS `34.64 SAR` → Total Cost `40.36 SAR` → Gross Profit `148.64 SAR` → **Expected Gross Margin: `78.6%`** ✅

#### 3. Agency Scale Plan (`399.00 SAR / mo`, `500 Credits`, up to `4K`, `Flash`/`Lite`/`Pro`)
- **Revenue:** `399.00 SAR` (`$106.40 USD`)
- **Paymob Fee:** `(399 × 0.025) + 1.00 = 10.98 SAR` (`10.975 SAR` exact)
- **Worst-Case (100% = 500 images):** COGS `133.22 SAR` → Total Cost `144.19 SAR` → Gross Profit `254.81 SAR` → **Worst-Case Gross Margin: `63.9%`** ✅
- **Expected-Case (65% = 325 images):** COGS `86.59 SAR` → Total Cost `97.57 SAR` → Gross Profit `301.43 SAR` → **Expected Gross Margin: `75.5%`** ✅

---

## 4. On-Demand Top-Up Credit Packs (100% Eventual Consumption Risk Audit)

Because top-up packs never expire, unit economics are audited at `100%` eventual credit drawdown on default `gemini-3.1-flash-image` (`1K` Standard @ `$0.071050`):

| Pack | Credits | EG Price | EG Paymob | EG COGS (100%) | EG Margin | SA Price | SA Paymob | SA COGS (100%) | SA Margin |
|---|---|---|---|---|---|---|---|---|---|
| `pack_50` | 50 | `249 EGP` | `9.85 EGP` | `177.63 EGP` | **`24.7%`** | `49 SAR` | `2.23 SAR` | `13.32 SAR` | **`68.3%`** |
| `pack_150` | 150 | `599 EGP` | `19.47 EGP` | `532.88 EGP` | **`7.8%`** | `119 SAR` | `3.98 SAR` | `39.97 SAR` | **`63.1%`** |
| `pack_500` | 500 | `1,499 EGP` | `44.22 EGP` | `1,776.25 EGP` | **`-21.4%`** ⚠️ | `299 SAR` | `8.48 SAR` | `133.22 SAR` | **`52.6%`** |

> ⚠️ **Pricing Governance Finding (`pack_500` Egypt):** At `3.00 EGP/credit`, `pack_500` in Egypt is priced below Standard `gemini-3.1-flash-image` 1K COGS (`3.5525 EGP/img`), creating `-321.47 EGP` negative margin per pack if redeemed interactively. **Pre-launch mitigation:** route `pack_500` bulk catalog jobs via the Gemini Batch API (`1.7888 EGP/img` → `37.4%` margin) or raise Egypt `pack_500` to `>= 2,199 EGP` (`>= 17%` Standard margin).

---

## 5. Model & Resolution Credit Weighting Protection

Weighted credit consumption (`getCreditWeightForGeneration`) ensures high-resolution or `gemini-3-pro-image` requests never erode margins relative to the `1K` Standard baseline (`$0.071050`/credit):
- `gemini-3.1-flash-lite-image` (`1K`, `$0.035775`) = **1 credit** (`$0.035775`/credit)
- `gemini-3.1-flash-image` (`512`, `$0.047998`) = **1 credit** (`$0.047998`/credit)
- `gemini-3.1-flash-image` (`1K`, `$0.071050`) = **1 credit** (`$0.071050`/credit)
- `gemini-3.1-flash-image` (`2K`, `$0.105658`) = **2 credits** (`$0.052829`/credit)
- `gemini-3.1-flash-image` (`4K`, `$0.157570`) = **3 credits** (`$0.052523`/credit)
- `gemini-3-pro-image` (`1K` / `2K`, `$0.141960`) = **2 credits** (`$0.070980`/credit)
- `gemini-3-pro-image` (`4K`, `$0.250728`) = **4 credits** (`$0.062682`/credit)
