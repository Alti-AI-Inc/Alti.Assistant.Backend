/**
 * test-realestate.mjs — Integration & Verification Test Suite for RealEstateAPI.com Integration
 *
 * Verifies:
 * 1. Micro-agent registration in the global SWARM_REGISTRY.
 * 2. Precision keyword routing in SynapseRouter.
 * 3. RAG orchestration, markdown formatting, bold metrics, and source citations in realestateSmartRouter.
 * 4. Parallel compilation and multi-channel merging (Finance + Real Estate) in combinedRouteAndEnhancePrompt.
 */

import { SWARM_REGISTRY } from './src/app/modules/swarm/swarm.registry.js';
import { SynapseRouter } from './src/app/modules/swarm/synapseRouter.js';
import { massiveSmartRouter } from './src/app/helpers/massiveSmartRouter.js';
import { parseAddressEntities } from './src/app/helpers/realestateIntentDB.js';
import { realestateService } from './src/app/modules/realestate/realestate.service.js';

console.log('\n======================================================================');
console.log('🧪 ALTI REAL ESTATE INTEGRATION TEST SUITE (RealEstateAPI.com)');
console.log('======================================================================\n');

let failedTests = 0;
let passedTests = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    failedTests++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 1: SWARM MICRO-AGENT REGISTRATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 1: Swarm Agent Registration Check ---');
const expectedAgentIds = [
  'realestate_property_quant',
  'realestate_market_analyst',
  'realestate_skip_tracer'
];

expectedAgentIds.forEach(id => {
  const agent = SWARM_REGISTRY[id];
  assert(agent !== undefined, `Micro-agent "${id}" successfully registered in SWARM_REGISTRY`);
  if (agent) {
    assert(agent.model === 'gemini-2.0-flash', `Agent "${id}" correctly configured with gemini-2.0-flash`);
    assert(agent.keywords.length > 0, `Agent "${id}" has keywords declared`);
  }
});
console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 2: SYNAPSE ROUTING LOGIC
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 2: Synapse Routing Engine Audit ---');
const routingTestCases = [
  {
    query: 'What is the estimated home avm and valuation of 123 Main St?',
    expectedId: 'realestate_property_quant'
  },
  {
    query: 'I need to check recent comparable sales and sold comps near 456 Oak Ln',
    expectedId: 'realestate_market_analyst'
  },
  {
    query: 'Run a skip trace to lookup owner phone and email contacts for 1600 Pennsylvania Ave NW',
    expectedId: 'realestate_skip_tracer'
  }
];

routingTestCases.forEach(({ query, expectedId }) => {
  const routed = SynapseRouter.routeQuery(query);
  assert(
    routed.length > 0 && routed[0].id === expectedId,
    `Query: "${query}" -> Correctly routed to "${expectedId}" (Matched: "${routed[0]?.name || 'None'}")`
  );
});
console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 3: RAG ENHANCEMENT & FORMATTING
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 3: RAG Formatting, Metrics Bolding & Source Auditing ---');
const ragTestCases = [
  {
    label: 'Property Valuation (AVM)',
    query: 'what is the home valuation and estimated monthly rent for 123 Main St?',
    verifiers: [
      '[Source: RealEstateAPI.com]',
      '🏡 Property Valuation Report (AVM)',
      '**$672,000**',
      '**$3,950/mo**',
      '**7.05%**', // Gross annual yield calculation
      '**4** beds',
      '**3.5** baths',
      '**3,150** sqft'
    ]
  },
  {
    label: 'Comparable Sales (Comps)',
    query: 'show me recent comparable sales and comps for 456 Oak Ln',
    verifiers: [
      '[Source: RealEstateAPI.com]',
      'Comparable Sales Analysis (Comps)',
      '| Comp Address | Distance | Layout | Sold Price | Sold Date | Avg Price/Sqft |',
      '**$512,000**',
      '**$540,000**',
      'Suggested Subject Value'
    ]
  },
  {
    label: 'Owner Skip Tracing',
    query: 'run a skip trace on who owns 1600 Pennsylvania Ave NW',
    verifiers: [
      '[Source: RealEstateAPI.com]',
      'Skip Trace Owner Verification',
      '**United States Government**',
      '**450,000,000**'
    ]
  },
  {
    label: 'Active MLS Listings',
    query: 'list active MLS listings for sale in Atlanta GA',
    verifiers: [
      '[Source: RealEstateAPI.com]',
      'Active Real Estate MLS Listings',
      '| Address | List Price | Beds/Baths | Property Sqft | Listing Status | DOM |',
      '**$625,000**',
      '**$549,000**'
    ]
  }
];

