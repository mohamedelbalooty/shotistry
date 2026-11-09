import { z } from 'zod';

export type DeployEnv = 'local' | 'test' | 'staging' | 'production';

export const DeployEnvSchema = z.enum(['local', 'test', 'staging', 'production']);

/**
 * Resolves the operational deployment environment.
 * Evaluates SHOTISTRY_DEPLOY_ENV, falling back gracefully to NODE_ENV.
 */
export function getDeployEnv(): DeployEnv {
  const configured = process.env.SHOTISTRY_DEPLOY_ENV?.trim().toLowerCase();
  if (configured) {
    const parsed = DeployEnvSchema.safeParse(configured);
    if (parsed.success) {
      return parsed.data;
    }
  }

  if (process.env.NODE_ENV === 'test') {
    return 'test';
  }
  if (process.env.NODE_ENV === 'production') {
    return 'production';
  }
  return 'local';
}

/**
 * Returns true if the current environment is production-like (staging or production).
 * Enforces production-grade security, fail-closed guards, and prevents mock simulations.
 */
export function isProductionLike(): boolean {
  const env = getDeployEnv();
  return env === 'staging' || env === 'production';
}

/**
 * Returns true only if local development or mock fallback execution is explicitly permitted.
 */
export function isMockFallbackAllowed(): boolean {
  const env = getDeployEnv();
  return env === 'local' || env === 'test';
}

/**
 * Validates that the active runtime configuration contains necessary variables
 * without leaking sensitive values.
 */
export function validateRuntimeEnvironment(): {
  deployEnv: DeployEnv;
  valid: boolean;
  missing: string[];
} {
  const deployEnv = getDeployEnv();
  const missing: string[] = [];

  if (isProductionLike()) {
    if (!process.env.DATABASE_URL) missing.push('DATABASE_URL');
    if (!process.env.ASSET_SIGNING_SECRET || process.env.ASSET_SIGNING_SECRET.length < 32) {
      missing.push('ASSET_SIGNING_SECRET');
    }
    if (!process.env.PAYMOB_HMAC_SECRET || process.env.PAYMOB_HMAC_SECRET.includes('placeholder')) {
      missing.push('PAYMOB_HMAC_SECRET');
    }
    if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('placeholder')) {
      missing.push('RESEND_API_KEY');
    }
    if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('placeholder')) {
      missing.push('GEMINI_API_KEY');
    }
  }

  return {
    deployEnv,
    valid: missing.length === 0,
    missing,
  };
}
