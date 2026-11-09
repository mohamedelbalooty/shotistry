import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCIAL_CONFIG,
  FX_RATES,
  PAYMOB_FEE_SCHEDULE,
  VAT_CONFIG,
  INFRA_COST_ESTIMATES,
  UTILIZATION_SCENARIOS,
  MARGIN_GUARDRAILS,
  calculatePaymobFee,
  calculateTopUpProfitability,
  checkFinancialGuardrails,
  runFxSensitivityAnalysis,
} from '../src/lib/pricing/financial-config.ts';
import {
  calculatePlanProfitability,
  calculateModelGenerationCost,
} from '../src/lib/pricing/model-costs.ts';
import { SUBSCRIPTION_PLANS, TOP_UP_PACKS } from '../src/lib/pricing/plans.ts';

describe('Milestone M6: Centralized Financial Configuration & Unit Economics Tests', () => {
  it('should have verified FX rates with source and pricing reference date', () => {
    assert.equal(FX_RATES.EG.rate, 50.0);
    assert.equal(FX_RATES.EG.currency, 'EGP');
    assert.ok(FX_RATES.EG.source.length > 0);
    assert.ok(FX_RATES.EG.lastVerifiedDate.match(/^\d{4}-\d{2}-\d{2}$/));

    assert.equal(FX_RATES.SA.rate, 3.75);
    assert.equal(FX_RATES.SA.currency, 'SAR');
    assert.ok(FX_RATES.SA.source.length > 0);
    assert.ok(FX_RATES.SA.lastVerifiedDate.match(/^\d{4}-\d{2}-\d{2}$/));
  });

  it('should define regional Paymob fee schedules for cards, wallets, and mada', () => {
    // Egypt
    const egCards = PAYMOB_FEE_SCHEDULE.EG.methods.card;
    assert.equal(egCards.percentage, 0.0275);
    assert.equal(egCards.fixedSubunitsOrAmount, 3.0);

    const egWallets = PAYMOB_FEE_SCHEDULE.EG.methods.wallet;
    assert.equal(egWallets.percentage, 0.02);
    assert.equal(egWallets.fixedSubunitsOrAmount, 2.0);

    // Saudi Arabia
    const saMada = PAYMOB_FEE_SCHEDULE.SA.methods.mada;
    assert.equal(saMada.percentage, 0.01);
    assert.equal(saMada.fixedSubunitsOrAmount, 1.0);

    const saCards = PAYMOB_FEE_SCHEDULE.SA.methods.card;
    assert.equal(saCards.percentage, 0.027);
    assert.equal(saCards.fixedSubunitsOrAmount, 1.0);

    // Helper function calculatePaymobFee
    const feeEg1000 = calculatePaymobFee(1000, 'EG', 'card');
    assert.equal(feeEg1000, 1000 * 0.0275 + 3.0); // 30.50 EGP

    const feeSa100 = calculatePaymobFee(100, 'SA', 'mada');
    assert.equal(feeSa100, 100 * 0.01 + 1.0); // 2.00 SAR
  });

  it('should define regional VAT configuration', () => {
    assert.equal(VAT_CONFIG.EG.rate, 0.14);
    assert.equal(VAT_CONFIG.SA.rate, 0.15);
    assert.equal(typeof VAT_CONFIG.EG.pricesIncludeVat, 'boolean');
    assert.equal(typeof VAT_CONFIG.SA.pricesIncludeVat, 'boolean');
  });

  it('should define utilization scenarios and margin guardrails', () => {
    assert.equal(UTILIZATION_SCENARIOS.CONSERVATIVE, 0.4);
    assert.equal(UTILIZATION_SCENARIOS.EXPECTED, 0.65);
    assert.equal(UTILIZATION_SCENARIOS.WORST_CASE, 1.0);

    assert.equal(MARGIN_GUARDRAILS.TARGET_WORST_CASE_MARGIN_PERCENT, 25.0);
    assert.equal(MARGIN_GUARDRAILS.TARGET_EXPECTED_MARGIN_PERCENT, 50.0);
  });

  it('should calculate top-up pack profitability accurately for EG and SA', () => {
    const pack50Eg = calculateTopUpProfitability('pack_50', 'EG');
    assert.equal(pack50Eg.credits, 50);
    assert.equal(pack50Eg.priceLocal, 249);
    assert.equal(pack50Eg.currency, 'EGP');
    assert.ok(pack50Eg.worstCaseGrossMarginPercent > 0);

    const pack500Eg = calculateTopUpProfitability('pack_500', 'EG');
    assert.equal(pack500Eg.credits, 500);
    assert.equal(pack500Eg.priceLocal, 1499);
    // At 1499 EGP, revenue per credit = ~3.00 EGP.
    // 1K Flash cost = ~$0.0712 * 50 = ~3.56 EGP.
    // At 100% utilization, gross margin is negative (loss leader / deficit risk).
    assert.ok(
      pack500Eg.worstCaseGrossProfitLocal < 0,
      'pack_500 EG should be recognized as negative profit at 100% credit utilization'
    );
    assert.ok(pack500Eg.worstCaseGrossMarginPercent < 0);

    // Saudi packs should maintain strong positive margins
    const pack500Sa = calculateTopUpProfitability('pack_500', 'SA');
    assert.equal(pack500Sa.priceLocal, 299);
    assert.ok(pack500Sa.worstCaseGrossMarginPercent > 50);
  });

  it('should detect margin guardrail violations and return actionable warnings', () => {
    const report = checkFinancialGuardrails();
    assert.equal(typeof report.passed, 'boolean');
    assert.ok(Array.isArray(report.violations));
    assert.ok(Array.isArray(report.warnings));

    // pack_500 EG and AGENCY EG should be flagged
    const flaggedItems = report.violations.map((v) => `${v.type}:${v.id}:${v.country}`);
    assert.ok(
      flaggedItems.some((f) => f.includes('pack_500:EG')),
      'pack_500 EG must be flagged in violations'
    );
    assert.ok(
      flaggedItems.some((f) => f.includes('AGENCY:EG')),
      'AGENCY EG must be flagged for thin worst-case margin (<25%)'
    );

    // Saudi items should pass guardrails comfortably
    const saViolations = report.violations.filter((v) => v.country === 'SA');
    assert.equal(saViolations.length, 0, 'Saudi Arabia offers should have zero violations');
  });

  it('should perform FX sensitivity analysis modeling EGP devaluation', () => {
    // Model EGP from 50.0 to 60.0 (+20% devaluation)
    const baseline = calculatePlanProfitability('STARTER', 'EG');
    const stressed = runFxSensitivityAnalysis('STARTER', 'EG', 60.0);

    assert.equal(stressed.fxRatePerUsd, 60.0);
    assert.ok(
      stressed.worstCaseGrossMarginPercent < baseline.worstCaseGrossMarginPercent,
      'Devaluation should compress gross margin'
    );
  });
});

