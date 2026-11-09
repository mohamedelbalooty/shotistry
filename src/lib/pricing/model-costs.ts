import type {
  Country,
  Currency,
  GeminiImageModelId,
  GeminiImageSize,
  GeminiServiceTier,
  PlanTier,
} from '../types/index.ts';
import { SUBSCRIPTION_PLANS } from './plans.ts';

export interface ServiceTierPricing {
  serviceTier: GeminiServiceTier;
  inputUsdPer1MTokens: number;
  textOutputUsdPer1MTokens: number;
  imageOutputUsdPer1MTokens: number;
  geminiApiSupported: boolean;
  vertexAiSupported: boolean;
  notes: string;
}

export interface ModelPricingSpec {
  modelId: GeminiImageModelId;
  displayName: string;
  inputTokensPerImage: number;
  defaultInputImagesPerRequest: number;
  defaultTextPromptTokens: number;
  supportedResolutions: GeminiImageSize[];
  outputTokensByResolution: Partial<Record<GeminiImageSize, number>>;
  tiers: Record<GeminiServiceTier, ServiceTierPricing>;
}

export interface GenerationCostBreakdown {
  modelId: GeminiImageModelId;
  imageSize: GeminiImageSize;
  serviceTier: GeminiServiceTier;
  inputImageCount: number;
  inputImageTokens: number;
  textInputTokens: number;
  outputImageTokens: number;
  inputImageCostUsd: number;
  textInputCostUsd: number;
  imageOutputCostUsd: number;
  directApiCostUsd: number;
  storageAndDeliveryCostUsd: number;
  retryAllowanceRate: number;
  retryAllowanceUsd: number;
  actualCostPerSuccessfulImageUsd: number;
}

export interface PlanProfitabilityReport {
  tier: Exclude<PlanTier, 'FREE'>;
  country: Country;
  currency: Exclude<Currency, 'USD'>;
  fxRatePerUsd: number;
  revenueLocal: number;
  revenueUsd: number;
  monthlyCredits: number;
  modelId: GeminiImageModelId;
  imageSize: GeminiImageSize;
  serviceTier: GeminiServiceTier;
  paymobFeeLocal: number;
  costPerImageUsd: number;
  costPerImageLocal: number;
  worstCaseImages: number;
  worstCaseCogsLocal: number;
  worstCaseTotalCostLocal: number;
  worstCaseGrossProfitLocal: number;
  worstCaseGrossMarginPercent: number;
  expectedUtilizationRate: number;
  expectedImages: number;
  expectedCogsLocal: number;
  expectedTotalCostLocal: number;
  expectedGrossProfitLocal: number;
  expectedGrossMarginPercent: number;
}

export const STORAGE_AND_DELIVERY_COST_USD = 0.0005;
export const DEFAULT_RETRY_ALLOWANCE_RATE = 0.03;
export const DEFAULT_EXPECTED_UTILIZATION_RATE = 0.65;

export const FX_RATES_PER_USD: Record<Country, number> = {
  EG: 50.0,
  SA: 3.75,
};

/**
 * Official Google Gemini API & Vertex AI Pricing Catalog for Image Generation Models
 * Verified against official Google AI for Developers & Vertex AI Pricing Documentation:
 * - https://ai.google.dev/gemini-api/docs/pricing
 * - https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image
 * - https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite-image
 * - https://ai.google.dev/gemini-api/docs/models/gemini-3-pro-image
 * - https://ai.google.dev/gemini-api/docs/flex-inference
 * - https://ai.google.dev/gemini-api/docs/priority-inference
 */
