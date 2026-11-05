# Product Fidelity & Identity Preservation Architecture

## 1. The Core Engineering Challenge

In commercial e-commerce, **product fidelity is non-negotiable**. A photograph that alters a product's brand logo, modifies the text on a cosmetic box, or changes the cut and color of an apparel item will lead directly to customer returns, chargebacks, and merchant churn.

Standard text-to-image AI models hallucinate new details by default. To overcome this, Shotistry enforces a strict **Multi-Format Sharp Pixel Isolation, Reference-Conditioned Generation & Compositing Architecture** (`src/lib/ai/image-processor.ts` & `src/lib/ai/gemini-client.ts`).

```
┌────────────────────────────────────────────────────────────────────────────┐
│                  SHOTISTRY PRODUCT FIDELITY PIPELINE                       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  [Step 1: Raw Customer Upload (PNG / JPEG / WebP)]                         │
│         │  • Validated by magic bytes & MIME type                          │
│         │  • Decoded via Sharp (libvips) + EXIF auto-orientation           │
│         ▼                                                                  │
│  [Step 2: Subject Segmentation & Binary Alpha Mask Extraction]             │
│         │                                                                  │
│         ├──────────────────────────────┬──────────────────────────────┐    │
│         ▼                              ▼                              ▼    │
│  [Isolated Product RGBA]       [Binary Pixel Mask]         [Bounding Box]  │
│         │                              │                              │    │
│         │                              ▼                              │    │
│         │       [Step 3: Gemini Interactions API Conditioning]        │    │
│         │       • Model: gemini-3.1-flash-image / gemini-3-pro-image  │    │
│         │       • Passes customer product + mask in input[]           │    │
│         │       • response_format: { type: "image", aspect_ratio }    │    │
│         │                              │                              │    │
│         ▼                              ▼                              ▼    │
│  [Step 4: Studio Pedestal, Contact Shadow & Pixel Fidelity Verification]   │
│  • Contact shadow projection onto studio pedestal                          │
│  • Quantitative pixel-preservation check (verifyProductFidelity >= 0.90)   │
│         │                                                                  │
│         ▼                                                                  │
│  [Final Commercial Output: Verified Product Pixels + Studio Environment]   │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technical Implementation Stages

### Stage 1: Real PNG, JPEG & WebP Pixel Decoding (`decodeProductImage`)
- Uses `sharp` (`libvips 8.18.7`, `mozjpeg`, `libwebp`, `libpng`) to decode real pixels from `image/png`, `image/jpeg`, and `image/webp` uploads.
- Automatically applies mobile phone camera EXIF orientation tags via `.rotate()`.
- Rejects unsupported formats (`PDF`, `GIF`, `HEIC`, `SVG`) and corrupt/truncated image buffers with clear validation errors — **never** falls back to synthetic file-hash images.

### Stage 2: Foreground Alpha Matting (`isolateProductForeground`)
- Samples border corners and midpoints to estimate background color and isolates foreground product pixels via Euclidean RGB/alpha matting, producing both `isolatedProductDataUrl` and `maskDataUrl`.

### Stage 3: Gemini Interactions API Reference Conditioning (`GeminiClient.generateProductPhoto`)
- Calls `@google/genai` `ai.interactions.create` using official model IDs (`gemini-3.1-flash-image`, `gemini-3.1-flash-lite-image`, `gemini-3-pro-image`), supplying the customer product image and binary mask in `input` and `response_format: { type: 'image', mime_type, aspect_ratio, image_size }`, and extracting `interaction.output_image.data`.

### Stage 4: Quantitative Pixel Fidelity Verification (`verifyProductFidelity`)
- Compares every placed foreground pixel in the studio composite against the isolated customer product pixels and computes `fidelityScore` (`0.0` to `1.0`), setting `fidelityVerified = fidelityScore >= 0.90`.
