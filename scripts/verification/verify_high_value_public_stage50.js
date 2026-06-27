/**
 * verify_high_value_public_stage50.js
 *
 * Verification script for testing Alti's Stage 50 Premium High-Value Public Grounding Channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 50 Premium High-Value Public Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'USCIS H-1B Employer Data Hub',
      query: 'Retrieve uscis h-1b employer visa approval count and sponsorships for Altis Tech Corp',
      expectedId: 'uscis_h1b_employers'
    },
    {
      name: 'GSA SAM.gov Active Exclusions & Debarments',
      query: 'Check sam exclusions registry for active debarred companies and suspended parties',
      expectedId: 'gsa_sam_exclusions'
    },
    {
      name: 'USPTO Patent Trial and Appeal Board (PTAB)',
      query: 'Search uspto ptab decisions for patent appeal board trial inter partes review dockets',
      expectedId: 'uspto_ptab_decisions'
    },
    {
      name: 'SEC Form ADV Investment Advisers & AUM',
      query: 'Retrieve registered investment adviser aum from sec form adv disclosures for Altis Asset Management',
      expectedId: 'sec_form_adv_advisers'
    },
    {
      name: 'EPA EJScreen Environmental Justice Indices',
      query: 'Retrieve epa ejscreen demographic index and environmental justice census tract scores',
      expectedId: 'epa_ejscreen_environmental'
    },
    {
      name: 'CBP Import Trade Manifests & Port Logistics',
      query: 'Check cbp import trade manifest vessel cargo shipment log for Port of Newark',
      expectedId: 'cbp_import_manifests'
    },
    {
      name: 'NOAA NCEI Extreme Weather & Storm Events',
      query: 'Search storm events database noaa for tornado flood property damage historical storm records',
      expectedId: 'noaa_ncei_storms'
    },
    {
      name: 'HUD LIHTC Affordable Housing Projects',
      query: 'Retrieve lihtc credit allocation from hud lihtc housing projects and unit counts',
      expectedId: 'hud_lihtc_housing'
    },
    {
      name: 'FAA OE/AAA Airspace Hazard Evaluations',
      query: 'Check faa oe aaa proposed airspace construction hazard evaluations and tower obstructions',
      expectedId: 'faa_oe_aaa_obstructions'
    },
    {
      name: 'DOT National Transit Database (NTD)',
      query: 'Query dot national transit database passenger miles and urban public transport operating expense',
      expectedId: 'dot_ntd_transit'
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
    console.log('🎉 All systems functional! All 10/10 Stage 50 Premium High-Value Public Grounding channels compile and run perfectly.');
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
