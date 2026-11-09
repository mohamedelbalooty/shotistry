import crypto from 'node:crypto';
import { getPhotoshootRepository } from '../../../../lib/db/repositories/photoshoot-repository.ts';
import { CreditLedgerService } from '../../../../lib/ledger/credit-ledger-service.ts';
import { JOB_ERROR_CODES } from '../../../../lib/jobs/job-state.ts';

const DEFAULT_STALE_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(request: Request) {
  try {
    const cronSecret = process.env.CRON_SECRET?.trim();
    if (!cronSecret) {
      return Response.json(
        { success: false, error: 'CRON_SECRET is not configured' },
        { status: 500 }
      );
    }

    const authHeader = request.headers.get('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    const providedSecret = match ? match[1].trim() : '';

    if (!providedSecret) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const providedBuf = Buffer.from(providedSecret);
    const expectedBuf = Buffer.from(cronSecret);

    if (
      providedBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const photoshootRepo = getPhotoshootRepository();
    const ledger = new CreditLedgerService();

    const staleBeforeIso = new Date(Date.now() - DEFAULT_STALE_TIMEOUT_MS).toISOString();
    const staleJobs = await photoshootRepo.findStaleRunningJobs(staleBeforeIso);

    let reapedCount = 0;
    for (const job of staleJobs) {
      await photoshootRepo.markJobFailed(
        job.id,
        'Generation job timed out or failed to report heartbeat within window',
        JOB_ERROR_CODES.TIMEOUT_STALE_HEARTBEAT
      );

      if (job.reservationId) {
        try {
          await ledger.releaseReservation(
            job.reservationId,
            JOB_ERROR_CODES.TIMEOUT_STALE_HEARTBEAT
          );
          reapedCount++;
        } catch {
          // If already settled or released in a race, ignore
        }
      }
    }

    return Response.json({
      success: true,
      reapedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Generation reaper execution failed';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

