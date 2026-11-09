/**
 * Gemini Model Probe Script (Phase 10 Milestone M4)
 * Probes official Google Gemini Image generation models:
 * - gemini-3.1-flash-lite-image
 * - gemini-3.1-flash-image
 * - gemini-3-pro-image
 * across supported resolutions and aspect ratios.
 *
 * NOTE: The founder's authorized budget for external billing is currently $0.
 * If GEMINI_API_KEY is not configured or contains placeholder text,
 * the probe terminates safely with status [BLOCKED] and consumes $0.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GeminiClient } from '../src/lib/ai/gemini-client.ts';

const apiKey = process.env.GEMINI_API_KEY?.trim();

if (!apiKey || apiKey.includes('placeholder') || apiKey.includes('your_gemini_api_key')) {
  console.log('======================================================');
  console.log('[BLOCKED] Gemini Model Capability Probe (M4)');
  console.log('Status: BLOCKED — GEMINI_API_KEY is not configured.');
  console.log('Founder directive: Initial authorized spending budget is $0.');
  console.log('No billable generation requests were dispatched.');
  console.log('======================================================');
  process.exit(0);
}

async function runProbe() {
  console.log('Starting Gemini Model Capability Probe with live key...');
  const fixturePath = path.resolve('tests/fixtures/product-ruby.png');
  const imageBytes = fs.readFileSync(fixturePath);
  const sampleBase64 = `data:image/png;base64,${imageBytes.toString('base64')}`;

  const client = new GeminiClient(apiKey);
  const models = [
    'gemini-3.1-flash-lite-image',
    'gemini-3.1-flash-image',
    'gemini-3-pro-image',
  ];

  for (const model of models) {
    console.log(`Probing model: ${model}...`);
    try {
      const start = Date.now();
      const res = await client.generateProductPhoto(`probe-${model}`, {
        prompt: 'Commercial perfume bottle on reflective marble pedestal, cinematic lighting',
        negativePrompt: 'blurry, distorted',
        aspectRatio: '1:1',
        model,
        referenceImageBase64: sampleBase64,
      });
      const durationMs = Date.now() - start;
      console.log(`[PASS] ${model} — Latency: ${durationMs}ms, Resolution: ${res.resolution}`);
    } catch (err) {
      console.error(`[FAIL] ${model} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

runProbe().catch((err) => {
  console.error('Fatal probe error:', err);
  process.exit(1);
});

