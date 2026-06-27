/**
 * verify_high_value_public_stage53.js
 *
 * Verification script for testing Alti's Stage 53 Premium High-Value Public Grounding Channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 53 Premium High-Value Public Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'FAA Wildlife Aircraft Strikes',
      query: 'Retrieve faa wildlife strike report and airport wildlife strike statistics',
      expectedId: 'faa_wildlife_strikes'
    },
    {
      name: 'EEOC Employment Discrimination Statistics',
      query: 'Check eeoc discrimination charge rates and employment discrimination settlements annual report',
      expectedId: 'eeoc_discrimination_stats'
    },
    {
      name: 'CBP AD/CVD Active Orders',
      query: 'Check cbp ad cvd active orders and trade remedy countervailing duty rates',
      expectedId: 'cbp_ad_cvd_orders'
    },
    {
      name: 'NPS Species & Biodiversity Inventory',
      query: 'Retrieve nps national parks species list and biodiversity inventory yellowstone checklists',
      expectedId: 'nps_species_inventory'
    },
    {
      name: 'SEC Fails-to-Deliver (FTD) Equity & ETF Registry',
      query: 'Retrieve sec fails to deliver equity short sale failures and ftd shares tracker volume',
      expectedId: 'sec_fails_to_deliver'
    },
    {
      name: 'EPA CERCLA Superfund National Priorities List (NPL)',
      query: 'Search epa cercla superfund list and national priorities list cleanup hazard rankings',
      expectedId: 'epa_cercla_superfund'
    },
    {
      name: 'HUD Continuum of Care Homeless Assistance Awards',
      query: 'Retrieve hud continuum of care coc grant awards and federal homeless shelter funding project list',
      expectedId: 'hud_coc_awards'
    },
    {
      name: 'NOAA NCEI Marine Microplastics Concentration Database',
      query: 'Retrieve noaa marine microplastics concentration database sample ocean floor maps',
      expectedId: 'noaa_marine_microplastics'
    },
    {
      name: 'FTC Funeral Rule Pricing & Compliance Registry',
      query: 'Check ftc funeral rule pricing compliance and funeral home compliance violations audit dockets',
      expectedId: 'ftc_funeral_rule'
    },
    {
      name: 'USDA Farm Service Agency (FSA) Crop Acreage Reports',
      query: 'Retrieve usda fsa crop acreage reports farm service agency planted acreage statistics',
      expectedId: 'usda_fsa_crop_acreage'
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
    console.log('🎉 All systems functional! All 10/10 Stage 53 Premium High-Value Public Grounding channels compile and run perfectly.');
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
