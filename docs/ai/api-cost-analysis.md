# AI API Cost Analysis & Token Economics (Verified November 2026)

> **Source of Truth:** Implemented programmatically in [`src/lib/pricing/model-costs.ts`](../../src/lib/pricing/model-costs.ts) and verified against official Google Gemini API & Vertex AI Pricing documentation (`https://ai.google.dev/gemini-api/docs/pricing`, `https://ai.google.dev/gemini-api/docs/flex-inference`, `https://ai.google.dev/gemini-api/docs/priority-inference`).

---

## 1. Critical Pricing Separation Rule (`Flash` vs `Flash Lite`)

- **Do NOT conflate `gemini-3.1-flash-lite-image` with `gemini-3.1-flash-image`.**
- **`gemini-3.1-flash-image` (Default Studio Engine)** bills **$60.00 / 1M image output tokens** (`$0.067200` for 1,120 1K output tokens) and **$0.50 / 1M input tokens** on the Standard interactive tier.
- **`gemini-3.1-flash-lite-image` (Fast 1K Preview Engine)** bills **$30.00 / 1M image output tokens** (`$0.033600` for 1,120 1K output tokens) and **$0.25 / 1M input tokens** on the Standard interactive tier.
- Earlier estimates of `$0.0336` for standard `gemini-3.1-flash-image` mistakenly used the **Lite** (or Batch) output rate. All platform COGS calculations in `model-costs.ts` and `/api/admin/metrics` now enforce strict per-model, per-resolution, per-tier calculation.

---

## 2. Official Per-Model & Service-Tier Token Rates

| Model ID | Tier | Gemini API | Vertex AI | Input ($/1M tok) | Text Out ($/1M tok) | Image Out ($/1M tok) | Input Tokens / Img |
|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | `standard` | Yes | Yes | $0.50 | $3.00 | $60.00 | 1,120 |
| **`gemini-3.1-flash-image`** | `batch` | Yes (50% off) | Yes | $0.25 | $1.50 | $30.00 | 1,120 |
| **`gemini-3.1-flash-image`** | `flex` | **No** (`not-supported`) | Yes (50% off) | $0.25 | $1.50 | $30.00 | 1,120 |
| **`gemini-3.1-flash-image`** | `priority` | **No** (`not-supported`) | Yes (1.8× Std) | $0.90 | $5.40 | $108.00 | 1,120 |
| **`gemini-3.1-flash-lite-image`** | `standard` | Yes | Yes | $0.25 | $1.50 | $30.00 | 1,120 |
| **`gemini-3.1-flash-lite-image`** | `batch` | Yes (50% off) | Yes | $0.125 | $0.75 | $15.00 | 1,120 |
| **`gemini-3.1-flash-lite-image`** | `flex` | **No** (`not-supported`) | Yes (50% off) | $0.125 | $0.75 | $15.00 | 1,120 |
| **`gemini-3.1-flash-lite-image`** | `priority` | **No** (`not-supported`) | Yes (1.8× Std) | $0.45 | $2.70 | $54.00 | 1,120 |
| **`gemini-3-pro-image`** | `standard` | Yes | Yes | $2.00 | $12.00 | $120.00 | 560 |
| **`gemini-3-pro-image`** | `batch` | Yes (50% off) | Yes | $1.00 | $6.00 | $60.00 | 560 |
| **`gemini-3-pro-image`** | `flex` | **No** (`not-supported`) | Yes (50% off) | $1.00 | $6.00 | $60.00 | 560 |
| **`gemini-3-pro-image`** | `priority` | **No** (`not-supported`) | Yes (1.8× Std) | $3.60 | $21.60 | $216.00 | 560 |

---

## 3. Complete 6-Component Unit Cost Per Successful Image (USD)

Request assumptions per commercial shoot (`calculateModelGenerationCost`):
- **Input Image Cost:** 2 input images (customer reference product + binary foreground mask).
- **Text Input Cost:** 350 synthesized 10-component prompt + negative directive tokens.
- **Generated Image Output Cost:** Model & resolution output token count (`512`: 747; `1K`/`Flash`: 1,120; `2K`/`Flash`: 1,680; `4K`/`Flash`: 2,520; `1K`&`2K`/`Pro`: 1,120; `4K`/`Pro`: 2,000).
- **Storage & Delivery Cost:** `$0.000500` USD (Cloudflare R2 storage + operations + signed CDN delivery).
- **Retry Allowance:** **3%** (`0.03`) platform-absorbed failure/retry reserve on direct AI API cost.
- **Actual Cost per Successful Image:** `inputImage + textInput + imageOutput + retryAllowance + storageAndDelivery`.

### A. Standard Interactive Tier (`standard` — Primary Live API Path)

