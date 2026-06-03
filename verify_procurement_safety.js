/**
 * verify_procurement_safety.js
 *
 * Verification script for testing Alti's Batch 3 EU TED, USDA FAS,
 * NTSB CAROL, CFPB Enforcement, and EPA IRIS grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Batch 3 Public Procurement & Environmental Safety Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'EU TED Public Procurement',
      query: 'Show me the active EU tender notices for cloud infrastructure and IT services',
      expectedId: 'eu_ted_procurement'
    },
    {
      name: 'USDA FAS Global Trade & Exports',
      query: 'Retrieve the USDA FAS crop production and agricultural exports estimates for wheat',
      expectedId: 'usda_fas_agriculture'
    },
    {
      name: 'NTSB Civil Transportation Investigations',
      query: 'What NTSB accident reports and safety recommendations have been published for flight crash DCA26MA104?',
      expectedId: 'ntsb_safety'
    },
    {
      name: 'CFPB Financial Enforcement Judgments',
      query: 'What cfpb enforcement actions, penalties, and consent orders were issued against Apex Home Loans?',
      expectedId: 'cfpb_enforcement'
    },
    {
      name: 'EPA IRIS Toxicological Chemical Assessment',
      query: 'what chronic carcinogen status and toxicity is logged in epa iris for Benzene?',
      expectedId: 'epa_iris_toxicity'
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
