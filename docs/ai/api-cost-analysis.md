# Google Gemini API Cost Analysis & Billing Tracking

## 1. Verified API Cost Breakdown (November 2026)

Costs verified directly against `ai.google.dev/gemini-api/docs/pricing`:

### A. Active Image Generation & Editing Billing (`ai.interactions.create`)
- **`gemini-nano-banana-2.1` (Nano Banana 2.1 — Default Studio Engine):**
  - Text / Image Input: **$1.50 USD per 1,000,000 input tokens** (~$0.0008 per reference image + prompt).
  - Image Output: **$30.00 USD per 1,000,000 output image tokens**:
    - **1K (`1024x1024` / `1080x1350` / `1080x1920`)**: **$0.0336 USD per image** (Batch API: $0.0168 USD).
    - **2K**: **$0.0504 USD per image** (Batch API: $0.0252 USD).
    - **4K**: **$0.1130 USD per image** (Batch API: $0.0565 USD).
- **`gemini-3.1-flash-lite-image` (Nano Banana 2 Lite):**
  - Text / Image Input: **$0.25 USD per 1,000,000 input tokens**.
  - 1K Image Output: **$0.0336 USD per image** (Batch API: **$0.0168 USD per image**).

### B. Text & Vision Reasoning Models
- **`gemini-3.8-flash`:** $0.75 / 1M input tokens, $3.75 / 1M output tokens (promotional rate through Dec 31, 2026).
- **`gemini-3.5-flash-lite`:** $0.30 / 1M input tokens, $2.50 / 1M output tokens.

---

## 2. Platform Variable Cost Ledger per Generation Request

```
Multimodal Input (Product + Mask + Prompt):  $0.00085 USD
gemini-nano-banana-2.1 1K Studio Output:     $0.03360 USD
Object Storage Write & Signed Delivery:      $0.00050 USD
3% Automated Retry Reserve:                  $0.00105 USD
──────────────────────────────────────────────────────────
Total Internal Cost / Generation:            $0.03600 USD (~1.80 EGP / ~0.135 SAR)
```

---

## 3. Gross Margin Validation
- **Egypt Starter (`349 EGP` / 80 credits = `4.36 EGP` / credit):** Cost per credit `~1.80 EGP` + Paymob fee `~0.14 EGP` -> **~55.5% Gross Margin** on 100% credit utilization (~72% at typical 75% utilization).
- **Saudi Arabia Pro (`189 SAR` / 200 credits = `0.945 SAR` / credit):** Cost per credit `~0.135 SAR` + Paymob fee `~0.028 SAR` -> **~82.7% Gross Margin** on 100% credit utilization.
