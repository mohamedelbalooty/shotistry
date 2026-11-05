# AI Image Quality Benchmark & Evaluation Protocol

## 1. Quality Scoring Rubric (100-Point Standard)

To ensure generated images meet strict commercial standards, every candidate generation is evaluated across 6 objective dimensions:

```
┌────────────────────────────────────────────────────────────────────────┐
│             SHOTISTRY 100-POINT COMMERCIAL QUALITY RUBRIC              │
├────────────────────────────────┬─────────┬────────────────────────────┤
│ Dimension                      │ Weight  │ Pass Threshold             │
├────────────────────────────────┼─────────┼────────────────────────────┤
│ 1. Product Fidelity & Shape    │ 30 pts  │ ≥ 28 pts (Zero distortion) │
│ 2. Text & Label Integrity      │ 20 pts  │ ≥ 18 pts (Crisp, unwarped) │
│ 3. Physical Lighting & Shadows │ 15 pts  │ ≥ 12 pts (Natural contact) │
│ 4. Surface & Pedestal Grounding│ 15 pts  │ ≥ 12 pts (No floating)     │
│ 5. Material & Texture Realism  │ 10 pts  │ ≥ 8 pts (Photorealistic)   │
│ 6. Composition & Aesthetics    │ 10 pts  │ ≥ 8 pts (Balanced framing) │
├────────────────────────────────┴─────────┴────────────────────────────┤
│ Overall Passing Score: ≥ 86 / 100                                      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Benchmark Test Suites Across Categories

| Suite ID | Product Category | Test Subject Description | Key Challenge Tested |
|---|---|---|---|
| **BM-01** | Luxury Perfume | Clear glass bottle with gold script typography and amber liquid | Liquid translucency, refraction, label preservation, caustic shadows |
| **BM-02** | Leather Handbag | Textured camel-leather bag with brass zipper and buckle | Stitching detail, leather grain fidelity, matte vs metallic reflection |
| **BM-03** | Skincare Dropper | White dropper bottle with fine black ingredient text | White balance consistency, fine text preservation, clean edge cutout |
| **BM-04** | Coffee Packaging | Kraft paper pouch with printed brand emblem | Texture preservation, natural paper folds, vertical standing stability |
| **BM-05** | Luxury Watch | Polished steel timepiece with intricate watch face | Metallic specularity, sapphire crystal antireflection, micro-details |

---

## 3. Failure Mode Recovery Matrix
- **Issue:** Product appears floating without contact shadow.
  - **Remedy:** Automatically inject strict contact ambient occlusion and ground-plane physics terms into the prompt synthesis stage.
- **Issue:** Lighting on background contradicts highlights on original product.
  - **Remedy:** Gemini Flash pre-analyzes the product's dominant light direction (e.g. "key light from top-left") and forces the synthesized background lighting prompt to align symmetrically.
