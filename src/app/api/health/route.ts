import { getDeployEnv, isProductionLike, validateRuntimeEnvironment } from '../../../lib/config/env.ts';
import { resolveDbDriver } from '../../../lib/db/driver.ts';
import { getAdminRepository } from '../../../lib/db/repositories/admin-repository.ts';

export async function GET() {
  const deployEnv = getDeployEnv();
  const dbDriver = resolveDbDriver();
  let dbConnected = false;
  let dbError: string | null = null;

  try {
    const adminRepo = getAdminRepository();
    dbConnected = await adminRepo.ping();
  } catch (err: unknown) {
    dbConnected = false;
    dbError = err instanceof Error ? err.message : 'Database ping failed';
  }

  const storageConfigured = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );

  const validation = validateRuntimeEnvironment();
  const isHealthy = dbConnected;

  const payload = {
    status: isHealthy ? 'healthy' : 'degraded',
    deployEnv,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      driver: dbDriver,
      connected: dbConnected,
      ...(dbError && !isProductionLike() ? { error: dbError } : {}),
    },
    storage: {
      driver: storageConfigured ? 'r2' : 'local_filesystem',
      ready: storageConfigured || !isProductionLike(),
    },
    config: {
      valid: validation.valid,
      missingCount: validation.missing.length,
    },
  };

  return Response.json(payload, {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'application/json',
    },
  });
}
