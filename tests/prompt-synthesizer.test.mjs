import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  PromptSynthesizer,
  DEFAULT_GEMINI_IMAGE_MODEL,
  SUPPORTED_GEMINI_IMAGE_MODELS,
  normalizeGeminiImageModel,
} from '../src/lib/ai/prompt-synthesizer.ts';
import { REGIONAL_PHOTOSHOOT_PRESETS, getPresetById } from '../src/lib/ai/presets.ts';

describe('Commercial Prompt Synthesizer Tests', () => {
  it('should have 5 validated regional presets', () => {
    assert.strictEqual(REGIONAL_PHOTOSHOOT_PRESETS.length, 5);
    const gulfLuxury = getPresetById('gulf_luxury_marble');
    assert.strictEqual(gulfLuxury.id, 'gulf_luxury_marble');
    assert.strictEqual(gulfLuxury.isRegional, true);
    assert.ok(gulfLuxury.nameAr.includes('الفخامة الخليجية'));
  });

  it('should synthesize full 10-component prompt for Gulf Luxury Perfume Shoot with official default model gemini-3.1-flash-image', () => {
    const result = PromptSynthesizer.synthesize({
      productTitle: 'Royal Oud Parfum',
      productCategory: 'Fragrances',
      presetId: 'gulf_luxury_marble',
      aspectRatio: '1:1',
      brandName: 'Al-Majed',
      brandAesthetic: 'Luxury Heritage',
    });

    assert.ok(result.fullPrompt.includes('Hero commercial studio photography of Royal Oud Parfum'));
    assert.ok(result.fullPrompt.includes('Al-Majed'));
    assert.ok(result.fullPrompt.includes('Marquina black marble'));
    assert.ok(result.fullPrompt.includes('Lighting:'));
    assert.ok(result.fullPrompt.includes('Optics & Framing:'));
    assert.ok(result.fullPrompt.includes('Physics & Grounding:'));
    assert.ok(result.fullPrompt.includes('Preserve 100% original product geometry'));
    assert.strictEqual(result.aspectRatio, '1:1');
    assert.strictEqual(result.targetModel, 'gemini-3.1-flash-image');
    assert.strictEqual(DEFAULT_GEMINI_IMAGE_MODEL, 'gemini-3.1-flash-image');
    assert.deepStrictEqual(SUPPORTED_GEMINI_IMAGE_MODELS, [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
    ]);
  });

  it('should normalize marketing aliases (gemini-nano-banana-2.1), shut-down Imagen 3/4, and deprecated Flash Image IDs to gemini-3.1-flash-image', () => {
    assert.strictEqual(
      normalizeGeminiImageModel('gemini-nano-banana-2.1'),
      'gemini-3.1-flash-image'
    );
    assert.strictEqual(
      normalizeGeminiImageModel('imagen-3.0-generate-002'),
      'gemini-3.1-flash-image'
    );
    assert.strictEqual(
      normalizeGeminiImageModel('imagen-4.0-generate-001'),
      'gemini-3.1-flash-image'
    );
    assert.strictEqual(
      normalizeGeminiImageModel('gemini-2.5-flash-image'),
      'gemini-3.1-flash-image'
    );
    assert.strictEqual(
      normalizeGeminiImageModel('gemini-3.1-flash-image'),
      'gemini-3.1-flash-image'
    );
    assert.strictEqual(
      normalizeGeminiImageModel('gemini-3-pro-image'),
      'gemini-3-pro-image'
    );
    assert.strictEqual(
      normalizeGeminiImageModel('gemini-3.1-flash-lite-image'),
      'gemini-3.1-flash-lite-image'
    );
  });

  it('should generate robust negative prompts preventing distortion and watermarks', () => {
    const result = PromptSynthesizer.synthesize({
      productTitle: 'Leather Handbag',
      productCategory: 'Apparel',
      presetId: 'minimalist_concrete_studio',
      aspectRatio: '4:5',
    });

    assert.ok(result.negativePrompt.includes('no warped product geometry'));
    assert.ok(result.negativePrompt.includes('blurry'));
    assert.ok(result.negativePrompt.includes('watermark'));
    assert.ok(result.negativePrompt.includes('CGI rendering look'));
  });

  it('should append custom creative directives without breaking core schema', () => {
    const result = PromptSynthesizer.synthesize({
      productTitle: 'Hydrating Face Serum',
      productCategory: 'Cosmetics',
      presetId: 'botanical_spa_splash',
      aspectRatio: '9:16',
      customDirectives: 'warm golden sunbeam coming from top-left',
    });

    assert.ok(
      result.fullPrompt.includes(
        'Additional creative styling: warm golden sunbeam coming from top-left.'
      )
    );
    assert.strictEqual(result.aspectRatio, '9:16');
  });

  it('should fallback gracefully to default preset if an unknown presetId is provided', () => {
    const result = PromptSynthesizer.synthesize({
      productTitle: 'Sneakers',
      productCategory: 'Footwear',
      presetId: 'non_existent_preset_id',
      aspectRatio: '1:1',
    });

    assert.ok(result.fullPrompt.length > 50);
    assert.ok(result.fullPrompt.includes('Hero commercial studio photography of Sneakers'));
  });
});
