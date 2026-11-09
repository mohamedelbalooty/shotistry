import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import type {
  AspectRatio,
  ExecutionMode,
  GeminiImageModelId,
  GeminiImageSize,
  GeminiUsageMetadata,
  GenerationResult,
  SupportedImageMimeType,
} from '../types/index.ts';
import {
  DEFAULT_GEMINI_IMAGE_MODEL,
  normalizeGeminiImageModel,
} from './prompt-synthesizer.ts';
import {
  parseImageInput,
  isolateProductForeground,
  compositeProductOnStudioScene,
  compositeProductOnSceneImage,
  verifyDeliveredImageFidelity,
  getResolutionForAspectRatio,
} from './image-processor.ts';
import { isMockFallbackAllowed } from '../config/env.ts';
import {
  classifyGeminiError,
  GeminiNoImageOutputError,
  GeminiTimeoutError,
} from './gemini-errors.ts';
import { calculateActualGenerationCostUsdMicros } from '../pricing/model-costs.ts';

export interface GenerateImageOptions {
  prompt: string;
  negativePrompt: string;
  aspectRatio: AspectRatio;
  imageSize?: string;
  outputMimeType?: SupportedImageMimeType;
  model?: string;
  presetId?: string;
  referenceImageBase64?: string;
  maskImageBase64?: string;
  lockProductForeground?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface InteractionsCreateRequest {
  model: GeminiImageModelId;
  input: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; mime_type: string; data: string }
  >;
  response_format: {
    type: 'image';
    mime_type: string;
    aspect_ratio: AspectRatio;
    image_size: GeminiImageSize;
  };
}

export interface InteractionResponseLike {
  id?: string;
  model?: string;
  status?: string;
  errors?: Array<{ code?: string | number; message?: string }>;
  output_image?: {
    type?: string;
    data?: string;
    mime_type?: string;
    uri?: string;
  };
  output_text?: string;
  steps?: Array<{
    type?: string;
    content?: Array<{
      type?: string;
      data?: string;
      mime_type?: string;
      text?: string;
    }>;
  }>;
  usage?: {
    total_input_tokens?: number;
    total_output_tokens?: number;
    total_thought_tokens?: number;
    total_tokens?: number;
  };
}

export interface InteractionsClientLike {
  interactions: {
    create(params: InteractionsCreateRequest): Promise<InteractionResponseLike>;
  };
}

/**
 * Normalizes the requested `image_size` parameter to uppercase (`512`, `1K`, `2K`, `4K`)
 * as required by the Google Interactions API, and enforces per-model resolution limits:
 * - `gemini-3.1-flash-lite-image`: supports `1K` only.
 * - `gemini-3-pro-image`: supports `1K`, `2K`, `4K` (`512` is clamped to `1K`).
 * - `gemini-3.1-flash-image`: supports `512`, `1K`, `2K`, `4K`.
 */
export function normalizeImageSizeForModel(
  rawSize: string | undefined,
  model: GeminiImageModelId
): GeminiImageSize {
  if (model === 'gemini-3.1-flash-lite-image') {
    return '1K';
  }
  const normalized = (rawSize ?? '1K').trim().toUpperCase();
  if (normalized === '4K') return '4K';
  if (normalized === '2K') return '2K';
  if (normalized === '512' || normalized === '0.5K' || normalized === '512PX') {
    return model === 'gemini-3.1-flash-image' ? '512' : '1K';
  }
  return '1K';
}

export class GeminiClient {
  private client: InteractionsClientLike | null = null;
  private isLiveConfigured = false;

  constructor(apiKey?: string, injectedClient?: InteractionsClientLike) {
    if (injectedClient) {
      this.client = injectedClient;
      this.isLiveConfigured = true;
      return;
    }

    const key = apiKey !== undefined ? apiKey : process.env.GEMINI_API_KEY;
    if (
      key &&
      key.trim().length > 10 &&
      !key.includes('Placeholder') &&
      !key.includes('your_gemini_api_key')
    ) {
      this.client = new GoogleGenAI({ apiKey: key }) as unknown as InteractionsClientLike;
      this.isLiveConfigured = true;
    }
  }

  public isLiveMode(): boolean {
    return this.isLiveConfigured && this.client !== null;
  }

