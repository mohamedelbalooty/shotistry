import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSampleProductPngDataUrl,
  decodePngDataUrl,
  isolateProductForeground,
  compositeProductOnStudioScene,
  verifyProductFidelity,
} from '../src/lib/ai/image-processor.ts';

describe('Product Image Isolation, Masking & Studio Compositing Pipeline', () => {
  test('decodes a customer PNG product photo and extracts a binary foreground mask & bounding box', () => {
    // Create a 64x64 studio test image: white background with a crimson perfume bottle in center
    const rawProductDataUrl = createSampleProductPngDataUrl({
      width: 64,
      height: 64,
      backgroundColor: [250, 250, 250],
      productColor: [180, 25, 45],
      labelColor: [240, 200, 80],
    });

    const decoded = decodePngDataUrl(rawProductDataUrl);
    assert.equal(decoded.width, 64);
    assert.equal(decoded.height, 64);

    const isolated = isolateProductForeground(rawProductDataUrl);
    assert.ok(isolated.maskDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(isolated.isolatedProductDataUrl.startsWith('data:image/png;base64,'));
    assert.ok(isolated.boundingBox.width > 10);
    assert.ok(isolated.boundingBox.height > 15);
    assert.ok(isolated.boundingBox.foregroundRatio > 0.08);
    assert.ok(isolated.boundingBox.foregroundRatio < 0.85);
  });

  test('composites the actual customer product pixels onto a studio scene and verifies pixel fidelity', () => {
    const rawProductDataUrl = createSampleProductPngDataUrl({
      width: 80,
      height: 80,
      backgroundColor: [255, 255, 255],
      productColor: [20, 95, 70], // Emerald bottle
      labelColor: [212, 175, 55], // Gold label
    });

    const isolated = isolateProductForeground(rawProductDataUrl);
    const composited = compositeProductOnStudioScene({
      isolated,
      presetId: 'ramadan-luxury',
      aspectRatio: '1:1',
    });

    assert.ok(composited.imageDataUrl.startsWith('data:image/png;base64,'));
    assert.equal(composited.resolution, '1024x1024');

    const fidelity = verifyProductFidelity(isolated, composited);
    assert.ok(
      fidelity.fidelityScore >= 0.95,
      `Expected high foreground pixel preservation >= 0.95, got ${fidelity.fidelityScore}`
    );
    assert.equal(fidelity.fidelityVerified, true);
    assert.ok(fidelity.preservedPixels > 100);
  });

  test('detects when a different product image is substituted (different product inputs produce distinct outputs)', () => {
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

    const isoRuby = isolateProductForeground(rubyBottle);
    const isoCobalt = isolateProductForeground(cobaltBottle);

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

    // Output images must genuinely differ because the customer product pixels participate
    assert.notEqual(compRuby.imageDataUrl, compCobalt.imageDataUrl);

    // Cross-checking Ruby product foreground against Cobalt composite must fail fidelity verification!
    const crossCheck = verifyProductFidelity(isoRuby, compCobalt);
    assert.ok(
      crossCheck.fidelityScore < 0.5,
      `Expected cross-product fidelity check to fail (< 0.5), got ${crossCheck.fidelityScore}`
    );
    assert.equal(crossCheck.fidelityVerified, false);
  });
});