| Model | Size | Credit Weight | Input Image Cost | Text Input Cost | Image Output Cost | Storage & CDN | Retry (3%) | **Actual Cost / Image (USD)** | EGP (`50.0`) | SAR (`3.75`) |
|---|---|---|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | `512` | 1 credit | $0.001120 | $0.000175 | $0.044820 | $0.000500 | $0.001383 | **$0.047998** | 2.3999 EGP | 0.1800 SAR |
| **`gemini-3.1-flash-image`** *(Default)* | `1K` | 1 credit | $0.001120 | $0.000175 | $0.067200 | $0.000500 | $0.002055 | **$0.071050** | 3.5525 EGP | 0.2664 SAR |
| **`gemini-3.1-flash-image`** | `2K` | 2 credits | $0.001120 | $0.000175 | $0.100800 | $0.000500 | $0.003063 | **$0.105658** | 5.2829 EGP | 0.3962 SAR |
| **`gemini-3.1-flash-image`** | `4K` | 3 credits | $0.001120 | $0.000175 | $0.151200 | $0.000500 | $0.004575 | **$0.157570** | 7.8785 EGP | 0.5909 SAR |
| **`gemini-3.1-flash-lite-image`** | `1K` | 1 credit | $0.000560 | $0.000088 | $0.033600 | $0.000500 | $0.001027 | **$0.035775** | 1.7888 EGP | 0.1342 SAR |
| **`gemini-3-pro-image`** | `1K` | 2 credits | $0.002240 | $0.000700 | $0.134400 | $0.000500 | $0.004120 | **$0.141960** | 7.0980 EGP | 0.5323 SAR |
| **`gemini-3-pro-image`** | `2K` | 2 credits | $0.002240 | $0.000700 | $0.134400 | $0.000500 | $0.004120 | **$0.141960** | 7.0980 EGP | 0.5323 SAR |
| **`gemini-3-pro-image`** | `4K` | 4 credits | $0.002240 | $0.000700 | $0.240000 | $0.000500 | $0.007288 | **$0.250728** | 12.5364 EGP | 0.9402 SAR |

### B. Batch API (`batch`, Gemini API & Vertex AI — 50% Discount for Agency Bulk Jobs) & Flex (`flex`, Vertex AI PayGo Only — Identical 50% Rates)

| Model | Size | Input Image Cost | Text Input Cost | Image Output Cost | Storage & CDN | Retry (3%) | **Actual Cost / Image (USD)** |
|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | `512` | $0.000560 | $0.000088 | $0.022410 | $0.000500 | $0.000692 | **$0.024250** |
| **`gemini-3.1-flash-image`** | `1K` | $0.000560 | $0.000088 | $0.033600 | $0.000500 | $0.001027 | **$0.035775** |
| **`gemini-3.1-flash-image`** | `2K` | $0.000560 | $0.000088 | $0.050400 | $0.000500 | $0.001531 | **$0.053079** |
| **`gemini-3.1-flash-image`** | `4K` | $0.000560 | $0.000088 | $0.075600 | $0.000500 | $0.002287 | **$0.079035** |
| **`gemini-3.1-flash-lite-image`** | `1K` | $0.000280 | $0.000044 | $0.016800 | $0.000500 | $0.000514 | **$0.018138** |
| **`gemini-3-pro-image`** | `1K` | $0.001120 | $0.000350 | $0.067200 | $0.000500 | $0.002060 | **$0.071230** |
| **`gemini-3-pro-image`** | `2K` | $0.001120 | $0.000350 | $0.067200 | $0.000500 | $0.002060 | **$0.071230** |
| **`gemini-3-pro-image`** | `4K` | $0.001120 | $0.000350 | $0.120000 | $0.000500 | $0.003644 | **$0.125614** |

### C. Priority PayGo (`priority`, Vertex AI Only — 1.8× Standard; Not Supported on Gemini Developer API)

| Model | Size | Input Image Cost | Text Input Cost | Image Output Cost | Storage & CDN | Retry (3%) | **Actual Cost / Image (USD)** |
|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | `512` | $0.002016 | $0.000315 | $0.080676 | $0.000500 | $0.002490 | **$0.085997** |
| **`gemini-3.1-flash-image`** | `1K` | $0.002016 | $0.000315 | $0.120960 | $0.000500 | $0.003699 | **$0.127490** |
| **`gemini-3.1-flash-image`** | `2K` | $0.002016 | $0.000315 | $0.181440 | $0.000500 | $0.005513 | **$0.189784** |
| **`gemini-3.1-flash-image`** | `4K` | $0.002016 | $0.000315 | $0.272160 | $0.000500 | $0.008235 | **$0.283226** |
| **`gemini-3.1-flash-lite-image`** | `1K` | $0.001008 | $0.000158 | $0.060480 | $0.000500 | $0.001849 | **$0.063995** |
| **`gemini-3-pro-image`** | `1K` | $0.004032 | $0.001260 | $0.241920 | $0.000500 | $0.007416 | **$0.255128** |
| **`gemini-3-pro-image`** | `2K` | $0.004032 | $0.001260 | $0.241920 | $0.000500 | $0.007416 | **$0.255128** |
| **`gemini-3-pro-image`** | `4K` | $0.004032 | $0.001260 | $0.432000 | $0.000500 | $0.013119 | **$0.450911** |
