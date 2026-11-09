import type { Country, Currency, GeminiImageModelId, GeminiImageSize, GeminiServiceTier, PlanTier } from '../types/index.ts';
import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from './plans.ts';
import { calculateModelGenerationCost } from './model-costs.ts';

export interface FxRateEntry {
  rate: number;
  currency: Exclude<Currency, 'USD'>;
  source: string;
  lastVerifiedDate: string;
}

export const FX_RATES: Record<Country, FxRateEntry> = {
  EG: {
    rate: 50.0,
    currency: 'EGP',
    source: 'Central Bank of Egypt / Market Benchmark Reference Rate',
    lastVerifiedDate: '2026-11-09',
  },
  SA: {
    rate: 3.75,
    currency: 'SAR',
    source: 'Saudi Central Bank (SAMA) Official Fixed Peg (USD/SAR)',
    lastVerifiedDate: '2026-11-09',
  },
};

export const FX_RATES_PER_USD: Record<Country, number> = {
  EG: FX_RATES.EG.rate,
  SA: FX_RATES.SA.rate,
};

export type PaymobPaymentMethod = 'card' | 'wallet' | 'meeza' | 'mada' | 'applePay';

export interface PaymobMethodRate {
  percentage: number;
  fixedSubunitsOrAmount: number;
  currency: Exclude<Currency, 'USD'>;
  name: string;
}

export interface PaymobRegionSchedule {
  default: {
    percentage: number;
    fixedSubunitsOrAmount: number;
    currency: Exclude<Currency, 'USD'>;
  };
  methods: Record<string, PaymobMethodRate>;
}

export const PAYMOB_FEE_SCHEDULE: Record<Country, PaymobRegionSchedule> = {
  EG: {
    default: {
      percentage: 0.0275,
      fixedSubunitsOrAmount: 3.0,
      currency: 'EGP',
    },
    methods: {
      card: {
        percentage: 0.0275,
        fixedSubunitsOrAmount: 3.0,
        currency: 'EGP',
        name: 'Credit / Debit Cards (Visa / Mastercard)',
      },
      wallet: {
        percentage: 0.02,
        fixedSubunitsOrAmount: 2.0,
        currency: 'EGP',
        name: 'Mobile Wallets (Vodafone Cash, Orange, Etisalat, WE)',
      },
      meeza: {
        percentage: 0.0275,
        fixedSubunitsOrAmount: 3.0,
        currency: 'EGP',
        name: 'Meeza National Debit Cards',
      },
    },
  },
  SA: {
    default: {
      percentage: 0.025,
      fixedSubunitsOrAmount: 1.0,
      currency: 'SAR',
    },
    methods: {
      mada: {
        percentage: 0.01,
        fixedSubunitsOrAmount: 1.0,
        currency: 'SAR',
        name: 'Mada Domestic Debit Cards',
      },
      card: {
        percentage: 0.027,
        fixedSubunitsOrAmount: 1.0,
        currency: 'SAR',
        name: 'Visa / Mastercard International Cards',
      },
      applePay: {
        percentage: 0.027,
        fixedSubunitsOrAmount: 1.0,
        currency: 'SAR',
        name: 'Apple Pay (via Card/Mada Network)',
      },
    },
  },
};

export interface VatConfigEntry {
  rate: number;
  name: string;
  pricesIncludeVat: boolean;
}

export const VAT_CONFIG: Record<Country, VatConfigEntry> = {
  EG: {
    rate: 0.14,
    name: 'Egyptian Value Added Tax (VAT 14%)',
    pricesIncludeVat: true,
  },
  SA: {
    rate: 0.15,
    name: 'Saudi Value Added Tax (VAT 15%)',
    pricesIncludeVat: true,
  },
};

export const INFRA_COST_ESTIMATES = {
  cloudflareR2: {
    storagePerGbMonthUsd: 0.015,
    egressPerGbUsd: 0.0,
    estimatedPerImageUsd: 0.0005,
  },
  vercel: {
    plan: 'Pro',
    monthlyCostUsd: 20.0,
  },
  neonPostgres: {
    plan: 'Launch / Free Tier',
    monthlyCostUsd: 0.0,
  },
  resend: {
    plan: 'Free Tier (3,000 emails/mo)',
    monthlyCostUsd: 0.0,
  },
  sentry: {
    plan: 'Developer Free',
    monthlyCostUsd: 0.0,
  },
};

