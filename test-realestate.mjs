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
