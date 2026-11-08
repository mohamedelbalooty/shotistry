import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBSCRIPTION_PLANS,
  TOP_UP_PACKS,
  getPriceForCountry,
  formatCurrency,
} from '../src/lib/pricing/plans.ts';
import {
  MODEL_PRICING_CATALOG,
  calculateModelGenerationCost,
  getAllModelResolutionCosts,
  calculatePlanProfitability,
  getAllPlansProfitabilityMatrix,
  getCreditWeightForGeneration,
} from '../src/lib/pricing/model-costs.ts';
import { DEFAULT_GEMINI_IMAGE_MODEL } from '../src/lib/ai/prompt-synthesizer.ts';

describe('Pricing, Centralized Model-Specific Cost Configuration & Plan Profitability Tests', () => {
  it('should have correct pricing and model configuration for every subscription plan', () => {
    assert.equal(DEFAULT_GEMINI_IMAGE_MODEL, 'gemini-3.1-flash-image');

    const free = SUBSCRIPTION_PLANS.FREE;
    assert.equal(free.monthlyCredits, 5);
    assert.equal(free.defaultModel, 'gemini-3.1-flash-image');
    assert.equal(free.defaultImageSize, '1K');
    assert.equal(free.maxImageSize, '1K');
    assert.deepEqual(free.allowedModels, [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
    ]);

    const starter = SUBSCRIPTION_PLANS.STARTER;
    assert.equal(starter.priceEGP, 349);
    assert.equal(starter.priceSAR, 79);
    assert.equal(starter.monthlyCredits, 80);
    assert.equal(starter.resolution, 'HD');
    assert.equal(starter.defaultModel, 'gemini-3.1-flash-image');
    assert.equal(starter.defaultImageSize, '1K');
    assert.equal(starter.maxImageSize, '1K');
    assert.deepEqual(starter.allowedModels, [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
    ]);

    const pro = SUBSCRIPTION_PLANS.PRO;
    assert.equal(pro.priceEGP, 899);
    assert.equal(pro.priceSAR, 189);
    assert.equal(pro.monthlyCredits, 200);
    assert.equal(pro.resolution, '4K');
    assert.equal(pro.priorityQueue, true);
    assert.equal(pro.defaultModel, 'gemini-3.1-flash-image');
    assert.equal(pro.defaultImageSize, '1K');
    assert.equal(pro.maxImageSize, '4K');
    assert.deepEqual(pro.allowedModels, [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
    ]);

    const agency = SUBSCRIPTION_PLANS.AGENCY;
    assert.equal(agency.priceEGP, 1899);
    assert.equal(agency.priceSAR, 399);
    assert.equal(agency.monthlyCredits, 500);
    assert.equal(agency.resolution, '4K');
    assert.equal(agency.defaultModel, 'gemini-3.1-flash-image');
    assert.equal(agency.defaultImageSize, '1K');
    assert.equal(agency.maxImageSize, '4K');
    assert.deepEqual(agency.allowedModels, [
      'gemini-3.1-flash-image',
      'gemini-3.1-flash-lite-image',
      'gemini-3-pro-image',
    ]);
  });

  it('never uses Lite model price ($0.0336) for standard gemini-3.1-flash-image COGS', () => {
    const flash1k = calculateModelGenerationCost('gemini-3.1-flash-image', '1K', 'standard');
    const lite1k = calculateModelGenerationCost('gemini-3.1-flash-lite-image', '1K', 'standard');

    // Lite 1K output is $30/1M * 1120 = $0.0336
    assert.equal(lite1k.imageOutputCostUsd, 0.0336);
    assert.equal(lite1k.inputImageCostUsd, 0.00056); // 2 * 1120 * $0.25/1M
    assert.equal(lite1k.textInputCostUsd, 0.000088); // 350 * $0.25/1M rounded to 6 decimals
    assert.equal(lite1k.storageAndDeliveryCostUsd, 0.0005);
    assert.equal(lite1k.retryAllowanceUsd, 0.001027);
    assert.equal(lite1k.actualCostPerSuccessfulImageUsd, 0.035775);

    // Standard Flash 1K output is $60/1M * 1120 = $0.0672 (2x Lite!)
    assert.notEqual(
      flash1k.imageOutputCostUsd,
      0.0336,
      'Standard Flash 1K must NEVER use Lite $0.0336 output price'
    );
    assert.equal(flash1k.imageOutputCostUsd, 0.0672);
    assert.equal(flash1k.inputImageCostUsd, 0.00112); // 2 * 1120 * $0.50/1M
    assert.equal(flash1k.textInputCostUsd, 0.000175); // 350 * $0.50/1M
    assert.equal(flash1k.storageAndDeliveryCostUsd, 0.0005);
    assert.equal(flash1k.retryAllowanceUsd, 0.002055); // 3% of $0.068495
    assert.equal(flash1k.actualCostPerSuccessfulImageUsd, 0.07105);
  });

  it('calculates all 6 cost components for every supported model and resolution (512, 1K, 2K, 4K)', () => {
    const allStandard = getAllModelResolutionCosts('standard');
    // gemini-3.1-flash-image (4 sizes: 512, 1K, 2K, 4K) + gemini-3.1-flash-lite-image (1K) + gemini-3-pro-image (1K, 2K, 4K) = 8 entries
    assert.equal(allStandard.length, 8);

    // 1. gemini-3.1-flash-image @ 512 (747 output tokens @ $60/1M = $0.04482)
    const flash512 = calculateModelGenerationCost('gemini-3.1-flash-image', '512', 'standard');
    assert.equal(flash512.outputImageTokens, 747);
    assert.equal(flash512.imageOutputCostUsd, 0.04482);
    assert.equal(flash512.inputImageCostUsd, 0.00112);
    assert.equal(flash512.textInputCostUsd, 0.000175);
    assert.equal(flash512.storageAndDeliveryCostUsd, 0.0005);
    assert.equal(flash512.retryAllowanceUsd, 0.001383);
    assert.equal(flash512.actualCostPerSuccessfulImageUsd, 0.047998);

    // 2. gemini-3.1-flash-image @ 2K (1680 output tokens @ $60/1M = $0.1008)
    const flash2k = calculateModelGenerationCost('gemini-3.1-flash-image', '2K', 'standard');
    assert.equal(flash2k.outputImageTokens, 1680);
    assert.equal(flash2k.imageOutputCostUsd, 0.1008);
    assert.equal(flash2k.actualCostPerSuccessfulImageUsd, 0.105658);

    // 3. gemini-3.1-flash-image @ 4K (2520 output tokens @ $60/1M = $0.1512)
    const flash4k = calculateModelGenerationCost('gemini-3.1-flash-image', '4K', 'standard');
    assert.equal(flash4k.outputImageTokens, 2520);
    assert.equal(flash4k.imageOutputCostUsd, 0.1512);
    assert.equal(flash4k.actualCostPerSuccessfulImageUsd, 0.15757);

    // 4. gemini-3-pro-image @ 1K & 2K (560 tokens/input image, 1120 output tokens @ $120/1M = $0.1344)
    const pro1k = calculateModelGenerationCost('gemini-3-pro-image', '1K', 'standard');
    const pro2k = calculateModelGenerationCost('gemini-3-pro-image', '2K', 'standard');
    assert.equal(pro1k.inputImageTokens, 1120); // 2 * 560 tokens
    assert.equal(pro1k.inputImageCostUsd, 0.00224); // 1120 * $2.00/1M
    assert.equal(pro1k.textInputCostUsd, 0.0007); // 350 * $2.00/1M
    assert.equal(pro1k.imageOutputCostUsd, 0.1344);
    assert.equal(pro1k.retryAllowanceUsd, 0.00412);
    assert.equal(pro1k.actualCostPerSuccessfulImageUsd, 0.14196);
    assert.equal(pro2k.actualCostPerSuccessfulImageUsd, 0.14196);

    // 5. gemini-3-pro-image @ 4K (2000 output tokens @ $120/1M = $0.2400)
    const pro4k = calculateModelGenerationCost('gemini-3-pro-image', '4K', 'standard');
    assert.equal(pro4k.outputImageTokens, 2000);
    assert.equal(pro4k.imageOutputCostUsd, 0.24);
    assert.equal(pro4k.retryAllowanceUsd, 0.007288);
    assert.equal(pro4k.actualCostPerSuccessfulImageUsd, 0.250728);
  });

  it('separates standard, batch, flex, and priority pricing and platform support flags', () => {
    const flashStd = calculateModelGenerationCost('gemini-3.1-flash-image', '1K', 'standard');
    const flashBatch = calculateModelGenerationCost('gemini-3.1-flash-image', '1K', 'batch');
    const flashFlex = calculateModelGenerationCost('gemini-3.1-flash-image', '1K', 'flex');
    const flashPriority = calculateModelGenerationCost('gemini-3.1-flash-image', '1K', 'priority');

    assert.equal(flashStd.imageOutputCostUsd, 0.0672);
    assert.equal(flashBatch.imageOutputCostUsd, 0.0336); // 50% batch discount
    assert.equal(flashFlex.imageOutputCostUsd, 0.0336); // 50% flex discount (Vertex AI Flex PayGo)
    assert.equal(flashPriority.imageOutputCostUsd, 0.12096); // 1.8x priority rate (Vertex AI Priority PayGo)

    assert.equal(
      MODEL_PRICING_CATALOG['gemini-3.1-flash-image'].tiers.standard.geminiApiSupported,
      true
    );
    assert.equal(
      MODEL_PRICING_CATALOG['gemini-3.1-flash-image'].tiers.batch.geminiApiSupported,
      true
    );
    assert.equal(
      MODEL_PRICING_CATALOG['gemini-3.1-flash-image'].tiers.flex.geminiApiSupported,
      false
    );
    assert.equal(
      MODEL_PRICING_CATALOG['gemini-3.1-flash-image'].tiers.flex.vertexAiSupported,
      true
    );
    assert.equal(
      MODEL_PRICING_CATALOG['gemini-3.1-flash-image'].tiers.priority.geminiApiSupported,
      false
    );
    assert.equal(
      MODEL_PRICING_CATALOG['gemini-3.1-flash-image'].tiers.priority.vertexAiSupported,
      true
    );

    const liteBatch = calculateModelGenerationCost('gemini-3.1-flash-lite-image', '1K', 'batch');
    assert.equal(liteBatch.imageOutputCostUsd, 0.0168);
  });

  it('recalculates Egypt (EGP) and Saudi Arabia (SAR) subscription profitability for worst-case (100%) and expected (65%) consumption', () => {
    // Egypt Starter: 349 EGP, 80 credits, default model gemini-3.1-flash-image @ 1K ($0.07105 = 3.5525 EGP @ 50 EGP/USD)
    const egStarter = calculatePlanProfitability('STARTER', 'EG');
    assert.equal(egStarter.revenueLocal, 349);
    assert.equal(egStarter.currency, 'EGP');
    assert.equal(egStarter.paymobFeeLocal, 12.6); // 349 * 0.0275 + 3.00 = 12.5975 -> 12.60
    assert.equal(egStarter.worstCaseImages, 80);
    assert.equal(egStarter.expectedImages, 52);
    assert.equal(egStarter.worstCaseCogsLocal, 284.2); // 80 * 3.5525
    assert.equal(egStarter.worstCaseGrossMarginPercent, 15.0);
    assert.equal(egStarter.expectedGrossMarginPercent, 43.5);

    // Egypt Pro: 899 EGP, 200 credits
    const egPro = calculatePlanProfitability('PRO', 'EG');
    assert.equal(egPro.revenueLocal, 899);
    assert.equal(egPro.paymobFeeLocal, 27.72);
    assert.equal(egPro.worstCaseGrossMarginPercent, 17.9);
    assert.equal(egPro.expectedGrossMarginPercent, 45.5);

    // Egypt Agency: 1899 EGP, 500 credits
    const egAgency = calculatePlanProfitability('AGENCY', 'EG');
    assert.equal(egAgency.revenueLocal, 1899);
    assert.equal(egAgency.paymobFeeLocal, 55.22);
    assert.equal(egAgency.worstCaseGrossMarginPercent, 3.6);
    assert.equal(egAgency.expectedGrossMarginPercent, 36.3);

    // Saudi Starter: 79 SAR, 80 credits ($0.07105 * 3.75 = 0.2664375 SAR/image)
    const saStarter = calculatePlanProfitability('STARTER', 'SA');
    assert.equal(saStarter.revenueLocal, 79);
    assert.equal(saStarter.currency, 'SAR');
    assert.equal(saStarter.paymobFeeLocal, 2.98); // 79 * 0.025 + 1.00 = 2.975 -> 2.98
    assert.equal(saStarter.worstCaseGrossMarginPercent, 69.3);
    assert.equal(saStarter.expectedGrossMarginPercent, 78.7);

    // Saudi Pro: 189 SAR, 200 credits
    const saPro = calculatePlanProfitability('PRO', 'SA');
    assert.equal(saPro.revenueLocal, 189);
    assert.equal(saPro.paymobFeeLocal, 5.73);
    assert.equal(saPro.worstCaseGrossMarginPercent, 68.8);
    assert.equal(saPro.expectedGrossMarginPercent, 78.6);

    // Saudi Agency: 399 SAR, 500 credits
    const saAgency = calculatePlanProfitability('AGENCY', 'SA');
    assert.equal(saAgency.revenueLocal, 399);
    assert.equal(saAgency.paymobFeeLocal, 10.98);
    assert.equal(saAgency.worstCaseGrossMarginPercent, 63.9);
    assert.equal(saAgency.expectedGrossMarginPercent, 75.5);

    const matrix = getAllPlansProfitabilityMatrix();
    assert.equal(matrix.length, 6);
  });

  it('should format currency correctly in Arabic and English locales and return country pricing', () => {
    const egpAr = formatCurrency(899, 'EGP', 'ar');
    assert.ok(egpAr.includes('ج.م'));

    const sarAr = formatCurrency(189, 'SAR', 'ar');
    assert.ok(sarAr.includes('ر.س'));

    const sarEn = formatCurrency(189, 'SAR', 'en');
    assert.ok(sarEn.includes('SAR'));

    const priceEg = getPriceForCountry('PRO', 'EG');
    assert.equal(priceEg.currency, 'EGP');
    assert.equal(priceEg.amount, 899);

    const priceSa = getPriceForCountry('PRO', 'SA');
    assert.equal(priceSa.currency, 'SAR');
    assert.equal(priceSa.amount, 189);
  });

  it('should have 3 non-expiring top-up packs with volume discounts', () => {
    assert.equal(TOP_UP_PACKS.length, 3);
    assert.equal(TOP_UP_PACKS[0].credits, 50);
    assert.equal(TOP_UP_PACKS[1].credits, 150);
    assert.equal(TOP_UP_PACKS[2].credits, 500);

    const pricePerCredit50 = TOP_UP_PACKS[0].priceSAR / TOP_UP_PACKS[0].credits;
    const pricePerCredit500 = TOP_UP_PACKS[2].priceSAR / TOP_UP_PACKS[2].credits;
    assert.ok(pricePerCredit500 < pricePerCredit50);
  });

  it('assigns credit weights per model & resolution so Pro 2K/4K never erodes Egypt or Saudi gross margins', () => {
    assert.equal(getCreditWeightForGeneration('gemini-3.1-flash-lite-image', '1K'), 1);
    assert.equal(getCreditWeightForGeneration('gemini-3.1-flash-image', '512'), 1);
    assert.equal(getCreditWeightForGeneration('gemini-3.1-flash-image', '1K'), 1);
    assert.equal(getCreditWeightForGeneration('gemini-3.1-flash-image', '2K'), 2);
    assert.equal(getCreditWeightForGeneration('gemini-3.1-flash-image', '4K'), 3);
    assert.equal(getCreditWeightForGeneration('gemini-3-pro-image', '1K'), 2);
    assert.equal(getCreditWeightForGeneration('gemini-3-pro-image', '2K'), 2);
    assert.equal(getCreditWeightForGeneration('gemini-3-pro-image', '4K'), 4);

    // Verify worst-case COGS per credit on Egypt Agency (3.80 EGP/credit) remains <= 1K Flash COGS ($0.07105 = 3.5525 EGP)
    const pro4k = calculateModelGenerationCost('gemini-3-pro-image', '4K', 'standard');
    const pro4kPerCreditUsd = pro4k.actualCostPerSuccessfulImageUsd / getCreditWeightForGeneration('gemini-3-pro-image', '4K');
    const flash4k = calculateModelGenerationCost('gemini-3.1-flash-image', '4K', 'standard');
    const flash4kPerCreditUsd = flash4k.actualCostPerSuccessfulImageUsd / getCreditWeightForGeneration('gemini-3.1-flash-image', '4K');
    assert.ok(pro4kPerCreditUsd <= 0.07105, `Expected Pro 4K per-credit USD <= 0.07105, got ${pro4kPerCreditUsd}`);
    assert.ok(flash4kPerCreditUsd <= 0.07105, `Expected Flash 4K per-credit USD <= 0.07105, got ${flash4kPerCreditUsd}`);
  });
});
