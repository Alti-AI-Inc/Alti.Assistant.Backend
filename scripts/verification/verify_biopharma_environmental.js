/**
 * verify_biopharma_environmental.js
 *
 * Verification script for testing Alti's Stage 44 Premium Biopharma, Environmental,
 * and Public Registry grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 44 Premium Biopharma & Environmental Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'FDA Purple Book Biologics & Biosimilars',
      query: 'Retrieve biosimilar approvals and patent exclusivity from FDA purple book for Humira',
      expectedId: 'fda_purplebook'
    },
    {
      name: 'EPA Toxic Release Inventory (TRI)',
      query: 'Check toxic release inventory chemical emission reports for Summit Chemical',
      expectedId: 'epa_tri'
    },
    {
      name: 'BLM GLO Land Patents & Mining Claims',
      query: 'Find active mining claims and blm land patents for Township 18N',
      expectedId: 'blm_land_patent'
    },
    {
      name: 'FTC Consumer Sentinel Fraud Registry',
      query: 'Get consumer fraud ftc complaint statistics for Michigan State',
      expectedId: 'ftc_scams'
    },
    {
      name: 'FEC Real-Time Raw Campaign Filings Feed',
      query: 'What are the real-time fec raw campaign filings for Altis PAC?',
      expectedId: 'fec_raw_filings'
    },
    {
      name: 'FAA Civil Aircraft Registry',
      query: 'Find faa aircraft registration owner of plane with N-Number N495TS',
      expectedId: 'faa_aircraft'
    },
    {
      name: 'FCC Equipment Authorization System (EAS)',
      query: 'Retrieve fcc eas equipment authorization rf approval details for FCC ID 2A401-ALTIS',
      expectedId: 'fcc_eas'
    },
    {
      name: 'USGS Mineral Resources Data System (MRDS)',
      query: 'Search usgs mineral resource deposits and active mines in El Dorado County',
      expectedId: 'usgs_minerals'
    },
    {
      name: 'NHTSA VPIC Manufacturer Registry',
      query: 'Check nhtsa manufacturer registrations and plant locations for Altis EV Corp',
      expectedId: 'nhtsa_manufacturers'
    },
    {
      name: 'USDA NOP Organic Integrity Database',
      query: 'Query usda organic integrity database certified operations for Altis Organic Farms',
      expectedId: 'usda_organic'
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

    if (matchedIds.includes(test.expectedId)) {
      console.log(`   ✅ Intent Detection Passed.`);
    } else {
      console.log(`   ❌ Intent Detection Failed (Expected "${test.expectedId}").`);
    }

    // Execute combined RAG pipeline
    const ragContext = await SearchEngineRegistry.combinedRouteAndEnhance(test.query);
    
    if (ragContext && ragContext.includes('GROUNDED DATA SOURCE')) {
      console.log(`   ✅ RAG Pipeline Synthesis Completed Successfully.`);
      console.log(`   --- Output Sneak Peek ---`);
      const lines = ragContext.split('\n');
      console.log(lines.slice(0, 15).join('\n'));
      console.log(`   ...`);
      successCount++;
    } else {
      console.log(`   ❌ RAG Pipeline Synthesis Failed (Returned empty or raw query).`);
    }
  }

  console.log(`--------------------------------------------------------------------------------`);
  console.log(` 📊 Verification Summary: ${successCount} / ${testQueries.length} passed.`);
  if (successCount === testQueries.length) {
    console.log('🎉 All systems functional! Grounding channels compile and run without error.');
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
