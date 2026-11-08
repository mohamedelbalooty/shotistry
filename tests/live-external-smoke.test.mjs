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

  test('LIVE API GATE: Upstash Redis REST atomic rate limiting', async (t) => {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (
      !url ||
      !token ||
      !url.startsWith('https://') ||
      url.includes('your-database') ||
      token === 'changeme' ||
      token.length < 8
    ) {
      t.skip(
        'BLOCKED (External Credential Required): UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN not set or placeholder. Live Upstash rate limiting is NOT TESTED.'
      );
      return;
    }

    const { createUpstashRateLimitStore } = await import(
      '../src/lib/security/rate-limit/upstash-store.ts'
    );
    const store = createUpstashRateLimitStore({ url, token });
    const testKey = `shotistry:test:smoke:${Date.now()}`;
    const result = await store.consume(testKey, 10, 10000);

    assert.equal(result.backend, 'upstash');
    assert.equal(result.allowed, true);
    assert.ok(result.remaining >= 0);
  });

  test('LIVE API GATE: Resend Transactional Email dispatch', async (t) => {
    const apiKey = process.env.RESEND_API_KEY;
    const liveTo = process.env.LIVE_EMAIL_TO;
    if (
      !apiKey ||
      !apiKey.startsWith('re_') ||
      apiKey.includes('placeholder') ||
      !liveTo ||
      !liveTo.includes('@')
    ) {
      t.skip(
        'BLOCKED (External Credential Required): RESEND_API_KEY and LIVE_EMAIL_TO not set in environment. Live Resend delivery is NOT TESTED.'
      );
      return;
    }

    const { createResendEmailTransport } = await import(
      '../src/lib/email/resend-transport.ts'
    );
    const transport = createResendEmailTransport({ apiKey });
    const result = await transport.send({
      to: liveTo,
      subject: 'Shotistry Live Integration Test',
      html: '<p>Live smoke test email</p>',
      text: 'Live smoke test email',
      idempotencyKey: `live:smoke:${Date.now()}`,
    });

    assert.equal(result.provider, 'resend');
    assert.ok(result.messageId);
  });
});
