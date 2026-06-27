/**
 * verify_high_value_public_stage52.js
 *
 * Verification script for testing Alti's Stage 52 Premium High-Value Public Grounding Channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 52 Premium High-Value Public Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'EPA Green Vehicle Guide & Fuel Economy',
      query: 'Retrieve epa fuel economy estimates and green vehicle guide spec mpg',
      expectedId: 'epa_fuel_economy'
    },
    {
      name: 'CFTC Commitments of Traders COT Reports',
      query: 'Check cftc commitments of traders report and cot speculative futures positions',
      expectedId: 'cftc_commitments_traders'
    },
    {
      name: 'DOJ ADA Civil Rights Enforcement',
      query: 'Search doj ada enforcement settlements and americans with disabilities act compliance',
      expectedId: 'doj_ada_enforcement'
    },
    {
      name: 'GSA Schedules eLibrary Contract Registry',
      query: 'Retrieve gsa schedules elibrary contract list and gsa schedule contractors',
      expectedId: 'gsa_elibrary_contracts'
    },
    {
      name: 'EPA AQS Criteria Air Pollutants Monitoring',
      query: 'Check epa aqs pollutant criteria air pollutants monitoring and daily AQI index',
      expectedId: 'epa_aqs_pollutants'
    },
    {
      name: 'DOI BSEE Offshore Lease Oil & Gas Production',
      query: 'Retrieve outer continental shelf production from doi bsee offshore oil gas leases',
      expectedId: 'doi_bsee_offshore_production'
    },
    {
      name: 'HUD PIT Point-in-Time Homelessness Counts',
      query: 'Search hud pit count point-in-time homelessness estimate sheltered and unsheltered',
      expectedId: 'hud_pit_homelessness'
    },
    {
      name: 'FAA Certified Mechanic & Repair Stations',
      query: 'Check faa repair station certified aircraft mechanic and powerplant ratings',
      expectedId: 'faa_repair_stations'
    },
    {
      name: 'NOAA NCEI 30-Year Climate Normals',
      query: 'Retrieve ncei climate normals 30-year average weather and mean temperatures',
      expectedId: 'noaa_ncei_climate_normals'
    },
    {
      name: 'SEC Form ADV-W Adviser Withdrawals',
      query: 'Retrieve sec form adv-w investment adviser registration withdrawal terminating aum',
      expectedId: 'sec_form_adv_w'
    }
  ];

  let successCount = 0;

  for (const test of testQueries) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`🧪 Test Case: ${test.name}`);
    console.log(`   Query: "${test.query}"`);
    
    // Detect matching providers
    const activeProviders = SearchEngineRegistry.detectActiveProviders(test.query);
    const matchedIds = activeProviders.map(p => p.id);
    console.log(`   Detected Providers: [${matchedIds.join(', ')}]`);

    let detectionPassed = false;
    if (matchedIds.includes(test.expectedId)) {
      console.log(`   ✅ Intent Detection Passed.`);
      detectionPassed = true;
    } else {
      console.log(`   ❌ Intent Detection Failed (Expected "${test.expectedId}").`);
    }

    // Execute combined RAG pipeline
    const ragContext = await SearchEngineRegistry.combinedRouteAndEnhance(test.query);
    
    if (ragContext && ragContext.includes('GROUNDED DATA SOURCE') && ragContext.includes(test.expectedId.toUpperCase())) {
      console.log(`   ✅ RAG Pipeline Synthesis Completed Successfully.`);
      console.log(`   --- Output Sneak Peek ---`);
      const lines = ragContext.split('\n');
      console.log(lines.slice(0, 12).join('\n'));
      console.log(`   ...`);
      if (detectionPassed) {
        successCount++;
      }
    } else {
      console.log(`   ❌ RAG Pipeline Synthesis Failed (Returned empty or raw query).`);
    }
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(`📊 Verification Summary: ${successCount} / ${testQueries.length} passed.`);
  if (successCount === testQueries.length) {
    console.log('🎉 All systems functional! All 10/10 Stage 52 Premium High-Value Public Grounding channels compile and run perfectly.');
    process.exit(0);
  } else {
    console.log('⚠️ Some tests failed. Please inspect logs.');
    process.exit(1);
  }
}

runVerification().catch(err => {
  console.error('💥 Fatal error during verification:', err);
  process.exit(1);
});
