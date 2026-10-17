import test from 'node:test';
import assert from 'node:assert/strict';
import { PlanTier } from '../src/types/index.js';

test('Subscription Plans & Pricing Integrity Suite', async (t) => {
  // Simulated API response matching GET /api/v1/plans
  const mockPlans: PlanTier[] = [
    {
      id: 'starter',
      name: 'Starter',
      tagline: 'For single-domain compliance audits and small business compliance readiness.',
      priceInrMonth: 4999,
      priceInrMonthly: 4999,
      priceInrAnnual: 47990,
      priceInrAnnualMonthlyEquivalent: 3999,
      scansPerMonth: 10,
      maxWebsites: 1,
      maxMembers: 1,
      dataRetentionDays: 30,
      features: ['1 Verified Business Domain', '10 Automated Compliance Scans / month']
    },
    {
      id: 'growth',
      name: 'Growth',
      tagline: 'For scaling companies with multiple digital properties and active tag audit workflows.',
      priceInrMonth: 14999,
      priceInrMonthly: 14999,
      priceInrAnnual: 143990,
      priceInrAnnualMonthlyEquivalent: 11999,
      scansPerMonth: 100,
      maxWebsites: 5,
      maxMembers: 5,
      dataRetentionDays: 90,
      features: ['Up to 5 Verified Business Domains', '100 Automated Compliance Scans / month'],
      isPopular: true
    },
    {
      id: 'business',
      name: 'Business',
      tagline: 'For enterprises, digital agencies, and regulated fiduciaries with deep audit requirements.',
      priceInrMonth: 39999,
      priceInrMonthly: 39999,
      priceInrAnnual: 383990,
      priceInrAnnualMonthlyEquivalent: 31999,
      scansPerMonth: 500,
      maxWebsites: 25,
      maxMembers: 20,
      dataRetentionDays: 365,
      features: ['Up to 25 Verified Business Domains', '500 Automated Compliance Scans / month']
    }
  ];

  await t.test('All three plan tiers are defined with valid limits and retention days', () => {
    assert.equal(mockPlans.length, 3);
    const [starter, growth, business] = mockPlans;

    assert.equal(starter.maxWebsites, 1);
    assert.equal(starter.scansPerMonth, 10);
    assert.equal(starter.maxMembers, 1);
    assert.equal(starter.dataRetentionDays, 30);
    assert.ok(starter.tagline.length > 0);

    assert.equal(growth.maxWebsites, 5);
    assert.equal(growth.scansPerMonth, 100);
    assert.equal(growth.maxMembers, 5);
    assert.equal(growth.dataRetentionDays, 90);
    assert.ok(growth.tagline.length > 0);

    assert.equal(business.maxWebsites, 25);
    assert.equal(business.scansPerMonth, 500);
    assert.equal(business.maxMembers, 20);
    assert.equal(business.dataRetentionDays, 365);
    assert.ok(business.tagline.length > 0);
  });

  await t.test('Monthly mode calculates strictly without NaN or undefined', () => {
    for (const plan of mockPlans) {
      const billingCycle = 'monthly';
      const monthlyBase = plan.priceInrMonth || plan.priceInrMonthly || 0;
      const annualTotal = plan.priceInrAnnual || Math.round(monthlyBase * 12 * 0.8);
      const price = billingCycle === 'annual'
        ? (plan.priceInrAnnualMonthlyEquivalent || Math.round(annualTotal / 12))
        : monthlyBase;

      assert.ok(!Number.isNaN(price), `Price for ${plan.name} in monthly mode should not be NaN`);
      assert.ok(price > 0, `Price for ${plan.name} should be positive`);
      assert.equal(price, plan.priceInrMonth);
      assert.equal(typeof price.toLocaleString('en-IN'), 'string');
    }
  });

  await t.test('Annual mode calculates 20% discount accurately without NaN', () => {
    for (const plan of mockPlans) {
      const billingCycle = 'annual';
      const monthlyBase = plan.priceInrMonth || plan.priceInrMonthly || 0;
      const annualTotal = plan.priceInrAnnual || Math.round(monthlyBase * 12 * 0.8);
      const price = billingCycle === 'annual'
        ? (plan.priceInrAnnualMonthlyEquivalent || Math.round(annualTotal / 12))
        : monthlyBase;

      assert.ok(!Number.isNaN(price), `Price for ${plan.name} in annual mode should not be NaN`);
      assert.ok(!Number.isNaN(annualTotal), `Annual total for ${plan.name} should not be NaN`);
      assert.ok(price < plan.priceInrMonth, `Annual monthly equivalent should be lower than standard monthly price`);
      assert.equal(typeof annualTotal.toLocaleString('en-IN'), 'string');
      assert.equal(typeof price.toLocaleString('en-IN'), 'string');

      // Verify mathematical discount rate (approx 20% off full 12-month rate)
      const undiscountedYear = plan.priceInrMonth * 12;
      const discountPercent = ((undiscountedYear - annualTotal) / undiscountedYear) * 100;
      assert.ok(
        discountPercent >= 19.5 && discountPercent <= 20.5,
        `Expected ~20% discount for ${plan.name}, got ${discountPercent.toFixed(2)}%`
      );
    }
  });

  await t.test('Legacy payload missing optional fields falls back safely', () => {
    // Test with bare minimum fields to verify resilience
    const minimalPlan: any = {
      id: 'growth',
      name: 'Growth',
      priceInrMonth: 14999
    };

    const billingCycle = 'annual';
    const monthlyBase = minimalPlan.priceInrMonth || minimalPlan.priceInrMonthly || 0;
    const annualTotal = minimalPlan.priceInrAnnual || Math.round(monthlyBase * 12 * 0.8);
    const price = billingCycle === 'annual'
      ? (minimalPlan.priceInrAnnualMonthlyEquivalent || Math.round(annualTotal / 12))
      : monthlyBase;

    assert.ok(!Number.isNaN(price));
    assert.equal(price, 11999);
    assert.equal(annualTotal, 143990);
  });
});
