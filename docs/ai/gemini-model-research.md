# Google Gemini & Nano Banana Model Research (Verified November 2026)

## 1. Official Google Image Generation & Deprecation Status

Per official Google AI Studio documentation (`ai.google.dev/gemini-api/docs/deprecations`, `docs/models`, `docs/image-generation`, `docs/pricing`) as of November 2026:
- **`imagen-3.0-generate-002`**: **SHUT DOWN** on November 10, 2025.
- **`imagen-4.0-generate-001` / `imagen-4.0-ultra-generate-001` / `imagen-4.0-fast-generate-001`**: **SHUT DOWN** on August 17, 2026. (*"Imagen is shut down and no longer available through the Gemini API. Use Nano Banana for image generation and editing."*)
- **`gemini-2.5-flash`**: **DEPRECATED** (auto-routes to `gemini-3.5-flash-lite` on Dec 1, 2026; shuts down March 15, 2027). Replaced by **`gemini-3.8-flash`** and **`gemini-3.5-flash-lite`**.
- **`gemini-2.5-flash-image` (Nano Banana 1)**: **DEPRECATED** (shuts down March 15, 2027). Replaced by **`gemini-nano-banana-2.1`** and **`gemini-3.1-flash-lite-image`**.

All current image generation and multimodal reference-image conditioning in `@google/genai` use the **Interactions API (`ai.interactions.create`)**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│               GOOGLE GEMINI NANO BANANA INTERACTIONS PIPELINE               │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 1. DEFAULT COMMERCIAL STUDIO ENGINE  │ 2. ULTRA 4K / HIGH-VOLUME ENGINES    │
│ Model: gemini-nano-banana-2.1        │ Models: gemini-3-pro-image (4K Pro)  │
│ Method: ai.interactions.create()     │         gemini-3.1-flash-lite-image  │
│ • Up to 14 reference images          │ • Reasoning-guided 4K studio design  │
│ • Up to 10 high-fidelity objects     │ • Arabic & English typography        │
│ • Binary mask + foreground lock      │ • Ultra-fast 1K catalog previews     │
│ • SynthID digital watermark          │ • Native aspect ratios (1:1..16:9)   │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Technical Evaluation of Active Official Models

| Model Identifier | Official Status | Primary Capability | Reference & Mask Support | Cost / 1K Image |
|---|---|---|---|---|
| **`gemini-nano-banana-2.1`** | **ACTIVE (Default)** | Multimodal commercial studio rendering & reference editing | ✅ Up to 14 reference images (10 objects with high fidelity) + mask | **$0.0336 USD** ($30/1M image output tokens; $0.0504 for 2K; $0.113 for 4K) |
| **`gemini-3.1-flash-lite-image`** | **ACTIVE (Fast 1K)** | High-volume catalog previews & fast iteration | ✅ Multimodal image + text input | **$0.0336 USD** ($0.0168 USD in Batch API) |
| **`gemini-3-pro-image`** | **ACTIVE (4K Studio Pro)** | Studio-grade 4K reasoning design & complex typography | ✅ Up to 6 object references + 3 style references | Tiered 1K/2K/4K image output tokens |
| **`gemini-3.8-flash`** | **ACTIVE (Reasoning)** | Multimodal vision analysis & prompt reasoning | Text/Vision input | $0.75 / 1M input, $3.75 / 1M output |

---

## 3. Product Photography Benchmarking & Fidelity Criteria
1. **Foreground Pixel Lock (`src/lib/ai/image-processor.ts`):** Every uploaded customer product photo undergoes alpha matting / background segmentation to extract a binary foreground mask (`maskDataUrl`) and isolated product layer (`isolatedProductDataUrl`).
2. **Physical Lighting Coherence:** Studio backdrops cast directional lighting, horizon reflections, and elliptical contact ambient occlusion shadows beneath the product base.
3. **Verifiable Pixel Preservation (`fidelityScore`):** Foreground product pixels are quantitatively compared against the final composited output (`fidelityScore >= 0.90` required for `fidelityVerified: true`).
4. **Truthful SynthID Provenance:** `synthIdDetected: true` is reported **only** when executed against the live Google Gemini API (`executionMode: 'LIVE_GEMINI_API'`), and is always `false` in local sandbox compositing mode (`executionMode: 'LOCAL_COMPOSITE_SANDBOX'`).
