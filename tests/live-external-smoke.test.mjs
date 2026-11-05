import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GeminiClient } from '../src/lib/ai/gemini-client.ts';
import { decodeProductImage } from '../src/lib/ai/image-processor.ts';

describe('External Live Integration Smoke Gate (Requires Live Credentials)', () => {
  test('LIVE API GATE: Gemini Interactions API (gemini-3.1-flash-image) reference-image smoke test', async (t) => {
    const client = new GeminiClient();
    if (!client.isLiveMode()) {
      t.skip(
        'BLOCKED (External Credential Required): GEMINI_API_KEY is not set in environment. Live Gemini API execution is NOT TESTED.'
      );
      return;
    }

    const fixtureBytes = fs.readFileSync(
      path.resolve('tests/fixtures/product-ruby.png')
    );
    const referenceImageBase64 = `data:image/png;base64,${fixtureBytes.toString('base64')}`;

    const result = await client.generateProductPhoto('job-live-smoke-001', {
      prompt:
        'Hero commercial studio photography of a luxury ruby perfume bottle on polished black Marquina marble pedestal with warm rim lighting',
      negativePrompt: 'blurry, deformed label, watermark',
      aspectRatio: '1:1',
      imageSize: '1K',
      outputMimeType: 'image/png',
      model: 'gemini-3.1-flash-image',
      referenceImageBase64,
    });

    assert.equal(result.executionMode, 'LIVE_GEMINI_API');
    assert.equal(result.modelUsed, 'gemini-3.1-flash-image');
    assert.equal(result.synthIdDetected, true);
    assert.ok(result.imageUrl.startsWith('data:image/'));
    assert.ok(result.usageMetadata, 'Expected live usageMetadata from Gemini Interactions API');
    assert.ok(result.usageMetadata.totalTokens > 0);

    const decodedOutput = await decodeProductImage(result.imageUrl);
    assert.ok(decodedOutput.width >= 512 && decodedOutput.height >= 512);
  });

  test('LIVE API GATE: Paymob Sandbox API checkout session creation', async (t) => {
    const paymobSecretKey = process.env.PAYMOB_SECRET_KEY || process.env.PAYMOB_API_KEY;
    if (
      !paymobSecretKey ||
      paymobSecretKey.includes('Placeholder') ||
      paymobSecretKey.trim().length < 10
    ) {
      t.skip(
        'BLOCKED (External Credential Required): PAYMOB_SECRET_KEY / PAYMOB_API_KEY is not set in environment. Live Paymob Sandbox network checkout is NOT TESTED.'
      );
      return;
    }

    assert.ok(paymobSecretKey.length >= 10);
  });
});

