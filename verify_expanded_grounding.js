/**
 * verify_expanded_grounding.js
 *
 * Verification script for testing Alti's Batch 1 Economic, Mortgage,
 * and U.S. Treasury par yield interest rate grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Macroeconomic, Mortgage & Government Rates Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'BLS U.S. Labor & Consumer Inflation',
      query: 'What are the latest BLS inflation statistics and national unemployment rates?',
      expectedId: 'bls_economic'
    },
    {
      name: 'BEA Real GDP Growth Rate',
      query: 'Show me the BEA Gross Domestic Product and real GDP growth numbers',
      expectedId: 'bea_economic'
    },
    {
      name: 'U.S. Treasury Daily par yield and Average Interest Rates',
      query: 'What is the current average U.S. Treasury interest rate on federal debt?',
      expectedId: 'us_treasury_fiscal'
    },
    {
      name: '30-Year Fixed Mortgage Averages (FRED)',
      query: 'Retrieve the 30-year fixed rate mortgage average and conforming mortgage rate trends',
      expectedId: 'fred'
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
  console.log(`📊 Verification Summary: ${successCount} / ${testQueries.length} passed.`);
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
