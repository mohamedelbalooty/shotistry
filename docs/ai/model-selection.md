# AI Model Selection & Routing Architecture

## 1. Hybrid Model Routing Strategy

Shotistry routes product photography requests across active Google Gemini Nano Banana models via the `@google/genai` Interactions API (`ai.interactions.create`), paired with deterministic foreground isolation and studio compositing (`src/lib/ai/image-processor.ts`):

```
                          ┌──────────────────────────┐
                          │ Customer Product Photo   │
                          └────────────┬─────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │ Stage 1: Foreground Mask  │
                         │ & 10-Component Synthesis  │
                         └─────────────┬─────────────┘
                                       │
                   ┌───────────────────┴───────────────────┐
                   ▼                                       ▼
       [DEFAULT STUDIO WORKHORSE]              [4K PRO / FAST LITE TIERS]
     Model: gemini-nano-banana-2.1           Models: gemini-3-pro-image (4K)
     • Cost: $0.0336 / 1K image                      gemini-3.1-flash-lite-image
     • Up to 14 reference images             • 4K agency exports & typography
     • Binary mask + product pixel lock      • High-speed catalog variations
```

---

## 2. Selection Rationale by Operational Pipeline

1. **Primary Commercial Studio Generation (`gemini-nano-banana-2.1`):**
   - **Why:** Official Google replacement for retired Imagen 3/4 and legacy Flash Image models. Accepts both the customer's raw product photo and the extracted binary alpha mask via `ai.interactions.create`, delivering photorealistic studio scenes at **$0.0336 per 1K image**.
2. **4K Pro Studio & Typography (`gemini-3-pro-image`):**
   - **Why:** Used for Pro/Agency 4K exports requiring complex multi-object studio staging and sharp Arabic/English scene typography.
3. **High-Efficiency Previews (`gemini-3.1-flash-lite-image`):**
   - **Why:** Low-latency 1K generation ($0.25/1M input tokens, $0.0336/1K image output, $0.0168/1K in batch) for rapid preset exploration.
4. **Automatic Legacy Model Normalization (`normalizeGeminiImageModel`):**
   - Any legacy or shut-down model identifier (`imagen-3.0-generate-002`, `imagen-4.0-generate-001`, `gemini-2.5-flash-image`, `gemini-3.1-flash-image`) is automatically normalized to **`gemini-nano-banana-2.1`**.
