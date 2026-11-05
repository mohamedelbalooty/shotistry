import type {
  AspectRatio,
  PromptComponentSchema,
  GeminiImageModelId,
} from '../types/index.ts';
import { getPresetById } from './presets.ts';

export const DEFAULT_GEMINI_IMAGE_MODEL: GeminiImageModelId = 'gemini-nano-banana-2.1';

export const SUPPORTED_GEMINI_IMAGE_MODELS: readonly GeminiImageModelId[] = [
  'gemini-nano-banana-2.1',
  'gemini-3-pro-image',
  'gemini-3.1-flash-lite-image',
] as const;

/**
 * Normalizes any model identifier (including shut-down Imagen 3/4 or deprecated
 * Gemini 2.5 Flash Image IDs) to an active, supported Gemini Nano Banana model.
 */
export function normalizeGeminiImageModel(model?: string): GeminiImageModelId {
  if (model === 'gemini-3-pro-image') return 'gemini-3-pro-image';
  if (model === 'gemini-3.1-flash-lite-image') return 'gemini-3.1-flash-lite-image';
  return DEFAULT_GEMINI_IMAGE_MODEL;
}

export interface PromptSynthesisOptions {
  productTitle: string;
  productCategory?: string;
  presetId: string;
  aspectRatio: AspectRatio;
  brandName?: string;
  brandAesthetic?: string;
  customDirectives?: string;
  targetModel?: string;
}

export interface SynthesizedPromptResult {
  fullPrompt: string;
  synthesizedPrompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  components: PromptComponentSchema;
  targetModel: GeminiImageModelId;
  modelTarget: GeminiImageModelId;
}

/**
 * Shotistry Commercial Prompt Synthesizer.
 * Enforces the 10-component structural schema to produce ultra-realistic
 * commercial advertising visuals while preserving 100% of the customer's product foreground.
 */
export class PromptSynthesizer {
  static synthesize(options: PromptSynthesisOptions): SynthesizedPromptResult {
    const cleanTitle = options.productTitle?.trim();
    if (!cleanTitle) {
      throw new Error('Product title cannot be empty');
    }

    const category = options.productCategory?.trim() || 'Commercial Product';
    const preset = getPresetById(options.presetId);
    const schema = preset.baseSchema;

    const brandContext = options.brandName
      ? `of the ${options.brandName} brand`
      : '';

    const aestheticContext = options.brandAesthetic
      ? `embodying a ${options.brandAesthetic} visual identity,`
      : '';

    const subject = `Hero commercial studio photography of ${cleanTitle} (${category}) ${brandContext}, ${aestheticContext} standing center-stage as the pristine, razor-sharp focal subject`;

    const surface =
      schema.surface ?? 'polished natural stone pedestal with subtle ground reflections';
    const backdrop =
      schema.backdrop ??
      'clean architectural studio background with soft natural ambient depth';
    const lighting =
      schema.lighting ??
      'dual softbox studio key lighting, rim light accentuating product silhouette, soft contact shadow';
    const cameraLens =
      schema.cameraLens ?? '85mm commercial prime lens, eye-level heroic perspective';
    const depthOfField =
      schema.depthOfField ??
      'crisp f/5.6 aperture, sharp product details and label clarity, soft background bokeh';
    const colorGrading =
      schema.colorGrading ??
      'balanced professional commercial color temperature, vibrant true-to-life tones';
    const props =
      schema.props ?? 'minimalist elegant props complementing the product';
    const physicalCoherence =
      schema.physicalCoherence ??
      'natural contact ambient occlusion shadow, accurate ground reflections, zero floating artifacts';

    const customAdditions = options.customDirectives
      ? `Additional creative styling: ${options.customDirectives}.`
      : '';

    const components: PromptComponentSchema = {
      subject,
      surface,
      backdrop,
      lighting,
      cameraLens,
      depthOfField,
      colorGrading,
      props,
      physicalCoherence,
      negativeDirectives:
        schema.negativeDirectives ??
        'no warped product geometry, no blurry labels, no fake text, no low resolution',
    };

    const fullPrompt = [
      components.subject,
      `resting firmly on a ${components.surface}.`,
      `Set against a ${components.backdrop}.`,
      `Lighting: ${components.lighting}.`,
      `Optics & Framing: ${components.cameraLens}, with ${components.depthOfField}.`,
      `Color Atmosphere: ${components.colorGrading}.`,
      `Accents: ${components.props}.`,
      `Physics & Grounding: ${components.physicalCoherence}.`,
      customAdditions,
      'CRITICAL PRODUCT FIDELITY: Preserve 100% original product geometry, packaging proportions, brand logo, and Arabic/English label typography from the reference product photo.',
      'High-end advertising quality, 8K ultra-detailed commercial standard, flawless photorealism.',
    ]
      .filter(Boolean)
      .join(' ');

    const negativePrompt = [
      'no warped product geometry, no distorted shape, no blurry labels, no fake text',
      components.negativeDirectives,
      'blurry, distorted, duplicate, extra limbs, watermark, copyright symbol, CGI rendering look, cartoon, oversaturated, deformed packaging',
    ].join(', ');

    const normalizedModel = normalizeGeminiImageModel(options.targetModel);

    return {
      fullPrompt,
      synthesizedPrompt: fullPrompt,
      negativePrompt,
      aspectRatio: options.aspectRatio,
      components,
      targetModel: normalizedModel,
      modelTarget: normalizedModel,
    };
  }

  public synthesize(options: PromptSynthesisOptions): SynthesizedPromptResult {
    return PromptSynthesizer.synthesize(options);
  }
}
