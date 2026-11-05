# Product Fidelity & Identity Preservation Architecture

## 1. The Core Engineering Challenge

In commercial e-commerce, **product fidelity is non-negotiable**. A photograph that alters a product's brand logo, modifies the text on a cosmetic box, or changes the cut and color of an apparel item will lead directly to customer returns, chargebacks, and merchant churn.

Standard text-to-image AI models hallucinate new details by default. To overcome this, Shotistry enforces a strict **Dual-Stage Masked Inpainting & Compositing Architecture**.

```
┌────────────────────────────────────────────────────────────────────────────┐
│                  SHOTISTRY PRODUCT FIDELITY PIPELINE                       │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  [Step 1: Raw Customer Upload]                                             │
│         │                                                                  │
│         ▼                                                                  │
│  [Step 2: AI Subject Segmentation & Edge Alpha Extraction]                 │
│         │                                                                  │
│         ├──────────────────────────────┬──────────────────────────────┐    │
│         ▼                              ▼                              ▼    │
│  [Isolated Product RGBA]       [Binary Pixel Mask]         [Edge Rim Band] │
│         │                              │                              │    │
│         │                              ▼                              │    │
│         │       [Step 3: Imagen 3 Inpainting / Scene Generation]      │    │
│         │       • Model generates background, pedestal & lighting     │    │
│         │       • Mask locks original product area from alteration    │    │
│         │                              │                              │    │
│         ▼                              ▼                              ▼    │
│  [Step 4: Photometric Blending & Shadow Composite Harmonization]           │
│  • Contact shadow projection onto generated pedestal                      │
│  • Edge ambient light wrapping (light wrap around perimeter)               │
│  • Specular highlight alignment                                            │
│         │                                                                  │
│         ▼                                                                  │
│  [Final Commercial Output: 100% Genuine Product + Studio Environment]      │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Technical Implementation Stages

### Stage 1: Ultra-Sharp Alpha Matting
- When a user uploads a product image, the system isolates the foreground subject from the cluttered background, generating an ultra-high precision alpha channel mask.
- Transparent and semi-translucent regions (e.g. glass bottles, sheer fabrics) retain their partial opacity to allow background light refraction.

### Stage 2: Mask-Guided Inpainting (Imagen 3)
- Using the official `@google/genai` API with `types.RawReferenceImage` and `types.MaskReferenceImage`:
  - The base product image and the mask are supplied to the generation engine.
  - The mask defines the protected zone (the product) while instructing the model to generate the surrounding scene, pedestal, lighting, and reflections.

### Stage 3: Light Wrapping & Contact Harmonization
- Real studio photos exhibit "light wrap"—diffuse ambient light from the background slightly bleeding over the extreme micro-edges of the subject.
- Our post-processing compositing layer computes subtle edge light wrapping and grounds the base with an ambient occlusion shadow pass, eliminating any artificial "sticker cutout" look.

---

## 3. Product Fidelity Guarantee
1. Original brand logos, typography, certifications, and barcode labels are preserved with 100% pixel fidelity.
2. Original product color tones are preserved against an unskewed sRGB color profile.
3. If an uploaded product image is too blurry, cropped, or poorly lit to preserve fidelity, the system proactively alerts the user during upload rather than silently producing a defective output.

