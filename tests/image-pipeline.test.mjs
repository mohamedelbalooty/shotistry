import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  createSampleProductPngDataUrl,
  decodeProductImage,
  isolateProductForeground,
  compositeProductOnStudioScene,
  verifyProductFidelity,
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
});
