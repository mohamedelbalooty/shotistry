import { getPhotoshootRepository } from '../db/repositories/photoshoot-repository.ts';
import { CreditLedgerService } from '../ledger/credit-ledger-service.ts';
import { GeminiClient } from '../ai/gemini-client.ts';
import { getObjectStorage } from '../storage/object-storage.ts';
import { JOB_ERROR_CODES } from './job-state.ts';
import type { AspectRatio, GeminiImageModelId } from '../types/index.ts';

export async function processGenerationJob(
  jobId: string,
  options?: {
    simulateFailureError?: string;
  }
): Promise<{ success: boolean; imageId?: string; error?: string }> {
  const photoshootRepo = getPhotoshootRepository();
  const ledger = new CreditLedgerService();

  const job = await photoshootRepo.findJobById(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  // Idempotency: if already COMPLETED, avoid re-executing
  if (job.status === 'COMPLETED') {
    const existingImages = await photoshootRepo.listJobImages(jobId);
    return { success: true, imageId: existingImages[0]?.id };
  }

  // Mark job as PROCESSING
  await photoshootRepo.markJobRunning(jobId);

  // Injected test failure hook
  if (options?.simulateFailureError) {
    await photoshootRepo.markJobFailed(
      jobId,
      options.simulateFailureError,
      JOB_ERROR_CODES.AI_GENERATION_FAILED
    );
    if (job.reservationId) {
      await ledger.releaseReservation(job.reservationId, options.simulateFailureError);
    }
    return { success: false, error: options.simulateFailureError };
  }

  try {
    let referenceImageBase64: string | undefined;

    if (job.assetKey) {
      const storage = getObjectStorage();
      const objectData = await storage.getBuffer(job.assetKey);
      if (objectData) {
        referenceImageBase64 = `data:${objectData.contentType};base64,${objectData.buffer.toString('base64')}`;
      }
    }

    const gemini = new GeminiClient();
    const result = await gemini.generateProductPhoto(job.id, {
      prompt: job.synthesizedPrompt,
      negativePrompt: 'blurry, low quality, distorted, deformed, watermark, text',
      aspectRatio: (job.aspectRatio as AspectRatio) || '1:1',
      model: (job.modelUsed as GeminiImageModelId) || 'gemini-3.1-flash-image',
      presetId: job.stylePreset,
      referenceImageBase64,
    });

    // Settle credit reservation
    if (job.reservationId) {
      await ledger.settleReservation(job.reservationId);
    }

    // Persist GeneratedImage and mark job COMPLETED
    const imageId = await photoshootRepo.completeJobAndPersistImage({
      jobId: job.id,
      imageUrl: result.imageUrl,
      thumbnailUrl: result.thumbnailUrl,
      resolution: result.resolution,
      aspectRatio: result.aspectRatio,
      synthIdDetected: Boolean(result.synthIdDetected),
      fidelityScore: result.fidelityScore,
      executionMode: result.executionMode,
    });

    return { success: true, imageId };
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : 'Generation pipeline failed';
    await photoshootRepo.markJobFailed(
      jobId,
      errMsg,
      JOB_ERROR_CODES.AI_GENERATION_FAILED
    );
    if (job.reservationId) {
      await ledger.releaseReservation(job.reservationId, errMsg);
    }
    return { success: false, error: errMsg };
  }
}
