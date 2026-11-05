# AI Model Selection & Routing Architecture

## 1. Hybrid Model Routing Strategy

Rather than relying on a single monolithic model for all workflows, Shotistry implements intelligent model routing based on tier, user intent, and generation mode:

```
                          ┌──────────────────────────┐
                          │ User Request & Photo     │
                          └────────────┬─────────────┘
                                       │
                         ┌─────────────▼─────────────┐
                         │ Stage 1: Scene & Prompt   │
                         │ Reasoning (Gemini Flash)  │
                         └─────────────┬─────────────┘
                                       │
                   ┌───────────────────┴───────────────────┐
                   ▼                                       ▼
       [STANDARD ITERATION / DRAFT]             [PREMIUM STUDIO EXPORT]
     Model: gemini-2.5-flash-image          Model: imagen-3.0-generate-002
     • Latency: ~3 seconds                  • Latency: ~6 seconds
     • High creative versatility            • Pixel-perfect inpainting mask
     • Quick preview & composition          • 100% original product fidelity
```

---

## 2. Selection Rationale by Operational Pipeline

1. **Prompt Synthesis & Product Analysis (`gemini-2.5-flash`):**
   - **Why:** Evaluates the user's uploaded product image, detects category, color temperature, and surface reflectivity, and enriches the chosen photoshoot style into a photorealistic scene prompt in under 1 second.
2. **High-Fidelity Studio Rendering (`imagen-3.0-generate-002`):**
   - **Why:** Delivers unmatched physical realism, surface scattering, specular highlights, contact shadows, and respects inpainting masks so logos and packaging remain razor-sharp.
3. **Conversational Quick Variations (`gemini-2.5-flash-image`):**
   - **Why:** When users want rapid creative exploration (e.g. "make the lighting warmer", "add flower petals around the bottle"), multimodal conversational editing provides rapid turnarounds.
