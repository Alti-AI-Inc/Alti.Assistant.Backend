/**
 * verify_regulatory_safety.js
 *
 * Verification script for testing Alti's Stage 43 Premium Regulatory, Corporate Benefit,
 * and Energy Transition grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 43 Premium Regulatory & Energy Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'FINRA BrokerCheck & Disciplinary Records',
      query: 'Check finra brokercheck disciplinary actions for Archibald Sterling',
      expectedId: 'finra_brokercheck'
    },
    {
      name: 'MSRB EMMA Municipal Security Disclosures',
      query: 'What are the municipal securities daily trading yields on emma bond list?',
      expectedId: 'msrb_emma'
    },
    {
      name: 'DOL EBSA Form 5500 & Benefits',
      query: 'Retrieve dol ebsa form 5500 retirement assets for Altis Tech 401k plan',
      expectedId: 'dol_ebsa'
    },
    {
      name: 'NCUA Credit Union Call Reports',
      query: 'What is the ncua credit union financial net worth ratio for Navy Federal?',
      expectedId: 'ncua_credit_union'
    },
    {
      name: 'DOE Alternative Fuels Station Registry',
      query: 'What are the EV charging station counts and alternative fuel credits in California?',
      expectedId: 'doe_alternative_fuels'
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
