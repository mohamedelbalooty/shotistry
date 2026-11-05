import crypto from 'node:crypto';
import { PromptSynthesizer } from '../../../../lib/ai/prompt-synthesizer.ts';
import { GeminiClient } from '../../../../lib/ai/gemini-client.ts';
import { CreditLedgerService } from '../../../../lib/ledger/credit-ledger-service.ts';
import { resolveWorkspaceSession } from '../../../../lib/auth/session.ts';
import { withSerializableTransaction } from '../../../../lib/db/prisma.ts';
import type { AspectRatio } from '../../../../lib/types/index.ts';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      workspaceId: requestedWorkspaceId,
      productTitle,
      productCategory = 'General',
      presetId = 'gulf_luxury_marble',
      aspectRatio = '1:1',
      brandName,
      brandAesthetic,
      customDirectives,
      rawImageBase64,
      model,
    } = body;

    if (!productTitle || typeof productTitle !== 'string' || !productTitle.trim()) {
      return Response.json(
        { success: false, error: 'Missing required field: productTitle' },
        { status: 400 }
      );
    }

    if (!rawImageBase64 || typeof rawImageBase64 !== 'string' || !rawImageBase64.trim()) {
      return Response.json(
        {
          success: false,
          error:
            'Missing required field: rawImageBase64. Customer product image is mandatory for product transformation.',
        },
        { status: 400 }
      );
    }

    // 1. Resolve and authorize workspace ownership
    const session = await resolveWorkspaceSession(request, requestedWorkspaceId);
    const ledger = new CreditLedgerService();

    // 2. Synthesize 10-component studio prompt targeting active Gemini Nano Banana model
    const synthesized = PromptSynthesizer.synthesize({
      productTitle: productTitle.trim(),
      productCategory,
      presetId,
      aspectRatio: aspectRatio as AspectRatio,
      brandName,
      brandAesthetic,
      customDirectives,
      targetModel: model,
    });

    // 3. Create persistent Photoshoot & GenerationJob in SQL
    const jobRecord = await ledger.createPhotoshootJob({
      workspaceId: session.workspaceId,
      productName: productTitle.trim(),
      category: productCategory,
      title: `${productTitle.trim()} — ${presetId}`,
      stylePreset: presetId,
      aspectRatio,
      modelUsed: synthesized.targetModel,
      rawPrompt: customDirectives ? `${productTitle}: ${customDirectives}` : productTitle,
      synthesizedPrompt: synthesized.fullPrompt,
      creditCost: 1,
    });

    // 4. Atomically reserve 1 credit before AI execution (402 if insufficient)
    let reservation;
    try {
      reservation = await ledger.reserveCredits({
        workspaceId: session.workspaceId,
        generationJobId: jobRecord.id,
        amount: 1,
      });
    } catch (resErr: unknown) {
      const msg = resErr instanceof Error ? resErr.message : 'Credit reservation failed';
      const isInsufficient = msg.toLowerCase().includes('insufficient credits');
      return Response.json(
        { success: false, error: msg },
        { status: isInsufficient ? 402 : 400 }
      );
    }

    // 5. Execute real product image isolation, studio generation/compositing & fidelity verification
    try {
      const gemini = new GeminiClient();
      const result = await gemini.generateProductPhoto(jobRecord.id, {
        prompt: synthesized.fullPrompt,
        negativePrompt: synthesized.negativePrompt,
        aspectRatio: aspectRatio as AspectRatio,
        model: synthesized.targetModel,
        presetId,
        referenceImageBase64: rawImageBase64,
      });

      // 6. Settle credit reservation and persist GeneratedImage + COMPLETED job state
      const settlement = await ledger.settleReservation(reservation.id);
      const now = new Date().toISOString();
      const generatedImageId = `img-${crypto.randomUUID()}`;

      await withSerializableTransaction((db) => {
        db.prepare(
          `INSERT INTO "GeneratedImage" (
             "id", "generationJobId", "imageUrl", "thumbnailUrl", "resolution",
             "aspectRatio", "isFavorite", "synthIdDetected", "fidelityScore", "executionMode", "createdAt"
           ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`
        ).run(
          generatedImageId,
          jobRecord.id,
          result.imageUrl,
          result.thumbnailUrl,
          result.resolution,
          result.aspectRatio,
          result.synthIdDetected ? 1 : 0,
          result.fidelityScore,
          result.executionMode,
          now
        );

        db.prepare(
          `UPDATE "GenerationJob" SET "status" = 'COMPLETED', "completedAt" = ? WHERE "id" = ?`
        ).run(now, jobRecord.id);
      });

      const updatedBalance = await ledger.getWorkspaceBalance(session.workspaceId);

      return Response.json({
        success: true,
        data: {
          ...result,
          photoshootId: jobRecord.photoshootId,
          components: synthesized.components,
          negativePrompt: synthesized.negativePrompt,
          creditsCharged: 1,
          remainingCredits: updatedBalance.availableCredits,
          ledgerEntryId: settlement.ledgerEntry.id,
        },
      });
    } catch (genErr: unknown) {
      // Automatically release reservation on generation error so customer loses 0 credits!
      const errMsg = genErr instanceof Error ? genErr.message : 'Generation pipeline error';
      await ledger.releaseReservation(reservation.id, errMsg);
      const isValidationError =
        errMsg.toLowerCase().includes('invalid') ||
        errMsg.toLowerCase().includes('product image') ||
        errMsg.toLowerCase().includes('buffer');

      return Response.json(
        {
          success: false,
          error: errMsg,
          reservationReleased: true,
        },
        { status: isValidationError ? 422 : 500 }
      );
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal generation error';
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
