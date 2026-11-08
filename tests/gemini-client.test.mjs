import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { GeminiClient } from '../src/lib/ai/gemini-client.ts';
import {
  createSampleProductPngDataUrl,
  isolateProductForeground,
  verifyDeliveredImageFidelity,
} from '../src/lib/ai/image-processor.ts';

describe('GeminiClient Engine & Official Interactions API Contract Tests', () => {
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
          model: 'gemini-3.1-flash-image',
        });
      },
      /Product reference image \(referenceImageBase64\) is required/
    );
  });

  test('transforms the actual uploaded product photo in local sandbox mode using official model IDs and never falsely claims SynthID', async () => {
    const client = new GeminiClient('');
    const result = await client.generateProductPhoto('job-sandbox-1', {
      prompt: 'Luxury skincare jar on marble, studio lighting',
      negativePrompt: 'blurry, deformed',
      aspectRatio: '1:1',
      model: 'gemini-nano-banana-2.1', // alias must normalize to gemini-3.1-flash-image
      presetId: 'marble-elegance',
      referenceImageBase64: sampleProductImage,
    });

    assert.equal(result.jobId, 'job-sandbox-1');
    assert.equal(result.aspectRatio, '1:1');
    assert.equal(result.resolution, '1024x1024');
    assert.equal(result.modelUsed, 'gemini-3.1-flash-image');
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
      model: 'gemini-3.1-flash-image',
      referenceImageBase64: sampleProductImage,
    });
    assert.equal(res45.resolution, '1080x1350');

    const res916 = await client.generateProductPhoto('job-916', {
      prompt: 'Oud bottle',
      negativePrompt: 'blurry',
      aspectRatio: '9:16',
      model: 'gemini-3.1-flash-image',
      referenceImageBase64: sampleProductImage,
    });
    assert.equal(res916.resolution, '1080x1920');

    const res169 = await client.generateProductPhoto('job-169', {
      prompt: 'Oud bottle',
      negativePrompt: 'blurry',
      aspectRatio: '16:9',
      model: 'gemini-3.1-flash-image',
      referenceImageBase64: sampleProductImage,
    });
    assert.equal(res169.resolution, '1920x1080');
  });

  test('CONTRACT: sends official Interactions API request schema (response_format, input blocks, official model ID) and extracts interaction.output_image.data', async () => {
    let capturedRequest = null;
    const rawOutputBase64 = sampleProductImage.replace(/^data:image\/png;base64,/, '');

    const mockInteractionsClient = {
      interactions: {
        create: async (req) => {
          capturedRequest = req;
          return {
            id: 'inter_contract_flash_001',
            model: req.model,
            status: 'completed',
            output_image: {
              type: 'image',
              mime_type: 'image/png',
              data: rawOutputBase64,
            },
            usage: {
              total_input_tokens: 580,
              total_output_tokens: 1680,
              total_thought_tokens: 140,
              total_tokens: 2400,
            },
          };
        },
      },
    };

    const client = new GeminiClient('AIzaSyContractTestKey999999', mockInteractionsClient);
    assert.equal(client.isLiveMode(), true);

    const result = await client.generateProductPhoto('job-contract-1', {
      prompt: 'Royal Oud bottle on black marble pedestal',
      negativePrompt: 'warped label, extra bottle',
      aspectRatio: '4:5',
      imageSize: '2K',
      outputMimeType: 'image/png',
      model: 'gemini-nano-banana-2.1', // Should be normalized to gemini-3.1-flash-image before API request
      referenceImageBase64: sampleProductImage,
    });

    assert.ok(capturedRequest, 'Expected interactions.create to be called');
    assert.equal(
      capturedRequest.model,
      'gemini-3.1-flash-image',
      'Must never send unsupported alias gemini-nano-banana-2.1 in API request'
    );
    assert.equal(
      capturedRequest.response_modalities,
      undefined,
      'Deprecated response_modalities field must not be sent'
    );
    assert.deepEqual(capturedRequest.response_format, {
      type: 'image',
      mime_type: 'image/png',
      aspect_ratio: '4:5',
      image_size: '2K',
    });

    assert.ok(Array.isArray(capturedRequest.input));
    assert.equal(capturedRequest.input.length, 3);
    assert.equal(capturedRequest.input[0].type, 'text');
    assert.ok(capturedRequest.input[0].text.includes('Royal Oud bottle on black marble pedestal'));
    assert.equal(capturedRequest.input[1].type, 'image');
    assert.equal(capturedRequest.input[1].mime_type, 'image/png');
    assert.ok(capturedRequest.input[1].data.length > 64);
    assert.equal(capturedRequest.input[2].type, 'image');
    assert.equal(capturedRequest.input[2].mime_type, 'image/png');
    assert.ok(capturedRequest.input[2].data.length > 64);

    assert.equal(result.modelUsed, 'gemini-3.1-flash-image');
    assert.equal(result.executionMode, 'LIVE_GEMINI_API');
    assert.equal(result.imageUrl, `data:image/png;base64,${rawOutputBase64}`);
    assert.equal(result.interactionId, 'inter_contract_flash_001');
    assert.deepEqual(result.usageMetadata, {
      inputTokens: 580,
      outputTokens: 1680,
      thoughtTokens: 140,
      totalTokens: 2400,
    });
  });

  test('CONTRACT: clamps gemini-3.1-flash-lite-image to 1K uppercase and supports steps[].content[] model_output fallback extraction', async () => {
    let capturedRequest = null;
    const rawOutputBase64 = sampleProductImage.replace(/^data:image\/png;base64,/, '');

    const mockInteractionsClient = {
      interactions: {
        create: async (req) => {
          capturedRequest = req;
          return {
            id: 'inter_contract_lite_002',
            model: req.model,
            status: 'completed',
            steps: [
              {
                type: 'thought',
                summary: [{ type: 'text', text: 'Composing product lighting...' }],
              },
              {
                type: 'model_output',
                content: [
                  { type: 'text', text: 'Studio shot generated.' },
                  {
                    type: 'image',
                    mime_type: 'image/jpeg',
                    data: rawOutputBase64,
                  },
                ],
              },
            ],
            usage: {
              total_input_tokens: 410,
              total_output_tokens: 1120,
              total_tokens: 1530,
            },
          };
        },
      },
    };

    const client = new GeminiClient('AIzaSyContractTestKey999999', mockInteractionsClient);
    const result = await client.generateProductPhoto('job-contract-lite', {
      prompt: 'Perfume bottle preview',
      negativePrompt: 'blurry',
      aspectRatio: '16:9',
      imageSize: '4k', // Should be normalized to uppercase and clamped to 1K for flash-lite-image
      outputMimeType: 'image/jpeg',
      model: 'gemini-3.1-flash-lite-image',
      referenceImageBase64: sampleProductImage,
    });

    assert.equal(capturedRequest.model, 'gemini-3.1-flash-lite-image');
    assert.deepEqual(capturedRequest.response_format, {
      type: 'image',
      mime_type: 'image/jpeg',
      aspect_ratio: '16:9',
      image_size: '1K',
    });
    assert.equal(result.imageUrl, `data:image/jpeg;base64,${rawOutputBase64}`);
    assert.equal(result.modelUsed, 'gemini-3.1-flash-lite-image');
    assert.equal(result.usageMetadata?.totalTokens, 1530);
  });

  test('CONTRACT: surfaces descriptive error when Interactions API returns failed status or empty image output', async () => {
    const failingClient = new GeminiClient('AIzaSyContractTestKey999999', {
      interactions: {
        create: async () => ({
          id: 'inter_failed_003',
          status: 'failed',
          errors: [{ code: 'SAFETY_BLOCKED', message: 'Image generation blocked by policy' }],
        }),
      },
    });

    await assert.rejects(
      async () => {
        await failingClient.generateProductPhoto('job-contract-fail', {
          prompt: 'Test prompt',
          negativePrompt: 'blurry',
          aspectRatio: '1:1',
          model: 'gemini-3-pro-image',
          referenceImageBase64: sampleProductImage,
        });
      },
      /Image generation blocked by policy/
    );

    const emptyOutputClient = new GeminiClient('AIzaSyContractTestKey999999', {
      interactions: {
        create: async () => ({
          id: 'inter_empty_004',
          status: 'completed',
          steps: [],
        }),
      },
    });

    await assert.rejects(
      async () => {
        await emptyOutputClient.generateProductPhoto('job-contract-empty', {
          prompt: 'Test prompt',
          negativePrompt: 'blurry',
          aspectRatio: '1:1',
          model: 'gemini-3-pro-image',
          referenceImageBase64: sampleProductImage,
        });
      },
      /Gemini Interactions API returned no image output/
    );
  });

  test('FIDELITY INVARIANT: displayed fidelityScore measures the actual final image delivered to the customer, never an intermediate local composite', async () => {
    const rubyProduct = createSampleProductPngDataUrl({
      width: 64,
      height: 64,
      backgroundColor: [255, 255, 255],
      productColor: [185, 20, 40],
      labelColor: [245, 210, 90],
    });
    const alteredBlueOutput = createSampleProductPngDataUrl({
      width: 180,
      height: 180,
      backgroundColor: [30, 30, 35],
      productColor: [15, 55, 215],
      labelColor: [180, 220, 255],
    });
    const alteredBase64 = alteredBlueOutput.replace(/^data:image\/png;base64,/, '');

    const mockInteractionsClient = {
      interactions: {
        create: async (req) => ({
          id: 'inter_fidelity_raw_005',
          model: req.model,
          status: 'completed',
          output_image: {
            type: 'image',
            mime_type: 'image/png',
            data: alteredBase64,
          },
        }),
      },
    };

    const client = new GeminiClient('AIzaSyContractTestKey999999', mockInteractionsClient);
    const result = await client.generateProductPhoto('job-fidelity-raw', {
      prompt: 'Ruby perfume bottle on dark marble',
      negativePrompt: 'warped label',
      aspectRatio: '1:1',
      model: 'gemini-3.1-flash-image',
      referenceImageBase64: rubyProduct,
      lockProductForeground: false,
    });

    assert.equal(result.executionMode, 'LIVE_GEMINI_API');
    assert.equal(result.imageUrl, alteredBlueOutput);
    assert.ok(
      result.fidelityScore < 0.5,
      `Expected fidelityScore on altered live output to be < 0.5 (measured on actual delivered image), got ${result.fidelityScore}`
    );
    assert.equal(
      result.fidelityVerified,
      false,
      'Must not claim fidelityVerified=true when the delivered Gemini image altered the product pixels'
    );
  });

  test('FIDELITY INVARIANT: lockProductForeground composites exact isolated product foreground onto the Gemini-generated scene and proves fidelity on the delivered asset', async () => {
    const rubyProduct = createSampleProductPngDataUrl({
      width: 64,
      height: 64,
      backgroundColor: [255, 255, 255],
      productColor: [185, 20, 40],
      labelColor: [245, 210, 90],
    });
    const geminiGeneratedScene = createSampleProductPngDataUrl({
      width: 180,
      height: 180,
      backgroundColor: [28, 24, 22],
      productColor: [20, 60, 200],
      labelColor: [200, 200, 220],
    });
    const sceneBase64 = geminiGeneratedScene.replace(/^data:image\/png;base64,/, '');

    const mockInteractionsClient = {
      interactions: {
        create: async (req) => ({
          id: 'inter_fidelity_locked_006',
          model: req.model,
          status: 'completed',
          output_image: {
            type: 'image',
            mime_type: 'image/png',
            data: sceneBase64,
          },
        }),
      },
    };

    const client = new GeminiClient('AIzaSyContractTestKey999999', mockInteractionsClient);
    const result = await client.generateProductPhoto('job-fidelity-locked', {
      prompt: 'Ruby perfume bottle on dark marble',
      negativePrompt: 'warped label',
      aspectRatio: '1:1',
      model: 'gemini-3.1-flash-image',
      referenceImageBase64: rubyProduct,
      lockProductForeground: true,
    });

    assert.equal(result.executionMode, 'LIVE_GEMINI_API');
    assert.equal(result.fidelityVerified, true);
    assert.equal(result.fidelityScore, 1);

    // Independently decode the actual delivered result.imageUrl and prove pixel preservation
    const isolated = await isolateProductForeground(rubyProduct);
    const independentCheck = await verifyDeliveredImageFidelity(isolated, result.imageUrl);
    assert.equal(independentCheck.fidelityVerified, true);
    assert.equal(independentCheck.fidelityScore, 1);
    assert.equal(independentCheck.exactPixelMatchRatio, 1);
  });
});
