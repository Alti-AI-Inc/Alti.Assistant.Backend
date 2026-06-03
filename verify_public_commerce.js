/**
 * verify_public_commerce.js
 *
 * Verification script for testing Alti's Batch 2 Corporate, Vehicle Safety,
 * FBI Crime, CPSC Product Recalls, and NSF Awards grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Batch 2 Public Commerce & Science Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'OpenCorporates Corporate Registration',
      query: 'Is Altis Holdings LLC registered in Delaware corporate registry?',
      expectedId: 'opencorporates'
    },
    {
      name: 'NHTSA Vehicle Safety & Defect Recalls',
      query: 'Retrieve safety recalls on a 2023 Tesla Model Y using NHTSA lookup',
      expectedId: 'nhtsa_safety'
    },
    {
      name: 'FBI Crime Data Explorer Statistics',
      query: 'fbi crime stats and arrest rates in Michigan',
      expectedId: 'fbi_crime'
    },
    {
      name: 'CPSC Product Safety Recalls',
      query: 'cpsc consumer recalls on electrical power chargers',
      expectedId: 'cpsc_recalls'
    },
    {
      name: 'NSF Scientific Research & Engineering Grants',
      query: 'nsf scientific awards and grants for edge machine learning research',
      expectedId: 'nsf_awards'
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
