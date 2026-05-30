/**
 * verify_high_value_public_stage51.js
 *
 * Verification script for testing Alti's Stage 51 Premium High-Value Public Grounding Channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 51 Premium High-Value Public Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'SEC Form 13F Institutional Holdings',
      query: 'Retrieve sec form 13f institutional holding portfolio and quarterly stock positions',
      expectedId: 'sec_form_13f_portfolios'
    },
    {
      name: 'CDC WONDER Vaccine Adverse Event Reporting System',
      query: 'Check cdc wonder vaers vaccine adverse event report safety logs and injury reports',
      expectedId: 'cdc_wonder_vaers'
    },
    {
      name: 'CBP Enforce and Protect Act (EAPA)',
      query: 'Search cbp eapa violation customs duty evasion cases and antidumping evasion',
      expectedId: 'cbp_eapa_violations'
    },
    {
      name: 'USDA FGIS Export Grain Inspection',
      query: 'Retrieve usda fgis grain export volume and grain inspection certificates',
      expectedId: 'usda_fgis_grain_exports'
    },
    {
      name: 'EIA Electric Power Plant Operations',
      query: 'Check eia electric power plant power generationcapacity and net electricity generation output',
      expectedId: 'eia_electric_power_plants'
    },
    {
      name: 'FEMA National Flood Insurance Program (NFIP)',
      query: 'Retrieve fema nfip claim national flood insurance program payouts and flood insurance claim payouts',
      expectedId: 'fema_nfip_claims'
    },
    {
      name: 'NHTSA Fatality Analysis Reporting System (FARS)',
      query: 'Search nhtsa fars fatality traffic crash fatal records and highway safety factors',
      expectedId: 'nhtsa_fars_fatalities'
    },
    {
      name: 'FCC OET Experimental Radio Licenses',
      query: 'Check fcc oet experimental radio license frequency testing and active licenses',
      expectedId: 'fcc_oet_experimental'
    },
    {
      name: 'NPS National Register of Historic Places',
      query: 'Retrieve nps historic places national register of historic sites and landmarks',
      expectedId: 'nps_historic_places'
    },
    {
      name: 'USDA Forest Service Forest Inventory & Analysis',
      query: 'Query usda forest inventory forest service biomass and national forest timber volume',
      expectedId: 'usda_fs_forest_inventory'
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
    console.log('🎉 All systems functional! All 10/10 Stage 51 Premium High-Value Public Grounding channels compile and run perfectly.');
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
