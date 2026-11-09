import { PromptSynthesizer } from '../../../../lib/ai/prompt-synthesizer.ts';
import {
  GeminiClient,
  normalizeImageSizeForModel,
} from '../../../../lib/ai/gemini-client.ts';
import { parseImageInput } from '../../../../lib/ai/image-processor.ts';
import { CreditLedgerService } from '../../../../lib/ledger/credit-ledger-service.ts';
import { resolveAuthenticatedSession } from '../../../../lib/auth/session.ts';
import { requireWorkspacePermission } from '../../../../lib/auth/rbac.ts';
import { validateCsrfRequest } from '../../../../lib/security/csrf.ts';
import { enforceRateLimitPolicies } from '../../../../lib/security/rate-limit.ts';
import { getPhotoshootRepository } from '../../../../lib/db/repositories/photoshoot-repository.ts';
import { getObjectStorage } from '../../../../lib/storage/object-storage.ts';
import { buildUploadAssetKey, validateWorkspaceKeyAccess } from '../../../../lib/storage/keys.ts';
import { processGenerationJob } from '../../../../lib/jobs/generation-worker.ts';
import { SUBSCRIPTION_PLANS } from '../../../../lib/pricing/plans.ts';
import {
  getCreditWeightForGeneration,
  validatePlanModelEntitlement,
} from '../../../../lib/pricing/model-costs.ts';
import type {
  AspectRatio,
  GeminiImageModelId,
  GeminiImageSize,
  PlanTier,
} from '../../../../lib/types/index.ts';