  /**
   * Transforms a customer's uploaded product photo into a studio product photograph.
   * - Requires `referenceImageBase64` (never generates text-only stock photos).
   * - Decodes PNG, JPEG, or WebP product pixels and isolates the product foreground & binary alpha mask.
   * - Calls the official Gemini Interactions API (`gemini-3.1-flash-image` default, `gemini-3.1-flash-lite-image`,
   *   or `gemini-3-pro-image`) with `response_format: { type: 'image', mime_type, aspect_ratio, image_size }`
   *   and extracts `interaction.output_image.data` (with fallback to `interaction.steps` `model_output`).
   * - In local/sandbox mode, executes the deterministic pixel-level studio compositor
   *   with the customer's actual isolated product pixels and reports `synthIdDetected: false`.
   */
  public async generateProductPhoto(
    jobId: string,
    options: GenerateImageOptions
  ): Promise<GenerationResult> {
    if (!options.referenceImageBase64 || options.referenceImageBase64.trim().length === 0) {
      throw new Error(
        'Product reference image (referenceImageBase64) is required for product photography generation'
      );
    }

    if (!this.client && !isMockFallbackAllowed()) {
      throw new Error(
        'AI provider unavailable: GEMINI_API_KEY is required in staging and production environments'
      );
    }

    const targetModel = normalizeGeminiImageModel(options.model ?? DEFAULT_GEMINI_IMAGE_MODEL);
    const effectiveImageSize = normalizeImageSizeForModel(options.imageSize, targetModel);
    const outputMimeType: SupportedImageMimeType =
      options.outputMimeType === 'image/jpeg' || options.outputMimeType === 'image/webp'
        ? options.outputMimeType
        : 'image/png';
    const { resolution } = getResolutionForAspectRatio(
      options.aspectRatio,
      effectiveImageSize
    );

    // Stage 1 & 2: Decode customer product image (PNG, JPEG, or WebP), isolate foreground & extract binary alpha mask
    const isolated = await isolateProductForeground(options.referenceImageBase64);
    const completedAt = new Date().toISOString();

    if (this.client && this.isLiveConfigured) {
      const parsedRef = parseImageInput(options.referenceImageBase64);
      const parsedMask = parseImageInput(
        options.maskImageBase64 ?? isolated.maskDataUrl
      );

      const sendMask = process.env.GEMINI_SEND_MASK !== 'false';
      const inputs: InteractionsCreateRequest['input'] = [
        {
          type: 'text',
          text: `${options.prompt}\nAvoid: ${options.negativePrompt}\nPreserve the exact product foreground from the provided reference image${sendMask ? ' and binary mask' : ''}.`,
        },
        {
          type: 'image',
          mime_type: parsedRef.mimeType,
          data: parsedRef.buffer.toString('base64'),
        },
      ];

      if (sendMask) {
        inputs.push({
          type: 'image',
          mime_type: parsedMask.mimeType,
          data: parsedMask.buffer.toString('base64'),
        });
      }

      const requestPayload: InteractionsCreateRequest = {
        model: targetModel,
        input: inputs,
        response_format: {
          type: 'image',
          mime_type: outputMimeType,
          aspect_ratio: options.aspectRatio,
          image_size: effectiveImageSize,
        },
      };

      const maxRetries = options.maxRetries ?? 2;
      const timeoutMs = options.timeoutMs ?? (effectiveImageSize === '4K' ? 35000 : 25000);

      let interaction: InteractionResponseLike | null = null;
      let lastClassifiedError: unknown = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          let timer: NodeJS.Timeout | undefined;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              reject(new GeminiTimeoutError(timeoutMs));
            }, timeoutMs);
          });

          try {
            interaction = await Promise.race([
              this.client.interactions.create(requestPayload),
              timeoutPromise,
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }

          if (
            interaction.status === 'failed' ||
            interaction.status === 'cancelled' ||
            (interaction.errors && interaction.errors.length > 0)
          ) {
            const errMessage =
              interaction.errors
                ?.map((e) => `${e.code ?? 'API_ERROR'}: ${e.message ?? 'Unknown error'}`)
                .join('; ') ||
              `Gemini Interaction ${interaction.id ?? ''} ended with status=${interaction.status}`;
            throw new Error(`Gemini Interactions API failure: ${errMessage}`);
          }

          break; // Succeeded
        } catch (err: unknown) {
          const classified = classifyGeminiError(err);
          lastClassifiedError = classified;

          if (!classified.isRetryable || attempt >= maxRetries) {
            throw classified;
          }

          const backoffMs = Math.min(2000, 100 * Math.pow(2, attempt) + Math.random() * 50);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
      }

      if (!interaction) {
        throw classifyGeminiError(lastClassifiedError);
      }

      // Extract image output from documented `interaction.output_image.data` first,
      // then fall back to iterating `interaction.steps` (`step.type === 'model_output'`).
      let extractedBase64: string | undefined = interaction.output_image?.data;
      let extractedMimeType: string | undefined = interaction.output_image?.mime_type;

      if (!extractedBase64 && Array.isArray(interaction.steps)) {
        for (const step of interaction.steps) {
          if (step.type === 'model_output' && Array.isArray(step.content)) {
            for (const block of step.content) {
              if (block.type === 'image' && block.data) {
                extractedBase64 = block.data;
                extractedMimeType = block.mime_type;
              }
            }
          }
        }
      }

      if (!extractedBase64 || extractedBase64.trim().length === 0) {
        throw new GeminiNoImageOutputError(
          'Gemini Interactions API returned no image output in interaction.output_image.data or model_output steps'
        );
      }

      // Verify that the extracted base64 represents a valid decodable image via Sharp
      const outputBuffer = Buffer.from(extractedBase64, 'base64');
      const sharpMeta = await sharp(outputBuffer).metadata();
      if (!sharpMeta.width || !sharpMeta.height) {
        throw new GeminiNoImageOutputError('Gemini output image could not be decoded by Sharp');
      }

      const finalMimeType = extractedMimeType || outputMimeType;
      const liveDataUrl = `data:${finalMimeType};base64,${extractedBase64}`;

      let finalDeliveredImageUrl = liveDataUrl;
      let finalPlacement: ReturnType<typeof compositeProductOnStudioScene>['placement'] | undefined;

      if (options.lockProductForeground) {
        const lockedComposite = await compositeProductOnSceneImage({
          isolated,
          sceneImageDataUrl: liveDataUrl,
          aspectRatio: options.aspectRatio,
          presetId: options.presetId,
        });
        finalDeliveredImageUrl = lockedComposite.imageDataUrl;
        finalPlacement = lockedComposite.placement;
      }

      // Measure fidelity directly on the actual final image delivered to the customer
      const deliveredFidelity = await verifyDeliveredImageFidelity(
        isolated,
        finalDeliveredImageUrl,
        finalPlacement
      );

      const usageMetadata: GeminiUsageMetadata | undefined = interaction.usage
        ? {
            inputTokens: interaction.usage.total_input_tokens ?? 0,
            outputTokens: interaction.usage.total_output_tokens ?? 0,
            ...(interaction.usage.total_thought_tokens !== undefined
              ? { thoughtTokens: interaction.usage.total_thought_tokens }
              : {}),
            totalTokens:
              interaction.usage.total_tokens ??
              (interaction.usage.total_input_tokens ?? 0) +
                (interaction.usage.total_output_tokens ?? 0) +
                (interaction.usage.total_thought_tokens ?? 0),
          }
        : undefined;

      const costUsdMicros = calculateActualGenerationCostUsdMicros(
        targetModel,
        usageMetadata,
        effectiveImageSize
      );

      return {
        jobId,
        interactionId: interaction.id,
        status: 'COMPLETED',
        imageUrl: finalDeliveredImageUrl,
        thumbnailUrl: finalDeliveredImageUrl,
        maskImageUrl: isolated.maskDataUrl,
        isolatedProductUrl: isolated.isolatedProductDataUrl,
        synthesizedPrompt: options.prompt,
        negativePrompt: options.negativePrompt,
        aspectRatio: options.aspectRatio,
        resolution,
        modelUsed: targetModel,
        executionMode: 'LIVE_GEMINI_API' as ExecutionMode,
        usageMetadata,
        costUsdMicros,
        creditsCharged: 1,
        synthIdDetected: true,
        aiGenerated: true,
        fidelityScore: deliveredFidelity.fidelityScore,
        fidelityVerified: deliveredFidelity.fidelityVerified,
        completedAt,
      };
    }

    if (!isMockFallbackAllowed()) {
      throw new Error(
        'AI provider unavailable: GEMINI_API_KEY is required in staging and production environments'
      );
    }

    // Stage 3: Prepare pixel-accurate studio composite preserving 100% of customer product foreground
    const studioComposite = compositeProductOnStudioScene({
      isolated,
      presetId: options.presetId ?? 'gulf_luxury_marble',
      aspectRatio: options.aspectRatio,
    });

    // Stage 4: Verify foreground pixel fidelity directly on the actual delivered imageUrl
    const deliveredFidelity = await verifyDeliveredImageFidelity(
      isolated,
      studioComposite.imageDataUrl,
      studioComposite.placement
    );

    // Local Composite Sandbox Mode (when GEMINI_API_KEY is not configured):
    return {
      jobId,
      status: 'COMPLETED',
      imageUrl: studioComposite.imageDataUrl,
      thumbnailUrl: studioComposite.imageDataUrl,
      maskImageUrl: isolated.maskDataUrl,
      isolatedProductUrl: isolated.isolatedProductDataUrl,
      synthesizedPrompt: options.prompt,
      negativePrompt: options.negativePrompt,
      aspectRatio: options.aspectRatio,
      resolution,
      modelUsed: targetModel,
      executionMode: 'LOCAL_COMPOSITE_SANDBOX' as ExecutionMode,
      creditsCharged: 1,
      synthIdDetected: false,
      aiGenerated: false,
      fidelityScore: deliveredFidelity.fidelityScore,
      fidelityVerified: deliveredFidelity.fidelityVerified,
      completedAt,
    };
  }
}
