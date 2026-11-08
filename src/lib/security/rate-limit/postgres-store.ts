import { resolveDbDriver } from '../../db/driver.ts';
import { prisma, getDb } from '../../db/prisma.ts';
import type {
  RateLimitStore,
  RateLimitDecision,
} from './types.ts';
import { RateLimitBackendUnavailableError } from './types.ts';

export class PostgresRateLimitStore implements RateLimitStore {
  readonly backend = 'postgres' as const;

  async consume(
    key: string,
    limit: number,
    windowMs: number
  ): Promise<RateLimitDecision> {
    const driver = resolveDbDriver();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + windowMs);

    try {
      let count = 1;
      let expiresAtDate = expiresAt;

      if (driver === 'postgres') {
        const rows = (await prisma.$queryRawUnsafe(
          `INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt", "updatedAt")
           VALUES ($1, 1, $2, $3, $2)
           ON CONFLICT ("key") DO UPDATE
           SET
             "count" = CASE
               WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN 1
               ELSE "RateLimitBucket"."count" + 1
             END,
             "windowStart" = CASE
               WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN EXCLUDED."windowStart"
               ELSE "RateLimitBucket"."windowStart"
             END,
             "expiresAt" = CASE
               WHEN "RateLimitBucket"."expiresAt" <= EXCLUDED."windowStart" THEN EXCLUDED."expiresAt"
               ELSE "RateLimitBucket"."expiresAt"
             END,
             "updatedAt" = EXCLUDED."updatedAt"
           RETURNING "count", "expiresAt"`,
          key,
          now,
          expiresAt
        )) as Array<{ count: number; expiresAt: Date }>;

        if (rows.length > 0) {
          count = Number(rows[0].count);
          expiresAtDate = new Date(rows[0].expiresAt);
        }

        // 1% probabilistic cleanup
        if (Math.random() < 0.01) {
          prisma
            .$executeRawUnsafe(
              `DELETE FROM "RateLimitBucket"
               WHERE "key" IN (
                 SELECT "key" FROM "RateLimitBucket"
                 WHERE "expiresAt" < $1
                 LIMIT 200
               )`,
              now
            )
            .catch(() => {});
        }
      } else {
        // SQLite fallback
        const db = getDb();
        const nowIso = now.toISOString();
        const expiresAtIso = expiresAt.toISOString();

        const row = db
          .prepare(
            `INSERT INTO "RateLimitBucket" ("key", "count", "windowStart", "expiresAt", "updatedAt")
             VALUES (?, 1, ?, ?, ?)
             ON CONFLICT ("key") DO UPDATE
             SET
               "count" = CASE
                 WHEN "RateLimitBucket"."expiresAt" <= excluded."windowStart" THEN 1
                 ELSE "RateLimitBucket"."count" + 1
               END,
               "windowStart" = CASE
                 WHEN "RateLimitBucket"."expiresAt" <= excluded."windowStart" THEN excluded."windowStart"
                 ELSE "RateLimitBucket"."windowStart"
               END,
               "expiresAt" = CASE
                 WHEN "RateLimitBucket"."expiresAt" <= excluded."windowStart" THEN excluded."expiresAt"
                 ELSE "RateLimitBucket"."expiresAt"
               END,
               "updatedAt" = excluded."updatedAt"
             RETURNING "count", "expiresAt"`
          )
          .get(key, nowIso, expiresAtIso, nowIso) as { count: number; expiresAt: string };

        if (row) {
          count = Number(row.count);
          expiresAtDate = new Date(row.expiresAt);
        }
      }

      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const diffMs = expiresAtDate.getTime() - Date.now();
      const retryAfterSeconds = Math.max(1, Math.ceil(diffMs / 1000));

      return {
        allowed,
        remaining,
        retryAfterSeconds,
        backend: this.backend,
      };
    } catch (err: unknown) {
      throw new RateLimitBackendUnavailableError(
        `Database rate limiter failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
}