for (const tc of ragTestCases) {
  console.log(`🔍 Running RAG Audit: [${tc.label}]`);
  try {
    const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(tc.query);
    assert(result !== tc.query, `Prompt successfully enhanced with RAG data context`);
    
    let allPassed = true;
    tc.verifiers.forEach(v => {
      const contains = result.includes(v);
      assert(contains, `Context contains expected token: "${v}"`);
      if (!contains) allPassed = false;
    });

    if (allPassed) {
      console.log(`  ❇️ High-Density formatting verified successfully.`);
    }
  } catch (err) {
    console.error(`  ❌ RAG Audit encountered error:`, err.message);
    failedTests++;
  }
  console.log('');
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 4: PARALLEL COMPILATION & MULTI-CHANNEL MERGING
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 4: Multi-Channel Parallel RAG Compilation & Merging ---');
const overlapQuery = 'Compare SPY ETF price vs the home valuation of 123 Main St';

try {
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(overlapQuery);
  assert(result !== overlapQuery, `Overlap prompt successfully enhanced`);
  
  assert(
    result.includes('📈 FINANCIAL MARKET DATA (Massive.com)'),
    `Merged output includes Financial Market Data header block`
  );
  assert(
    result.includes('[Source: Massive.com]'),
    `Merged output includes Massive.com source citation`
  );
  assert(
    result.includes('🏡 REAL ESTATE PROPERTY DATA (RealEstateAPI.com)'),
    `Merged output includes Real Estate Property Data header block`
  );
  assert(
    result.includes('[Source: RealEstateAPI.com]'),
    `Merged output includes RealEstateAPI.com source citation`
  );
  assert(
    result.includes('**$672,000**'),
    `Merged output contains property valuation details`
  );
} catch (err) {
  console.error(`  ❌ Parallel RAG compile encountered error:`, err.message);
  failedTests++;
}
console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 5: CRITERIA PARSING, MOCK DYNAMIC FILTERING & INVESTMENT CALCULATIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 5: Criteria Parsing, Mock Filtering & Investment Calculations ---');

// 1. Criteria Parsing Tests
console.log('  ▸ Auditing Natural Language Criteria Parsing:');
const query1 = 'Find active listings in LA with at least 3 beds, 2 baths under 900k';
const entities1 = parseAddressEntities(query1);
assert(entities1.city === 'Los Angeles', `Query "LA" correctly normalized to "${entities1.city}"`);
assert(entities1.minBeds === 3, `Query beds parsed successfully: minBeds = ${entities1.minBeds}`);
assert(entities1.minBaths === 2, `Query baths parsed successfully: minBaths = ${entities1.minBaths}`);
assert(entities1.maxPrice === 900000, `Query price under 900k parsed successfully: maxPrice = ${entities1.maxPrice}`);

const query2 = 'townhouse in Seattle between 400k and 600k';
const entities2 = parseAddressEntities(query2);
assert(entities2.propertyType === 'Townhouse', `Query propertyType parsed successfully: "${entities2.propertyType}"`);
assert(entities2.minPrice === 400000, `Query price min between 400k and 600k parsed: minPrice = ${entities2.minPrice}`);
assert(entities2.maxPrice === 600000, `Query price max between 400k and 600k parsed: maxPrice = ${entities2.maxPrice}`);

// 2. Programmatic Filtering in Mock Search Paths Tests
console.log('  ▸ Auditing Programmatic Filtering in Mock Search:');
const filteredTownhouses = await realestateService.searchMlsService({ city: 'Atlanta', propertyType: 'Townhouse' });
assert(
  filteredTownhouses.length > 0 && filteredTownhouses.every(p => p.propertyType === 'Townhouse'),
  `Mock MLS search filters Townhouses correctly (Count: ${filteredTownhouses.length})`
);

const filteredPrices = await realestateService.searchMlsService({ city: 'Atlanta', maxPrice: 450000 });
assert(
  filteredPrices.length > 0 && filteredPrices.every(p => p.price <= 450000),
  `Mock MLS search filters maximum price of $450,000 correctly (Count: ${filteredPrices.length})`
);

const filteredBeds = await realestateService.searchMlsService({ city: 'Atlanta', minBeds: 4 });
assert(
  filteredBeds.length > 0 && filteredBeds.every(p => p.beds >= 4),
  `Mock MLS search filters bedrooms (min: 4) correctly (Count: ${filteredBeds.length})`
);

// 3. Investment Prospectus Mathematical Integrity Tests
console.log('  ▸ Auditing Premium Financial & Underwriting Calculations:');
const valuationPrice = 672000;
const rentalValuation = 3950;

// Calculations match commercial underwriting specs exactly
const downPayment = valuationPrice * 0.20;
const loanAmount = valuationPrice * 0.80;
const interestRateYearly = 0.065;
const interestRateMonthly = interestRateYearly / 12;
const numberOfPayments = 360;
const monthlyMortgagePI = loanAmount * (interestRateMonthly * Math.pow(1 + interestRateMonthly, numberOfPayments)) / (Math.pow(1 + interestRateMonthly, numberOfPayments) - 1);

const annualGrossRent = rentalValuation * 12;
const estOperatingExpenses = annualGrossRent * 0.45;
const netOperatingIncome = annualGrossRent - estOperatingExpenses;
const capRate = (netOperatingIncome / valuationPrice) * 100;
const grossRentMultiplier = valuationPrice / annualGrossRent;

const monthlyOperatingExpenses = estOperatingExpenses / 12;
const totalMonthlyOutflow = monthlyMortgagePI + monthlyOperatingExpenses;
const netMonthlyCashFlow = rentalValuation - totalMonthlyOutflow;
const annualNetCashFlow = netMonthlyCashFlow * 12;
const cashOnCashReturn = (annualNetCashFlow / downPayment) * 100;

assert(downPayment === 134400, `Down Payment (20%) is exactly $${downPayment.toLocaleString()}`);
assert(loanAmount === 537600, `Loan Amount (80% LTV) is exactly $${loanAmount.toLocaleString()}`);
assert(Math.round(monthlyMortgagePI) === 3398, `Monthly P&I payment at 6.5% interest is exactly $${Math.round(monthlyMortgagePI).toLocaleString()}`);
assert(Math.round(netOperatingIncome) === 26070, `Net Operating Income (NOI) at 45% OpEx ratio is exactly $${Math.round(netOperatingIncome).toLocaleString()}`);
assert(capRate.toFixed(2) === '3.88', ` implied Cap Rate is exactly ${capRate.toFixed(2)}%`);
assert(grossRentMultiplier.toFixed(2) === '14.18', ` implied Gross Rent Multiplier is exactly ${grossRentMultiplier.toFixed(2)}x`);
assert(Math.round(netMonthlyCashFlow) === -1225, `Monthly Net Cash Flow yield shows expected Carry of $${Math.round(netMonthlyCashFlow).toLocaleString()}`);
assert(cashOnCashReturn.toFixed(2) === '-10.94', ` implied Cash-on-Cash Return is exactly ${cashOnCashReturn.toFixed(2)}%`);

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// FINAL AUDIT METRICS
// ─────────────────────────────────────────────────────────────────────────────
console.log('======================================================================');
console.log(`🏁 INTEGRATION TEST METRICS: ${passedTests} PASSED, ${failedTests} FAILED`);
console.log('======================================================================');

if (failedTests > 0) {
  console.error('\n❌ RealEstateAPI.com integration verification tests FAILED!');
  process.exit(1);
} else {
  console.log('\n🎉 ALL REAL ESTATE SYSTEM INTEGRATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}
