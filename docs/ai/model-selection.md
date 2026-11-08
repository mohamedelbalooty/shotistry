# AI Model Selection, Plan Routing & Credit Weighting Strategy (Verified November 2026)

## 1. Executive Summary
Following the permanent shutdown of Imagen 3/4 (`imagen-3.0-generate-002` Nov 10, 2025; `imagen-4.0-*` Aug 17, 2026) and deprecation of `gemini-2.5-flash-image`, Shotistry routes all image generation through the **Google Gemini Interactions API (`ai.interactions.create`)** using three active models configured in [`src/lib/pricing/plans.ts`](../../src/lib/pricing/plans.ts) and costed in [`src/lib/pricing/model-costs.ts`](../../src/lib/pricing/model-costs.ts).

---

## 2. Subscription Plan Model Assignments & Entitlements

| Plan Tier | Default Model & Size | Max Image Size | Allowed Models | Interactive 1K COGS / Shoot (USD) |
|---|---|---|---|---|
| **`FREE`** (5 credits) | `gemini-3.1-flash-image` (`1K`) | `1K` | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` | **$0.071050** (Lite opt: `$0.035775`) |
| **`STARTER`** (80 credits) | `gemini-3.1-flash-image` (`1K`) | `1K` | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image` | **$0.071050** |
| **`PRO`** (200 credits) | `gemini-3.1-flash-image` (`1K`) | `4K` | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image` | **$0.071050** (Weighted credits for `2K`/`4K`/`Pro`) |
| **`AGENCY`** (500 credits) | `gemini-3.1-flash-image` (`1K`) | `4K` | `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image` | **$0.071050** (`$0.035775` in Batch API bulk jobs) |

---

## 3. Credit Weighting & Plan Enforcement (`src/app/api/photoshoots/generate/route.ts`)

1. **Plan Entitlement Validation (`validatePlanModelEntitlement`):** Free and Starter workspaces attempting to request `4K` or `gemini-3-pro-image` receive `403 Forbidden`.
2. **Model- & Resolution-Weighted Credit Consumption (`getCreditWeightForGeneration`):**
   - `gemini-3.1-flash-lite-image` (`1K`, `$0.035775`) → **1 credit**
   - `gemini-3.1-flash-image` (`512`, `$0.047998`) → **1 credit**
   - `gemini-3.1-flash-image` (`1K`, `$0.071050`) → **1 credit** *(Platform Default)*
   - `gemini-3.1-flash-image` (`2K`, `$0.105658`) → **2 credits** (`$0.052829`/credit)
   - `gemini-3.1-flash-image` (`4K`, `$0.157570`) → **3 credits** (`$0.052523`/credit)
   - `gemini-3-pro-image` (`1K` / `2K`, `$0.141960`) → **2 credits** (`$0.070980`/credit)
   - `gemini-3-pro-image` (`4K`, `$0.250728`) → **4 credits** (`$0.062682`/credit)
   This guarantees that even under 100% consumption in Egypt (`3.5525 EGP` max per credit COGS), Pro/4K jobs never erode plan margins.
3. **Alias Normalization (`normalizeGeminiImageModel`):** Marketing aliases (`gemini-nano-banana-2.1`) and retired model IDs normalize automatically to `gemini-3.1-flash-image`.