export const STORAGE_AND_DELIVERY_COST_USD = INFRA_COST_ESTIMATES.cloudflareR2.estimatedPerImageUsd;
export const DEFAULT_RETRY_ALLOWANCE_RATE = 0.03;
export const DEFAULT_EXPECTED_UTILIZATION_RATE = 0.65;

export const UTILIZATION_SCENARIOS = {
  CONSERVATIVE: 0.4,
  EXPECTED: 0.65,
  WORST_CASE: 1.0,
} as const;

export const MARGIN_GUARDRAILS = {
  TARGET_WORST_CASE_MARGIN_PERCENT: 25.0,
  TARGET_EXPECTED_MARGIN_PERCENT: 50.0,
} as const;

export const FINANCIAL_CONFIG = {
  fxRates: FX_RATES,
  paymobFees: PAYMOB_FEE_SCHEDULE,
  vat: VAT_CONFIG,
  infra: INFRA_COST_ESTIMATES,
  utilization: UTILIZATION_SCENARIOS,
  guardrails: MARGIN_GUARDRAILS,
};

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function round6(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
}

export function calculatePaymobFee(
  amountLocal: number,
  country: Country,
  method?: PaymobPaymentMethod
): number {
  const schedule = PAYMOB_FEE_SCHEDULE[country];
  if (!schedule) {
    return round2(amountLocal * 0.0275 + 3.0);
  }

  if (method && schedule.methods[method]) {
    const rate = schedule.methods[method];
    return round2(amountLocal * rate.percentage + rate.fixedSubunitsOrAmount);
  }

  return round2(amountLocal * schedule.default.percentage + schedule.default.fixedSubunitsOrAmount);
}

export interface TopUpProfitabilityReport {
  packId: string;
  country: Country;
  currency: Exclude<Currency, 'USD'>;
  credits: number;
  priceLocal: number;
  priceUsd: number;
  fxRatePerUsd: number;
  paymobFeeLocal: number;
  costPerImageUsd: number;
  costPerImageLocal: number;
  worstCaseImages: number;
  worstCaseCogsLocal: number;
  worstCaseTotalCostLocal: number;
  worstCaseGrossProfitLocal: number;
  worstCaseGrossMarginPercent: number;
  expectedImages: number;
  expectedCogsLocal: number;
  expectedTotalCostLocal: number;
  expectedGrossProfitLocal: number;
  expectedGrossMarginPercent: number;
}

export function calculateTopUpProfitability(
  packId: string,
  country: Country,
  options: {
    modelId?: GeminiImageModelId;
    imageSize?: GeminiImageSize;
    serviceTier?: GeminiServiceTier;
    paymobMethod?: PaymobPaymentMethod;
    expectedUtilizationRate?: number;
    fxRateOverride?: number;
  } = {}
): TopUpProfitabilityReport {
  const pack = TOP_UP_PACKS.find((p) => p.id === packId);
  if (!pack) {
    throw new Error(`Top-up pack not found: ${packId}`);
  }

  const modelId = options.modelId ?? 'gemini-3.1-flash-image';
  const imageSize = options.imageSize ?? '1K';
  const serviceTier = options.serviceTier ?? 'standard';
  const expectedUtilizationRate = options.expectedUtilizationRate ?? UTILIZATION_SCENARIOS.EXPECTED;

  const currency: Exclude<Currency, 'USD'> = country === 'SA' ? 'SAR' : 'EGP';
  const fxRatePerUsd = options.fxRateOverride ?? FX_RATES_PER_USD[country];
  const priceLocal = country === 'SA' ? pack.priceSAR : pack.priceEGP;
  const priceUsd = round2(priceLocal / fxRatePerUsd);

  const paymobFeeLocal = calculatePaymobFee(priceLocal, country, options.paymobMethod);

  const costBreakdown = calculateModelGenerationCost(modelId, imageSize, serviceTier);
  const costPerImageUsd = costBreakdown.actualCostPerSuccessfulImageUsd;
  const rawCostPerImageLocal = costPerImageUsd * fxRatePerUsd;
  const costPerImageLocal = round6(rawCostPerImageLocal);

  const worstCaseImages = pack.credits;
  const rawWorstCaseCogsLocal = worstCaseImages * rawCostPerImageLocal;
  const rawWorstCaseTotalCostLocal = rawWorstCaseCogsLocal + paymobFeeLocal;
  const rawWorstCaseGrossProfitLocal = priceLocal - rawWorstCaseTotalCostLocal;

  const worstCaseCogsLocal = round2(rawWorstCaseCogsLocal);
  const worstCaseTotalCostLocal = round2(rawWorstCaseTotalCostLocal);
  const worstCaseGrossProfitLocal = round2(rawWorstCaseGrossProfitLocal);
  const worstCaseGrossMarginPercent = round1((rawWorstCaseGrossProfitLocal / priceLocal) * 100);

  const expectedImages = Math.round(pack.credits * expectedUtilizationRate);
  const rawExpectedCogsLocal = expectedImages * rawCostPerImageLocal;
  const rawExpectedTotalCostLocal = rawExpectedCogsLocal + paymobFeeLocal;
  const rawExpectedGrossProfitLocal = priceLocal - rawExpectedTotalCostLocal;

  const expectedCogsLocal = round2(rawExpectedCogsLocal);
  const expectedTotalCostLocal = round2(rawExpectedTotalCostLocal);
  const expectedGrossProfitLocal = round2(rawExpectedGrossProfitLocal);
  const expectedGrossMarginPercent = round1((rawExpectedGrossProfitLocal / priceLocal) * 100);

  return {
    packId: pack.id,
    country,
    currency,
    credits: pack.credits,
    priceLocal,
    priceUsd,
    fxRatePerUsd,
    paymobFeeLocal,
    costPerImageUsd,
    costPerImageLocal,
    worstCaseImages,
    worstCaseCogsLocal,
    worstCaseTotalCostLocal,
    worstCaseGrossProfitLocal,
    worstCaseGrossMarginPercent,
    expectedImages,
    expectedCogsLocal,
    expectedTotalCostLocal,
    expectedGrossProfitLocal,
    expectedGrossMarginPercent,
  };
}

