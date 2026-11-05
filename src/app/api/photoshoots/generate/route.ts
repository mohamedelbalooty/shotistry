import { NextResponse } from 'next/server';
import { PromptSynthesizer } from '../../../../lib/ai/prompt-synthesizer';
import { GeminiClient } from '../../../../lib/ai/gemini-client';
import { AspectRatio } from '../../../../lib/types';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      productTitle,
      productCategory,
      presetId,
      aspectRatio = '1:1',
      brandName,
      brandAesthetic,
      customDirectives,
    } = body;

    if (!productTitle || !presetId) {
      return NextResponse.json(
        { error: 'Product title and photoshoot preset are required.' },
        { status: 400 }
      );
    }

    // Step 1: Synthesize Prompt using 10-component schema
    const synthesized = PromptSynthesizer.synthesize({
      productTitle,
      productCategory: productCategory || 'General Product',
      presetId,
      aspectRatio: aspectRatio as AspectRatio,
      brandName,
      brandAesthetic,
      customDirectives,
    });

    // Step 2: Invoke Gemini / Imagen Gateway
    const client = new GeminiClient();
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const result = await client.generateProductPhoto(jobId, {
      prompt: synthesized.fullPrompt,
      negativePrompt: synthesized.negativePrompt,
      aspectRatio: aspectRatio as AspectRatio,
      model: synthesized.targetModel,
    });

    return NextResponse.json({
      success: true,
      jobId,
      result,
      creditsConsumed: 1,
    });
  } catch (error: any) {
    console.error('API Generation Route Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error processing image generation.' },
      { status: 500 }
    );
  }
}

