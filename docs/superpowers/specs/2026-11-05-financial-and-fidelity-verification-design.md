# Shotistry — Final Financial Accuracy & Product Fidelity Verification Specification

- **Date:** November 5, 2026
- **Branch:** `audit/production-readiness` (isolated from `main`)
- **Status:** Approved for TDD Execution

---

## 1. Problem Statement & Audit Findings

Before staging deployment, a focused verification of Shotistry's unit economics and product fidelity pipeline identified two critical discrepancies:

### 1.1 Model-Specific Unit Economics Discrepancy
1. **Conflation of Lite and Standard Flash Image Pricing:**
   - Previous financial documentation (`docs/ai/api-cost-analysis.md`, `docs/business/unit-economics.md`) and `/api/admin/metrics` used **$0.0336 per 1K image** (`$30.00 / 1M output tokens × 1,120 tokens`) as the standard cost of `gemini-3.1-flash-image`.
   - According to the official Google Gemini API Pricing specification (`aistudio.google.com/docs/pricing` & `docs.cloud.google.com/gemini-enterprise-agent-platform/...`), **$0.0336 per 1K image** is the Standard-tier output price for **`gemini-3.1-flash-lite-image`** (and the Batch-tier output price for `gemini-3.1-flash-image`), whereas **`gemini-3.1-flash-image` Standard tier** is priced at **$60.00 / 1M image output tokens** (**$0.0672 per 1K image**, ~$0.067) and **$0.50 / 1M input tokens** (1,120 tokens per input image).