export interface GuardrailViolation {
  type: 'plan' | 'top_up';
  id: string;
  country: Country;
  worstCaseMarginPercent: number;
  expectedMarginPercent: number;
  thresholdWorstCase: number;
  thresholdExpected: number;
  reason: string;
}

export interface FinancialGuardrailReport {
  passed: boolean;
  violations: GuardrailViolation[];
  warnings: string[];
  summary: string;
}

export function checkFinancialGuardrails(
  options: {
    targetWorstCaseMargin?: number;
    targetExpectedMargin?: number;
  } = {}
): FinancialGuardrailReport {
  const targetWorstCase = options.targetWorstCaseMargin ?? MARGIN_GUARDRAILS.TARGET_WORST_CASE_MARGIN_PERCENT;
  const targetExpected = options.targetExpectedMargin ?? MARGIN_GUARDRAILS.TARGET_EXPECTED_MARGIN_PERCENT;

  const violations: GuardrailViolation[] = [];
  const warnings: string[] = [];

  const paidTiers: Array<Exclude<PlanTier, 'FREE'>> = ['STARTER', 'PRO', 'AGENCY'];
  const countries: Country[] = ['EG', 'SA'];

  // Check subscription plans
  for (const country of countries) {
    for (const tier of paidTiers) {
      const plan = SUBSCRIPTION_PLANS[tier];
      const fxRate = FX_RATES_PER_USD[country];
      const revenueLocal = country === 'SA' ? plan.priceSAR : plan.priceEGP;
      const paymobFee = calculatePaymobFee(revenueLocal, country);

      const costBreakdown = calculateModelGenerationCost(plan.defaultModel, plan.defaultImageSize);
      const costPerImageLocal = costBreakdown.actualCostPerSuccessfulImageUsd * fxRate;

      const worstCaseCost = plan.monthlyCredits * costPerImageLocal + paymobFee;
      const worstCaseMargin = round1(((revenueLocal - worstCaseCost) / revenueLocal) * 100);

      const expectedCredits = Math.round(plan.monthlyCredits * UTILIZATION_SCENARIOS.EXPECTED);
      const expectedCost = expectedCredits * costPerImageLocal + paymobFee;
      const expectedMargin = round1(((revenueLocal - expectedCost) / revenueLocal) * 100);

      if (worstCaseMargin < targetWorstCase) {
        violations.push({
          type: 'plan',
          id: tier,
          country,
          worstCaseMarginPercent: worstCaseMargin,
          expectedMarginPercent: expectedMargin,
          thresholdWorstCase: targetWorstCase,
          thresholdExpected: targetExpected,
          reason: `Plan ${tier} in ${country} has worst-case margin ${worstCaseMargin}% below threshold ${targetWorstCase}%.`,
        });
      }
    }
  }

  // Check top-up packs
  for (const country of countries) {
    for (const pack of TOP_UP_PACKS) {
      const report = calculateTopUpProfitability(pack.id, country);
      if (report.worstCaseGrossMarginPercent < targetWorstCase) {
        violations.push({
          type: 'top_up',
          id: pack.id,
          country,
          worstCaseMarginPercent: report.worstCaseGrossMarginPercent,
          expectedMarginPercent: report.expectedGrossMarginPercent,
          thresholdWorstCase: targetWorstCase,
          thresholdExpected: targetExpected,
          reason: `Top-up pack ${pack.id} in ${country} has worst-case margin ${report.worstCaseGrossMarginPercent}% below threshold ${targetWorstCase}%.`,
        });
      }
    }
  }

  if (violations.length > 0) {
    warnings.push(
      `Detected ${violations.length} offers below target worst-case margin of ${targetWorstCase}%. Detailed founder review required prior to live beta launch.`
    );
  }

  return {
    passed: violations.length === 0,
    violations,
    warnings,
    summary: violations.length === 0
      ? 'All plans and top-up packages meet or exceed financial margin guardrails.'
      : `${violations.length} offers violate margin guardrails (primarily high-volume Egyptian Pound packages).`,
  };
}

