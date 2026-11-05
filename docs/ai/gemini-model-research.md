# Google Gemini & Imagen Model Research

## 1. Official Google Image Generation Architecture

As of late 2024 through 2026, Google provides image generation and visual editing through two distinct pathways within the official Google GenAI ecosystem (`@google/genai` SDK):

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GOOGLE GENAI IMAGE GENERATION PIPELINES                  │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 1. DEDICATED IMAGE GENERATION        │ 2. NATIVE MULTIMODAL EDITING         │
│ Model: imagen-3.0-generate-002       │ Model: gemini-2.5-flash-image / 3.1  │
│ Method: ai.models.generateImages()   │ Method: ai.models.generateContent()  │
│ • Photorealistic textures            │ • Image-to-image semantic editing    │
│ • User-provided mask inpainting      │ • Conversational scene alterations   │
│ • Accurate text rendering in scene   │ • Natural language visual guidance   │
│ • SynthID digital watermark          │ • High-speed, lower latency          │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Technical Evaluation of Available Models

| Model Identifier | Primary Capability | Inpainting / Mask Support | Text Rendering | Typical Latency | Cost / 1K Image |
|---|---|---|---|---|---|
| **`imagen-3.0-generate-002`** | Dedicated photorealistic generation | ✅ Yes (User Mask + Raw Image) | Exceptional | 4.5 – 8.0s | $0.030 USD |
| **`gemini-2.5-flash-image`** | Native multimodal generation/editing | ✅ Conversational image editing | Strong | 2.5 – 4.5s | ~$0.045 USD |
| **`gemini-2.5-flash`** | Text & vision prompt reasoning | N/A (Text/Reasoning only) | N/A | 0.8 – 1.5s | $0.25 / 1M input tokens |

---

## 3. Product Photography Benchmarking Criteria
1. **Physical Lighting Coherence:** Does the generated background cast natural shadows, contact ambient occlusion, and color bounce onto the surface holding the product?
2. **Material Realism:** Are marble veins, polished glass, velvet, liquid transparency, and brushed metal accurately rendered?
3. **Typography & Label Integrity:** Does the model avoid hallucinating scrambled letters or fake brand names on the product itself?
4. **Resolution & Aspect Ratios:** Native support for 1:1 (Square), 4:5 (Instagram Feed), 9:16 (Stories/TikTok), and 16:9 (Landscape) without aspect distortion.
