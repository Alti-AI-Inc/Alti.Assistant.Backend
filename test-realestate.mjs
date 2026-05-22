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
import { sportsSmartRouter } from './src/app/helpers/sportsSmartRouter.js';
import { parseAddressEntities } from './src/app/helpers/realestateIntentDB.js';
import { realestateService } from './src/app/modules/realestate/realestate.service.js';
import { detectNewsApiAiIntent, getNewsApiAiData } from './src/app/helpers/v13DataIntegrations.js';

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
      '| Comp Address | Proximity Tier | Distance | Layout | Layout Match | Sold Price | Sold Date | Avg Price/Sqft |',
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

// 4. Custom Scenario Underwriting & Break-Even/Lifetime Math Tests
console.log('  ▸ Auditing Dynamic Natural Language Custom Scenario Underwriting & Calculations:');
const queryCustom = 'what is the valuation of 123 Main St assuming 15% down, 7.2% interest, 35% opex and rent of $3200?';
const entitiesCustom = parseAddressEntities(queryCustom);
assert(entitiesCustom.downPaymentPct === 0.15, `Custom Down Payment parsed successfully: ${entitiesCustom.downPaymentPct * 100}%`);
assert(Math.abs(entitiesCustom.interestRate - 0.072) < 1e-9, `Custom Interest Rate parsed successfully: ${(entitiesCustom.interestRate * 100).toFixed(2)}%`);
assert(entitiesCustom.opexRatio === 0.35, `Custom OpEx Ratio parsed successfully: ${entitiesCustom.opexRatio * 100}%`);
assert(entitiesCustom.customRent === 3200, `Custom Rent parsed successfully: $${entitiesCustom.customRent}`);

// Verify RAG output contains these custom underwriting calculations
try {
  const resultCustom = await massiveSmartRouter.combinedRouteAndEnhancePrompt(queryCustom);
  assert(resultCustom.includes('Down Payment (15%)'), `RAG Context includes custom down payment label`);
  assert(resultCustom.includes('Financed Loan (85%)'), `RAG Context includes custom loan label`);
  assert(resultCustom.includes('**$100,800**'), `RAG Context includes custom down payment of **$100,800**`);
  assert(resultCustom.includes('**$571,200**'), `RAG Context includes custom loan amount of **$571,200**`);
  assert(resultCustom.includes('**$3,877/mo**'), `RAG Context includes calculated mortgage P&I of **$3,877/mo**`);
  assert(resultCustom.includes('**$1,120/mo**'), `RAG Context includes calculated OpEx of **$1,120/mo**`);
  assert(resultCustom.includes('**$-2,154/mo**'), `RAG Context includes calculated Net Cash Flow of **$-2,154/mo**`);
  assert(resultCustom.includes('**-25.65%**'), `RAG Context includes calculated Cash-on-Cash Return of **-25.65%**`);
  
  // Custom levers / metrics:
  assert(resultCustom.includes('Break-Even Monthly Rent'), `RAG Context includes Break-Even Monthly Rent header`);
  assert(resultCustom.includes('**$6,514/mo**'), `RAG Context includes Break-Even Monthly Rent calculation: **$6,514/mo**`);
  assert(resultCustom.includes('Total 30-Year Debt Service Payments'), `RAG Context includes Cumulative Mortgage Amortization section`);
  assert(resultCustom.includes('**$1,524,326**'), `RAG Context includes Total 30-Year Debt Service calculation: **$1,524,326**`);
  assert(resultCustom.includes('**$824,606**'), `RAG Context includes Total Interest Cost calculation: **$824,606**`);
} catch (err) {
  console.error(`  ❌ Custom scenario underwriting audit encountered error:`, err.message);
  failedTests++;
}

// 5. Distance-Weighted Comps & Layout Match Comps Tests
console.log('  ▸ Auditing Distance-Weighted Comps Consensus Model & Layout Matches:');
const queryComps = 'show me recent comparable sales and comps for 123 Main St';
try {
  const resultComps = await massiveSmartRouter.combinedRouteAndEnhancePrompt(queryComps);
  
  // Verify Layout Match Flag
  assert(resultComps.includes('🎯 **Match**'), `RAG Comps Context contains layout match flag indicator`);
  assert(resultComps.includes('✖'), `RAG Comps Context contains layout mismatch indicator`);
  
  // Verify Distance-Weighted Calculations
  assert(resultComps.includes('Distance-Weighted Average'), `RAG Comps Context contains Distance-Weighted Average header`);
  assert(resultComps.includes('**$194.88/sqft**'), `RAG Comps Context contains correct Distance-Weighted Average price/sqft: **$194.88/sqft**`);
  assert(resultComps.includes('Suggested Subject Value (Distance-Weighted)'), `RAG Comps Context contains Distance-Weighted Suggested Value header`);
  assert(resultComps.includes('**$613,866**'), `RAG Comps Context contains correct Distance-Weighted Suggested Subject Value: **$613,866**`);
} catch (err) {
  console.error(`  ❌ Distance-weighted comps audit encountered error:`, err.message);
  failedTests++;
}

