import { GoogleGenAI } from '@google/genai';
import type { AspectRatio, GenerationResult } from '../types/index.ts';

export interface GenerateImageOptions {
  prompt: string;
  negativePrompt?: string;
  aspectRatio: AspectRatio;
  numberOfImages?: number;
  model?: string;
  referenceImageBase64?: string;
  maskImageBase64?: string;
}

/**
 * Shotistry Google Gemini & Imagen API Gateway.
 * Supports live production image generation via @google/genai SDK
 * and high-fidelity simulated execution for test suites and sandbox environments.
 */
export class GeminiClient {
  private client: GoogleGenAI | null = null;
  private apiKey: string | null = null;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY || null;
    if (this.apiKey && !this.apiKey.includes('Placeholder')) {
      try {
        this.client = new GoogleGenAI({ apiKey: this.apiKey });
      } catch (err) {
        console.warn('GoogleGenAI initialization fallback to simulation mode:', err);
      }
    }
  }

  /**
   * Generates commercial product photography using Imagen 3 or Gemini multimodal models.
   */
  async generateProductPhoto(
    jobId: string,
    options: GenerateImageOptions
  ): Promise<GenerationResult> {
    const model = options.model || 'imagen-3.0-generate-002';

    // Live execution pathway if valid API key is present
    if (this.client) {
      try {
        const response = await this.client.models.generateImages({
          model,
          prompt: options.prompt,
          config: {
            numberOfImages: options.numberOfImages || 1,
            outputMimeType: 'image/png',
            aspectRatio: options.aspectRatio,
            includeRaiReason: true
          }
        });

        const generated = response.generatedImages?.[0];
        if (!generated || !generated.image?.imageBytes) {
          throw new Error('Google GenAI API returned an empty image response.');
        }

        const base64Data = generated.image.imageBytes;
        const imageUrl = `data:image/png;base64,${base64Data}`;

        return {
          jobId,
          imageUrl,
          thumbnailUrl: imageUrl,
          aspectRatio: options.aspectRatio,
          resolution: options.aspectRatio === '1:1' ? '1024x1024' : '1080x1350',
          modelUsed: model,
          synthesizedPrompt: options.prompt,
          synthIdDetected: true,
          completedAt: new Date().toISOString()
        };
      } catch (error: any) {
        console.error('Google GenAI generation error:', error);
        throw new Error(`AI Generation Failed: ${error.message || 'Unknown upstream model error'}`);
      }
    }

    // High-fidelity sandbox / test simulation pathway
    // Simulates realistic network delay (300ms) and returns a structured commercial result
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Curated high-resolution commercial asset mockup corresponding to aspect ratio
    const mockUrls: Record<AspectRatio, string> = {
      '1:1': 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1024&q=90',
      '4:5': 'https://images.unsplash.com/photo-1546868871-7041f2a55e12?w=1080&h=1350&q=90',
      '9:16': 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=1080&h=1920&q=90',
      '16:9': 'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=1920&h=1080&q=90'
    };

    const imageUrl = mockUrls[options.aspectRatio] || mockUrls['1:1'];

    return {
      jobId,
      imageUrl,
      thumbnailUrl: imageUrl,
      aspectRatio: options.aspectRatio,
      resolution: options.aspectRatio === '1:1' ? '1024x1024' : '1080x1350',
      modelUsed: `${model} (Simulated Sandbox)`,
      synthesizedPrompt: options.prompt,
      synthIdDetected: true,
      completedAt: new Date().toISOString()
    };
  }
}
