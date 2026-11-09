import type { Country, Currency } from '../types/index.ts';

export interface PaymobRegionConfig {
  country: Country;
  currency: Exclude<Currency, 'USD'>;
  baseUrl: string;
  secretKey: string | null;
  publicKey: string | null;
  hmacSecret: string | null;
  integrationIds: Record<string, number | string>;
  isConfigured: boolean;
  isLiveKey: boolean;
}

function cleanSecret(val?: string | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (
    trimmed.length < 8 ||
    trimmed.includes('placeholder') ||
    trimmed.includes('your_paymob')
  ) {
    return null;
  }
  return trimmed;
}

function parseIntegrationIds(raw?: string | null): Record<string, number | string> {
  if (!raw || !raw.trim()) return {};
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to comma-separated
    }
  }
  const result: Record<string, number | string> = {};
  const parts = trimmed.split(',');
  for (const part of parts) {
    const [method, idStr] = part.split(':').map((s) => s.trim());
    if (method && idStr) {
      const num = Number(idStr);
      result[method] = isNaN(num) ? idStr : num;
    }
  }
  return result;
}

function isLiveKeyPattern(key?: string | null): boolean {
  if (!key) return false;
  const lower = key.toLowerCase();
  return lower.startsWith('live_') || lower.startsWith('egy_live_') || lower.startsWith('sau_live_');
}

/**
 * Returns regional Paymob configuration for Egypt (EG) or Saudi Arabia (SA).
 * Supports regional environment variables (PAYMOB_EG_*, PAYMOB_SA_*) with fallback
 * to legacy global variables (PAYMOB_SECRET_KEY, PAYMOB_HMAC_SECRET) for backward compatibility.
 */
export function getPaymobConfig(country: Country): PaymobRegionConfig {
  if (country === 'SA') {
    const secretKey =
      cleanSecret(process.env.PAYMOB_SA_SECRET_KEY) ??
      cleanSecret(process.env.PAYMOB_SECRET_KEY);
    const publicKey =
      cleanSecret(process.env.PAYMOB_SA_PUBLIC_KEY) ??
      cleanSecret(process.env.PAYMOB_PUBLIC_KEY);
    const hmacSecret =
      cleanSecret(process.env.PAYMOB_SA_HMAC_SECRET) ??
      cleanSecret(process.env.PAYMOB_HMAC_SECRET);
    const baseUrl =
      process.env.PAYMOB_SA_BASE_URL?.trim() ||
      process.env.PAYMOB_BASE_URL?.trim() ||
      'https://accept.paymob.com';
    const integrationIds = {
      mada: 551122,
      card: 551123,
      applePay: 551124,
      ...parseIntegrationIds(process.env.PAYMOB_SA_INTEGRATION_IDS),
    };

    const isLive = isLiveKeyPattern(secretKey) || isLiveKeyPattern(publicKey);
    const isConfigured = Boolean(secretKey && hmacSecret);

    return {
      country: 'SA',
      currency: 'SAR',
      baseUrl,
      secretKey,
      publicKey,
      hmacSecret,
      integrationIds,
      isConfigured,
      isLiveKey: isLive,
    };
  }

  // Default: Egypt (EG)
  const secretKey =
    cleanSecret(process.env.PAYMOB_EG_SECRET_KEY) ??
    cleanSecret(process.env.PAYMOB_SECRET_KEY);
  const publicKey =
    cleanSecret(process.env.PAYMOB_EG_PUBLIC_KEY) ??
    cleanSecret(process.env.PAYMOB_PUBLIC_KEY);
  const hmacSecret =
    cleanSecret(process.env.PAYMOB_EG_HMAC_SECRET) ??
    cleanSecret(process.env.PAYMOB_HMAC_SECRET);
  const baseUrl =
    process.env.PAYMOB_EG_BASE_URL?.trim() ||
    process.env.PAYMOB_BASE_URL?.trim() ||
    'https://accept.paymob.com';
  const integrationIds = {
    card: 441122,
    wallet: 441123,
    meeza: 441124,
    ...parseIntegrationIds(process.env.PAYMOB_EG_INTEGRATION_IDS),
  };

  const isLive = isLiveKeyPattern(secretKey) || isLiveKeyPattern(publicKey);
  const isConfigured = Boolean(secretKey && hmacSecret);

  return {
    country: 'EG',
    currency: 'EGP',
    baseUrl,
    secretKey,
    publicKey,
    hmacSecret,
    integrationIds,
    isConfigured,
    isLiveKey: isLive,
  };
}

/**
 * Validates that the runtime environment does not accidentally execute live Paymob credentials
 * in non-production environments (staging, development, test).
 */
export function validatePaymobEnvironment(
  country: Country,
  deployEnv: string = process.env.SHOTISTRY_DEPLOY_ENV || 'development'
): { valid: boolean; error?: string } {
  const config = getPaymobConfig(country);

  // In non-production environments, live keys are strictly prohibited
  if (deployEnv !== 'production' && config.isLiveKey) {
    return {
      valid: false,
      error: `FORBIDDEN: Live Paymob credentials detected for ${country} in ${deployEnv} environment. Only sandbox/test keys are permitted in non-production.`,
    };
  }

  return { valid: true };
}

