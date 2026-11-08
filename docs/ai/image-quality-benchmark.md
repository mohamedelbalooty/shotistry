# AI Image Quality Benchmark & Delivered-Asset Verification Protocol

## 1. Automated Pixel-Fidelity Verification Gate (`tests/image-pipeline.test.mjs` & `tests/gemini-client.test.mjs`)

To prevent misleading "100% fidelity" claims or unverified intermediate metrics, Shotistry executes two complementary quality checks on every candidate output:

### A. Quantitative Delivered-Asset Pixel Audit (`verifyDeliveredImageFidelity`)
- Decodes the **actual final image delivered to the customer (`result.imageUrl`)** using `decodeProductImage()` (`sharp` / `libvips`).
- Measures against the customer's isolated product reference (`IsolatedProductResult`):
  - **`fidelityScore`:** Fraction of foreground pixels matching within `<= 12` RGB channel delta (lossy-codec tolerance). `fidelityVerified: true` requires `fidelityScore >= 0.90`.
  - **`exactPixelMatchRatio`:** Fraction of foreground pixels matching bit-for-bit (`0` RGB delta). Achieves **`1.0`** (`100%`) **only** when lossless foreground compositing (`lockProductForeground: true` / studio PNG compositor) is used and proven on the decoded output.
  - **`meanChannelError`:** Average per-channel pixel deviation across the product silhouette.
- **Anti-Hallucination Detection:** When live Gemini output substitutes or alters product pixels without `lockProductForeground`, `verifyDeliveredImageFidelity` measures the actual delivered `liveDataUrl` and reports `fidelityScore < 0.50` (`fidelityVerified: false`).

### B. 100-Point Commercial Studio Quality Rubric

| Dimension | Weight | Pass Threshold |
|---|---|---|
| 1. Product Fidelity & Shape | 30 pts | >= 28 pts (Verified by `verifyDeliveredImageFidelity`) |
| 2. Text & Logo Integrity | 20 pts | >= 18 pts (Interior white/gold logos preserved intact) |
| 3. Physical Lighting & Shadows | 15 pts | >= 12 pts (Contact AO & surface grounding) |
| 4. Surface & Pedestal Grounding | 15 pts | >= 12 pts (No floating artifacts) |
| 5. Material & Texture Realism | 10 pts | >= 8 pts (Glass refraction, chrome specularity) |
| 6. Composition & Aesthetics | 10 pts | >= 8 pts (Balanced commercial framing) |
| **Overall Passing Score** | **100 pts** | **>= 86 / 100** |

---

## 2. Verified Difficult Product Category Test Matrix (`tests/image-pipeline.test.mjs`)

| Test ID | Product Fidelity Challenge | Verified Segmentation & Final-Asset Proof | Automated Status |
|---|---|---|---|
| **FIDELITY 1** | Original product pixel preservation | Ruby bottle decoded via Sharp; final delivered studio PNG proven at `fidelityScore === 1` and `exactPixelMatchRatio === 1`. | **PASS** |
| **FIDELITY 2** | Logo and packaging preservation | Crimson bottle with pure-white `[255,255,255]` interior brand emblem on white background; 100% of interior logo pixels preserved (`maskAlpha === 255`), `exactPixelMatchRatio === 1` after dark marble compositing. | **PASS** |
| **FIDELITY 3** | White products on white backgrounds | Soft ivory ceramic jar `[245,245,248]` with `[232,234,238]` subtle rim on pure `[255,255,255]` white backdrop; full `29x37` jar isolated with zero interior dropout and `exactPixelMatchRatio === 1`. | **PASS** |
| **FIDELITY 4** | Transparent bottles and glass | Clear glass vessel (`[206,218,228]` refractive rims, `[250,252,254]` translucent chamber, amber liquid); glass chamber intact at `maskAlpha === 255` and proven in delivered composite. | **PASS** |
| **FIDELITY 5** | Reflective chrome/metallic surfaces | Brushed steel cylinder with `[253,253,255]` mirror specular strip matching `[252,252,252]` backdrop; mirror strip preserved at `maskAlpha === 255` and proven in delivered composite. | **PASS** |
| **FIDELITY 6** | Product edges and fine details | 2px gold atomizer nozzle (`x=31..32, y=8..13`) and stepped collar preserved at exact top bounding coordinate `y=8` and `fidelityScore === 1`. | **PASS** |
| **FIDELITY 7** | Separate scene generation + foreground compositing | Gemini-generated scene decoded via `compositeProductOnSceneImage` with exact isolated foreground composited + contact shadow; delivered asset verified at `exactPixelMatchRatio === 1`. | **PASS** |