export function runFxSensitivityAnalysis(
  tier: Exclude<PlanTier, 'FREE'>,
  country: Country,
  simulatedFxRate: number,
  options: {
    modelId?: GeminiImageModelId;
    imageSize?: GeminiImageSize;
    serviceTier?: GeminiServiceTier;
    expectedUtilizationRate?: number;
  } = {}
) {
  const plan = SUBSCRIPTION_PLANS[tier];
  const modelId = options.modelId ?? plan.defaultModel;
  const imageSize = options.imageSize ?? plan.defaultImageSize;
  const serviceTier = options.serviceTier ?? 'standard';
  const expectedUtilizationRate = options.expectedUtilizationRate ?? UTILIZATION_SCENARIOS.EXPECTED;

  const currency: Exclude<Currency, 'USD'> = country === 'SA' ? 'SAR' : 'EGP';
  const revenueLocal = country === 'SA' ? plan.priceSAR : plan.priceEGP;
  const revenueUsd = round2(revenueLocal / simulatedFxRate);

  const paymobFeeLocal = calculatePaymobFee(revenueLocal, country);

  const costBreakdown = calculateModelGenerationCost(modelId, imageSize, serviceTier);
  const costPerImageUsd = costBreakdown.actualCostPerSuccessfulImageUsd;
  const rawCostPerImageLocal = costPerImageUsd * simulatedFxRate;
  const costPerImageLocal = round6(rawCostPerImageLocal);

  const worstCaseImages = plan.monthlyCredits;
  const rawWorstCaseCogsLocal = worstCaseImages * rawCostPerImageLocal;
  const rawWorstCaseTotalCostLocal = rawWorstCaseCogsLocal + paymobFeeLocal;
  const rawWorstCaseGrossProfitLocal = revenueLocal - rawWorstCaseTotalCostLocal;

  const worstCaseCogsLocal = round2(rawWorstCaseCogsLocal);
  const worstCaseTotalCostLocal = round2(rawWorstCaseTotalCostLocal);
  const worstCaseGrossProfitLocal = round2(rawWorstCaseGrossProfitLocal);
  const worstCaseGrossMarginPercent = round1((rawWorstCaseGrossProfitLocal / revenueLocal) * 100);

  const expectedImages = Math.round(plan.monthlyCredits * expectedUtilizationRate);
  const rawExpectedCogsLocal = expectedImages * rawCostPerImageLocal;
  const rawExpectedTotalCostLocal = rawExpectedCogsLocal + paymobFeeLocal;
  const rawExpectedGrossProfitLocal = revenueLocal - rawExpectedTotalCostLocal;

  const expectedCogsLocal = round2(rawExpectedCogsLocal);
  const expectedTotalCostLocal = round2(rawExpectedTotalCostLocal);
  const expectedGrossProfitLocal = round2(rawExpectedGrossProfitLocal);
  const expectedGrossMarginPercent = round1((rawExpectedGrossProfitLocal / revenueLocal) * 100);

  return {
    tier,
    country,
    currency,
    fxRatePerUsd: simulatedFxRate,
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