const MAX_IMAGE_BASE64_LENGTH = 20 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    // 1. Authenticate session, verify CSRF token & enforce workspace RBAC
    const session = await resolveAuthenticatedSession(request, { requireWorkspace: true });
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const workspace = requireWorkspacePermission(session, 'photoshoot:generate');

    const rateBlocked = await enforceRateLimitPolicies(
      request,
      'photoshoots:generate:ws',
      { workspaceId: workspace.workspaceId }
    );
    if (rateBlocked) return rateBlocked;

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ success: false, error: 'Malformed JSON body' }, { status: 400 });
    }

    const requestedWorkspaceId =
      typeof body.workspaceId === 'string' ? body.workspaceId.trim() : undefined;
    if (requestedWorkspaceId && requestedWorkspaceId !== workspace.workspaceId) {
      return Response.json(
        {
          success: false,
          error: 'FORBIDDEN: Requested workspaceId does not match active authenticated workspace',
        },
        { status: 403 }
      );
    }

    // Idempotency check: return existing job if same key in same workspace
    const idempotencyKey =
      request.headers.get('idempotency-key')?.trim() ||
      (typeof body.idempotencyKey === 'string' ? body.idempotencyKey.trim() : undefined);

    if (idempotencyKey) {
      const photoshootRepo = getPhotoshootRepository();
      const existing = await photoshootRepo.findJobByIdempotencyKey(
        workspace.workspaceId,
        idempotencyKey
      );
      if (existing) {
        return Response.json(
          {
            success: true,
            jobId: existing.id,
            photoshootId: existing.photoshootId,
            status: existing.status,
          },
          { status: existing.status === 'COMPLETED' ? 200 : 202 }
        );
      }
    }

    const productTitle = typeof body.productTitle === 'string' ? body.productTitle : '';
    const productCategory =
      typeof body.productCategory === 'string' && body.productCategory.trim()
        ? body.productCategory.trim()
        : 'General';
    const presetId =
      typeof body.presetId === 'string' && body.presetId.trim()
        ? body.presetId.trim()
        : 'gulf_luxury_marble';
    const aspectRatio = (
      typeof body.aspectRatio === 'string' ? body.aspectRatio : '1:1'
    ) as AspectRatio;
    const brandName = typeof body.brandName === 'string' ? body.brandName : undefined;
    const brandAesthetic =
      typeof body.brandAesthetic === 'string' ? body.brandAesthetic : undefined;
    const customDirectives =
      typeof body.customDirectives === 'string' ? body.customDirectives : undefined;
    const rawImageBase64 = typeof body.rawImageBase64 === 'string' ? body.rawImageBase64 : '';
    const assetKey = typeof body.assetKey === 'string' ? body.assetKey.trim() : undefined;
    const model =
      typeof body.model === 'string' ? (body.model as GeminiImageModelId) : undefined;
    const imageSize =
      typeof body.imageSize === 'string' ? (body.imageSize as GeminiImageSize) : undefined;
    const lockProductForeground = Boolean(body.lockProductForeground);

    if (!productTitle.trim()) {
      return Response.json(
        { success: false, error: 'Missing required field: productTitle' },
        { status: 400 }
      );
    }

    if (!assetKey && !rawImageBase64.trim()) {
      return Response.json(
        {
          success: false,
          error:
            'Missing required product image. Provide either assetKey or rawImageBase64.',
        },
        { status: 400 }
      );
    }

    if (assetKey && !validateWorkspaceKeyAccess(workspace.workspaceId, assetKey)) {
      return Response.json(
        {
          success: false,
          error: 'FORBIDDEN: Requested storage assetKey does not belong to active workspace',
        },
        { status: 403 }
      );
    }

    if (rawImageBase64 && rawImageBase64.length > MAX_IMAGE_BASE64_LENGTH) {
      return Response.json(
        { success: false, error: 'Image payload exceeds 20MB limit' },
        { status: 413 }
      );
    }

    let effectiveAssetKey = assetKey;
    if (!effectiveAssetKey && rawImageBase64.trim()) {
      try {
        const storage = getObjectStorage();
        const { buffer, mimeType } = parseImageInput(rawImageBase64);
        const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/webp' ? 'webp' : 'png';
        const uploadKey = buildUploadAssetKey(workspace.workspaceId, ext);
        await storage.put(uploadKey, buffer, mimeType);
        effectiveAssetKey = uploadKey;
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : 'Invalid image payload';
        return Response.json({ success: false, error: errMsg }, { status: 400 });
      }
    }

    const ledger = new CreditLedgerService();
    const rawTier = workspace.planTier;
    const planTier: PlanTier = (
      rawTier in SUBSCRIPTION_PLANS ? rawTier : 'FREE'
    ) as PlanTier;
    const plan = SUBSCRIPTION_PLANS[planTier];

    // 2. Synthesize studio prompt & validate plan entitlement
    const synthesized = PromptSynthesizer.synthesize({
      productTitle: productTitle.trim(),
      productCategory,
      presetId,
      aspectRatio,
      brandName,
      brandAesthetic,
      customDirectives,
      targetModel: model ?? plan.defaultModel,
    });
    const effectiveImageSize = normalizeImageSizeForModel(
      imageSize ?? plan.defaultImageSize,
      synthesized.targetModel
    );

    const entitlement = validatePlanModelEntitlement(
      planTier,
      synthesized.targetModel,
      effectiveImageSize
    );
    if (!entitlement.allowed) {
      return Response.json(
        { success: false, error: entitlement.reason },
        { status: 403 }
      );
    }

    const creditCost = getCreditWeightForGeneration(
      synthesized.targetModel,
      effectiveImageSize
    );

    const preferHeader = request.headers.get('prefer')?.toLowerCase() || '';
    const isAsync = preferHeader.includes('respond-async') || Boolean(body.async);

    // 3. Create persistent Photoshoot & GenerationJob in SQL
    const jobRecord = await ledger.createPhotoshootJob({
      workspaceId: workspace.workspaceId,
      productName: productTitle.trim(),
      category: productCategory,
      title: `${productTitle.trim()} — ${presetId}`,
      stylePreset: presetId,
      aspectRatio,
      modelUsed: synthesized.targetModel,
      rawPrompt: customDirectives ? `${productTitle}: ${customDirectives}` : productTitle,
      synthesizedPrompt: synthesized.fullPrompt,
      creditCost,
      idempotencyKey,
      assetKey: effectiveAssetKey,
      status: isAsync ? 'QUEUED' : 'PROCESSING',
    });

    // 4. Atomically reserve credits
    let reservation;
    try {
      reservation = await ledger.reserveCredits({
        workspaceId: workspace.workspaceId,
        generationJobId: jobRecord.id,
        amount: creditCost,
      });
    } catch (resErr: unknown) {
      const msg = resErr instanceof Error ? resErr.message : 'Credit reservation failed';
      const isInsufficient = msg.toLowerCase().includes('insufficient credits');
      return Response.json(
        { success: false, error: msg },
        { status: isInsufficient ? 402 : 400 }
      );
    }

    // 5. Handle async vs sync execution
    if (isAsync) {
      try {
        const { after } = await import('next/server');
        after(async () => {
          await processGenerationJob(jobRecord.id);
        });
      } catch {
        // Outside Next.js request context (e.g. node:test suite runner)
      }

      return Response.json(
        {
          success: true,
          jobId: jobRecord.id,
          photoshootId: jobRecord.photoshootId,
          status: 'QUEUED',
        },
        { status: 202 }
      );
    }

    // Synchronous execution (legacy flow)
    try {
      const gemini = new GeminiClient();
      const result = await gemini.generateProductPhoto(jobRecord.id, {
        prompt: synthesized.fullPrompt,
        negativePrompt: synthesized.negativePrompt,
        aspectRatio,
        imageSize: effectiveImageSize,
        model: synthesized.targetModel,
        presetId,
        referenceImageBase64: rawImageBase64,
        lockProductForeground,
      });

      const settlement = await ledger.settleReservation(reservation.id);
      const photoshootRepo = getPhotoshootRepository();

      await photoshootRepo.completeJobAndPersistImage({
        jobId: jobRecord.id,
        imageUrl: result.imageUrl,
        thumbnailUrl: result.thumbnailUrl,
        resolution: result.resolution,
        aspectRatio: result.aspectRatio,
        synthIdDetected: Boolean(result.synthIdDetected),
        fidelityScore: result.fidelityScore,
        executionMode: result.executionMode,
      });

      const updatedBalance = await ledger.getWorkspaceBalance(workspace.workspaceId);

      return Response.json({
        success: true,
        data: {
          ...result,
          photoshootId: jobRecord.photoshootId,
          components: synthesized.components,
          negativePrompt: synthesized.negativePrompt,
          creditsCharged: creditCost,
          remainingCredits: updatedBalance.availableCredits,
          ledgerEntryId: settlement.ledgerEntry.id,
        },
      });
    } catch (genErr: unknown) {
      const errMsg = genErr instanceof Error ? genErr.message : 'Generation pipeline error';
      await ledger.releaseReservation(reservation.id, errMsg);
      const isValidationError =
        errMsg.toLowerCase().includes('invalid') ||
        errMsg.toLowerCase().includes('unsupported') ||
        errMsg.toLowerCase().includes('corrupt') ||
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
    const status = message.startsWith('UNAUTHORIZED:')
      ? 401
      : message.startsWith('FORBIDDEN:')
        ? 403
        : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
