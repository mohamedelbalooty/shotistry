const { describe, it } = require('node:test');
const assert = require('node:assert');

// Test the pricing logic directly
const { SUBSCRIPTION_PLANS, TOP_UP_PACKS, getPriceForCountry, formatCurrency } = require('../src/lib/pricing/plans');

describe('Pricing & Currency Engine Tests', () => {
  it('should have correct pricing for Egyptian Starter Plan (349 EGP, 80 Credits)', () => {
    const starter = SUBSCRIPTION_PLANS.STARTER;
    assert.strictEqual(starter.priceEGP, 349);
    assert.strictEqual(starter.monthlyCredits, 80);
    assert.strictEqual(starter.resolution, 'HD');
  });

  it('should have correct pricing for Saudi Pro Plan (189 SAR, 200 Credits)', () => {
    const pro = SUBSCRIPTION_PLANS.PRO;
    assert.strictEqual(pro.priceSAR, 189);
    assert.strictEqual(pro.monthlyCredits, 200);
    assert.strictEqual(pro.resolution, '4K');
    assert.strictEqual(pro.priorityQueue, true);
  });

  it('should format currency correctly in Arabic and English locales', () => {
    const egpAr = formatCurrency(899, 'EGP', 'ar');
    assert.ok(egpAr.includes('ج.م'));

    const sarAr = formatCurrency(189, 'SAR', 'ar');
    assert.ok(sarAr.includes('ر.س'));

    const sarEn = formatCurrency(189, 'SAR', 'en');
    assert.ok(sarEn.includes('SAR'));
  });

  it('should return correct country-specific pricing object', () => {
    const priceEg = getPriceForCountry('PRO', 'EG');
    assert.strictEqual(priceEg.currency, 'EGP');
    assert.strictEqual(priceEg.amount, 899);

    const priceSa = getPriceForCountry('PRO', 'SA');
    assert.strictEqual(priceSa.currency, 'SAR');
    assert.strictEqual(priceSa.amount, 189);
  });

  it('should have 3 non-expiring top-up packs with volume discounts', () => {
    assert.strictEqual(TOP_UP_PACKS.length, 3);
    assert.strictEqual(TOP_UP_PACKS[0].credits, 50);
    assert.strictEqual(TOP_UP_PACKS[1].credits, 150);
    assert.strictEqual(TOP_UP_PACKS[2].credits, 500);

    // Verify per-credit price decreases as pack size increases
    const pricePerCredit50 = TOP_UP_PACKS[0].priceSAR / TOP_UP_PACKS[0].credits;
    const pricePerCredit500 = TOP_UP_PACKS[2].priceSAR / TOP_UP_PACKS[2].credits;
    assert.ok(pricePerCredit500 < pricePerCredit50);
  });
});
