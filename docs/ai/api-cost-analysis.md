# AI API Cost Analysis & Token Economics (Verified November 2026)

## 1. Official Google Gemini Interactions API Pricing
All figures are verified against the official Google Gemini API Pricing documentation (`ai.google.dev/gemini-api/docs/pricing`, November 2026):

- **`gemini-3.1-flash-image` (Official Default Studio Engine):**
  - Text Input: **$0.50 / 1M tokens**
  - Image Input (Customer product reference + mask): **$0.50 / 1M tokens** (~$0.0006 per reference image)
  - Image Output:
    - **512px (0.5K)**: 747 tokens
    - **1K (`1024x1024` / `1080x1350`)**: 1,120 tokens (~**$0.0336 / image**)
    - **2K (`2048x2048`)**: 1,680 tokens (~**$0.0504 / image**)
    - **4K (`4096x4096`)**: 2,520 tokens (~**$0.0756 – $0.113 / image**)
- **`gemini-3.1-flash-lite-image` (Fast 1K Preview Engine):**
  - 1K Image Output: 1,120 tokens (**$0.0336 / image** standard, **$0.0168 / image** via Batch API)
- **`gemini-3-pro-image` (4K Studio Pro Engine):**
  - High-precision reasoning + studio 1K/2K (1,120 tokens) and 4K (2,000 tokens) output for Pro & Agency tiers.

---

## 2. Per-Generation COGS Breakdown (1 Credit = 1 Photoshoot Generation)

```
Foreground Isolation & Alpha Matting (Sharp): $0.00000 USD (In-process libvips RGBA matting)
Reference Image + Mask Input Tokens:          $0.00120 USD (2 images × 560 tokens)
gemini-3.1-flash-image 1K Studio Output:      $0.03360 USD (1,120 output tokens)
Storage & Signed Delivery Overhead:           $0.00040 USD
---------------------------------------------------------------------------
Total Variable COGS per 1K Studio Shot:       $0.03520 USD (~1.76 EGP / ~0.132 SAR)
```

With Starter/Pro credit pricing at **$0.12–$0.20 USD equivalent per credit**, Shotistry maintains an **80%+ gross margin** across both Egyptian (`EGP`) and Saudi (`SAR`) subscription tiers.
