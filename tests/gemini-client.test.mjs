import { describe, it } from 'node:test';
import assert from 'node:assert';
import { GeminiClient } from '../src/lib/ai/gemini-client.ts';

describe('Google Gemini & Imagen Client Tests', () => {
  it('should initialize client cleanly in simulation/fallback mode when live API key is unset', () => {
    const client = new GeminiClient();
    assert.ok(client);
  });

  it('should successfully generate a commercial photoshoot in sandbox simulation mode', async () => {
    const client = new GeminiClient();
    const result = await client.generateProductPhoto('job_test_001', {
      prompt: 'High-end commercial photo of luxury watch on slate stone pedestal',
      aspectRatio: '1:1',
      model: 'imagen-3.0-generate-002'
    });

    assert.strictEqual(result.jobId, 'job_test_001');
    assert.strictEqual(result.aspectRatio, '1:1');
    assert.strictEqual(result.resolution, '1024x1024');
    assert.ok(result.imageUrl.startsWith('https://'));
    assert.strictEqual(result.synthIdDetected, true);
    assert.ok(result.modelUsed.includes('imagen-3.0-generate-002'));
    assert.ok(result.completedAt);
  });

  it('should route to 9:16 vertical resolution for Instagram Story / TikTok preset', async () => {
    const client = new GeminiClient();
    const result = await client.generateProductPhoto('job_test_story', {
      prompt: 'Perfume bottle in desert dunes vertical story advertisement',
      aspectRatio: '9:16'
    });

    assert.strictEqual(result.aspectRatio, '9:16');
    assert.strictEqual(result.resolution, '1080x1350');
    assert.ok(result.imageUrl);
  });
});

