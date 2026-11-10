import crypto from 'node:crypto';
import { z } from 'zod';
import { resolveAuthenticatedSession } from '../../../../../lib/auth/session.ts';
import { validateCsrfRequest } from '../../../../../lib/security/csrf.ts';
import { getBetaRepository } from '../../../../../lib/db/repositories/beta-repository.ts';
import { getWorkspaceRepository } from '../../../../../lib/db/repositories/workspace-repository.ts';
import { createScopedLogger } from '../../../../../lib/observability/logger.ts';

const logger = createScopedLogger('feedback:image');

const feedbackSchema = z.object({
  rating: z.enum(['THUMBS_UP', 'THUMBS_DOWN']),
  reason: z
    .enum([
      'POOR_LIGHTING',
      'BLURRY_FOREGROUND',
      'HALLUCINATED_TEXT',
      'STYLE_MISMATCH',
      'DISTORTED_PRODUCT',
      'OTHER',
    ])
    .optional(),
  comment: z.string().trim().max(1000).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await resolveAuthenticatedSession(request);
    const csrf = validateCsrfRequest(request, session.csrfToken);
    if (!csrf.valid) {
      return Response.json(
        { success: false, error: csrf.reason || 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const { id: imageId } = await context.params;
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return Response.json(
        { success: false, error: 'Malformed JSON payload' },
        { status: 400 }
      );
    }

    const parsed = feedbackSchema.safeParse(rawBody);
    if (!parsed.success) {
      return Response.json(
        { success: false, error: parsed.error.issues[0]?.message || 'Invalid feedback data' },
        { status: 400 }
      );
    }

    const betaRepo = getBetaRepository();
    const imageWorkspace = await betaRepo.findImageWorkspace(imageId);
    if (!imageWorkspace) {
      return Response.json(
        { success: false, error: 'Image not found' },
        { status: 404 }
      );
    }

    // Strict Cross-Workspace Isolation Verification
    const wsRepo = getWorkspaceRepository();
    const member = await wsRepo.getWorkspaceMember(imageWorkspace.workspaceId, session.userId);
    if (!member) {
      return Response.json(
        { success: false, error: 'FORBIDDEN: You do not have access to this workspace image' },
        { status: 403 }
      );
    }

    const feedbackId = `fb-${crypto.randomUUID()}`;
    const nowIso = new Date().toISOString();

    await betaRepo.recordFeedback({
      id: feedbackId,
      generatedImageId: imageId,
      workspaceId: imageWorkspace.workspaceId,
      userId: session.userId,
      rating: parsed.data.rating,
      reason: parsed.data.reason ?? null,
      comment: parsed.data.comment ?? null,
      nowIso,
    });

    logger.info('Merchant submitted image feedback', {
      imageId,
      workspaceId: imageWorkspace.workspaceId,
      rating: parsed.data.rating,
      reason: parsed.data.reason,
    });

    return Response.json({
      success: true,
      feedback: {
        id: feedbackId,
        imageId,
        rating: parsed.data.rating,
        reason: parsed.data.reason,
        comment: parsed.data.comment,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record image feedback';
    const status = message.startsWith('UNAUTHORIZED:') ? 401 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
