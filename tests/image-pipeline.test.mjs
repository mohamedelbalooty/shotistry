import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  createSampleProductPngDataUrl,
  decodeProductImage,
  encodeRgbaToPngDataUrl,
  isolateProductForeground,
  compositeProductOnStudioScene,
  compositeProductOnSceneImage,
  verifyProductFidelity,
  verifyDeliveredImageFidelity,
} from '../src/lib/ai/image-processor.ts';

const FIXTURES_DIR = path.resolve('tests/fixtures');

function loadFixtureAsDataUrl(filename, mimeType) {
  const bytes = fs.readFileSync(path.join(FIXTURES_DIR, filename));
  return `data:${mimeType};base64,${bytes.toString('base64')}`;
}

describe('Product Image Isolation, Masking & Studio Compositing Pipeline (PNG, JPEG, WebP)', () => {
  test('decodes real PNG product fixture and extracts binary foreground mask & bounding box', async () => {
    const pngDataUrl = loadFixtureAsDataUrl('product-ruby.png', 'image/png');

    const decoded = await decodeProductImage(pngDataUrl);
    assert.equal(decoded.width, 64);
    assert.equal(decoded.height, 64);
    assert.equal(decoded.mimeType, 'image/png');

    const isolated = await isolateProductForeground(pngDataUrl);
    assert.ok(isolated.maskDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(isolated.isolatedProductDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(isolated.boundingBox.width > 10);
    assert.ok(isolated.boundingBox.height > 15);
    assert.ok(isolated.boundingBox.foregroundRatio > 0.08);
    assert.ok(isolated.boundingBox.foregroundRatio < 0.85);
  });

  test('decodes real JPEG product fixtures (never synthetic hashes) and preserves actual pixel colors', async () => {
    const rubyJpegUrl = loadFixtureAsDataUrl('product-ruby.jpg', 'image/jpeg');
    const cobaltJpegUrl = loadFixtureAsDataUrl('product-cobalt.jpg', 'image/jpeg');

    const decodedRuby = await decodeProductImage(rubyJpegUrl);
    const decodedCobalt = await decodeProductImage(cobaltJpegUrl);

    // Must decode actual 64x64 JPEG dimensions, NOT the old 96x96 SHA-256 synthetic rasterizer
    assert.equal(decodedRuby.width, 64);
    assert.equal(decodedRuby.height, 64);
    assert.equal(decodedRuby.mimeType, 'image/jpeg');

    assert.equal(decodedCobalt.width, 64);
    assert.equal(decodedCobalt.height, 64);
    assert.equal(decodedCobalt.mimeType, 'image/jpeg');

    // Sample a pixel on the lower bottle body (x=32, y=50) outside the center label
    const bodyPixelOffset = (50 * 64 + 32) * 4;
    const rubyR = decodedRuby.pixels[bodyPixelOffset];
    const rubyB = decodedRuby.pixels[bodyPixelOffset + 2];
    const cobaltR = decodedCobalt.pixels[bodyPixelOffset];
    const cobaltB = decodedCobalt.pixels[bodyPixelOffset + 2];

    assert.ok(rubyR > 165 && rubyB < 75, `Expected Ruby JPEG pixel (R=${rubyR}, B=${rubyB})`);
    assert.ok(cobaltB > 175 && cobaltR < 60, `Expected Cobalt JPEG pixel (R=${cobaltR}, B=${cobaltB})`);

    const isoRuby = await isolateProductForeground(rubyJpegUrl);
    const compRuby = compositeProductOnStudioScene({
      isolated: isoRuby,
      presetId: 'gulf_luxury_marble',
      aspectRatio: '1:1',
    });

    const fidelity = verifyProductFidelity(isoRuby, compRuby);
    assert.equal(fidelity.fidelityVerified, true);
    assert.ok(fidelity.fidelityScore >= 0.95);
  });

  test('decodes real WebP product fixtures and preserves actual pixel colors across studio compositing', async () => {
    const rubyWebpUrl = loadFixtureAsDataUrl('product-ruby.webp', 'image/webp');
    const cobaltWebpUrl = loadFixtureAsDataUrl('product-cobalt.webp', 'image/webp');

    const decodedRuby = await decodeProductImage(rubyWebpUrl);
    assert.equal(decodedRuby.width, 64);
    assert.equal(decodedRuby.height, 64);
    assert.equal(decodedRuby.mimeType, 'image/webp');

    const bodyPixelOffset = (50 * 64 + 32) * 4;
    assert.ok(decodedRuby.pixels[bodyPixelOffset] > 165, 'WebP must preserve Ruby red channel');

    const isoRuby = await isolateProductForeground(rubyWebpUrl);
    const isoCobalt = await isolateProductForeground(cobaltWebpUrl);

    const compRuby = compositeProductOnStudioScene({
      isolated: isoRuby,
      presetId: 'minimal-studio',
      aspectRatio: '1:1',
    });
    const compCobalt = compositeProductOnStudioScene({
      isolated: isoCobalt,
      presetId: 'minimal-studio',
      aspectRatio: '1:1',
    });

    assert.notEqual(compRuby.imageDataUrl, compCobalt.imageDataUrl);
    const selfFidelity = verifyProductFidelity(isoRuby, compRuby);
    assert.equal(selfFidelity.fidelityVerified, true);
    assert.ok(selfFidelity.fidelityScore >= 0.95);

    const crossFidelity = verifyProductFidelity(isoRuby, compCobalt);
    assert.equal(crossFidelity.fidelityVerified, false);
    assert.ok(crossFidelity.fidelityScore < 0.5);
  });

  test('supports phone-camera JPEG with EXIF orientation metadata and non-square dimensions', async () => {
    // Create an 80x120 portrait phone-camera JPEG with EXIF orientation tag
    const portraitBuffer = await sharp({
      create: {
        width: 80,
        height: 120,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .composite([
        {
          input: await sharp({
            create: {
              width: 36,
              height: 64,
              channels: 3,
              background: { r: 30, g: 130, b: 85 },
            },
          })
            .png()
            .toBuffer(),
          left: 22,
          top: 28,
        },
      ])
      .withMetadata({ orientation: 1 })
      .jpeg({ quality: 92 })
      .toBuffer();

    const phoneDataUrl = `data:image/jpeg;base64,${portraitBuffer.toString('base64')}`;
    const decoded = await decodeProductImage(phoneDataUrl);
    assert.equal(decoded.width, 80);
    assert.equal(decoded.height, 120);
    assert.equal(decoded.mimeType, 'image/jpeg');

    const isolated = await isolateProductForeground(phoneDataUrl);
    assert.ok(isolated.boundingBox.width >= 30 && isolated.boundingBox.width <= 42);
    assert.ok(isolated.boundingBox.height >= 58 && isolated.boundingBox.height <= 70);
  });

  test('rejects unsupported image formats (PDF, GIF, HEIC) and corrupt image bytes with clear validation errors', async () => {
    const fakePdf = `data:application/pdf;base64,${Buffer.from('%PDF-1.7 fake document content padding').toString('base64')}`;
    await assert.rejects(
      async () => {
        await decodeProductImage(fakePdf);
      },
      /Unsupported image/i
    );

    const fakeGif = `data:image/gif;base64,${Buffer.from('GIF89a0000000000000000000000').toString('base64')}`;
    await assert.rejects(
      async () => {
        await decodeProductImage(fakeGif);
      },
      /Unsupported image/i
    );

    const fakeHeic = `data:image/heic;base64,${Buffer.from('\x00\x00\x00\x18ftypheic\x00\x00\x00\x00heicmif1').toString('base64')}`;
    await assert.rejects(
      async () => {
        await decodeProductImage(fakeHeic);
      },
      /Unsupported image/i
    );

    const corruptJpeg = `data:image/jpeg;base64,${Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]).toString('base64')}`;
    await assert.rejects(
      async () => {
        await decodeProductImage(corruptJpeg);
      },
      /Corrupt or unreadable product image/i
    );
  });

  test('detects when a different PNG product image is substituted (different product inputs produce distinct outputs)', async () => {
    const rubyBottle = createSampleProductPngDataUrl({
      width: 64,
      height: 64,
      backgroundColor: [255, 255, 255],
      productColor: [200, 10, 30],
      labelColor: [255, 215, 0],
    });

    const cobaltBottle = createSampleProductPngDataUrl({
      width: 64,
      height: 64,
      backgroundColor: [255, 255, 255],
      productColor: [15, 45, 210],
      labelColor: [230, 230, 250],
    });

    const isoRuby = await isolateProductForeground(rubyBottle);
    const isoCobalt = await isolateProductForeground(cobaltBottle);

    const compRuby = compositeProductOnStudioScene({
      isolated: isoRuby,
      presetId: 'minimal-studio',
      aspectRatio: '1:1',
    });
    const compCobalt = compositeProductOnStudioScene({
      isolated: isoCobalt,
      presetId: 'minimal-studio',
      aspectRatio: '1:1',
    });

    assert.notEqual(compRuby.imageDataUrl, compCobalt.imageDataUrl);

    const crossCheck = verifyProductFidelity(isoRuby, compCobalt);
    assert.ok(
      crossCheck.fidelityScore < 0.5,
      `Expected cross-product fidelity check to fail (< 0.5), got ${crossCheck.fidelityScore}`
    );
    assert.equal(crossCheck.fidelityVerified, false);
  });

  test('FIDELITY 1 — Original product pixel preservation: verifies exact pixel match on decoded final delivered image', async () => {
    const pngDataUrl = loadFixtureAsDataUrl('product-ruby.png', 'image/png');
    const isolated = await isolateProductForeground(pngDataUrl);
    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'gulf_luxury_marble',
      aspectRatio: '1:1',
    });

    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      composited.imageDataUrl,
      composited.placement
    );

    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
    assert.equal(deliveredReport.exactPixelMatchRatio, 1);
    assert.equal(deliveredReport.preservedPixels, deliveredReport.sampledForegroundPixels);
    assert.ok(deliveredReport.sampledForegroundPixels > 400);
  });

  test('FIDELITY 2 — Logo and packaging preservation: preserves interior white brand logo and packaging typography without punching background holes', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inBottle = x >= 18 && x <= 46 && y >= 14 && y <= 54;
        const inWhiteLogo = x >= 24 && x <= 40 && y >= 26 && y <= 42;
        if (inWhiteLogo) {
          // Pure white brand logo crest inside the crimson bottle (identical RGB to the outer white background)
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        } else if (inBottle) {
          rgba[idx] = 155;
          rgba[idx + 1] = 22;
          rgba[idx + 2] = 44;
          rgba[idx + 3] = 255;
        } else {
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        }
      }
    }

    const logoProductDataUrl = encodeRgbaToPngDataUrl(width, height, rgba);
    const isolated = await isolateProductForeground(logoProductDataUrl);

    // Every pixel inside the interior white logo (x: 24..40, y: 26..42) MUST have maskAlpha === 255
    let logoTotal = 0;
    let logoPreservedInMask = 0;
    for (let y = 26; y <= 42; y++) {
      for (let x = 24; x <= 40; x++) {
        logoTotal++;
        if (isolated.maskAlpha[y * width + x] === 255) {
          logoPreservedInMask++;
        }
      }
    }
    assert.equal(
      logoPreservedInMask,
      logoTotal,
      `Expected 100% of interior white brand logo pixels (${logoTotal}) to be preserved in mask, got ${logoPreservedInMask}`
    );

    // Composite onto dark marble studio scene and verify final delivered image retains the white logo
    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'gulf_luxury_marble',
      aspectRatio: '1:1',
    });
    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      composited.imageDataUrl,
      composited.placement
    );
    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
    assert.equal(deliveredReport.exactPixelMatchRatio, 1);
  });

  test('FIDELITY 3 — White products on white backgrounds: isolates low-contrast white ceramic/matte skincare jar on pure white background', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inJar = x >= 18 && x <= 46 && y >= 16 && y <= 52;
        const isContourEdge =
          inJar && (x === 18 || x === 46 || y === 16 || y === 52);

        if (isContourEdge) {
          // Subtle studio contact contour on white jar (Euclidean distance ~36 from 255,255,255)
          rgba[idx] = 232;
          rgba[idx + 1] = 234;
          rgba[idx + 2] = 238;
          rgba[idx + 3] = 255;
        } else if (inJar) {
          // Soft ivory/white jar body (Euclidean distance ~17 from 255,255,255 — below old threshold 26!)
          rgba[idx] = 245;
          rgba[idx + 1] = 245;
          rgba[idx + 2] = 248;
          rgba[idx + 3] = 255;
        } else {
          // Pure white background
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        }
      }
    }

    const whiteOnWhiteUrl = encodeRgbaToPngDataUrl(width, height, rgba);
    const isolated = await isolateProductForeground(whiteOnWhiteUrl);

    assert.equal(isolated.boundingBox.x, 18);
    assert.equal(isolated.boundingBox.y, 16);
    assert.equal(isolated.boundingBox.width, 29);
    assert.equal(isolated.boundingBox.height, 37);
    assert.equal(
      isolated.boundingBox.foregroundPixels,
      29 * 37,
      'Must isolate the entire 29x37 white product silhouette without interior dropout'
    );

    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'gulf_luxury_marble',
      aspectRatio: '1:1',
    });
    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      composited.imageDataUrl,
      composited.placement
    );
    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
    assert.equal(deliveredReport.exactPixelMatchRatio, 1);
  });

  test('FIDELITY 4 — Transparent bottles and glass: preserves refractive glass walls and translucent glass interior chamber', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inBottle = x >= 20 && x <= 44 && y >= 14 && y <= 54;
        const isGlassWall =
          inBottle && (x <= 22 || x >= 42 || y <= 16 || y >= 52);
        const inAmberLiquid = inBottle && !isGlassWall && y >= 32;
        const inClearGlassChamber = inBottle && !isGlassWall && y < 32;

        if (isGlassWall) {
          // Refractive glass rim
          rgba[idx] = 206;
          rgba[idx + 1] = 218;
          rgba[idx + 2] = 228;
          rgba[idx + 3] = 255;
        } else if (inClearGlassChamber) {
          // Clear glass chamber showing nearly white background with slight refraction (~7 RGB units from 255)
          rgba[idx] = 250;
          rgba[idx + 1] = 252;
          rgba[idx + 2] = 254;
          rgba[idx + 3] = 255;
        } else if (inAmberLiquid) {
          // Golden perfume liquid inside glass
          rgba[idx] = 218;
          rgba[idx + 1] = 162;
          rgba[idx + 2] = 54;
          rgba[idx + 3] = 255;
        } else {
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        }
      }
    }

    const glassBottleUrl = encodeRgbaToPngDataUrl(width, height, rgba);
    const isolated = await isolateProductForeground(glassBottleUrl);

    // Clear glass upper chamber (x: 25..39, y: 20..28) must remain inside the foreground mask
    for (let y = 20; y <= 28; y++) {
      for (let x = 25; x <= 39; x++) {
        assert.equal(
          isolated.maskAlpha[y * width + x],
          255,
          `Transparent glass interior at (${x},${y}) must not be punched out as background`
        );
      }
    }

    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'desert_sunset_dunes',
      aspectRatio: '1:1',
    });
    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      composited.imageDataUrl,
      composited.placement
    );
    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
    assert.equal(deliveredReport.exactPixelMatchRatio, 1);
  });

  test('FIDELITY 5 — Reflective surfaces: preserves mirror-white specular highlights on chrome/metallic hardware', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inChromeBody = x >= 20 && x <= 44 && y >= 16 && y <= 52;
        const inMirrorSpecularStrip =
          inChromeBody && x >= 27 && x <= 31 && y >= 20 && y <= 48;

        if (inMirrorSpecularStrip) {
          // Mirror specular highlight with same brightness as studio white background
          rgba[idx] = 253;
          rgba[idx + 1] = 253;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        } else if (inChromeBody) {
          // Brushed chrome metal
          rgba[idx] = 128;
          rgba[idx + 1] = 134;
          rgba[idx + 2] = 142;
          rgba[idx + 3] = 255;
        } else {
          rgba[idx] = 252;
          rgba[idx + 1] = 252;
          rgba[idx + 2] = 252;
          rgba[idx + 3] = 255;
        }
      }
    }

    const reflectiveUrl = encodeRgbaToPngDataUrl(width, height, rgba);
    const isolated = await isolateProductForeground(reflectiveUrl);

    for (let y = 20; y <= 48; y++) {
      for (let x = 27; x <= 31; x++) {
        assert.equal(
          isolated.maskAlpha[y * width + x],
          255,
          `Mirror specular highlight at (${x},${y}) must be preserved in foreground mask`
        );
      }
    }

    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'gulf_luxury_marble',
      aspectRatio: '1:1',
    });
    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      composited.imageDataUrl,
      composited.placement
    );
    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
    assert.equal(deliveredReport.exactPixelMatchRatio, 1);
  });

  test('FIDELITY 6 — Product edges and fine details: preserves 2px atomizer nozzle and stepped contour edges', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8Array(width * height * 4);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const inFineNozzle = x >= 31 && x <= 32 && y >= 8 && y <= 13;
        const inSteppedCollar = x >= 27 && x <= 36 && y >= 14 && y <= 17;
        const inBody = x >= 20 && x <= 43 && y >= 18 && y <= 52;

        if (inFineNozzle || inSteppedCollar) {
          rgba[idx] = 185;
          rgba[idx + 1] = 152;
          rgba[idx + 2] = 65;
          rgba[idx + 3] = 255;
        } else if (inBody) {
          rgba[idx] = 45;
          rgba[idx + 1] = 28;
          rgba[idx + 2] = 68;
          rgba[idx + 3] = 255;
        } else {
          rgba[idx] = 255;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 255;
          rgba[idx + 3] = 255;
        }
      }
    }

    const fineEdgeUrl = encodeRgbaToPngDataUrl(width, height, rgba);
    const isolated = await isolateProductForeground(fineEdgeUrl);

    assert.equal(isolated.boundingBox.y, 8, 'Bounding box top must include the 2px atomizer nozzle at y=8');
    assert.equal(isolated.maskAlpha[9 * width + 31], 255);
    assert.equal(isolated.maskAlpha[9 * width + 32], 255);

    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'minimal-studio',
      aspectRatio: '1:1',
    });
    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      composited.imageDataUrl,
      composited.placement
    );
    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
  });

  test('FIDELITY 7 — Separate scene generation + foreground compositing: composites exact isolated product foreground onto an AI-generated scene', async () => {
    const pngDataUrl = loadFixtureAsDataUrl('product-ruby.png', 'image/png');
    const isolated = await isolateProductForeground(pngDataUrl);

    // Simulate a 180x180 scene generated by Gemini (e.g. warm golden sandstone backdrop)
    const sceneW = 180;
    const sceneH = 180;
    const sceneRgba = new Uint8Array(sceneW * sceneH * 4);
    for (let i = 0; i < sceneW * sceneH; i++) {
      sceneRgba[i * 4] = 35;
      sceneRgba[i * 4 + 1] = 28;
      sceneRgba[i * 4 + 2] = 24;
      sceneRgba[i * 4 + 3] = 255;
    }
    const sceneDataUrl = encodeRgbaToPngDataUrl(sceneW, sceneH, sceneRgba);

    const compositedScene = await compositeProductOnSceneImage({
      isolated,
      sceneImageDataUrl: sceneDataUrl,
      aspectRatio: '1:1',
    });

    const deliveredReport = await verifyDeliveredImageFidelity(
      isolated,
      compositedScene.imageDataUrl,
      compositedScene.placement
    );
    assert.equal(deliveredReport.fidelityVerified, true);
    assert.equal(deliveredReport.fidelityScore, 1);
    assert.equal(deliveredReport.exactPixelMatchRatio, 1);
  });
});
