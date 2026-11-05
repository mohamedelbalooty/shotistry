# AI Model Selection & Routing Strategy (Verified November 2026)

## 1. Executive Summary
Following the permanent shutdown of Google's legacy Imagen models (`imagen-3.0-generate-002` shut down **November 10, 2025**; `imagen-4.0-*` shut down **August 17, 2026**) and the deprecation of `gemini-2.5-flash` / `gemini-2.5-flash-image`, Shotistry routes all image generation and product reference conditioning through the **Google Gemini Interactions API (`ai.interactions.create`)** using official API model identifiers (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`).

---

## 2. Active Production Model Matrix

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   SHOTISTRY OFFICIAL GEMINI MODEL ROUTING                  │
├─────────────────────────────────────┬──────────────────────────────────────┤
│ DEFAULT STUDIO ENGINE               │ HIGH-PRECISION / FAST PREVIEW TIERS  │
│ Official ID: gemini-3.1-flash-image │ Official IDs: gemini-3-pro-image     │
│ API: ai.interactions.create         │               gemini-3.1-flash-lite- │
│ • Up to 14 reference images         │               image                  │
│ • Customer product + binary mask    │ • 4K Pro studio reasoning (Pro)      │
│ • 512, 1K, 2K, and 4K output        │ • Sub-2s 1K catalog previews (Lite)  │
└─────────────────────────────────────┴──────────────────────────────────────┘
```

### Routing Rules (`src/lib/ai/prompt-synthesizer.ts` & `src/lib/ai/gemini-client.ts`)
1. **Primary Commercial Studio Generation (`gemini-3.1-flash-image`):**
   - **Why:** Official Google API model code for Nano Banana 2. Accepts both the customer's raw product photo (`PNG`, `JPEG`, or `WebP`) and the extracted binary alpha mask via `ai.interactions.create` with `response_format: { type: 'image', mime_type, aspect_ratio, image_size }`.
2. **4K Studio Pro Tier (`gemini-3-pro-image`):**
   - **Why:** Reasoning-guided 4K commercial rendering for Pro & Agency workspaces requiring intricate lighting reflections and crisp bilingual packaging scenes.
3. **Fast Catalog Previews (`gemini-3.1-flash-lite-image`):**
   - **Why:** Sub-2-second low-latency 1K generation for rapid style exploration (`image_size` automatically clamped to `'1K'`).
4. **Automatic Legacy & Marketing Alias Normalization (`normalizeGeminiImageModel`):**
   - Any marketing alias (`gemini-nano-banana-2.1`) or shut-down/deprecated model identifier (`imagen-3.0-generate-002`, `imagen-4.0-generate-001`, `gemini-2.5-flash-image`) is automatically normalized to **`gemini-3.1-flash-image`** before any API request is constructed.