export const MODEL_PRICING_CATALOG: Record<GeminiImageModelId, ModelPricingSpec> = {
  'gemini-3.1-flash-image': {
    modelId: 'gemini-3.1-flash-image',
    displayName: 'Gemini 3.1 Flash Image (Nano Banana 2)',
    inputTokensPerImage: 1120,
    defaultInputImagesPerRequest: 2, // Isolated product reference + binary mask
    defaultTextPromptTokens: 350,
    supportedResolutions: ['512', '1K', '2K', '4K'],
    outputTokensByResolution: {
      '512': 747,
      '1K': 1120,
      '2K': 1680,
      '4K': 2520,
    },
    tiers: {
      standard: {
        serviceTier: 'standard',
        inputUsdPer1MTokens: 0.5,
        textOutputUsdPer1MTokens: 3.0,
        imageOutputUsdPer1MTokens: 60.0,
        geminiApiSupported: true,
        vertexAiSupported: true,
        notes:
          'Official Standard interactive tier ($0.50/1M input, $60.00/1M image output: $0.04482 @ 512px, $0.0672 @ 1K, $0.1008 @ 2K, $0.1512 @ 4K).',
      },
      batch: {
        serviceTier: 'batch',
        inputUsdPer1MTokens: 0.25,
        textOutputUsdPer1MTokens: 1.5,
        imageOutputUsdPer1MTokens: 30.0,
        geminiApiSupported: true,
        vertexAiSupported: true,
        notes:
          'Official Batch API asynchronous tier (50% discount: $0.25/1M input, $30.00/1M image output: $0.02241 @ 512px, $0.0336 @ 1K, $0.0504 @ 2K, $0.0756 @ 4K).',
      },
      flex: {
        serviceTier: 'flex',
        inputUsdPer1MTokens: 0.25,
        textOutputUsdPer1MTokens: 1.5,
        imageOutputUsdPer1MTokens: 30.0,
        geminiApiSupported: false,
        vertexAiSupported: true,
        notes:
          'Flex Pay-as-you-go (50% discount). Not available for image models on Gemini Developer API (ai.google.dev/gemini-api/docs/flex-inference); available via Vertex AI Flex PayGo.',
      },
      priority: {
        serviceTier: 'priority',
        inputUsdPer1MTokens: 0.9,
        textOutputUsdPer1MTokens: 5.4,
        imageOutputUsdPer1MTokens: 108.0,
        geminiApiSupported: false,
        vertexAiSupported: true,
        notes:
          'Priority Pay-as-you-go (1.8x Standard rate). Not available for image models on Gemini Developer API (ai.google.dev/gemini-api/docs/priority-inference); available via Vertex AI Priority PayGo.',
      },
    },
  },
  'gemini-3.1-flash-lite-image': {
    modelId: 'gemini-3.1-flash-lite-image',
    displayName: 'Gemini 3.1 Flash Lite Image (Nano Banana 2 Lite)',
    inputTokensPerImage: 1120,
    defaultInputImagesPerRequest: 2,
    defaultTextPromptTokens: 350,
    supportedResolutions: ['1K'],
    outputTokensByResolution: {
      '1K': 1120,
    },
    tiers: {
      standard: {
        serviceTier: 'standard',
        inputUsdPer1MTokens: 0.25,
        textOutputUsdPer1MTokens: 1.5,
        imageOutputUsdPer1MTokens: 30.0,
        geminiApiSupported: true,
        vertexAiSupported: true,
        notes:
          'Official Standard interactive tier ($0.25/1M input, $30.00/1M image output: $0.0336 @ 1K). Supports 1K output only.',
      },
      batch: {
        serviceTier: 'batch',
        inputUsdPer1MTokens: 0.125,
        textOutputUsdPer1MTokens: 0.75,
        imageOutputUsdPer1MTokens: 15.0,
        geminiApiSupported: true,
        vertexAiSupported: true,
        notes:
          'Official Batch API asynchronous tier (50% discount: $0.125/1M input, $15.00/1M image output: $0.0168 @ 1K).',
      },
      flex: {
        serviceTier: 'flex',
        inputUsdPer1MTokens: 0.125,
        textOutputUsdPer1MTokens: 0.75,
        imageOutputUsdPer1MTokens: 15.0,
        geminiApiSupported: false,
        vertexAiSupported: true,
        notes:
          'Flex Pay-as-you-go (50% discount). Not available on Gemini Developer API for image models; available via Vertex AI Flex PayGo.',
      },
      priority: {
        serviceTier: 'priority',
        inputUsdPer1MTokens: 0.45,
        textOutputUsdPer1MTokens: 2.7,
        imageOutputUsdPer1MTokens: 54.0,
        geminiApiSupported: false,
        vertexAiSupported: true,
        notes:
          'Priority Pay-as-you-go (1.8x Standard rate). Not available on Gemini Developer API for image models; available via Vertex AI Priority PayGo.',
      },
    },
  },
  'gemini-3-pro-image': {
    modelId: 'gemini-3-pro-image',
    displayName: 'Gemini 3 Pro Image (Nano Banana Pro)',
    inputTokensPerImage: 560,
    defaultInputImagesPerRequest: 2,
    defaultTextPromptTokens: 350,
    supportedResolutions: ['1K', '2K', '4K'],
    outputTokensByResolution: {
      '1K': 1120,
      '2K': 1120,
      '4K': 2000,
    },
    tiers: {
      standard: {
        serviceTier: 'standard',
        inputUsdPer1MTokens: 2.0,
        textOutputUsdPer1MTokens: 12.0,
        imageOutputUsdPer1MTokens: 120.0,
        geminiApiSupported: true,
        vertexAiSupported: true,
        notes:
          'Official Standard interactive tier ($2.00/1M input, 560 tokens/input image, $120.00/1M image output: $0.1344 @ 1K/2K, $0.2400 @ 4K).',
      },
      batch: {
        serviceTier: 'batch',
        inputUsdPer1MTokens: 1.0,
        textOutputUsdPer1MTokens: 6.0,
        imageOutputUsdPer1MTokens: 60.0,
        geminiApiSupported: true,
        vertexAiSupported: true,
        notes:
          'Official Batch API asynchronous tier (50% discount: $1.00/1M input, $60.00/1M image output: $0.0672 @ 1K/2K, $0.1200 @ 4K).',
      },
      flex: {
        serviceTier: 'flex',
        inputUsdPer1MTokens: 1.0,
        textOutputUsdPer1MTokens: 6.0,
        imageOutputUsdPer1MTokens: 60.0,
        geminiApiSupported: false,
        vertexAiSupported: true,
        notes:
          'Flex Pay-as-you-go (50% discount). Not available on Gemini Developer API for image models; available via Vertex AI Flex PayGo.',
      },
      priority: {
        serviceTier: 'priority',
        inputUsdPer1MTokens: 3.6,
        textOutputUsdPer1MTokens: 21.6,
        imageOutputUsdPer1MTokens: 216.0,
        geminiApiSupported: false,
        vertexAiSupported: true,
        notes:
          'Priority Pay-as-you-go (1.8x Standard rate). Not available on Gemini Developer API for image models; available via Vertex AI Priority PayGo.',
      },
    },
  },
};

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export interface CalculateModelCostOptions {
  inputImageCount?: number;
  textInputTokens?: number;
  storageAndDeliveryCostUsd?: number;
  retryAllowanceRate?: number;
}

