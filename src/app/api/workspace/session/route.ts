import { getDb } from '../../../../lib/db/prisma.ts';
import { resolveWorkspaceSession } from '../../../../lib/auth/session.ts';

export async function GET(request: Request) {
  try {
    const session = await resolveWorkspaceSession(request);
    const db = getDb();

    const recentJobs = db
      .prepare(
        `SELECT j."id" AS "jobId",
                j."status",
                j."modelUsed",
                j."creditCost",
                j."synthesizedPrompt",
                j."createdAt",
                j."completedAt",
                p."title" AS "productTitle",
                p."stylePreset",
                p."aspectRatio",
                img."imageUrl",
                img."resolution",
                img."synthIdDetected",
                img."fidelityScore",
                img."executionMode"
         FROM "GenerationJob" j
         JOIN "Photoshoot" p ON p."id" = j."photoshootId"
         LEFT JOIN "GeneratedImage" img ON img."generationJobId" = j."id"
         WHERE p."workspaceId" = ?
         ORDER BY j."createdAt" DESC
         LIMIT 20`
      )
      .all(session.workspaceId);

    return Response.json({
      success: true,
      workspace: session.workspace,
      recentJobs,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to resolve workspace session';
    const status = message.startsWith('FORBIDDEN:') ? 403 : 500;
    return Response.json({ success: false, error: message }, { status });
  }
}
