# Final Financial Accuracy & Product Fidelity Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement centralized model-specific Gemini API unit economics, recalculate Egyptian and Saudi subscription plan profitability, and enforce genuine final-image product fidelity verification across all 6 product photography challenge categories.

**Architecture:** Introduce `src/lib/pricing/model-costs.ts` as the single source of truth for official Gemini image model pricing (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`) across `standard`, `batch`, `flex`, and `priority` service tiers and resolutions (`512`, `1K`, `2K`, `4K`), wired into `src/lib/pricing/plans.ts` and `/api/admin/metrics`. Upgrade `src/lib/ai/image-processor.ts` and `src/lib/ai/gemini-client.ts` with exterior border flood-fill segmentation, adaptive white-on-white/glass/reflective isolation, scene compositing (`compositeProductOnSceneImage`), and final-asset decoding verification (`verifyDeliveredImageFidelity`).

**Tech Stack:** Node.js 24, Next.js 15, TypeScript, Sharp (`libvips`), `@google/genai` Interactions API, Node native test runner (`node --test`).

**Spec:** `docs/superpowers/specs/2026-11-05-financial-and-fidelity-verification-design.md`

## Global Constraints

- Never use `gemini-3.1-flash-lite-image`'s price (`$0.0336`) when calculating `gemini-3.1-flash-image`'s Standard-tier COGS (`$0.0672` output image cost; `$0.071050` actual cost per successful 1K image).
- `fidelityScore` must always measure the actual final image (`result.imageUrl`) delivered to the customer, never an intermediate local composite while returning a different Gemini-generated image.
- Keep `audit/production-readiness` branch isolated; do not merge into `main` or deploy to production; keep unavailable live external integrations marked `BLOCKED`.

## Review Focus

- Calling `calculateModelGenerationCost('gemini-3.1-flash-image', '1K', 'standard')` must return `$0.0672` output image cost and `$0.071050` actual cost per successful image, never `$0.0336`.
- Requesting an unsupported resolution on `gemini-3.1-flash-lite-image` (`2K`/`4K`) or `gemini-3-pro-image` (`512`) must clamp or throw appropriately according to model resolution capabilities.
- When `GeminiClient.generateProductPhoto` runs in live mode (`LIVE_GEMINI_API`) without `lockProductForeground` and the API returns an image whose product pixels differ from the customer's isolated product, `result.fidelityScore` must reflect the low fidelity of the actual returned image (`< 0.5`, `fidelityVerified: false`).
- When `GeminiClient.generateProductPhoto` runs in live mode with `lockProductForeground: true`, the original isolated product foreground is composited onto the Gemini-generated scene and `verifyDeliveredImageFidelity` proves `>= 0.98` fidelity on the final delivered asset.
- White products on white backgrounds, internal white packaging logos/labels, transparent glass bottles, and reflective chrome surfaces must not have interior holes punched out during foreground isolation.

---

### Task 1: Centralized Model-Specific Cost Configuration & Plan Profitability Engine

**Files:**
- Create: `src/lib/pricing/model-costs.ts`
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/pricing/plans.ts`
- Modify: `src/app/api/admin/metrics/route.ts`
- Modify: `src/app/admin/page.tsx`
- Test: `tests/pricing.test.mjs`, `tests/admin-metrics.test.mjs`

**Interfaces:**
- Produces:
  - `MODEL_PRICING_CATALOG`: full pricing registry for `gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image` across `standard`, `batch`, `flex`, `priority`.
  - `calculateModelGenerationCost(model: GeminiImageModelId, imageSize?: GeminiImageSize, serviceTier?: GeminiServiceTier, options?: CostCalculationOptions): ModelGenerationCostBreakdown`
  - `getAllModelResolutionCosts(serviceTier?: GeminiServiceTier): ModelGenerationCostBreakdown[]`
  - `calculatePlanProfitability(tier: PlanTier, country: Country, options?: PlanProfitabilityOptions): PlanProfitabilityReport`

- [x] **Step 1: Write failing tests in `tests/pricing.test.mjs` and `tests/admin-metrics.test.mjs`**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/pricing.test.mjs tests/admin-metrics.test.mjs` to verify RED failure**
- [x] **Step 3: Implement `src/lib/pricing/model-costs.ts`, update `src/lib/pricing/plans.ts`, `src/lib/types/index.ts`, `src/app/api/admin/metrics/route.ts`, and `src/app/admin/page.tsx`**
- [x] **Step 4: Run `node --experimental-strip-types --test tests/pricing.test.mjs tests/admin-metrics.test.mjs` to verify GREEN pass**

---

### Task 2: Genuine Final-Image Product Fidelity & Difficult Product Categories

**Files:**
- Modify: `src/lib/ai/image-processor.ts`
- Modify: `src/lib/ai/gemini-client.ts`
- Test: `tests/image-pipeline.test.mjs`, `tests/gemini-client.test.mjs`

**Interfaces:**
- Produces:
  - `verifyDeliveredImageFidelity(isolated: IsolatedProductResult, deliveredImageDataUrl: string, placement?: CompositedStudioResult['placement']): Promise<ProductFidelityReport>`
  - `compositeProductOnSceneImage(options: { isolated: IsolatedProductResult; sceneImageDataUrl: string; aspectRatio?: AspectRatio }): Promise<CompositedStudioResult>`
  - Updated `isolateProductForeground(imageInput: string): Promise<IsolatedProductResult>` with exterior border BFS flood-fill, adaptive white-on-white / glass contrast detection, and contour closure.
  - Updated `GeminiClient.generateProductPhoto` verifying fidelity directly on the delivered `imageUrl` and supporting `lockProductForeground?: boolean`.

- [x] **Step 1: Write failing tests in `tests/image-pipeline.test.mjs` and `tests/gemini-client.test.mjs` covering all 6 product categories and live-mode final-image fidelity verification**
- [x] **Step 2: Run `node --experimental-strip-types --test tests/image-pipeline.test.mjs tests/gemini-client.test.mjs` to verify RED failure**
- [x] **Step 3: Implement exterior flood-fill segmentation, `compositeProductOnSceneImage`, `verifyDeliveredImageFidelity`, and live-mode fidelity measurement in `src/lib/ai/image-processor.ts` and `src/lib/ai/gemini-client.ts`**
- [x] **Step 4: Run `node --experimental-strip-types --test tests/image-pipeline.test.mjs tests/gemini-client.test.mjs` to verify GREEN pass**

---

### Task 3: Financial, AI, Audit & QA Documentation Synchronization

**Files:**
- Modify: `docs/ai/api-cost-analysis.md`
- Modify: `docs/ai/gemini-model-research.md`
- Modify: `docs/ai/model-selection.md`
- Modify: `docs/ai/product-fidelity-strategy.md`
- Modify: `docs/ai/image-quality-benchmark.md`
- Modify: `docs/business/unit-economics.md`
- Modify: `docs/business/profitability-analysis.md`
- Modify: `docs/business/pricing-strategy.md`
- Modify: `docs/business/revenue-model.md`
- Modify: `docs/research/source-register.md`
- Modify: `docs/audit/production-readiness-audit.md`
- Modify: `docs/qa/release-criteria.md`
- Modify: `docs/qa/release-checklist.md`
- Modify: `docs/qa/test-results.md`
- Modify: `project-status.md`
- Modify: `CHANGELOG.md`

- [x] **Step 1: Update all financial, AI, and QA documentation with verified model-specific costs, profitability tables, and final-image fidelity proof**
- [x] **Step 2: Execute full test suite, PostgreSQL concurrency suite, TypeScript typecheck, and Next.js production build**
- [x] **Step 3: Commit all changes to `audit/production-readiness` and report final SHA**