/**
 * Calculates all 6 required unit-economics cost components for a specific Gemini image model,
 * output resolution, and service tier (`standard`, `batch`, `flex`, `priority`).
 *
 * Strictly enforces model-specific pricing so `gemini-3.1-flash-lite-image`'s $0.0336 price
 * is never conflated with `gemini-3.1-flash-image`'s $0.0672 1K image output price.
 */
export function calculateModelGenerationCost(
  modelId: GeminiImageModelId,
  imageSize: GeminiImageSize = '1K',
  serviceTier: GeminiServiceTier = 'standard',
  options: CalculateModelCostOptions = {}
): GenerationCostBreakdown {
  const spec = MODEL_PRICING_CATALOG[modelId] ?? MODEL_PRICING_CATALOG['gemini-3.1-flash-image'];
  const resolvedSize: GeminiImageSize = spec.supportedResolutions.includes(imageSize)
    ? imageSize
    : spec.supportedResolutions[0];

  const tierPricing = spec.tiers[serviceTier] ?? spec.tiers.standard;
  const inputImageCount = options.inputImageCount ?? spec.defaultInputImagesPerRequest;
  const inputImageTokens = inputImageCount * spec.inputTokensPerImage;
  const textInputTokens = options.textInputTokens ?? spec.defaultTextPromptTokens;
  const outputImageTokens = spec.outputTokensByResolution[resolvedSize] ?? 1120;

  const rawInputImageCostUsd =
    (inputImageTokens / 1_000_000) * tierPricing.inputUsdPer1MTokens;
  const rawTextInputCostUsd =
    (textInputTokens / 1_000_000) * tierPricing.inputUsdPer1MTokens;
  const rawImageOutputCostUsd =
    (outputImageTokens / 1_000_000) * tierPricing.imageOutputUsdPer1MTokens;
  const rawDirectApiCostUsd =
    rawInputImageCostUsd + rawTextInputCostUsd + rawImageOutputCostUsd;

  const retryAllowanceRate =
    options.retryAllowanceRate ?? DEFAULT_RETRY_ALLOWANCE_RATE;
  const storageAndDeliveryCostUsd = round6(
    options.storageAndDeliveryCostUsd ?? STORAGE_AND_DELIVERY_COST_USD
  );

  const inputImageCostUsd = round6(rawInputImageCostUsd);
  const textInputCostUsd = round6(rawTextInputCostUsd);
  const imageOutputCostUsd = round6(rawImageOutputCostUsd);
  const directApiCostUsd = round6(rawDirectApiCostUsd);
  const retryAllowanceUsd = round6(rawDirectApiCostUsd * retryAllowanceRate);

  const actualCostPerSuccessfulImageUsd = round6(
    inputImageCostUsd +
      textInputCostUsd +
      imageOutputCostUsd +
      retryAllowanceUsd +
      storageAndDeliveryCostUsd
  );

  return {
    modelId: spec.modelId,
    imageSize: resolvedSize,
    serviceTier,
    inputImageCount,
    inputImageTokens,
    textInputTokens,
    outputImageTokens,
    inputImageCostUsd,
    textInputCostUsd,
    imageOutputCostUsd,
    directApiCostUsd,
    storageAndDeliveryCostUsd,
    retryAllowanceRate,
    retryAllowanceUsd,
    actualCostPerSuccessfulImageUsd,
  };
}

