import { getDb } from '../../../../lib/db/prisma.ts';
import { resolveWorkspaceSession } from '../../../../lib/auth/session.ts';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await resolveWorkspaceSession(request);
    const { id: jobId } = await context.params;
    const db = getDb();

    const jobRow = db
      .prepare(
        `SELECT j."id",
                j."photoshootId",
                j."status",
                j."modelUsed",
                j."creditCost",
                j."rawPrompt",
                j."synthesizedPrompt",
                j."errorMessage",
                j."startedAt",
                j."completedAt",
                j."createdAt",
                p."workspaceId",
                p."title" AS "productTitle",
                p."stylePreset",
                p."aspectRatio",
                r."status" AS "reservationStatus",
                r."amount" AS "reservedAmount"
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         LEFT JOIN "CreditReservation" r ON r."generationJobId" = j."id"
         WHERE j."id" = ?`
      )
      .get(jobId) as
      | {
          id: string;
          photoshootId: string;
          status: string;
          modelUsed: string;
          creditCost: number;
          rawPrompt: string;
          synthesizedPrompt: string;
          errorMessage: string | null;
          startedAt: string | null;
          completedAt: string | null;
          createdAt: string;
          workspaceId: string;
          productTitle: string;
          stylePreset: string;
          aspectRatio: string;
          reservationStatus: string | null;
          reservedAmount: number | null;
        }
      | undefined;

    if (!jobRow) {
      return Response.json({ success: false, error: 'Job not found' }, { status: 404 });
    }

    if (jobRow.workspaceId !== session.workspaceId && session.role !== 'ADMIN') {
      return Response.json(
        { success: false, error: 'FORBIDDEN: Job belongs to a different workspace' },
        { status: 403 }
      );
    }

    const images = db
      .prepare(
        `SELECT "id",
                "generationJobId",
                "imageUrl",
                "thumbnailUrl",
                "resolution",
                "aspectRatio",
                "synthIdDetected",
                "fidelityScore",
                "executionMode",
                "createdAt"
         FROM "GeneratedImage"
         WHERE "generationJobId" = ?
         ORDER BY "createdAt" DESC`
      )
      .all(jobId)
      .map((img: Record<string, unknown>) => ({
        ...img,
        synthIdDetected: Boolean(img.synthIdDetected),
      }));

    return Response.json({
      success: true,
      job: jobRow,
      images,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch job';
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
