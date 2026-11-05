# Prompt Engineering Strategy for Commercial Product Photography

## 1. Core Engineering Principles

Commercial product photography has fundamentally different requirements than artistic text-to-image generation. A commercial photo must:
1. **Highlight the Product as Hero:** The product must be the sharpest, focal centerpiece with zero optical distortion.
2. **Obey Physical Lighting Rules:** Lighting direction, soft shadow falloff, specular reflections, and ambient occlusion must ground the product naturally onto its physical surface.
3. **Respect Brand Tones:** Color palettes must complement rather than clash with the product packaging.

---

## 2. The 10-Component Prompt Architecture

Every prompt synthesized by Shotistry follows a strict 10-component structural schema:

```
[Subject/Hero] + [Surface/Pedestal] + [Environment/Backdrop] + [Lighting Geometry] +
[Camera/Lens Optic] + [Color Atmosphere] + [Physical Props] + [Depth of Field] +
[Atmospheric Nuance] + [Commercial Quality Directives]
```

### Component Breakdown
1. **Subject Anchor:** Exact description of the segmented product (e.g., "The centerpiece is a cylindrical luxury glass perfume bottle filled with amber fragrance").
2. **Surface & Contact:** Material physical interaction (e.g., "resting on a polished dark travertine stone slab with a subtle mirror contact reflection and natural cast shadow").
3. **Environment & Background:** Scenic backdrop (e.g., "warm sand dunes in the background under twilight, desert horizon softly out of focus").
4. **Lighting Schema:** Professional studio lighting key (e.g., "dual softbox studio lighting, 45-degree warm rim light highlighting glass bevels, diffuse fill light eliminating harsh black cutoffs").
5. **Camera & Optics:** Perspective specification (e.g., "shot with Hasselblad medium format, 85mm portrait macro lens, eye-level heroic commercial angle").
6. **Depth of Field:** f-stop aesthetic (e.g., "crisp f/5.6 aperture, sharp focus on product label, gradual bokeh blur across background").
7. **Props & Contextual Elements:** Non-distracting accents (e.g., "subtle botanical leaves, dry wood bark, fine water droplets").
8. **Color Grading:** Color temperature and mood (e.g., "warm golden hour tones, rich earthy contrast, muted neutral highlights").
9. **Physical Coherence:** Contact grounding (e.g., "ground contact shadow, true-to-life ambient occlusion, no floating artifacts").
10. **Negative Directives:** Prevent common failure modes (e.g., "no warped geometry, no low resolution artifacts, no floating props, no fake text on product").
