# Real-World Image Quality Benchmark Specification & Protocol

## Status: SPECIFIED & READY (Awaiting Founder Approval & Budget Cap Authorization)

---

## 1. Executive Summary
Commercial merchants in Egypt and Saudi Arabia will only adopt and pay for Shotistry if delivered commercial product photos look genuinely professional, preserve exact product branding and typography, and avoid unrealistic generative hallucinations.

This benchmark establishes a scientific, empirical, and reproducible quality assessment protocol to evaluate Google Gemini image generation models (`gemini-3.1-flash-lite-image`, `gemini-3.1-flash-image`, `gemini-3-pro-image`) across 8 core e-commerce product categories before opening the platform to closed beta merchants.

---

## 2. Experimental Design & Category Matrix

The benchmark dataset consists of 8 commercial product categories identified from top e-commerce categories in Egypt (Jumia, Amazon Egypt, social merchants) and Saudi Arabia (Salla, Zid, Noon, Amazon SA):

| Category ID | Category Name | Primary Risks & Visual Challenges | Target Model | Recommended Compositor Mode |
|---|---|---|---|---|
| `cat_perfume` | Perfume & Oud | Glass caustics, gold-embossed labels, liquid transparency | `gemini-3.1-flash-image` | `lockProductForeground: true` |
| `cat_cosmetics` | Cosmetics & Skincare | Dropper bottles, fine micro-typography, frosted glass | `gemini-3.1-flash-image` | `lockProductForeground: true` |
| `cat_fashion` | Fashion & Leather Goods | Material texture (camel leather, stitching, zipper shine) | `gemini-3.1-flash-image` | Standard / Blended |
| `cat_jewelry` | Jewelry & Accessories | Specular metal reflection, gemstone facet integrity | `gemini-3-pro-image` (4K) | `lockProductForeground: true` |
| `cat_food_beverage` | Gourmet Food & Dates | Organic dates, premium packaging, heritage props | `gemini-3.1-flash-image` | Standard / Blended |
| `cat_glass_transparent` | Glass & Transparent Bottles | Background visibility through bottle, refraction index | `gemini-3.1-flash-image` | `lockProductForeground: true` |
| `cat_reflective` | Metallic & Brass Objects | In-room reflections, mirror highlights | `gemini-3.1-flash-image` | `lockProductForeground: true` |
| `cat_fmcg_packaged` | Packaged Retail Goods | Corner geometry, barcodes, nutritional badges | `gemini-3.1-flash-lite-image` | Standard / Blended |

---

## 3. Evaluation Methodology

### 3.1 Automated Mathematical Verification (Algorithmic Gate)
Every delivered image undergoes immediate programmatic pixel verification via Sharp (`libvips`):
1. **Foreground Mask IoU:** Measures the intersection-over-union between the detected alpha mask and original product silhouette.
2. **Color Drift (ΔE):** Computes mean Euclidean color distance in CIELAB color space across the isolated product region. Must satisfy ΔE < 4.0 for standard studio lighting.
3. **Exact Pixel Preservation Ratio:** When `lockProductForeground: true` is activated, pixel match ratio must equal `1.000` (100.0% exact byte preservation).

### 3.2 Human Double-Blind Evaluation (Rubric Gate)
Two independent human reviewers grade each generated image on a 1–5 Likert scale across the 7 dimensions defined in `docs/ai/benchmark/rubric.md`:
1. Product Identity Preservation (Weight: 25%)
2. Label Text & Typography Accuracy (Weight: 25%)
3. Logo & Brand Insignia Invariance (Hard Gate: PASS / FAIL)
4. Color Fidelity & Materiality (Weight: 15%)
5. Lighting, Shadows & Contact Occlusion (Weight: 15%)
6. Background Realism & Preset Authenticity (Weight: 10%)
7. Composition & Commercial Utility (Weight: 10%)

---

## 4. Go/No-Go Acceptance Criteria for Closed Beta Release
1. **Aggregate Quality Threshold:** **≥ 80%** of generated benchmark photos across all 8 advertised categories must achieve an aggregate score of **≥ 4.0 / 5.0**.
2. **Zero Brand Alteration Tolerance:** **0** hard-fail logo alterations or misspelled brand names in the delivered set.
3. **Category Gating Rule:** Any category failing to achieve the ≥ 80% threshold must be explicitly marked as **"تجريبي / إصدار محدود (Beta / Limited)"** in the merchant studio UI and default to `lockProductForeground: true` until prompt synthesis and compositor tuning achieve passing scores.
4. **Marketing Truthfulness Rule:** Marketing copy and landing pages may only claim "100% Brand Identity Preservation" when `lockProductForeground: true` is active.

---

## 5. Budget, Execution Plan & Blockers
- **Execution Script:** `scripts/benchmark/run-image-benchmark.mjs`
- **Estimated Executions:** 8 categories × 2 products × 3 presets × 2 models ≈ 96 generations.
- **Estimated Cost:** ~$7.00 – $15.00 total API cost.
- **Founder Budget Request:** Capped authorization of **$25.00 USD** for staging benchmark execution.
- **Current Operational Status:** **BLOCKED** on founder API key configuration and budget authorization ($0 spending limit strictly observed).