2. **Missing Multi-Tier, Multi-Resolution Centralized Cost Engine:**
   - The codebase lacked a centralized, typed cost configuration module covering all three supported models (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`), all supported resolutions (`512`, `1K`, `2K`, `4K`), all service tiers (`standard`, `batch`, `flex`, `priority`), and all six required cost components (input image cost, text input cost, generated image output cost, storage & delivery cost, retry allowance, and actual cost per successful image).
3. **Subscription Plan Model & Profitability Recalculation:**
   - `SUBSCRIPTION_PLANS` in `src/lib/pricing/plans.ts` did not explicitly declare `defaultModel`, `defaultImageSize`, `maxImageSize`, or `allowedModels` per tier, nor did it provide programmatic profitability calculations for Egyptian (`EGP`) and Saudi (`SAR`) plans under worst-case (100%) and expected (65%) credit consumption.

### 1.2 Final-Image Product Fidelity Verification Discrepancy
1. **Intermediate Composite Measurement Bug in Live Mode:**
   - In `src/lib/ai/gemini-client.ts`, `GeminiClient.generateProductPhoto` computed `studioComposite = compositeProductOnStudioScene(...)` and `fidelityReport = verifyProductFidelity(isolated, studioComposite)` before branching on `if (this.client && this.isLiveConfigured)`.
   - When running in live mode (`LIVE_GEMINI_API`), it returned `imageUrl: liveDataUrl` (the Gemini-generated image) while still reporting `fidelityScore: fidelityReport.fidelityScore` measured on `studioComposite` (the intermediate local composite).
2. **Edge-Case Product Segmentation Vulnerabilities:**
   - In `src/lib/ai/image-processor.ts`, `isolateProductForeground` used a global per-pixel Euclidean threshold (`dist > 26`) across all pixels `(x, y)` rather than an exterior border-connected flood-fill with adaptive contrast and contour closure.
   - As a result:
     - **White products on white backgrounds** (e.g., `[240, 240, 244]` bottle on `[255, 255, 255]` backdrop, `dist ≈ 24.3 <= 26`) had their product body classified as background.
     - **Logo and packaging typography** with white/light interiors inside a product silhouette had transparent holes punched through them.
     - **Transparent bottles and glass** with subtle refractive interiors had their interior glass pixels stripped.
     - **Reflective metallic/mirror surfaces** with bright specular highlights matching background luminance had holes punched inside the product boundary.

---

## 2. Architectural Invariants & Design Decisions

### 2.1 Official Gemini Image Model Pricing Matrix (`src/lib/pricing/model-costs.ts`)

All calculations are grounded in official Google Gemini API & Vertex AI / Enterprise Agent Platform pricing (`documents/aistudio.google.com/docs/pricing`, `documents/docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/*`):

| Model ID | Service Tier | API Availability | Input Rate ($/1M tokens) | Text Output Rate ($/1M tokens) | Image Output Rate ($/1M tokens) | Input Tokens / Image | Output Image Tokens (`512` / `1K` / `2K` / `4K`) |
|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | `standard` | Gemini API + Vertex AI | $0.50 | $3.00 | $60.00 | 1,120 | 747 / 1,120 / 1,680 / 2,520 |
| **`gemini-3.1-flash-image`** | `batch` | Gemini Batch API + Vertex AI (50% off) | $0.25 | $1.50 | $30.00 | 1,120 | 747 / 1,120 / 1,680 / 2,520 |
| **`gemini-3.1-flash-image`** | `flex` | Vertex AI Flex PayGo (`not-supported` in AI Studio) | $0.25 | $1.50 | $30.00 | 1,120 | 747 / 1,120 / 1,680 / 2,520 |
| **`gemini-3.1-flash-image`** | `priority` | Vertex AI Priority PayGo (`not-supported` in AI Studio, 1.8× Standard) | $0.90 | $5.40 | $108.00 | 1,120 | 747 / 1,120 / 1,680 / 2,520 |
| **`gemini-3.1-flash-lite-image`** | `standard` | Gemini API + Vertex AI | $0.25 | $1.50 | $30.00 | 1,120 | N/A / 1,120 / N/A / N/A |
| **`gemini-3.1-flash-lite-image`** | `batch` | Gemini Batch API + Vertex AI (50% off) | $0.125 | $0.75 | $15.00 | 1,120 | N/A / 1,120 / N/A / N/A |
| **`gemini-3.1-flash-lite-image`** | `flex` | Vertex AI Flex PayGo (`not-supported` in AI Studio) | $0.125 | $0.75 | $15.00 | 1,120 | N/A / 1,120 / N/A / N/A |
| **`gemini-3.1-flash-lite-image`** | `priority` | Vertex AI Priority PayGo (`not-supported` in AI Studio, 1.8× Standard) | $0.45 | $2.70 | $54.00 | 1,120 | N/A / 1,120 / N/A / N/A |
| **`gemini-3-pro-image`** | `standard` | Gemini API + Vertex AI | $2.00 | $12.00 | $120.00 | 560 | N/A / 1,120 / 1,120 / 2,000 |
| **`gemini-3-pro-image`** | `batch` | Gemini Batch API + Vertex AI (50% off) | $1.00 | $6.00 | $60.00 | 560 | N/A / 1,120 / 1,120 / 2,000 |
| **`gemini-3-pro-image`** | `flex` | Vertex AI Flex PayGo (`not-supported` in AI Studio) | $1.00 | $6.00 | $60.00 | 560 | N/A / 1,120 / 1,120 / 2,000 |
| **`gemini-3-pro-image`** | `priority` | Vertex AI Priority PayGo (`not-supported` in AI Studio, 1.8× Standard) | $3.60 | $21.60 | $216.00 | 560 | N/A / 1,120 / 1,120 / 2,000 |

### 2.2 Six-Component Per-Image Cost Formula
For every supported `(model, resolution, serviceTier)` combination:
1. **Input Image Cost (`inputImageCostUsd`):** 2 input images (customer product reference + binary alpha mask) × `inputTokensPerImage` × `(inputRatePer1M / 1,000,000)`.
2. **Text Input Cost (`textInputCostUsd`):** 350 synthesized prompt + negative directive tokens × `(inputRatePer1M / 1,000,000)`.
3. **Generated Image Output Cost (`imageOutputCostUsd`):** `outputImageTokens` × `(imageOutputRatePer1M / 1,000,000)`.
4. **Storage and Delivery Cost (`storageAndDeliveryCostUsd`):** **$0.000500 USD** per image (Cloudflare R2 storage + Class A/B operations + signed CDN delivery).
5. **Retry Allowance (`retryAllowanceUsd`):** **3%** (`0.03`) platform-absorbed retry/failure reserve applied to raw AI API cost (`0.03 × (inputImageCostUsd + textInputCostUsd + imageOutputCostUsd)`).
6. **Actual Cost per Successful Image (`actualCostPerSuccessfulImageUsd`):**
   `inputImageCostUsd + textInputCostUsd + imageOutputCostUsd + retryAllowanceUsd + storageAndDeliveryCostUsd`.

### 2.3 Default Model & Subscription Plan Model Assignment (`src/lib/pricing/plans.ts`)
- **Platform Default Model:** `gemini-3.1-flash-image` at `1K` resolution (`standard` tier: **$0.071050 USD** actual cost per successful image; **$0.068495 USD** direct AI API cost).
- **Plan-Specific Model & Credit Schedule:**
  - `FREE` (5 credits, 0 EGP / 0 SAR): Default `gemini-3.1-flash-image` (`1K`), max `1K`, allowed `['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']`.
  - `STARTER` (80 credits, 349 EGP / 79 SAR): Default `gemini-3.1-flash-image` (`1K`), max `1K`, allowed `['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image']`.
  - `PRO` (200 credits, 899 EGP / 189 SAR): Default `gemini-3.1-flash-image` (`1K`), max `4K`, allowed `['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']`.
  - `AGENCY` (500 credits, 1,899 EGP / 399 SAR): Default `gemini-3.1-flash-image` (`1K`), max `4K`, allowed `['gemini-3.1-flash-image', 'gemini-3.1-flash-lite-image', 'gemini-3-pro-image']`.
- **Credit Cost Schedule & Profitability Analysis:**
  - 1 credit = 1 standard `1K` generation on `gemini-3.1-flash-image` (`$0.071050`).
  - Higher-cost tiers (`2K`/`4K` on `gemini-3.1-flash-image`, or `1K`/`2K`/`4K` on `gemini-3-pro-image`) have both their **credit-weighted cost schedule** (`2` credits for `2K`/`4K` Flash and `1K`/`2K` Pro; `4` credits for `4K` Pro) and their **unthrottled 1-credit worst-case stress test** explicitly calculated in `calculatePlanProfitability()`.

### 2.4 Genuine Final-Image Product Fidelity Pipeline (`src/lib/ai/image-processor.ts` & `src/lib/ai/gemini-client.ts`)
1. **Exterior Border-Connected Flood-Fill + Adaptive Contrast & Contour Closure (`isolateProductForeground`):**
   - Samples the image perimeter to estimate background color `[bgR, bgG, bgB]`.
   - Computes an adaptive foreground distance threshold: `26` for standard high-contrast subjects, automatically lowering to `7` when a low-contrast / white-on-white or transparent glass subject is detected in the central product region.
   - Identifies structural product boundary pixels (`dist > threshold` or local Sobel/neighbor gradient across the product boundary) and applies a 2px morphological closing to seal micro-gaps along reflective/glass rims.
   - Executes a 4-connected Breadth-First Search (BFS) flood-fill starting **only from the outer image border**.
   - Only pixels reachable from the outer border are marked as background (`maskAlpha = 0`). All interior pixels enclosed by the product silhouette — including white labels, brand logos, specular chrome reflections, and transparent glass interiors — remain `maskAlpha = 255` (foreground).
2. **Scene Compositing for Exact Foreground Preservation (`compositeProductOnSceneImage`):**
   - When `lockProductForeground: true` is requested in `GeminiClient.generateProductPhoto` (or when compositing onto a generated background scene), decodes the generated background scene image via Sharp, renders the contact shadow, and composites the customer's exact isolated foreground pixels (`isolated`) onto the scene.
3. **Final Delivered Asset Fidelity Verification (`verifyDeliveredImageFidelity`):**
   - `verifyDeliveredImageFidelity(isolated, deliveredImageDataUrl, placement?)` decodes the **actual final `result.imageUrl`** delivered to the customer via `decodeProductImage(deliveredImageDataUrl)`.
   - Compares every foreground pixel of `isolated` against the corresponding placed pixel in the decoded final delivered image, computing:
     - `fidelityScore`: ratio of foreground pixels preserved within perceptual tolerance (`<= 12` per channel for lossy codecs).
     - `exactPixelMatchRatio`: ratio of foreground pixels with zero RGB deviation (`<= 1` per channel).
     - `fidelityVerified`: `fidelityScore >= 0.90`.
   - In `GeminiClient.generateProductPhoto`, `result.fidelityScore` and `result.fidelityVerified` are **always** computed by running `verifyDeliveredImageFidelity` on the exact `result.imageUrl` returned to the caller — never on an unused intermediate composite.
