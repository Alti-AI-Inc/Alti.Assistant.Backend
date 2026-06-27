/**
 * verify_scientific_academic.js
 *
 * Verification script for testing Alti's Stage 48 Premium Scientific
 * Academic and Medical Research grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 48 Premium Scientific Academic Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'Johns Hopkins CSSE Global Health Data',
      query: 'Check johns hopkins global health jhu csse epidemiology virus tracker for active cases',
      expectedId: 'jhu_csse_global_health'
    },
    {
      name: 'University of Chicago CRSP Stock Indices',
      query: 'Retrieve uchicago financial data crsp stock index crsp market cap total return index',
      expectedId: 'uchicago_crsp_finance'
    },
    {
      name: 'Georgetown University CEW College ROI',
      query: 'Check georgetown cew college net present value college roi index for University of Michigan',
      expectedId: 'georgetown_cew_roi'
    },
    {
      name: 'Duke Fuqua CFO Global Survey',
      query: 'Query duke cfo survey fuqua cfo index corporate capital forecast spending expectations',
      expectedId: 'duke_cfo_survey'
    },
    {
      name: 'Northwestern CSSI Science Citations',
      query: 'Search northwestern cssi researcher citation trajectory and science index for Archibald Sterling',
      expectedId: 'northwestern_cssi_impact'
    },
    {
      name: 'Caltech IPAC Infrared Science Archive',
      query: 'Search caltech ipac infrared science archive astronomical observation coordinates RA 12h',
      expectedId: 'caltech_ipac_astronomy'
    },
    {
      name: 'CMU Delphi Epidemic Forecasting',
      query: 'Query cmu delphi flu tracker public health signal and epidemic forecasting in Detroit 48201',
      expectedId: 'cmu_delphi_epidemiology'
    },
    {
      name: 'Vanderbilt LAPOP AmericasBarometer',
      query: 'Check vanderbilt lapop americasbarometer democratic stability score for USA',
      expectedId: 'vanderbilt_lapop_opinion'
    },
    {
      name: 'UC Berkeley Haas Real Estate Indices',
      query: 'Query berkeley haas housing commercial real estate rent and haas real estate index in Ann Arbor',
      expectedId: 'uc_berkeley_haas_real_estate'
    },
    {
      name: 'UW-Madison CHSRA Care Quality',
      query: 'Retrieve uw madison chsra nursing home quality indicator and chsra clinical survey for Michigan Care',
      expectedId: 'uw_madison_chsra_care'
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