/**
 * Returns the complete cost breakdown table for every supported model and resolution
 * under the requested service tier.
 */
export function getAllModelResolutionCosts(
  serviceTier: GeminiServiceTier = 'standard'
): GenerationCostBreakdown[] {
  const results: GenerationCostBreakdown[] = [];
  for (const modelId of Object.keys(MODEL_PRICING_CATALOG) as GeminiImageModelId[]) {
    const spec = MODEL_PRICING_CATALOG[modelId];
    for (const imageSize of spec.supportedResolutions) {
      results.push(calculateModelGenerationCost(modelId, imageSize, serviceTier));
    }
  }
  return results;
}

export interface CalculatePlanProfitabilityOptions {
  modelId?: GeminiImageModelId;
  imageSize?: GeminiImageSize;
  serviceTier?: GeminiServiceTier;
  expectedUtilizationRate?: number;
}

/**
 * Calculates regional subscription profitability for Egypt (EGP) and Saudi Arabia (SAR)
 * across both worst-case (100% credit consumption) and expected (65% credit consumption) scenarios.
 */
export function calculatePlanProfitability(
  tier: Exclude<PlanTier, 'FREE'>,
  country: Country,
  options: CalculatePlanProfitabilityOptions = {}
): PlanProfitabilityReport {
  const plan = SUBSCRIPTION_PLANS[tier];
  const modelId = options.modelId ?? plan.defaultModel;
  const imageSize = options.imageSize ?? plan.defaultImageSize;
  const serviceTier = options.serviceTier ?? 'standard';
  const expectedUtilizationRate =
    options.expectedUtilizationRate ?? DEFAULT_EXPECTED_UTILIZATION_RATE;

  const currency: Exclude<Currency, 'USD'> = country === 'SA' ? 'SAR' : 'EGP';
  const fxRatePerUsd = FX_RATES_PER_USD[country];
  const revenueLocal = country === 'SA' ? plan.priceSAR : plan.priceEGP;
  const revenueUsd = round2(revenueLocal / fxRatePerUsd);

  // Paymob fee schedule: Egypt 2.75% + 3.00 EGP; Saudi Arabia 2.50% + 1.00 SAR
  const rawPaymobFeeLocal =
    country === 'SA' ? revenueLocal * 0.025 + 1.0 : revenueLocal * 0.0275 + 3.0;
  const paymobFeeLocal = round2(rawPaymobFeeLocal);

  const costBreakdown = calculateModelGenerationCost(modelId, imageSize, serviceTier);
  const costPerImageUsd = costBreakdown.actualCostPerSuccessfulImageUsd;
  const rawCostPerImageLocal = costPerImageUsd * fxRatePerUsd;
  const costPerImageLocal = round6(rawCostPerImageLocal);

  const worstCaseImages = plan.monthlyCredits;
  const rawWorstCaseCogsLocal = worstCaseImages * rawCostPerImageLocal;
  const rawWorstCaseTotalCostLocal = rawWorstCaseCogsLocal + rawPaymobFeeLocal;
  const rawWorstCaseGrossProfitLocal = revenueLocal - rawWorstCaseTotalCostLocal;

  const worstCaseCogsLocal = round2(rawWorstCaseCogsLocal);
  const worstCaseTotalCostLocal = round2(rawWorstCaseTotalCostLocal);
  const worstCaseGrossProfitLocal = round2(rawWorstCaseGrossProfitLocal);
  const worstCaseGrossMarginPercent = round1(
    (rawWorstCaseGrossProfitLocal / revenueLocal) * 100
  );

  const expectedImages = Math.round(plan.monthlyCredits * expectedUtilizationRate);
  const rawExpectedCogsLocal = expectedImages * rawCostPerImageLocal;
  const rawExpectedTotalCostLocal = rawExpectedCogsLocal + rawPaymobFeeLocal;
  const rawExpectedGrossProfitLocal = revenueLocal - rawExpectedTotalCostLocal;

  const expectedCogsLocal = round2(rawExpectedCogsLocal);
  const expectedTotalCostLocal = round2(rawExpectedTotalCostLocal);
  const expectedGrossProfitLocal = round2(rawExpectedGrossProfitLocal);
  const expectedGrossMarginPercent = round1(
    (rawExpectedGrossProfitLocal / revenueLocal) * 100
  );

  return {
    tier,
    country,
    currency,
    fxRatePerUsd,
    revenueLocal,
    revenueUsd,
    monthlyCredits: plan.monthlyCredits,
    modelId,
    imageSize,
    serviceTier,
    paymobFeeLocal,
    costPerImageUsd,
    costPerImageLocal,
    worstCaseImages,
    worstCaseCogsLocal,
    worstCaseTotalCostLocal,
    worstCaseGrossProfitLocal,
    worstCaseGrossMarginPercent,
    expectedUtilizationRate,
    expectedImages,
    expectedCogsLocal,
    expectedTotalCostLocal,
    expectedGrossProfitLocal,
    expectedGrossMarginPercent,
  };
}

