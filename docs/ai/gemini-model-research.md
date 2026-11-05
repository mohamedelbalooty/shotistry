# Google Gemini Interactions API Image Model Research (Verified November 2026)

## 1. Official Google Image Generation Model Identifiers & Deprecation Status

Per official Google AI Studio documentation (`aistudio.google.com/docs/models/gemini-3.1-flash-image`, `docs/models/gemini-3.1-flash-lite-image`, `docs/models/gemini-3-pro-image`, `docs/image-generation`, `docs/deprecations`) as of November 2026:
- **Official API Model Identifiers (Must be used in API requests, NOT marketing names):**
  - **`gemini-3.1-flash-image`** *(marketed as Nano Banana 2)* — **ACTIVE (Default)**: High-efficiency commercial image generation & multimodal reference editing supporting `512` (0.5K), `1K` (default), `2K`, and `4K` resolutions, up to 14 reference images (10 objects with high fidelity), and 14 aspect ratios.
  - **`gemini-3.1-flash-lite-image`** *(marketed as Nano Banana 2 Lite)* — **ACTIVE (Fast 1K Preview)**: Sub-2 second low-latency 1K (`1024px`) image generation and editing (`2K` and `4K` are unsupported on Lite and automatically clamped to `1K`).
  - **`gemini-3-pro-image`** *(marketed as Nano Banana Pro)* — **ACTIVE (4K Studio Pro)**: Reasoning-driven studio-grade 1K/2K/4K image generation for complex commercial mockups and bilingual typography.
- **Disallowed / Retired / Marketing Aliases (Normalized by `normalizeGeminiImageModel()` and never sent in API requests):**
  - `gemini-nano-banana-2.1`: Product marketing alias — normalized to **`gemini-3.1-flash-image`**.
  - `imagen-3.0-generate-002`: **SHUT DOWN** on November 10, 2025.
  - `imagen-4.0-generate-001` / `imagen-4.0-ultra-generate-001` / `imagen-4.0-fast-generate-001`: **SHUT DOWN** on August 17, 2026.
  - `gemini-2.5-flash-image`: **DEPRECATED** (shuts down March 15, 2027) — normalized to **`gemini-3.1-flash-image`**.

All image generation and multimodal reference-image conditioning in `@google/genai` use the **Interactions API (`ai.interactions.create`)**:

```ts
const interaction = await ai.interactions.create({
  model: 'gemini-3.1-flash-image', // or 'gemini-3.1-flash-lite-image' | 'gemini-3-pro-image'
  input: [
    { type: 'text', text: promptText },
    { type: 'image', mime_type: 'image/png', data: base64ProductImage },
    { type: 'image', mime_type: 'image/png', data: base64MaskImage },
  ],
  response_format: {
    type: 'image',
    mime_type: 'image/png',
    aspect_ratio: '1:1',
    image_size: '1K', // Uppercase required ('512' | '1K' | '2K' | '4K')
  },
});

const outputBase64 = interaction.output_image?.data;
```

---

## 2. Technical Evaluation of Active Official Models

| Official API Model Code | Marketing Name | Official Status | Supported `image_size` | Reference & Mask Support | Token Output (1K / 2K / 4K) |
|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | Nano Banana 2 | **ACTIVE (Default)** | `512`, `1K`, `2K`, `4K` | ✅ Up to 14 reference images (10 objects with high fidelity) + mask | 1120 / 1680 / 2520 tokens |
| **`gemini-3.1-flash-lite-image`** | Nano Banana 2 Lite | **ACTIVE (Fast 1K)** | `1K` only | ✅ Multimodal image + text input | 1120 tokens (1K) |
| **`gemini-3-pro-image`** | Nano Banana Pro | **ACTIVE (4K Studio Pro)** | `1K`, `2K`, `4K` | ✅ Up to 14 reference images (5 high-fidelity objects) | 1120 / 1120 / 2000 tokens |
| **`gemini-3.8-flash`** | Gemini 3.8 Flash | **ACTIVE (Reasoning)** | N/A (Text/Vision) | Multimodal vision analysis & prompt reasoning | $0.75 / 1M in, $3.75 / 1M out |

---

## 3. Product Photography Benchmarking & Fidelity Criteria
1. **Multi-Format Pixel Decoding via Sharp (`src/lib/ai/image-processor.ts`):** Every uploaded customer product photo (`PNG`, `JPEG`, or `WebP`) is decoded into real 8-bit RGBA pixels using `sharp` (`libvips` + `mozjpeg` + `libwebp`) with automatic phone-camera EXIF orientation normalization (`.rotate()`) and zero synthetic hash fallbacks.
2. **Foreground Pixel Lock:** Euclidean color/alpha matting extracts a binary foreground mask (`maskDataUrl`) and isolated product layer (`isolatedProductDataUrl`).
3. **Verifiable Pixel Preservation (`fidelityScore`):** Foreground product pixels are quantitatively compared against the final composited output (`fidelityScore >= 0.90` required for `fidelityVerified: true`).
4. **Truthful SynthID Provenance:** `synthIdDetected: true` is reported **only** when executed against the live Google Gemini API (`executionMode: 'LIVE_GEMINI_API'`), and is always `false` in local sandbox compositing mode (`executionMode: 'LOCAL_COMPOSITE_SANDBOX'`).
