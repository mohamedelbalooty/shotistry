import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiClient } from '../src/lib/ai/gemini-client.ts';
import { createSampleProductPngDataUrl } from '../src/lib/ai/image-processor.ts';

describe('GeminiClient Engine', () => {
  const sampleProductImage = createSampleProductPngDataUrl({
    width: 64,
    height: 64,
    backgroundColor: [255, 255, 255],
    productColor: [140, 30, 60],
    labelColor: [240, 210, 90],
  });

  test('rejects generation when referenceImageBase64 is missing (enforces real product transformation)', async () => {
    const client = new GeminiClient('');
    await assert.rejects(
      async () => {
        await client.generateProductPhoto('job-missing-img', {
          prompt: 'Luxury skincare jar on marble',
          negativePrompt: 'blurry',
          aspectRatio: '1:1',
          model: 'gemini-nano-banana-2.1',
        });
      },
      /Product reference image \(referenceImageBase64\) is required/
    );
  });

  test('transforms the actual uploaded product photo in local sandbox mode and never falsely claims SynthID', async () => {
    const client = new GeminiClient('');
    const result = await client.generateProductPhoto('job-sandbox-1', {
      prompt: 'Luxury skincare jar on marble, studio lighting',
      negativePrompt: 'blurry, deformed',
      aspectRatio: '1:1',
      model: 'gemini-nano-banana-2.1',
      presetId: 'marble-elegance',
      referenceImageBase64: sampleProductImage,
    });

    assert.equal(result.jobId, 'job-sandbox-1');
    assert.equal(result.aspectRatio, '1:1');
    assert.equal(result.resolution, '1024x1024');
    assert.equal(result.modelUsed, 'gemini-nano-banana-2.1');
    assert.equal(result.executionMode, 'LOCAL_COMPOSITE_SANDBOX');
    assert.equal(result.synthIdDetected, false, 'Sandbox mode must NEVER claim SynthID provenance');
    assert.equal(result.fidelityVerified, true);
    assert.ok(result.fidelityScore >= 0.95);
    assert.ok(result.imageUrl.startsWith('data:image/png;base64,'));
    assert.ok(result.maskImageUrl?.startsWith('data:image/png;base64,'));
    assert.ok(result.isolatedProductUrl?.startsWith('data:image/png;base64,'));
  });

  test('maps aspect ratios accurately including 4:5 (1080x1350), 9:16 (1080x1920), and 16:9 (1920x1080)', async () => {
    const client = new GeminiClient('');

    const res45 = await client.generateProductPhoto('job-45', {
      prompt: 'Oud bottle',
      negativePrompt: 'blurry',
      aspectRatio: '4:5',
      model: 'gemini-nano-banana-2.1',
      referenceImageBase64: sampleProductImage,
    });
    assert.equal(res45.resolution, '1080x1350');

    const res916 = await client.generateProductPhoto('job-916', {
      prompt: 'Oud bottle',
      negativePrompt: 'blurry',
      aspectRatio: '9:16',
      model: 'gemini-nano-banana-2.1',
      referenceImageBase64: sampleProductImage,
    });
    assert.equal(res916.resolution, '1080x1920');

    const res169 = await client.generateProductPhoto('job-169', {
      prompt: 'Oud bottle',
      negativePrompt: 'blurry',
      aspectRatio: '16:9',
      model: 'gemini-nano-banana-2.1',
      referenceImageBase64: sampleProductImage,
    });
    assert.equal(res169.resolution, '1920x1080');
  });
});