export function getCreditWeightForGeneration(
  modelId: GeminiImageModelId,
  imageSize: GeminiImageSize = '1K'
): number {
  const spec =
    MODEL_PRICING_CATALOG[modelId] ??
    MODEL_PRICING_CATALOG['gemini-3.1-flash-image'];
  const resolvedSize: GeminiImageSize = spec.supportedResolutions.includes(
    imageSize
  )
    ? imageSize
    : spec.supportedResolutions[0];

  if (modelId === 'gemini-3-pro-image') {
    return resolvedSize === '4K' ? 4 : 2;
  }
  if (modelId === 'gemini-3.1-flash-image') {
    if (resolvedSize === '4K') return 3;
    if (resolvedSize === '2K') return 2;
    return 1;
  }
  return 1;
}

const IMAGE_SIZE_RANK: Record<GeminiImageSize, number> = {
  '512': 0,
  '1K': 1,
  '2K': 2,
  '4K': 3,
};

export function validatePlanModelEntitlement(
  planTier: PlanTier,
  modelId: GeminiImageModelId,
  imageSize: GeminiImageSize
): { allowed: boolean; reason?: string } {
  const plan = SUBSCRIPTION_PLANS[planTier] ?? SUBSCRIPTION_PLANS.FREE;
  if (!plan.allowedModels.includes(modelId)) {
    return {
      allowed: false,
      reason: `FORBIDDEN: Plan ${planTier} does not include model "${modelId}". Upgrade to Pro or Agency to access this model.`,
    };
  }
  if (IMAGE_SIZE_RANK[imageSize] > IMAGE_SIZE_RANK[plan.maxImageSize]) {
    return {
      allowed: false,
      reason: `FORBIDDEN: Plan ${planTier} supports up to ${plan.maxImageSize} resolution (${imageSize} requested). Upgrade to Pro or Agency for 4K exports.`,
    };
  }
  return { allowed: true };
}

