# Product Fidelity & Identity Preservation Architecture

## 1. The Core Engineering Invariant

In commercial e-commerce, **product fidelity cannot be assumed — it must be measured directly on the final asset delivered to the customer**. Reporting fidelity from an intermediate local composite while returning an unverified Gemini-generated image masks label tampering and product hallucinations.

Shotistry enforces a **4-Stage Sharp Segmentation, Scene Compositing & Delivered-Asset Verification Pipeline** in [`src/lib/ai/image-processor.ts`](../../src/lib/ai/image-processor.ts) and [`src/lib/ai/gemini-client.ts`](../../src/lib/ai/gemini-client.ts):

```
┌────────────────────────────────────────────────────────────────────────────┐
│            SHOTISTRY GENUINE DELIVERED-IMAGE FIDELITY PIPELINE             │
├────────────────────────────────────────────────────────────────────────────┤
│                                                                            │
│  [Stage 1: Real Upload Decode (PNG / JPEG / WebP)]                         │
│         │  • Magic-byte MIME verification (rejects HEIC/GIF/PDF/corrupt)   │
│         │  • Sharp (libvips) RGBA decode + EXIF .rotate()                  │
│         ▼                                                                  │
│  [Stage 2: Border-Connected Flood-Fill + Adaptive Contrast Segmentation]   │
│         │  • Adaptive threshold (26 standard -> 7 white-on-white/glass)    │
│         │  • 1px contour gap closing + 4-connected Exterior Border BFS     │
│         │  • Preserves interior white logos, glass chambers, speculars     │
│         │  • Outputs isolatedProductDataUrl + binary maskDataUrl           │
│         ▼                                                                  │
│  [Stage 3: Gemini Interactions API Conditioning / Optional Foreground Lock]│
│         │  • Calls ai.interactions.create (product + binary mask)          │
│         │  • lockProductForeground=false: returns Gemini harmonized output │
│         │  • lockProductForeground=true: treats Gemini output as studio    │
│         │    scene & composites exact isolated product foreground onto it  │
│         ▼                                                                  │
│  [Stage 4: Post-Generation Delivered-Image Verification]                   │
│         │  • verifyDeliveredImageFidelity(isolated, finalImageUrl)         │
│         │  • Decodes actual delivered result.imageUrl via Sharp            │
│         │  • Computes fidelityScore, exactPixelMatchRatio, fidelityVerified│
│         │  • Fails check (< 0.90) if Gemini altered product or logo pixels │
│         ▼                                                                  │
│  [Final Output: Truthfully Verified result.imageUrl + fidelityScore]       │
│                                                                            │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Why Exterior Border Flood-Fill Resolves All 6 Difficult Product Categories

Replacing the legacy global per-pixel threshold (`dist > 26`) with **adaptive contrast + contour closure + 4-connected exterior border BFS** solves the classic cutout failure modes:

1. **Original Product Pixel Preservation:** When `lockProductForeground: true` (or local sandbox studio composite), exact isolated foreground RGB values are composited cleanly onto PNG canvases and verified via `exactPixelMatchRatio === 1.0` on the decoded final asset.
2. **Logo & Packaging Preservation:** Interior white logos, crests, and typography enclosed by packaging boundaries are unreachable from the outer border BFS and therefore remain `maskAlpha = 255` (zero hole-punching).
3. **White Products on White Backgrounds:** Adaptive contrast lowers the segmentation threshold when a low-contrast subject occupies the center against a white background (`dist ≈ 7+`), locking onto subtle contact contours and keeping the white product interior intact.
4. **Transparent Bottles & Glass:** Refractive glass rims form the outer contour barrier; the translucent interior glass chamber stays inside the mask rather than dropping out as background.
5. **Reflective Metallic/Chrome Surfaces:** Bright `[253, 253, 255]` mirror specular highlights inside chrome silhouettes remain enclosed at `maskAlpha = 255`.
6. **Product Edges & Fine Details:** Fine 1–2px atomizer nozzles and stepped bottle collars stay above barrier contrast and remain connected to the foreground silhouette without aggressive erosion.

---

## 3. UI & API Truthfulness Rules

- `GeminiClient.generateProductPhoto` **never** computes `fidelityScore` on `studioComposite` when returning `liveDataUrl`. It always decodes the final `imageUrl` actually returned to the customer via `verifyDeliveredImageFidelity()`.
- Marketing and Studio UI never unconditionally claim `100%`: the Studio badge reflects live `activeResult.fidelityVerified` (`>= 90%` emerald vs `< 90%` warning) and offers merchants a **Foreground Lock Compositing** toggle (`lockProductForeground`) when exact pixel-for-pixel packaging preservation is mandatory.