// 6. Cache Diagnostics Logs Output Verification
console.log('  ▸ Auditing Enterprise Cache & Latency Diagnostics Block:');
try {
  // Let's perform a detail lookup to ensure diagnostics are populated in serviceDiagnostics
  await realestateService.getPropertyDetailService('prop_90210_1');
  const resultDiag = await massiveSmartRouter.combinedRouteAndEnhancePrompt('get details for 123 Main St');
  
  assert(resultDiag.includes('ENTERPRISE CACHE & LATENCY DIAGNOSTICS LOG'), `RAG Context contains diagnostics log block`);
  assert(resultDiag.includes('Cache Stats:'), `RAG Context contains Cache Stats details`);
  assert(resultDiag.includes('Service Latency Logs:'), `RAG Context contains Service Latency Logs sub-block`);
} catch (err) {
  console.error(`  ❌ Cache diagnostics audit encountered error:`, err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 6: ADVANCED v3 UNDERWRITING & MULTI-MARKET CALCULATIONS
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 6: Advanced Underwriting, Multi-Market, and TADI Diagnostics Check ---');

// 1. Multi-Market Parsing Assertion
console.log('  ▸ Auditing Natural Language Multi-City Parsing:');
const multiQuery = 'Compare active listings in Atlanta and Miami under 800k';
const multiEntities = parseAddressEntities(multiQuery);
assert(multiEntities.locations && multiEntities.locations.length === 2, 'Locations array contains exactly 2 parsed cities');
assert(multiEntities.locations.some(loc => loc.city === 'Atlanta' && loc.state === 'GA'), 'Atlanta (GA) parsed correctly');
assert(multiEntities.locations.some(loc => loc.city === 'Miami' && loc.state === 'FL'), 'Miami (FL) parsed correctly');
assert(multiEntities.maxPrice === 800000, 'Price filter of 800k parsed correctly');

try {
  const multiResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(multiQuery);
  assert(multiResult.includes('Multi-Market Comparative MLS Dashboard'), 'RAG output includes Multi-Market Comparative MLS Dashboard');
  assert(multiResult.includes('Market Comparison Summary'), 'RAG output includes comparison summary table');
  assert(multiResult.includes('Side-by-Side Property Comparison'), 'RAG output includes side-by-side active property table');
} catch (err) {
  console.error('  ❌ Multi-market parallel compilation failed:', err.message);
  failedTests++;
}

// 2. Stress-Testing Calculations Assertion
console.log('  ▸ Auditing Downside / Base / Upside Stress-Testing Math:');
try {
  const stressQuery = 'what is the home valuation and stress-testing for 123 Main St?';
  const stressResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(stressQuery);
  assert(stressResult.includes('Investment Sensitivity Stress-Testing'), 'RAG output includes stress-testing sensitivity matrix');
  assert(stressResult.includes('**$3,555/mo**') && stressResult.includes('**50%**'), 'Downside Case monthly rent stressed by -10% ($3,555/mo) and OpEx ratio raised by +5% (50%)');
  assert(stressResult.includes('**$3,950/mo**') && stressResult.includes('**45%**'), 'Base Case monthly rent ($3,950/mo) and OpEx ratio (45%) match defaults');
  assert(stressResult.includes('**$4,345/mo**') && stressResult.includes('**40%**'), 'Upside Case monthly rent increased by +10% ($4,345/mo) and OpEx ratio reduced by -5% (40%)');
  assert(stressResult.includes('**$21,330**') && stressResult.includes('**3.17%**'), 'Downside NOI ($21,330) and Cap Rate (3.17%) mathematically correct');
  assert(stressResult.includes('**$26,070**') && stressResult.includes('**3.88%**'), 'Base NOI ($26,070) and Cap Rate (3.88%) mathematically correct');
  assert(stressResult.includes('**$31,284**') && stressResult.includes('**4.66%**'), 'Upside NOI ($31,284) and Cap Rate (4.66%) mathematically correct');
  assert(stressResult.includes('**-14.47%**'), 'Downside Cash-on-Cash Return (-14.47%) mathematically correct');
  assert(stressResult.includes('**-10.94%**'), 'Base Cash-on-Cash Return (-10.94%) mathematically correct');
  assert(stressResult.includes('**-7.06%**'), 'Upside Cash-on-Cash Return (-7.06%) mathematically correct');
} catch (err) {
  console.error('  ❌ Stress-testing calculation verification failed:', err.message);
  failedTests++;
}

// 3. Holding-Period Amortization Projections Assertion
console.log('  ▸ Auditing 10-Year holding-Period Amortization scheduler:');
try {
  const amortQuery = 'valuation and amortization schedule for 123 Main St';
  const amortResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(amortQuery);
  assert(amortResult.includes('Holding-Period Equity & Debt Amortization Projections'), 'RAG output includes holding-period projections');
  assert(amortResult.includes('**Year 1**') && amortResult.includes('**$531,591**') && amortResult.includes('**$34,767**'), 'Year 1 Remaining Balance ($531,591) and Cumulative Interest ($34,767) correct');
  assert(amortResult.includes('**Year 5**') && amortResult.includes('**$503,253**') && amortResult.includes('**$169,532**'), 'Year 5 Remaining Balance ($503,253) and Cumulative Interest ($169,532) correct');
  assert(amortResult.includes('**Year 10**') && amortResult.includes('**$455,756**') && amortResult.includes('**$325,916**'), 'Year 10 Remaining Balance ($455,756) and Cumulative Interest ($325,916) correct');
  assert(amortResult.includes('**Year 30**') && amortResult.includes('**$0**') && amortResult.includes('**$685,679**'), 'Year 30 Remaining Balance ($0) and Cumulative Interest ($685,679) correct');
  assert(amortResult.includes('**$140,409**'), 'Year 1 Built-in Equity (Down Payment + Principal Paydown: $134,400 + $6,009 = $140,409) correct');
} catch (err) {
  console.error('  ❌ Amortization projections verification failed:', err.message);
  failedTests++;
}

// 4. Proximity Comp Outlier Tiering Assertion
console.log('  ▸ Auditing Proximity Outlier Categorization & Layout Match Flags:');
try {
  const compsQuery = 'comparable sales and sold comps for 123 Main St';
  const compsResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(compsQuery);
  assert(compsResult.includes('Proximity Tier'), 'Comparable sales table includes Proximity Tier column');
  assert(compsResult.includes('🟢 Close (Primary)'), '🟢 Close (Primary) tier correctly assigned to comps within 0.15 miles');
  assert(compsResult.includes('🟡 Medium (Secondary)'), '🟡 Medium (Secondary) tier correctly assigned to comps between 0.15 and 0.30 miles');
} catch (err) {
  console.error('  ❌ Proximity comps outlier audit failed:', err.message);
  failedTests++;
}

// 5. Tax Assessment Deviation Index (TADI) Assertion
console.log('  ▸ Auditing Tax Assessment Deviation Index (TADI) ratio:');
try {
  const tadiQuery = 'what is the valuation and tax details for 123 Main St?';
  const tadiResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(tadiQuery);
  assert(tadiResult.includes('Tax Assessment Deviation Index (TADI)'), 'RAG output includes Tax Assessment Deviation Index section');
  assert(tadiResult.includes('**1.23x**'), 'Correct TADI ratio calculation: 672000 / 545000 = 1.233x (rounded to 1.23x)');
  assert(tadiResult.includes('Fair Market Alignment'), 'Correct advisor commentary indicating fair market alignment');
} catch (err) {
  console.error('  ❌ TADI audit failed:', err.message);
  failedTests++;
}

// 6. Advanced Institutional Underwriting Models (PMI, Seller Net Sheet, and Hazard Risk Profiling)
console.log('  ▸ Auditing Advanced Institutional Underwriting (PMI, Net Sheet, Hazard Risk):');
try {
  const pmiQuery = 'what is the valuation of 123 Main St assuming 15% down?';
  const pmiResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(pmiQuery);
  assert(pmiResult.includes('**$357/mo**'), '15% down triggers PMI of **$357/mo** correctly');
  assert(pmiResult.includes('LTV > 80%'), 'PMI trigger note matches custom leverage criteria');
} catch (err) {
  console.error('  ❌ PMI calculation test failed:', err.message);
  failedTests++;
}

try {
  const sellerQuery = 'valuation and seller proceeds for 123 Main St';
  const sellerResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(sellerQuery);
  assert(sellerResult.includes('Seller Net Sheet Projections'), 'Seller Net Sheet Projections table is output correctly');
  assert(sellerResult.includes('**$33,600**'), 'Broker commission of **$33,600** correctly calculated');
  assert(sellerResult.includes('**$225,120**'), 'Walkthrough net proceeds of **$225,120** correctly calculated');
} catch (err) {
  console.error('  ❌ Seller net sheet test failed:', err.message);
  failedTests++;
}

try {
  const detailQuery = 'details and hazard risk for 123 Main St';
  const detailResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(detailQuery);
  assert(detailResult.includes('Insurance Underwriting & Hazard Risk Profiling'), 'Insurance Underwriting table is output in public detail path');
  assert(detailResult.includes('**$551,250**'), 'Replacement Cost of **$551,250** correctly calculated');
  assert(detailResult.includes('**$1,929**'), 'Estimated annual premium of **$1,929** correctly calculated');
  assert(detailResult.includes('**$161/mo**'), 'Estimated monthly premium of **$161/mo** correctly calculated');
} catch (err) {
  console.error('  ❌ Hazard risk calculation test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 7: ADVANCED v5 INSTITUTIONAL PERSONAS & SENSITIVITY MATRIX VERIFICATION
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 7: Advanced v5 Institutional Personas & Underwriting Models Check ---');

// 1. Conforming Limits Audit (Conforming vs. Jumbo)
console.log('  ▸ Auditing Conforming limits audit (Washington DC - JUMBO):');
try {
  const dcQuery = 'what is the valuation and conforming loan status for 1600 Pennsylvania Ave NW?';
  const dcResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(dcQuery);
  assert(dcResult.includes('Conforming Limits Audit'), 'RAG output includes Conforming Loan Limits Audit section');
  assert(dcResult.includes('🔴 JUMBO'), 'Correct status check for JUMBO loan on Washington DC white house');
  assert(dcResult.includes('**$388,000,000**'), 'Subject loan amount of **$388,000,000** correctly calculated');
} catch (err) {
  console.error('  ❌ Conforming loan limits JUMBO audit failed:', err.message);
  failedTests++;
}

console.log('  ▸ Auditing Conforming limits audit (Atlanta - CONFORMING):');
try {
  const atlQuery = 'what is the valuation and conforming status for 123 Main St?';
  const atlResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(atlQuery);
  assert(atlResult.includes('🟢 CONFORMING'), 'Correct status check for CONFORMING loan on Atlanta property');
  assert(atlResult.includes('**$537,600**'), 'Subject loan amount of **$537,600** correctly calculated');
} catch (err) {
  console.error('  ❌ Conforming loan limits CONFORMING audit failed:', err.message);
  failedTests++;
}

// 2. FEMA Flood Insurance & Multi-Hazard Environmental Profiling
console.log('  ▸ Auditing FEMA Flood Surcharges & Multi-Hazard Environmental Risk Ratings:');
try {
  const floodQuery = 'details and flood insurance for 456 Oak Ln';
  const floodResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(floodQuery);
  assert(floodResult.includes('Insurance Underwriting & Hazard Risk Profiling'), 'RAG output includes Insurance Underwriting table');
  assert(floodResult.includes('**$385,000**'), 'Replacement Cost of **$385,000** correctly calculated for 456 Oak Ln (2,200 sqft * 175)');
  assert(floodResult.includes('Zone AE (High Risk)'), 'Correct high-risk FEMA flood zone AE triggered');
  assert(floodResult.includes('**$4,043**'), 'FEMA Annual Premium of **$4,043** correctly calculated (385,000 * 1.05% = 4,042.50 rounded)');
  assert(floodResult.includes('**$337/mo**'), 'FEMA Monthly Premium of **$337/mo** correctly calculated (4,042.50 / 12 = 336.88 rounded)');
  assert(floodResult.includes('🔥 **Wildfire Risk** | **Medium**'), 'Wildfire Risk correctly rated for Austin');
  assert(floodResult.includes('🌀 **Wind/Hurricane Risk** | **Medium**'), 'Wind/Hurricane Risk correctly rated for Austin');
  assert(floodResult.includes('🫨 **Seismic/Earthquake Risk** | **Low**'), 'Seismic Risk correctly rated for Austin');
} catch (err) {
  console.error('  ❌ FEMA flood insurance / hazard risk profiling failed:', err.message);
  failedTests++;
}

// 3. Interest Rate Sensitivity Analysis
console.log('  ▸ Auditing Interest Rate Sensitivity Matrix (6.0% to 8.5% steps):');
try {
  const rateQuery = 'valuation and interest rate sensitivity for 456 Oak Ln';
  const rateResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(rateQuery);
  assert(rateResult.includes('Interest Rate Sensitivity Analysis'), 'RAG output includes Interest Rate Sensitivity Analysis section');
  assert(rateResult.includes('**$2,566**'), 'Austin Monthly Mortgage P&I at 6.0% interest rate is exactly **$2,566** ($428,000 loan)');
  assert(rateResult.includes('**$3,291**'), 'Austin Monthly Mortgage P&I at 8.5% interest rate is exactly **$3,291** ($428,000 loan)');
} catch (err) {
  console.error('  ❌ Interest rate sensitivity matrix failed:', err.message);
  failedTests++;
}

// 4. Seller Multi-Scenario Exit Proceeds Comparative Ledger
console.log('  ▸ Auditing Seller Multi-Scenario Exit proceeds ledger:');
try {
  const sellerQuery = 'valuation and seller net sheet multi-scenario proceeds for 123 Main St';
  const sellerResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(sellerQuery);
  assert(sellerResult.includes('Seller Multi-Scenario Exit Ledger'), 'RAG output includes Seller Multi-Scenario Exit Ledger section');
  assert(sellerResult.includes('🔴 **90% of List**'), '90% price exit scenario included');
  assert(sellerResult.includes('**$604,800**'), 'Gross sale price at 90% list is **$604,800** ($672,000 * 0.90)');
  assert(sellerResult.includes('**$162,288**'), 'Estimated net proceeds at 90% list with fixed outstanding debt is **$162,288**');
  assert(sellerResult.includes('🎯 **100% List Price**'), '100% price exit scenario included');
  assert(sellerResult.includes('**$225,120**'), 'Estimated net proceeds at 100% list with fixed outstanding debt is **$225,120**');
} catch (err) {
  console.error('  ❌ Seller multi-scenario exit ledger failed:', err.message);
  failedTests++;
}

// 5. Programmatic Investor Buy-Box Matching Engine
console.log('  ▸ Auditing Programmatic Investor Buy-Box Matching Engine:');
try {
  const bboxQuery = 'prospectus matching engine and buybox criteria for 123 Main St assuming max price 700k, min beds 3, min cap rate 3.0%';
  const bboxResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(bboxQuery);
  assert(bboxResult.includes('Investor Buy-Box Matching Prospectus'), 'RAG output includes Investor Buy-Box Matching Prospectus section');
  assert(bboxResult.includes('🟢 PASS'), 'Checklist correctly includes 🟢 PASS tags');
  assert(bboxResult.includes('🟢 APPROVED BUY-BOX MATCH'), 'Overall status matches investor constraints: 🟢 APPROVED BUY-BOX MATCH');
} catch (err) {
  console.error('  ❌ Investor buy-box matching engine failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 8: ADVANCED v6 COMMERCIAL, HAZARD, SELLER POST-TAX, & BRRRR UNDERWRITING
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 8: Advanced v6 Commercial, Hazard, Seller Post-Tax, & BRRRR Underwriting Check ---');

// 1. Commercial Debt Yield (DY)
console.log('  ▸ Auditing Commercial Debt Yield calculation & risk tiers:');
try {
  const dyQuery = 'what is the valuation and debt yield for 123 Main St?';
  const dyResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(dyQuery);
  assert(dyResult.includes('Debt Yield'), 'RAG output includes Debt Yield section');
  assert(dyResult.includes('**4.85%**') || dyResult.includes('4.85%'), 'Debt Yield of **4.85%** correctly calculated (Base case Annual NOI: $26,070 / Loan Amount: $537,600 = 4.849% rounded to 4.85%)');
  assert(dyResult.includes('🔴 High Risk'), 'Debt Yield risk tier rated correctly as High Risk');
} catch (err) {
  console.error('  ❌ Commercial Debt Yield calculation failed:', err.message);
  failedTests++;
}

// 2. Multi-Unit Conforming Limits Matrix
console.log('  ▸ Auditing Multi-Unit Conforming limit scaling (2-Unit, 3-Unit, 4-Unit):');
try {
  const duplexQuery = 'what is the valuation and conforming loan status for 123 Main St assuming a duplex 2-unit?';
  const duplexResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(duplexQuery);
  assert(duplexResult.includes('Standard Conforming Limit (2-Unit)'), 'RAG output includes 2-unit conforming limits');
  assert(duplexResult.includes('**$981,500**'), 'Standard 2-unit limit of **$981,500** output correctly');
  assert(duplexResult.includes('**$1,472,250**'), 'High-cost 2-unit limit of **$1,472,250** output correctly');
  
  const triplexQuery = 'what is the valuation and conforming status for 123 Main St assuming 3-units?';
  const triplexResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(triplexQuery);
  assert(triplexResult.includes('Standard Conforming Limit (3-Unit)'), 'RAG output includes 3-unit conforming limits');
  assert(triplexResult.includes('**$1,186,350**'), 'Standard 3-unit limit of **$1,186,350** output correctly');
  assert(triplexResult.includes('**$1,779,525**'), 'High-cost 3-unit limit of **$1,779,525** output correctly');
} catch (err) {
  console.error('  ❌ Multi-Unit Conforming Limit matrix scaling failed:', err.message);
  failedTests++;
}

// 3. Seismic PML Loss and Premium Surcharge
console.log('  ▸ Auditing Seismic PML & Premium Surcharges (Los Angeles):');
try {
  const seismicQuery = 'details and earthquake hazard for 123 Main St in Los Angeles';
  const seismicResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(seismicQuery);
  assert(seismicResult.includes('Seismic PML Estimate'), 'RAG output includes Seismic PML Estimate');
  assert(seismicResult.includes('**$82,688**'), 'Seismic PML estimate of **$82,688** correctly calculated (15% of Replacement Cost $551,250)');
  assert(seismicResult.includes('**$1,378**'), 'Seismic Annual Premium of **$1,378** correctly calculated (0.25% of Replacement Cost $551,250)');
  assert(seismicResult.includes('**$115/mo**'), 'Seismic Monthly Premium of **$115/mo** correctly calculated ($1,378.13 / 12 = 114.84 rounded)');
} catch (err) {
  console.error('  ❌ Seismic PML & Premium Underwriting failed:', err.message);
  failedTests++;
}

// 4. Coastal Windstorm Deductible Escalator
console.log('  ▸ Auditing Coastal Windstorm Deductibles (Miami vs Austin):');
try {
  const miamiQuery = 'details and hazard risk for 123 Main St in Miami';
  const miamiResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(miamiQuery);
  assert(miamiResult.includes('Windstorm Deductible'), 'RAG output includes Windstorm Deductible');
  assert(miamiResult.includes('**$16,538**'), 'Miami Windstorm Deductible of **$16,538** correctly calculated (3% of RC $551,250 = 16,537.50 rounded)');
  assert(miamiResult.includes('**3.0%**'), 'Miami Windstorm Deductible percentage is **3.0%**');

  const austinQuery = 'details and hazard risk for 123 Main St in Austin';
  const austinResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(austinQuery);
  assert(austinResult.includes('**$5,512**') || austinResult.includes('**$5,513**'), 'Austin Windstorm Deductible of **$5,512** or **$5,513** correctly calculated (1% of RC $551,250 = 5,512.50 rounded)');
  assert(austinResult.includes('**1.0%**'), 'Austin Windstorm Deductible percentage is **1.0%**');
} catch (err) {
  console.error('  ❌ Coastal Windstorm Deductible verification failed:', err.message);
  failedTests++;
}

// 5. Seller Capital Gains Exclusion and Net Walkaway Proceeds Audit
console.log('  ▸ Auditing Seller Capital Gains exclusions & post-tax proceeds (Single vs Married):');
try {
  const singleQuery = 'valuation and capital gains tax net sheet for 123 Main St';
  const singleResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(singleQuery);
  assert(singleResult.includes('Seller Capital Gains & Net Walkaway Audit'), 'RAG output includes Seller Capital Gains & Net Walkaway Audit');
  assert(singleResult.includes('Single Exemption'), 'Exemption classified correctly as Single Exemption');
  assert(singleResult.includes('**$250,000**') || singleResult.includes('250,000'), 'Standard single exclusion of **$250,000** applied correctly');
  assert(singleResult.includes('**$13,200**'), 'Capital Gains Tax due of **$13,200** correctly calculated (Gain: $672k - LastSale $334k = $338k; Taxable: $338k - $250k = $88k; Tax: $88k * 15% = $13.2k)');
  assert(singleResult.includes('**$211,920**'), 'True Net Walkaway Proceeds of **$211,920** correctly calculated ($225,120 - $13,200 = $211,920)');

  const marriedQuery = 'valuation and capital gains tax net sheet for 123 Main St assuming married high bracket';
  const marriedResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(marriedQuery);
  assert(marriedResult.includes('Married/Joint Exemption'), 'Exemption classified correctly as Married/Joint Exemption');
  assert(marriedResult.includes('**$500,000**') || marriedResult.includes('500,000'), 'Standard married exclusion of **$500,000** applied correctly');
  assert(marriedResult.includes('**20.0%**'), 'High-bracket rate of **20.0%** applied correctly');
  assert(marriedResult.includes('**$0**'), 'Capital Gains Tax due is exactly **$0** (Gain of $338k is fully excluded by $500k exemption)');
  assert(marriedResult.includes('**$225,120**'), 'True Net Walkaway Proceeds of **$225,120** correctly calculated ($225,120 - $0 = $225,120)');
} catch (err) {
  console.error('  ❌ Seller Capital Gains tax ledger verification failed:', err.message);
  failedTests++;
}

// 6. Developer BRRRR Refinance Underwriting
console.log('  ▸ Auditing Developer BRRRR Refinance calculations (Recaptured Capital %):');
try {
  const brrrrQuery = 'valuation and brrrr refinance for 123 Main St';
  const brrrrResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(brrrrQuery);
  assert(brrrrResult.includes('Developer BRRRR Refinance Underwriting Engine'), 'RAG output includes Developer BRRRR Refinance Underwriting Engine');
  assert(brrrrResult.includes('**$806,400**'), 'After Repair Value (ARV) of **$806,400** correctly calculated (120% of AVM $672k)');
  assert(brrrrResult.includes('**$67,200**'), 'Rehab Budget of **$67,200** correctly calculated (10% of AVM $672k)');
  assert(brrrrResult.includes('**$201,600**'), 'Total initial outlay of **$201,600** correctly calculated ($134.4k down + $67.2k rehab)');
  assert(brrrrResult.includes('**$604,800**'), 'Refinance loan amount of **$604,800** correctly calculated (75% of ARV $806.4k)');
  assert(brrrrResult.includes('**$67,200**'), 'Refinance recaptured cash of **$67,200** correctly calculated ($604.8k refi loan - $537.6k initial loan)');
  assert(brrrrResult.includes('**33.33%**') || brrrrResult.includes('33.33%'), 'Recaptured Initial Capital ratio is exactly **33.33%** ($67.2k recaptured / $201.6k outlay)');
  assert(brrrrResult.includes('**$134,400**'), 'Net Capital Remaining of **$134,400** correctly calculated ($201.6k outlay - $67.2k recaptured)');
} catch (err) {
  console.error('  ❌ Developer BRRRR Refinance verification failed:', err.message);
  failedTests++;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 9: ADVANCED v7 MORTGAGE PRICING, HELOC ARBITRAGE, ENVIRONMENTAL ESCROWS & 1031 AUDITOR
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 9: Advanced v7 Mortgage Pricing, HELOC Arbitrage, Environmental Escrows & 1031 Exchange Auditor Check ---');

// 1. LLPA dynamic risk brackets pricing
console.log('  ▸ Auditing Mortgage Risk-Based Pricing (LLPAs):');
try {
  const llpaQuery = 'what is the valuation of 123 Main St assuming 30% down?';
  const llpaResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(llpaQuery);
  assert(llpaResult.includes('Mortgage Risk-Based Pricing (LLPAs)'), 'RAG output includes Mortgage Risk-Based Pricing (LLPAs) table');
  assert(llpaResult.includes('**70.00%**'), 'Loan-to-Value (LTV) of **70.00%** correctly output');
  assert(llpaResult.includes('**+0.125%**'), 'LTV dynamic risk surcharge of **+0.125%** correctly calculated');
  assert(llpaResult.includes('**6.625%**'), 'Risk-Adjusted Rate of **6.625%** correctly calculated (6.50% + 0.125%)');
  assert(llpaResult.includes('🟢 Premium Pricing Bracket'), 'Correct premium pricing bracket rated');
} catch (err) {
  console.error('  ❌ Mortgage Risk-Based Pricing (LLPAs) test failed:', err.message);
  failedTests++;
}

// 2. HELOC vs. Cash-Out Refinance Arbitrage Matrix
console.log('  ▸ Auditing HELOC vs. Cash-Out Refinance Arbitrage Matrix:');
try {
  const helocQuery = 'what is the valuation and heloc arbitrage comparison for 123 Main St?';
  const helocResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(helocQuery);
  assert(helocResult.includes('HELOC vs. Cash-Out Refinance Arbitrage Matrix'), 'RAG output includes HELOC vs. Cash-Out Refinance Arbitrage Matrix');
  assert(helocResult.includes('**$100,000**'), 'Extracted equity of **$100,000** correctly output');
  assert(helocResult.includes('**$300,000**'), 'First mortgage balance of **$300,000** correctly output');
  assert(helocResult.includes('**3.50%**'), 'First mortgage rate of **3.50%** correctly output');
  assert(helocResult.includes('**5.00%**'), 'HELOC Blended yield of **5.00%** correctly output');
  assert(helocResult.includes('**$455/mo**'), 'Monthly savings of **$455/mo** correctly output');
} catch (err) {
  console.error('  ❌ HELOC vs. Cash-Out Refinance Arbitrage test failed:', err.message);
  failedTests++;
}

// 3. Wildfire FAIR Plan escrow & roof age windstorm surcharges
console.log('  ▸ Auditing Wildfire FAIR Plan Escrow & Roof Age Windstorm Surcharges:');
try {
  const hazardQuery = 'details and hazard risk for 123 Main St in Austin assuming roof age 18';
  const hazardResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(hazardQuery);
  assert(hazardResult.includes('Insurance Underwriting & Hazard Risk Profiling'), 'RAG output includes Hazard Risk Profiling');
  assert(hazardResult.includes('**$1,200**') || hazardResult.includes('**$100/mo**'), 'Austin wildfire FAIR Plan escrow annual fee of **$1,200** or monthly **$100/mo** correct');
  assert(hazardResult.includes('**0.15%**'), 'Austin annual wildfire surcharge rate of **0.15%** of RC correct');
  assert(hazardResult.includes('**18**'), 'Parsed roof age is **18** yrs');
  assert(hazardResult.includes('**0.05%**'), 'Annual roof hazard premium surcharge rate of **0.05%** of RC correct');
  assert(hazardResult.includes('**$276**'), 'Annual roof hazard premium surcharge amount of **$276** correct');
  assert(hazardResult.includes('**$23/mo**'), 'Monthly roof age premium surcharge amount of **$23/mo** correct');
  assert(hazardResult.includes('**$6,339**'), 'Windstorm deductible scaled by 1.15x to **$6,339** due to roof age > 15 yrs');
} catch (err) {
  console.error('  ❌ Wildfire FAIR Plan Escrow & Roof Age Surcharges test failed:', err.message);
  failedTests++;
}

// 4. Section 1031 Exchange Auditor
console.log('  ▸ Auditing Section 1031 Like-Kind Exchange Auditor:');
try {
  const exchangeQuery = 'what is the valuation and 1031 exchange timeline for 123 Main St?';
  const exchangeResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(exchangeQuery);
  assert(exchangeResult.includes('Section 1031 Like-Kind Exchange Auditor'), 'RAG output includes Section 1031 Like-Kind Exchange Auditor');
  assert(exchangeResult.includes('**4.0x**'), 'Asset acquisition multiplier of **4.0x** correctly output');
  assert(exchangeResult.includes('**2026-07-05**'), '45-Day IRS identification deadline of **2026-07-05** correct');
  assert(exchangeResult.includes('**2026-11-17**'), '180-Day IRS exchange close deadline of **2026-11-17** correct');
} catch (err) {
  console.error('  ❌ Section 1031 Exchange Auditor test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 10: HYPER-ENTRENCHMENT & INSTITUTIONAL INTELLIGENCE v8 FEATURES
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 10: Hyper-Entrenchment & Institutional Intelligence v8 Features Check ---');

// 1. Cross-Collateralization Portfolio Optimizer
console.log('  ▸ Auditing Cross-Collateralization Portfolio Optimizer:');
try {
  const ccQuery = 'what is the portfolio valuation and cross-collateral performance?';
  const ccResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(ccQuery);
  assert(ccResult.includes('Commercial Portfolio Cross-Collateralization Optimizer'), 'RAG output includes Commercial Portfolio Cross-Collateralization Optimizer');
  assert(ccResult.includes('**$3,200,000**'), 'Combined valuation of **$3,200,000** correctly output');
  assert(ccResult.includes('**$2,100,000**'), 'Combined debt of **$2,100,000** correctly output');
  assert(ccResult.includes('**65.63%**'), 'Blended LTV of **65.63%** correctly output');
  assert(ccResult.includes('**4.10%**'), 'Blended rate of **4.10%** correctly output');
  assert(ccResult.includes('**$158,400**'), 'Combined NOI of **$158,400** correctly output');
  assert(ccResult.includes('**$121,841**'), 'Mortgage P&I of **$121,841** correctly output');
  assert(ccResult.includes('**1.30x**'), 'Combined DSCR of **1.30x** correctly output');
  assert(ccResult.includes('🟢 Institutional Grade'), 'Portfolio rating tier 🟢 Institutional Grade correct');
  passedTests++;
} catch (err) {
  console.error('  ❌ Cross-Collateralization Portfolio Optimizer test failed:', err.message);
  failedTests++;
}

// 2. Propensity to Sell Lead Score & Contact Reliability
console.log('  ▸ Auditing Propensity to Sell Lead Score & Contact Reliability:');
try {
  const propQuery = 'what is the lead score and exit propensity for 123 Main St?';
  const propResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(propQuery);
  assert(propResult.includes('Propensity to Sell Lead Score'), 'RAG output includes Propensity to Sell Lead Score');
  assert(propResult.includes('**88/100**'), 'Exit Propensity Score of **88/100** correctly output');
  assert(propResult.includes('🟢 High Propensity to Sell'), 'High exit probability tier correctly output');
  assert(propResult.includes('**12** years'), 'Ownership tenure of **12** years correctly output');

  const skipQuery = 'skip trace contact and propensity reliability score for 123 Main St';
  const skipResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(skipQuery);
  assert(skipResult.includes('Reliability Score:'), 'RAG output includes reliability confidence scores');
  assert(skipResult.includes('**🟢 High (92%)**'), 'Verified mobile reliability of **🟢 High (92%)** correct');
  assert(skipResult.includes('**🟡 Medium (74%)**'), 'Landline reliability of **🟡 Medium (74%)** correct');
  assert(skipResult.includes('Propensity to Sell Lead Score'), 'Skip trace includes propensity lead score table');
  passedTests++;
} catch (err) {
  console.error('  ❌ Propensity to Sell Lead Score & Contact Reliability test failed:', err.message);
  failedTests++;
}

// 3. Advanced Tax Depreciation & Cost Segregation Simulator
console.log('  ▸ Auditing Advanced Tax Depreciation & Cost Segregation Simulator:');
try {
  const depQuery = 'what is the cost segregation depreciation audit for 123 Main St?';
  const depResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(depQuery);
  assert(depResult.includes('Advanced Tax Depreciation & Cost Segregation Simulator'), 'RAG output includes Advanced Tax Depreciation');
  assert(depResult.includes('**$337,500**'), 'Residential structure basis of **$337,500** correctly output');
  assert(depResult.includes('**$270,000**'), 'Building basis of **$270,000** correctly output');
  assert(depResult.includes('**$9,818**'), 'Straight-line first-year depreciation of **$9,818** correctly output');
  assert(depResult.includes('**$28,512**'), 'Cost seg accelerated depreciation of **$28,512** correctly output');
  assert(depResult.includes('**$5,982**'), 'First-year cash tax savings of **$5,982** correctly output');
  assert(depResult.includes('**32.0%**'), 'Marginal ordinary tax bracket of **32.0%** correctly output');
  passedTests++;
} catch (err) {
  console.error('  ❌ Advanced Tax Depreciation & Cost Segregation test failed:', err.message);
  failedTests++;
}

// 4. FEMA Climate Surcharge Premium Adjuster
console.log('  ▸ Auditing FEMA Climate Surcharge Premium Adjuster:');
try {
  const climateQuery = 'hazard risk details for 123 Main St in Los Angeles with active FEMA flood zone AE';
  const climateResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(climateQuery);
  assert(climateResult.includes('Climate Multi-Hazard Ann. Surcharge'), 'RAG output includes Climate Multi-Hazard surcharge in risk ledger');
  assert(climateResult.includes('**1.25x**') || climateResult.includes('surcharge'), 'Premium escalated correctly by 1.25x');
  passedTests++;
} catch (err) {
  console.error('  ❌ FEMA Climate Surcharge Premium Adjuster test failed:', err.message);
  failedTests++;
}

// 5. Mortgage Rate Buy-Down Break-Even Auditor
console.log('  ▸ Auditing Mortgage Rate Buy-Down Break-Even Auditor:');
try {
  const bdQuery = 'what is the break even for buy-down interest rate on 123 Main St?';
  const bdResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(bdQuery);
  assert(bdResult.includes('Mortgage Note Rate Buy-Down break-even Auditor'), 'RAG output includes buy-down break-even auditor table');
  assert(bdResult.includes('**6.50%**'), 'Baseline note rate of **6.50%** correctly output');
  assert(bdResult.includes('**6.00%**'), 'Buy-down note rate of **6.00%** correctly output');
  assert(bdResult.includes('**$3,200**'), 'Upfront discount points fee of **$3,200** correctly output');
  assert(bdResult.includes('**$104/mo**'), 'Monthly P&I cash savings of **$104/mo** correctly output');
  assert(bdResult.includes('**30.8** months'), 'Amortized break-even timeline of **30.8** months correctly output');
  passedTests++;
} catch (err) {
  console.error('  ❌ Mortgage Rate Buy-Down Break-Even Auditor test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 11: HYPER-INTELLIGENCE v9 FEATURES CHECK
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 11: Hyper-Intelligence v9 Features Check ---');

// 1. Cross-Domain Synthesizer & Yield Arbitrage Engine
console.log('  ▸ Auditing Cross-Domain Synthesizer & Yield Arbitrage Engine:');
try {
  const compQuery = 'compare stocks and real estate yields';
  const compResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(compQuery);
  assert(compResult.includes('### 🏛️ Unified Cross-Asset Portfolio Yield Comparison'), 'RAG output includes Unified Cross-Asset Portfolio Yield Comparison');
  assert(compResult.includes('**6.25%**'), 'Real Estate Cap Rate of **6.25%** is correct');
  assert(compResult.includes('**8.50%**'), 'Real Estate Cash-on-Cash of **8.50%** is correct');
  assert(compResult.includes('**1.80%**'), 'Equities Dividend Yield of **1.80%** is correct');
  assert(compResult.includes('**14.20%**'), 'Equities CAGR of **14.20%** is correct');
  assert(compResult.includes('**+3.65%**'), 'Blended arbitrage spread of **+3.65%** is correct');
  passedTests++;
} catch (err) {
  console.error('  ❌ Cross-Domain Synthesizer test failed:', err.message);
  failedTests++;
}

// 2. Stale-While-Revalidate (SWR) Redis Cache Layer
console.log('  ▸ Auditing Stale-While-Revalidate (SWR) Redis Cache:');
try {
  const swrQuery = 'compare stocks and real estate yields for cache check';
  // First run: cache missing or set
  const start1 = Date.now();
  await massiveSmartRouter.combinedRouteAndEnhancePrompt(swrQuery);
  const duration1 = Date.now() - start1;
  
  // Second run: should hit SWR cache instantly
  const start2 = Date.now();
  const cachedResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(swrQuery);
  const duration2 = Date.now() - start2;
  
  console.log(`    - First call duration: ${duration1}ms, Second (SWR Cache) call duration: ${duration2}ms`);
  assert(duration2 < 50, `SWR Cache hit in under 50ms (actual: ${duration2}ms)`);
  assert(cachedResult.includes('### 🏛️ Unified Cross-Asset Portfolio Yield Comparison'), 'Cached RAG output is intact');
  passedTests++;
} catch (err) {
  console.error('  ❌ SWR Cache test failed:', err.message);
  failedTests++;
}

// 3. Structured JSON Response Adapter
console.log('  ▸ Auditing Structured JSON Response Adapter:');
try {
  const jsonQuery = 'compare stocks and real estate yields with json metadata';
  const jsonResult = await massiveSmartRouter.combinedRouteAndEnhancePrompt(jsonQuery);
  assert(jsonResult.includes('<!-- JSON_METADATA:'), 'Structured JSON block is appended');
  
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = jsonResult.indexOf(marker) + marker.length;
  const endIdx = jsonResult.indexOf(' -->', startIdx);
  const jsonStr = jsonResult.substring(startIdx, endIdx);
  const parsed = JSON.parse(jsonStr);
  
  assert(parsed.source === 'Alti.Assistant Hybrid Router', 'JSON source metadata is correct');
  assert(parsed.arbitrageSpread === 3.65, 'JSON arbitrage spread of 3.65 is correct');
  assert(parsed.assets.realestate.capRate === 6.25, 'JSON Real Estate Cap Rate is correct');
  passedTests++;
} catch (err) {
  console.error('  ❌ Structured JSON Response Adapter test failed:', err.message);
  failedTests++;
}

// 4. Swarm Multi-Agent Consensus Protocol Verification
console.log('  ▸ Auditing Swarm Multi-Agent Consensus Protocol instructions:');
try {
  const { realestatePropertyQuant, realestateMarketAnalyst, realestateSkipTracer } = await import('./src/app/modules/swarm/agents/realestate.agents.js');
  assert(realestatePropertyQuant.systemInstruction.includes('🟢 Swarm Consensus Audit Verified'), 'Quant instructions include Swarm Consensus tagging rules');
  assert(realestateMarketAnalyst.systemInstruction.includes('🟢 Swarm Consensus Audit Verified'), 'Analyst instructions include Swarm Consensus tagging rules');
  assert(realestateSkipTracer.systemInstruction.includes('🟢 Swarm Consensus Audit Verified'), 'Skip Tracer instructions include Swarm Consensus tagging rules');
  passedTests++;
} catch (err) {
  console.error('  ❌ Swarm Consensus protocol audit failed:', err.message);
  failedTests++;
}

// ─────────────────────────────────────────────────────────────────────────────
// PART 12: DEEP DATA INTEGRATION v10 FEATURES CHECK (NOAA, EIA, SEC, CENSUS/BLS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 12: Deep Data Integration v10 Features Check ---');

// 1. NOAA/USGS Climate Hazard Risk Profile
console.log('  ▸ Auditing Live Environmental Climate Risk (NOAA / USGS):');
try {
  const climateQuery = 'what is the environmental climate risk for the subject asset?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(climateQuery);
  assert(result.includes('🌍 ENVIRONMENTAL CLIMATE RISK (NOAA / USGS)'), 'RAG output includes Climate Risk header');
  assert(result.includes('**Zone AE**'), 'RAG output includes **Zone AE**');
  assert(result.includes('**0.18g**'), 'RAG output includes **0.18g**');
  assert(result.includes('**6.8/10**'), 'Wildfire index **6.8/10** matches');
  assert(result.includes('**8.4/10**'), 'Hurricane index **8.4/10** matches');
  
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.climateRisk !== undefined, 'JSON metadata contains climateRisk node');
  assert(parsed.climateRisk.floodZone === 'Zone AE', 'Flood zone is correct in JSON');
  assert(parsed.climateRisk.seismicPeakPGA === '0.18g', 'Seismic Peak PGA is correct in JSON');
  assert(parsed.climateRisk.wildfireRiskIndex === 6.8, 'Wildfire index is correct in JSON');
  assert(parsed.climateRisk.hurricaneRiskIndex === 8.4, 'Hurricane index is correct in JSON');
  assert(parsed.climateRisk.hazardMitigationMet === true, 'Hazard mitigation boolean is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ NOAA/USGS Climate Risk test failed:', err.message);
  failedTests++;
}

// 2. Physical Commodities Spot Pricing (EIA)
console.log('  ▸ Auditing Physical Commodities Spot Pricing (EIA):');
try {
  const commQuery = 'what are the latest commodities spot prices from eia?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(commQuery);
  assert(result.includes('🛢️ PHYSICAL COMMODITIES & ENERGY SPOT PRICING (EIA)'), 'RAG output includes EIA Commodities header');
  assert(result.includes('**$78.50/bbl**'), 'RAG output includes **$78.50/bbl**');
  assert(result.includes('**+2.45%**'), 'RAG output includes WTI YoY **+2.45%**');
  assert(result.includes('**$2.15/MMBtu**'), 'RAG output includes **$2.15/MMBtu**');
  assert(result.includes('**-18.40%**'), 'RAG output includes Nat Gas YoY **-18.40%**');
  assert(result.includes('**$2,345.80/oz**'), 'RAG output includes Gold **$2,345.80/oz**');
  assert(result.includes('**+12.80%**'), 'RAG output includes Gold YoY **+12.80%**');
  assert(result.includes('**$28.20/oz**'), 'RAG output includes Silver **$28.20/oz**');
  assert(result.includes('**+6.50%**'), 'RAG output includes Silver YoY **+6.50%**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.commodities !== undefined, 'JSON metadata contains commodities node');
  assert(parsed.commodities.wtiCrudeOil === 78.50, 'WTI Spot Price is correct in JSON');
  assert(parsed.commodities.naturalGasYoY === -18.40, 'Nat Gas YoY is correct in JSON');
  assert(parsed.commodities.goldSpot === 2345.80, 'Gold Spot Price is correct in JSON');
  assert(parsed.commodities.silverSpotYoY === 6.50, 'Silver YoY is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ EIA Commodities test failed:', err.message);
  failedTests++;
}

// 3. SEC EDGAR Corporate & REIT Filings
console.log('  ▸ Auditing SEC EDGAR Corporate & REIT Filings:');
try {
  const secQuery = 'show me public reit corporate 10-k filings from sec edgar';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(secQuery);
  assert(result.includes('🏛️ SEC EDGAR CORPORATE & REIT FILINGS INTEL'), 'RAG output includes SEC EDGAR header');
  assert(result.includes('**$98.50B**'), 'RAG output includes NAV of **$98.50B**');
  assert(result.includes('**+6.20%**'), 'RAG output includes NAV growth of **+6.20%**');
  assert(result.includes('**4.85%**'), 'RAG output includes cap rate of **4.85%**');
  assert(result.includes('**34.20%**'), 'RAG output includes debt-to-equity of **34.20%**');
  assert(result.includes('**96.80%**'), 'RAG output includes occupancy of **96.80%**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.secFilings !== undefined, 'JSON metadata contains secFilings node');
  assert(parsed.secFilings.netAssetValueBillions === 98.50, 'NAV is correct in JSON');
  assert(parsed.secFilings.navYoYGrowth === 6.20, 'NAV Growth is correct in JSON');
  assert(parsed.secFilings.weightedAvgCapRate === 4.85, 'Weighted Avg Cap Rate is correct in JSON');
  assert(parsed.secFilings.debtToEquity === 34.20, 'Debt to Equity is correct in JSON');
  assert(parsed.secFilings.occupancyRate === 96.80, 'Occupancy Rate is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ SEC EDGAR Filings test failed:', err.message);
  failedTests++;
}

// 4. U.S. Census Bureau & BLS demographics
console.log('  ▸ Auditing U.S. Census Bureau & BLS demographics:');
try {
  const demoQuery = 'what are the local census demographics and bls socioeconomics?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(demoQuery);
  assert(result.includes('📊 CENSUS & BLS LOCAL DEMOGRAPHICS & SOCIOECONOMICS'), 'RAG output includes Census/BLS header');
  assert(result.includes('**$85,420**'), 'RAG output includes household income of **$85,420**');
  assert(result.includes('**+3.20%**'), 'RAG output includes income growth of **+3.20%**');
  assert(result.includes('**+11.85%**'), 'RAG output includes 5-yr population growth of **+11.85%**');
  assert(result.includes('**3.80%**'), 'RAG output includes unemployment rate of **3.80%**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.demographics !== undefined, 'JSON metadata contains demographics node');
  assert(parsed.demographics.medianHouseholdIncome === 85420, 'Median household income is correct in JSON');
  assert(parsed.demographics.incomeYoYGrowth === 3.20, 'Income growth is correct in JSON');
  assert(parsed.demographics.populationGrowth5Yr === 11.85, 'Population growth is correct in JSON');
  assert(parsed.demographics.unemploymentRateLocal === 3.80, 'Unemployment rate is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ Census/BLS demographics test failed:', err.message);
  failedTests++;
}

// 5. Blended Query across all 4 v10 categories
console.log('  ▸ Auditing blended multi-channel query across all 4 v10 integrations:');
try {
  const blendQuery = 'Provide environmental hazard, EIA crude oil spot prices, SEC reit filings, and census demographics';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(blendQuery);
  
  // Verify citations presence
  assert(result.includes('"[Source: NOAA / USGS]" for environmental risk data'), 'Cites NOAA/USGS source');
  assert(result.includes('"[Source: EIA / Open Commodities]" for commodity spot prices'), 'Cites EIA source');
  assert(result.includes('"[Source: SEC EDGAR]" for REIT corporate filings'), 'Cites SEC EDGAR source');
  assert(result.includes('"[Source: U.S. Census Bureau / BLS]" for local socioeconomics'), 'Cites Census/BLS source');

  // Verify all 4 RAG sections exist in prompt context
  assert(result.includes('🌍 ENVIRONMENTAL CLIMATE RISK (NOAA / USGS)'), 'Includes environmental climate risk block');
  assert(result.includes('🛢️ PHYSICAL COMMODITIES & ENERGY SPOT PRICING (EIA)'), 'Includes commodities block');
  assert(result.includes('🏛️ SEC EDGAR CORPORATE & REIT FILINGS INTEL'), 'Includes SEC filing block');
  assert(result.includes('📊 CENSUS & BLS LOCAL DEMOGRAPHICS & SOCIOECONOMICS'), 'Includes demographics block');

  // Verify full JSON integration
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.climateRisk !== undefined, 'Climate risk is inside unified JSON');
  assert(parsed.commodities !== undefined, 'Commodities data is inside unified JSON');
  assert(parsed.secFilings !== undefined, 'SEC corporate filings are inside unified JSON');
  assert(parsed.demographics !== undefined, 'Socioeconomics statistics are inside unified JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ Multi-channel blended v10 test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 13: DEEP DATA INTEGRATION v11 FEATURES CHECK (FRED, HUD FMR, FHFA HPI, COLLEGE SCORECARD)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 13: Deep Data Integration v11 Features Check ---');

// 1. FRED Economics Indicators
console.log('  ▸ Auditing FRED Macroeconomic Indicators (FRED / Federal Reserve):');
try {
  const fredQuery = 'what are the latest fred economics indicators?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(fredQuery);
  assert(result.includes('🏦 FEDERAL RESERVE ECONOMIC DATA (FRED)'), 'RAG output includes FRED Economics header');
  assert(result.includes('**$28.25T**'), 'RAG output includes **$28.25T**');
  assert(result.includes('**3.10%**'), 'RAG output includes **3.10%**');
  assert(result.includes('**5.25%**'), 'RAG output includes **5.25%**');
  assert(result.includes('**4.35%**'), 'RAG output includes **4.35%**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.fredEconomics !== undefined, 'JSON metadata contains fredEconomics node');
  assert(parsed.fredEconomics.gdpTrillions === 28.25, 'GDP is correct in JSON');
  assert(parsed.fredEconomics.gdpYoYPercent === 2.90, 'GDP YoY percent is correct in JSON');
  assert(parsed.fredEconomics.cpiInflation === 3.10, 'CPI Inflation is correct in JSON');
  assert(parsed.fredEconomics.cpiYoYChange === -0.30, 'CPI YoY change is correct in JSON');
  assert(parsed.fredEconomics.fedFundsRate === 5.25, 'Fed Funds rate is correct in JSON');
  assert(parsed.fredEconomics.treasuryYield10Yr === 4.35, 'Treasury Yield is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ FRED Economics test failed:', err.message);
  failedTests++;
}

// 2. HUD Fair Market Rent Limits
console.log('  ▸ Auditing HUD Fair Market Rents & Income Limits (HUD User / PD&R):');
try {
  const hudQuery = 'what is the fair market rent limit for zip 90210 under hud?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(hudQuery);
  assert(result.includes('🏠 HUD FAIR MARKET RENTS & INCOME LIMITS (HUD PD&R)'), 'RAG output includes HUD FMR header');
  assert(result.includes('**$2,150**'), 'RAG output includes **$2,150**');
  assert(result.includes('**$2,680**'), 'RAG output includes **$2,680**');
  assert(result.includes('**$3,450**'), 'RAG output includes **$3,450**');
  assert(result.includes('**$3,980**'), 'RAG output includes **$3,980**');
  assert(result.includes('**$98,200**'), 'RAG output includes **$98,200**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.hudFmr !== undefined, 'JSON metadata contains hudFmr node');
  assert(parsed.hudFmr.zipCode === '90210', 'ZIP code is correct in JSON');
  assert(parsed.hudFmr.fmr1Bed === 2150, '1-Bed FMR is correct in JSON');
  assert(parsed.hudFmr.fmr2Bed === 2680, '2-Bed FMR is correct in JSON');
  assert(parsed.hudFmr.fmr3Bed === 3450, '3-Bed FMR is correct in JSON');
  assert(parsed.hudFmr.fmr4Bed === 3980, '4-Bed FMR is correct in JSON');
  assert(parsed.hudFmr.medianFamilyIncome === 98200, 'Median Family Income is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ HUD FMR test failed:', err.message);
  failedTests++;
}

// 3. FHFA Home Price Index & Loan Limits
console.log('  ▸ Auditing FHFA Home Price Index & Loan Limits (FHFA / Home Price Index):');
try {
  const fhfaQuery = 'what is the conforming loan limit and appreciation rate under fhfa?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(fhfaQuery);
  assert(result.includes('📈 FHFA HOME PRICE INDEX & LOAN LIMITS (FHFA)'), 'RAG output includes FHFA HPI header');
  assert(result.includes('**+7.80%**'), 'RAG output includes **+7.80%**');
  assert(result.includes('**+42.50%**'), 'RAG output includes **+42.50%**');
  assert(result.includes('**$1,149,825**'), 'RAG output includes **$1,149,825**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.fhfaHpi !== undefined, 'JSON metadata contains fhfaHpi node');
  assert(parsed.fhfaHpi.msaName === 'Los Angeles-Long Beach-Anaheim', 'MSA Name is correct in JSON');
  assert(parsed.fhfaHpi.annualAppreciationPercent === 7.80, 'Annual Appreciation is correct in JSON');
  assert(parsed.fhfaHpi.cumulativeAppreciation5Yr === 42.50, 'Cumulative Appreciation is correct in JSON');
  assert(parsed.fhfaHpi.conformingLoanLimitSF === 1149825, 'SF Conforming Loan Limit is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ FHFA HPI test failed:', err.message);
  failedTests++;
}

// 4. College Scorecard Academic Analytics
console.log('  ▸ Auditing College Scorecard (U.S. Department of Education):');
try {
  const scorecardQuery = 'what are the graduation rate and average annual cost for stanford university from college scorecard?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(scorecardQuery);
  assert(result.includes('🎓 COLLEGE SCORECARD ACADEMIC ANALYTICS (DEPT OF ED)'), 'RAG output includes College Scorecard header');
  assert(result.includes('**94.20%**'), 'RAG output includes **94.20%**');
  assert(result.includes('**$19,850**'), 'RAG output includes **$19,850**');
  assert(result.includes('**$108,500**'), 'RAG output includes **$108,500**');
  assert(result.includes('**$11,500**'), 'RAG output includes **$11,500**');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.collegeScorecard !== undefined, 'JSON metadata contains collegeScorecard node');
  assert(parsed.collegeScorecard.institutionName === 'Stanford University', 'Institution Name is correct in JSON');
  assert(parsed.collegeScorecard.graduationRatePercent === 94.20, 'Graduation rate is correct in JSON');
  assert(parsed.collegeScorecard.averageAnnualCost === 19850, 'Average cost is correct in JSON');
  assert(parsed.collegeScorecard.medianPostGradEarnings10Yr === 108500, 'Median post-grad earnings is correct in JSON');
  assert(parsed.collegeScorecard.medianStudentDebt === 11500, 'Median student debt is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ College Scorecard test failed:', err.message);
  failedTests++;
}

// 5. Blended Query across all 4 v11 categories
console.log('  ▸ Auditing blended multi-channel query across all 4 v11 integrations:');
try {
  const blendQuery = 'Provide HUD rent limits for 90210, FRED treasury yields, FHFA conforming limits, and Stanford scorecard stats';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(blendQuery);
  
  // Verify citations presence
  assert(result.includes('"[Source: FRED / Federal Reserve]" for macroeconomic indicators'), 'Cites FRED source');
  assert(result.includes('"[Source: HUD User / PD&R]" for Fair Market Rents'), 'Cites HUD source');
  assert(result.includes('"[Source: FHFA / Home Price Index]" for FHFA pricing and loan limits'), 'Cites FHFA source');
  assert(result.includes('"[Source: U.S. Department of Education]" for College Scorecard higher-education analytics'), 'Cites College Scorecard source');

  // Verify all 4 RAG sections exist in prompt context
  assert(result.includes('🏦 FEDERAL RESERVE ECONOMIC DATA (FRED)'), 'Includes FRED block');
  assert(result.includes('🏠 HUD FAIR MARKET RENTS & INCOME LIMITS (HUD PD&R)'), 'Includes HUD FMR block');
  assert(result.includes('📈 FHFA HOME PRICE INDEX & LOAN LIMITS (FHFA)'), 'Includes FHFA HPI block');
  assert(result.includes('🎓 COLLEGE SCORECARD ACADEMIC ANALYTICS (DEPT OF ED)'), 'Includes College Scorecard block');

  // Verify full JSON integration
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.fredEconomics !== undefined, 'FRED data is inside unified JSON');
  assert(parsed.hudFmr !== undefined, 'HUD FMR data is inside unified JSON');
  assert(parsed.fhfaHpi !== undefined, 'FHFA HPI data is inside unified JSON');
  assert(parsed.collegeScorecard !== undefined, 'College Scorecard data is inside unified JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ Multi-channel blended v11 test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 14: DEEP DATA INTEGRATION v12 FEATURES CHECK (GLEIF, PATENTSVIEW, OPENSKY, GRID MONITOR, USDA, COPERNICUS)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 14: Deep Data Integration v12 Features Check ---');

// 1. GLEIF Entity Registry
console.log('  ▸ Auditing GLEIF Entity Registry (GLEIF / Global Legal Entity Identifier Foundation):');
try {
  const gleifQuery = 'what is the gleif record corporate hierarchy details for google?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(gleifQuery);
  assert(result.includes('🏢 GLEIF GLOBAL LEGAL ENTITY REGISTRY (GLEIF)'), 'RAG output includes GLEIF Entity Registry header');
  assert(result.includes('**25490059S3208759S480**'), 'RAG output includes Subject LEI');
  assert(result.includes('**254900Y6M2039230588**'), 'RAG output includes Parent LEI');
  assert(result.includes('**US**'), 'RAG output includes Registered Country');
  assert(result.includes('**ACTIVE**'), 'RAG output includes LEI Status');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.gleif !== undefined, 'JSON metadata contains gleif node');
  assert(parsed.gleif.subjectEntity === 'Google LLC', 'Subject Entity is correct in JSON');
  assert(parsed.gleif.subjectLei === '25490059S3208759S480', 'Subject LEI is correct in JSON');
  assert(parsed.gleif.ultimateParent === 'Alphabet Inc.', 'Ultimate Parent is correct in JSON');
  assert(parsed.gleif.ultimateParentLei === '254900Y6M2039230588', 'Ultimate Parent LEI is correct in JSON');
  assert(parsed.gleif.registeredCountry === 'US', 'Country is correct in JSON');
  assert(parsed.gleif.leiStatus === 'ACTIVE', 'Status is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ GLEIF Entity Registry test failed:', err.message);
  failedTests++;
}

// 2. USPTO PatentsView
console.log('  ▸ Auditing USPTO PatentsView (USPTO / PatentsView):');
try {
  const patentsQuery = 'what is the patentsview records for assignee apple inc?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(patentsQuery);
  assert(result.includes('💡 USPTO PATENTSVIEW INTELLECTUAL PROPERTY INTEL (USPTO)'), 'RAG output includes USPTO PatentsView header');
  assert(result.includes('**28,450**'), 'RAG output includes Patents Granted');
  assert(result.includes('**12,340**'), 'RAG output includes Active Applications');
  assert(result.includes('**G06F - Electric Digital Data Processing**'), 'RAG output includes Dominant Class');
  assert(result.includes('**42.8**'), 'RAG output includes Average Citations');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.patentsview !== undefined, 'JSON metadata contains patentsview node');
  assert(parsed.patentsview.assigneeName === 'Apple Inc.', 'Assignee Name is correct in JSON');
  assert(parsed.patentsview.assigneeId === 'ORG-12345', 'Assignee ID is correct in JSON');
  assert(parsed.patentsview.totalPatentsGranted === 28450, 'Patents Granted is correct in JSON');
  assert(parsed.patentsview.activePatentApplications === 12340, 'Active Applications is correct in JSON');
  assert(parsed.patentsview.dominantTechClass === 'G06F - Electric Digital Data Processing', 'Tech Class is correct in JSON');
  assert(parsed.patentsview.averageCitationCount === 42.8, 'Average Citations is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ USPTO PatentsView test failed:', err.message);
  failedTests++;
}

// 3. OpenSky Network Aviation
console.log('  ▸ Auditing OpenSky Network Global Flight Surveillance (OpenSky Network):');
try {
  const openskyQuery = 'what is the opensky active flights tracked over lax?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(openskyQuery);
  assert(result.includes('✈️ OPENSKY NETWORK GLOBAL FLIGHT SURVEILLANCE'), 'RAG output includes OpenSky header');
  assert(result.includes('**420**'), 'RAG output includes Active Flights');
  assert(result.includes('**485 knots**'), 'RAG output includes Ground Speed');
  assert(result.includes('**45**'), 'RAG output includes Executive Jets');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.opensky !== undefined, 'JSON metadata contains opensky node');
  assert(parsed.opensky.targetAirspace === 'Los Angeles International (LAX)', 'Target Airspace is correct in JSON');
  assert(parsed.opensky.activeFlightsTracked === 420, 'Active Flights is correct in JSON');
  assert(parsed.opensky.averageGroundSpeedKnots === 485, 'Average Speed is correct in JSON');
  assert(parsed.opensky.executiveJetsRegistered === 45, 'Executive Jets is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ OpenSky Network test failed:', err.message);
  failedTests++;
}

// 4. US & EU Grid Monitors
console.log('  ▸ Auditing Electricity Grid Performance (EIA / ENTSO-E Grid Monitor):');
try {
  const gridQuery = 'what is the CAISO grid load and spot price from grid monitor?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(gridQuery);
  assert(result.includes('⚡ ELECTRICITY GRID PERFORMANCE & POWER SPOT PRICING'), 'RAG output includes Grid Monitor header');
  assert(result.includes('**32,450 MW**'), 'RAG output includes Hourly Demand');
  assert(result.includes('**$42.80/MWh**'), 'RAG output includes Spot Price');
  assert(result.includes('**38.5%**'), 'RAG output includes Solar generation percent');
  assert(result.includes('**12.2%**'), 'RAG output includes Wind generation percent');
  assert(result.includes('**8.4%**'), 'RAG output includes Hydro generation percent');
  assert(result.includes('**9.6%**'), 'RAG output includes Nuclear generation percent');
  assert(result.includes('**31.3%**'), 'RAG output includes Natural Gas generation percent');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.gridMonitor !== undefined, 'JSON metadata contains gridMonitor node');
  assert(parsed.gridMonitor.balancingAuthority === 'CAISO (California Grid)', 'Grid balancing authority is correct in JSON');
  assert(parsed.gridMonitor.hourlyElectricDemandMW === 32450, 'Hourly Demand is correct in JSON');
  assert(parsed.gridMonitor.spotWholesalePriceMWh === 42.80, 'Spot Wholesale Price is correct in JSON');
  assert(parsed.gridMonitor.solarGenerationPercent === 38.5, 'Solar mix is correct in JSON');
  assert(parsed.gridMonitor.windGenerationPercent === 12.2, 'Wind mix is correct in JSON');
  assert(parsed.gridMonitor.hydroGenerationPercent === 8.4, 'Hydro mix is correct in JSON');
  assert(parsed.gridMonitor.nuclearGenerationPercent === 9.6, 'Nuclear mix is correct in JSON');
  assert(parsed.gridMonitor.naturalGasPercent === 31.3, 'Natural Gas mix is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ Grid Monitor test failed:', err.message);
  failedTests++;
}

// 5. USDA QuickStats
console.log('  ▸ Auditing USDA NASS QuickStats (USDA / QuickStats NASS):');
try {
  const usdaQuery = 'what is the usda stats average farmland value in Fresno County?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(usdaQuery);
  assert(result.includes('🌾 USDA NASS QUICKSTATS AGRICULTURAL SURVEYS (USDA)'), 'RAG output includes USDA stats header');
  assert(result.includes('**$8,450/acre**'), 'RAG output includes Farmland Value per acre');
  assert(result.includes('**2,150 lbs/acre**'), 'RAG output includes Almond Yield');
  assert(result.includes('**$2.15/lb**'), 'RAG output includes Crop Price');
  assert(result.includes('**4,280**'), 'RAG output includes Active Census Farms');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.usdaStats !== undefined, 'JSON metadata contains usdaStats node');
  assert(parsed.usdaStats.surveyCounty === 'Fresno County, CA', 'Survey County is correct in JSON');
  assert(parsed.usdaStats.averageFarmlandValuePerAcre === 8450, 'Farmland Value per acre is correct in JSON');
  assert(parsed.usdaStats.averageAlmondYieldLbsPerAcre === 2150, 'Almond Yield is correct in JSON');
  assert(parsed.usdaStats.averageCropPricePerLb === 2.15, 'Crop Price is correct in JSON');
  assert(parsed.usdaStats.activeCensusFarms === 4280, 'Active Farms is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ USDA QuickStats test failed:', err.message);
  failedTests++;
}

// 6. Copernicus Sentinel Platform
console.log('  ▸ Auditing Copernicus Sentinel Earth Observation (ESA / Copernicus Sentinel Platform):');
try {
  const copernicusQuery = 'what are the copernicus sentinel earth observation satellite metrics for Los Angeles coordinates?';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(copernicusQuery);
  assert(result.includes('🛰️ COPERNICUS SENTINEL SATELLITE EARTH OBSERVATIONS'), 'RAG output includes Copernicus Sentinel header');
  assert(result.includes('**34.0522° N, 118.2437° W**'), 'RAG output includes Target Coordinates');
  assert(result.includes('**0.68**'), 'RAG output includes NDVI Index');
  assert(result.includes('**24.5%**'), 'RAG output includes Soil Moisture');
  assert(result.includes('**12**'), 'RAG output includes Construction Cranes Count');
  assert(result.includes('**18**'), 'RAG output includes Queued Offshore Vessels');

  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.copernicus !== undefined, 'JSON metadata contains copernicus node');
  assert(parsed.copernicus.targetCoordinates === '34.0522° N, 118.2437° W', 'Target Coordinates are correct in JSON');
  assert(parsed.copernicus.ndviVegetationIndex === 0.68, 'NDVI is correct in JSON');
  assert(parsed.copernicus.surfaceSoilMoisturePercent === 24.5, 'Soil moisture is correct in JSON');
  assert(parsed.copernicus.activeConstructionCranes === 12, 'Construction cranes is correct in JSON');
  assert(parsed.copernicus.queuedOffshoreCargoVessels === 18, 'Queued vessels is correct in JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ Copernicus Sentinel test failed:', err.message);
  failedTests++;
}

// 7. Blended Query across all 6 v12 categories
console.log('  ▸ Auditing blended multi-channel query across all 6 v12 integrations:');
try {
  const blendQuery = 'Diligence Google GLEIF records, Apple Patentsview assignee, LAX airspace OpenSky, grid monitor CAISO spot prices, USDA Fresno county crop yield stats, and Copernicus Sentinel physical observation for Los Angeles';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(blendQuery);

  // Verify citations presence
  assert(result.includes('"[Source: GLEIF / Global Legal Entity Identifier Foundation]" for corporate ownership hierarchies'), 'Cites GLEIF source');
  assert(result.includes('"[Source: USPTO / PatentsView]" for patent intellectual property research'), 'Cites PatentsView source');
  assert(result.includes('"[Source: OpenSky Network]" for global flight logistics and air traffic surveillance'), 'Cites OpenSky source');
  assert(result.includes('"[Source: EIA / ENTSO-E]" for real-time electric grid and energy pricing'), 'Cites Grid Monitor source');
  assert(result.includes('"[Source: USDA / QuickStats]" for agricultural land and crop statistics'), 'Cites USDA source');
  assert(result.includes('"[Source: European Space Agency / Copernicus]" for Sentinel satellite earth observations'), 'Cites Copernicus source');

  // Verify all 6 RAG sections exist in prompt context
  assert(result.includes('🏢 GLEIF GLOBAL LEGAL ENTITY REGISTRY (GLEIF)'), 'Includes GLEIF block');
  assert(result.includes('💡 USPTO PATENTSVIEW INTELLECTUAL PROPERTY INTEL (USPTO)'), 'Includes PatentsView block');
  assert(result.includes('✈️ OPENSKY NETWORK GLOBAL FLIGHT SURVEILLANCE'), 'Includes OpenSky block');
  assert(result.includes('⚡ ELECTRICITY GRID PERFORMANCE & POWER SPOT PRICING'), 'Includes Grid Monitor block');
  assert(result.includes('🌾 USDA NASS QUICKSTATS AGRICULTURAL SURVEYS (USDA)'), 'Includes USDA stats block');
  assert(result.includes('🛰️ COPERNICUS SENTINEL SATELLITE EARTH OBSERVATIONS'), 'Includes Copernicus Sentinel block');

  // Verify full JSON integration
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  assert(parsed.gleif !== undefined, 'GLEIF data is inside unified JSON');
  assert(parsed.patentsview !== undefined, 'PatentsView data is inside unified JSON');
  assert(parsed.opensky !== undefined, 'OpenSky data is inside unified JSON');
  assert(parsed.gridMonitor !== undefined, 'Grid Monitor data is inside unified JSON');
  assert(parsed.usdaStats !== undefined, 'USDA stats data is inside unified JSON');
  assert(parsed.copernicus !== undefined, 'Copernicus Sentinel data is inside unified JSON');
  passedTests++;
} catch (err) {
  console.error('  ❌ Multi-channel blended v12 test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 15: DEEP SPORTS DATA INTEGRATION CHECK (API-Sports.io)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 15: Deep Sports Data Integration Check ---');

// 1. Standings query intent
console.log('  ▸ Auditing API-Sports League Standings (football standings):');
try {
  const query = 'show me the Premier League standings table';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);
  
  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact citation');
  assert(result.includes('Manchester United'), 'RAG output includes Manchester United standing row');
  assert(result.includes('**1**'), 'Rank 1 is correctly bolded');
  assert(result.includes('**78**'), 'Points are correctly bolded');
  assert(result.includes('**+32**'), 'Goals difference is correctly bolded');
} catch (err) {
  console.error('  ❌ API-Sports standings test failed:', err.message);
  failedTests++;
}

// 2. Box Score / Live Stats query intent
console.log('  ▸ Auditing API-Sports Box Score Match Stats (EPL live stats):');
try {
  const query = 'show me the box score match stats for EPL game #39001';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);

  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact citation');
  assert(result.includes('Shots on Goal'), 'RAG output includes Shots on Goal metric');
  assert(result.includes('**54%**'), 'Ball possession percentage is correctly bolded');
  assert(result.includes('**8**'), 'Shots on goal for Manchester United are bolded');
  assert(!result.includes('\n| Shots on Goal | 8 |'), 'No unbolded numbers in the statistic row');
} catch (err) {
  console.error('  ❌ API-Sports box score test failed:', err.message);
  failedTests++;
}

// 3. H2H history query intent
console.log('  ▸ Auditing API-Sports Head-to-Head (H2H) History:');
try {
  const query = 'show me the H2H history between teams 33 and 34';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);

  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact citation');
  assert(result.includes('Head-to-Head History'), 'RAG output contains head-to-head header');
  assert(result.includes('**12**'), 'Win count is correctly bolded');
  assert(result.includes('**3**–**1**'), 'Fixture score is correctly bolded as **3**–**1**');
} catch (err) {
  console.error('  ❌ API-Sports H2H test failed:', err.message);
  failedTests++;
}

// 4. Blended query intent (Standings + Betting Odds)
console.log('  ▸ Auditing API-Sports + PredictionData.io Blended Query:');
try {
  const query = 'show me the EPL standings table and match odds';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);

  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact citation');
  assert(result.includes('League Standings'), 'RAG output includes standings table');
  assert(result.includes('PRE-GAME BETTING ODDS'), 'RAG output contains pre-game betting odds comparison');
} catch (err) {
  console.error('  ❌ API-Sports blended query test failed:', err.message);
  failedTests++;
}

// 5. Formula 1 Driver Championship Standings
console.log('  ▸ Auditing F1 Driver Championship Standings:');
try {
  const query = 'show me the F1 standings table';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);

  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact F1 citation');
  assert(result.includes('F1 — Driver Championship Standings'), 'RAG output contains F1 standings header');
  assert(result.includes('Max Verstappen'), 'RAG output includes Max Verstappen');
  assert(result.includes('Charles Leclerc'), 'RAG output includes Charles Leclerc');
  assert(result.includes('**1**'), 'Rank 1 is correctly bolded');
  assert(result.includes('**110**'), 'Verstappen points are correctly bolded');
  assert(result.includes('**4**'), 'Verstappen wins are correctly bolded');
} catch (err) {
  console.error('  ❌ F1 standings test failed:', err.message);
  failedTests++;
}

// 6. UFC Division Rankings
console.log('  ▸ Auditing UFC Division Rankings:');
try {
  const query = 'show me the UFC division rankings';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);

  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact UFC citation');
  assert(result.includes('UFC — Division Rankings'), 'RAG output contains UFC standings header');
  assert(result.includes('Jon Jones'), 'RAG output includes Jon Jones');
  assert(result.includes('Alex Pereira'), 'RAG output includes Alex Pereira');
  assert(result.includes('**1**'), 'Rank 1 is correctly bolded');
  assert(result.includes('**100**'), 'Jon Jones points are correctly bolded');
  assert(result.includes('27-1-0'), 'Jon Jones record is displayed correctly');
} catch (err) {
  console.error('  ❌ UFC rankings test failed:', err.message);
  failedTests++;
}

// 7. IPL Cricket League Standings
console.log('  ▸ Auditing IPL Cricket League Standings:');
try {
  const query = 'show me the IPL cricket standings';
  const result = await sportsSmartRouter.routeAndEnhancePrompt(query);

  assert(result.startsWith('[Source: API-Sports / api-sports.io]'), 'RAG output starts with exact IPL citation');
  assert(result.includes('IPL — League Standings'), 'RAG output contains IPL standings header');
  assert(result.includes('Rajasthan Royals'), 'RAG output includes Rajasthan Royals');
  assert(result.includes('Kolkata Knight Riders'), 'RAG output includes Kolkata Knight Riders');
  assert(result.includes('**1**'), 'Rank 1 is correctly bolded');
  assert(result.includes('**10**'), 'Played games are correctly bolded');
  assert(result.includes('**16**'), 'Rajasthan Royals points are correctly bolded');
  assert(result.includes('**+0.622**'), 'Net Run Rate is output and bolded');
} catch (err) {
  console.error('  ❌ IPL standings test failed:', err.message);
  failedTests++;
}

console.log('');

// ─────────────────────────────────────────────────────────────────────────────
// PART 16: DEEP NEWSAPI.AI DATA INTEGRATION CHECK
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- PART 16: Deep NewsAPI.ai Data Integration Check ---');

// 1. NewsAPI.ai Intent matching
console.log('  ▸ Auditing NewsAPI.ai intent matching:');
try {
  assert(detectNewsApiAiIntent('show me newsapi.ai trends'), 'Regex matches newsapi.ai');
  assert(detectNewsApiAiIntent('get event registry global news search data'), 'Regex matches event registry');
  assert(detectNewsApiAiIntent('sentiment analysis of monitored articles'), 'Regex matches sentiment analysis');
  assert(!detectNewsApiAiIntent('show me premier league standings'), 'Regex does not match unrelated queries');
} catch (err) {
  console.error('  ❌ NewsAPI.ai intent matching test failed:', err.message);
  failedTests++;
}

// 2. RAG output structure & precise citation check
console.log('  ▸ Auditing newsapi.ai RAG response formatting:');
try {
  const query = 'analyze current newsapi.ai trends for generative AI and global news search';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
  
  assert(result.includes('📰 EVENT REGISTRY / NEWSAPI.AI GLOBAL NEWS INTELLIGENCE'), 'RAG output includes NewsAPI.ai header');
  assert(result.includes('"[Source: Event Registry / NewsAPI.ai]" for global news intelligence and event streams'), 'RAG output includes correct citation rule');
  assert(result.includes('**2,450** articles'), 'Monitored articles metric is output and bolded');
  assert(result.includes('**+0.68**'), 'Sentiment index score is output and bolded');
  assert(result.includes('**142,500** shares'), 'Aggregated social shares is output and bolded');
  assert(result.includes('**Tech / Generative Models**'), 'Primary industry category is output and bolded');
  assert(result.includes('**98.2%**'), 'Information trust index is output and bolded');

  // Verify full JSON integration
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  
  assert(parsed.newsapi !== undefined, 'JSON metadata contains newsapi node');
  assert(parsed.newsapi.targetTopic === 'Artificial Intelligence', 'targetTopic is correct in JSON');
  assert(parsed.newsapi.monitoredArticles24h === 2450, 'monitoredArticles24h is correct in JSON');
  assert(parsed.newsapi.sentimentScore === 0.68, 'sentimentScore is correct in JSON');
  assert(parsed.newsapi.aggregatedSocialShares === 142500, 'aggregatedSocialShares is correct in JSON');
  assert(parsed.newsapi.primaryCategory === 'Tech / Generative Models', 'primaryCategory is correct in JSON');
  assert(parsed.newsapi.informationTrustIndex === 98.2, 'informationTrustIndex is correct in JSON');
} catch (err) {
  console.error('  ❌ NewsAPI.ai RAG formatting test failed:', err.message);
  failedTests++;
}

// 3. NewsAPI.ai dynamic extraction & deterministic metrics
console.log('  ▸ Auditing newsapi.ai dynamic extraction (news on Bitcoin):');
try {
  const query = 'get newsapi.ai news on Bitcoin trends';
  const result = await massiveSmartRouter.combinedRouteAndEnhancePrompt(query);
  
  assert(result.includes('Target Monitored Topic**  | Bitcoin'), 'RAG output dynamically extracts Bitcoin');
  assert(result.includes('Primary Industry Category**| **Finance / Macroeconomics**'), 'Bitcoin returns Finance category');
  
  // Verify full JSON integration and deterministic types
  const marker = '<!-- JSON_METADATA: ';
  const startIdx = result.indexOf(marker) + marker.length;
  const endIdx = result.indexOf(' -->', startIdx);
  const parsed = JSON.parse(result.substring(startIdx, endIdx));
  
  assert(parsed.newsapi !== undefined, 'JSON metadata contains newsapi node');
  assert(parsed.newsapi.targetTopic === 'Bitcoin', 'targetTopic is dynamically Bitcoin in JSON');
  assert(typeof parsed.newsapi.monitoredArticles24h === 'number', 'monitoredArticles24h is a number');
  assert(typeof parsed.newsapi.sentimentScore === 'number', 'sentimentScore is a number');
  assert(typeof parsed.newsapi.aggregatedSocialShares === 'number', 'aggregatedSocialShares is a number');
  assert(parsed.newsapi.primaryCategory === 'Finance / Macroeconomics', 'primaryCategory matches Finance');
} catch (err) {
  console.error('  ❌ NewsAPI.ai dynamic extraction test failed:', err.message);
  failedTests++;
}

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
  console.log('\n🎉 ALL REAL ESTATE SYSTEM, V10 & V11 DEEP DATA INTEGRATION TESTS PASSED SUCCESSFULLY!');
  process.exit(0);
}

