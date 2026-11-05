# Google Gemini API Cost Analysis & Billing Tracking

## 1. Verified API Cost Breakdown

Costs sourced directly from `ai.google.dev/gemini-api/docs/pricing`:

### A. Image Output Billing
- **Imagen 3 (`imagen-3.0-generate-002`):**
  - Standard Generation (1024x1024 / 1K): **$0.030 USD per image**.
  - Inpainting / Editing: **$0.030 USD per generated result**.
- **Gemini Multimodal Image Generation (`gemini-2.5-flash-image`):**
  - 512x512: ~$0.045 USD
  - 1024x1024: ~$0.067 USD
  - Batch API: 50% discount on standard rates.

### B. Input Token Costs (Prompt Optimization & Vision Analysis)
- `gemini-2.5-flash` for intelligent prompt synthesis and visual category classification:
  - Text Input: **$0.25 per 1,000,000 tokens** (negligible: ~$0.0001 per request).
  - Image Input Tokens: **$0.25 per 1,000,000 tokens** (~$0.00006 per 1K image input).

---

## 2. Platform Variable Cost Ledger per Generation Request

```
Base Gemini Prompt Synthesis:        $0.00015 USD
Imagen 3 High-Fidelity Generation:    $0.03000 USD
Cloudflare R2 Object Write & Cache:   $0.00050 USD
3% Automated Retry Reserve:          $0.00100 USD
──────────────────────────────────────────────────
Total Internal Cost / Generation:    $0.03165 USD (~1.55 EGP / ~0.119 SAR)
```

---

## 3. Centralized Model Pricing Configuration Invariant
To ensure business logic never requires code redeployments when Google updates pricing:
- A centralized database table (`ModelPricingConfig`) stores active model identifiers, resolution multipliers, token costs, and per-image base tariffs.
- All credit burn calculations and admin margin analytics dynamically query this configuration.