/**
 * Generates the 6-row regional profitability matrix (EG & SA x STARTER, PRO, AGENCY).
 */
export function getAllPlansProfitabilityMatrix(
  options: CalculatePlanProfitabilityOptions = {}
): PlanProfitabilityReport[] {
  const countries: Country[] = ['EG', 'SA'];
  const paidTiers: Array<Exclude<PlanTier, 'FREE'>> = ['STARTER', 'PRO', 'AGENCY'];
  const reports: PlanProfitabilityReport[] = [];

  for (const country of countries) {
    for (const tier of paidTiers) {
      reports.push(calculatePlanProfitability(tier, country, options));
    }
  }
  return reports;
}

/**
 * Calculates actual generation cost in micro-dollars ($1 USD = 1,000,000 micros)
 * based on actual returned token usage and model resolution catalog rates.
 */
export function calculateActualGenerationCostUsdMicros(
  modelId: GeminiImageModelId,
  usage?: { inputTokens?: number; outputTokens?: number; thoughtTokens?: number },
  imageSize: GeminiImageSize = '1K',
  serviceTier: GeminiServiceTier = 'standard'
): number {
  const spec = MODEL_PRICING_CATALOG[modelId] ?? MODEL_PRICING_CATALOG['gemini-3.1-flash-image'];
  const tierPricing = spec.tiers[serviceTier] ?? spec.tiers.standard;

  const inTokens = usage?.inputTokens ?? spec.inputTokensPerImage * 2;
  const outTokens = usage?.outputTokens ?? spec.outputTokensByResolution[imageSize] ?? 1120;

  const inputCost = (inTokens / 1_000_000) * tierPricing.inputUsdPer1MTokens;
  const outputCost = (outTokens / 1_000_000) * tierPricing.imageOutputUsdPer1MTokens;
  const totalCostUsd = inputCost + outputCost + STORAGE_AND_DELIVERY_COST_USD;

  return Math.round(totalCostUsd * 1_000_000);
}
