import crypto from 'node:crypto';
import { getObjectStorage } from '../../../../lib/storage/object-storage.ts';

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

    const storage = getObjectStorage();
    const objects = await storage.list('ws/');
    let cleanedCount = 0;
    const now = Date.now();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    for (const obj of objects) {
      if (obj.key.includes('/uploads/')) {
        const age = obj.lastModified ? now - obj.lastModified.getTime() : 0;
        if (age > TWENTY_FOUR_HOURS_MS) {
          await storage.delete(obj.key);
          cleanedCount++;
        }
      }
    }

    return Response.json({
      success: true,
      cleanedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Storage cleanup failed';
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}

