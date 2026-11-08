# Google Gemini Interactions API Image Model Research (Verified November 2026)

## 1. Official Google Image Generation Model Identifiers & Deprecation Status

Per official Google AI Studio & Vertex AI documentation (`aistudio.google.com/docs/models/gemini-3.1-flash-image`, `docs/models/gemini-3.1-flash-lite-image`, `docs/models/gemini-3-pro-image`, `docs/pricing`, `docs/flex-inference`, `docs/priority-inference`) verified November 2026:

- **Official API Model Identifiers (Used in all API requests and centralized in `src/lib/pricing/model-costs.ts`):**
  - **`gemini-3.1-flash-image`** *(Nano Banana 2)* — **ACTIVE (Platform Default)**: Commercial image generation & multimodal reference editing supporting `512` (747 out tokens), `1K` (1,120 out tokens), `2K` (1,680 out tokens), and `4K` (2,520 out tokens); 1,120 tokens per input image; `$0.50/1M` input, `$60.00/1M` image output (`$0.0672` 1K image output, **`$0.071050`** total actual cost per successful 1K image on Standard tier).
  - **`gemini-3.1-flash-lite-image`** *(Nano Banana 2 Lite)* — **ACTIVE (Fast 1K Preview)**: Sub-2s low-latency `1K` (`1024px`) generation only (`2K`/`4K` unsupported and automatically clamped to `1K`); 1,120 tokens per input image; `$0.25/1M` input, `$30.00/1M` image output (`$0.0336` 1K image output, **`$0.035775`** total actual cost per successful 1K image on Standard tier).
  - **`gemini-3-pro-image`** *(Nano Banana Pro)* — **ACTIVE (4K Studio Pro for Pro & Agency)**: Reasoning-driven studio `1K`/`2K` (1,120 out tokens) and `4K` (2,000 out tokens) generation; 560 tokens per input image; `$2.00/1M` input, `$120.00/1M` image output (`$0.1344` 1K/2K image output, `$0.2400` 4K image output; **`$0.141960`** actual cost at 1K/2K and **`$0.250728`** at 4K).
- **Disallowed / Retired / Marketing Aliases (Normalized by `normalizeGeminiImageModel()`):**
  - `gemini-nano-banana-2.1` → normalized to **`gemini-3.1-flash-image`**.
  - `imagen-3.0-generate-002` (**SHUT DOWN** Nov 10, 2025) → normalized to **`gemini-3.1-flash-image`**.
  - `imagen-4.0-*` (**SHUT DOWN** Aug 17, 2026) → normalized to **`gemini-3.1-flash-image`**.
  - `gemini-2.5-flash-image` (**DEPRECATED**, shutdown Mar 15, 2027) → normalized to **`gemini-3.1-flash-image`**.

All image generation and multimodal conditioning in `@google/genai` use the **Interactions API (`ai.interactions.create`)** with `response_format: { type: 'image', mime_type, aspect_ratio, image_size }` and `interaction.output_image.data`.

---

## 2. Technical Evaluation & Service Tier Matrix

| Official API Model Code | Marketing Name | Supported `image_size` | Input Tok/Img | Output Image Tokens | Standard Actual Cost (1K / Max) | Batch & Vertex Flex Actual Cost (1K / Max) | Vertex Priority Actual Cost (1K / Max) |
|---|---|---|---|---|---|---|---|
| **`gemini-3.1-flash-image`** | Nano Banana 2 (Default) | `512`, `1K`, `2K`, `4K` | 1,120 | 747 / 1,120 / 1,680 / 2,520 | `$0.071050` / `$0.157570` | `$0.035775` / `$0.079035` | `$0.127490` / `$0.283226` |
| **`gemini-3.1-flash-lite-image`** | Nano Banana 2 Lite | `1K` only | 1,120 | 1,120 | `$0.035775` | `$0.018138` | `$0.063995` |
| **`gemini-3-pro-image`** | Nano Banana Pro | `1K`, `2K`, `4K` | 560 | 1,120 / 1,120 / 2,000 | `$0.141960` / `$0.250728` | `$0.071230` / `$0.125614` | `$0.255128` / `$0.450911` |

*Note on Gemini API vs Vertex AI Service Tiers:* Both `standard` and `batch` (50% discount) are supported on the Gemini Developer API (`ai.google.dev`) and Vertex AI. `flex` (50% discount) and `priority` (1.8× Standard) are Pay-as-you-go tiers on **Vertex AI** (`geminiApiSupported: false`, `vertexAiSupported: true`).

---

## 3. Product Photography Benchmarking & Genuine Final-Asset Fidelity Criteria
1. **Multi-Format Pixel Decoding via Sharp (`src/lib/ai/image-processor.ts`):** Every uploaded customer product photo (`PNG`, `JPEG`, `WebP`) is decoded into real 8-bit RGBA pixels using `sharp` (`libvips`) with phone-camera EXIF `.rotate()` and zero synthetic hash fallbacks.
2. **Border-Connected Flood-Fill Foreground Isolation (`isolateProductForeground`):** Uses adaptive contrast thresholding (`26` standard, lowering to `7` for white-on-white or subtle glass objects), contour gap closing, and a 4-connected exterior border BFS flood-fill so interior white logos, translucent glass interiors, white packaging on white backdrops, and reflective specular highlights are never punched out as background.
3. **Final Delivered Asset Verification (`verifyDeliveredImageFidelity`):** `fidelityScore` and `fidelityVerified` are always measured by decoding the **actual final image delivered to the customer (`result.imageUrl`)**, never an intermediate local composite while returning a different Gemini output. When `lockProductForeground: true` is used with live scene generation, `compositeProductOnSceneImage` composites the exact isolated product foreground onto the Gemini-generated scene before `verifyDeliveredImageFidelity` proves preservation.
4. **Truthful SynthID Provenance:** `synthIdDetected: true` is reported strictly for `LIVE_GEMINI_API` outputs, and always `false` in `LOCAL_COMPOSITE_SANDBOX`.
