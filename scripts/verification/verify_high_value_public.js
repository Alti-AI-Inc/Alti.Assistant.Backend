/**
 * verify_high_value_public.js
 *
 * Verification script for testing Alti's Stage 49 Premium High-Value Public Grounding Channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 49 Premium High-Value Public Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'NTIA Spectrum & Broadband BEAD Grants',
      query: 'Retrieve ntia spectrum allocations for Michigan BEAD program infrastructure grant',
      expectedId: 'ntia_spectrum_broadband'
    },
    {
      name: 'BLM Wild Horse & Burro Program',
      query: 'Check blm wild horse herd management corral inventory in Nevada Range Sector',
      expectedId: 'blm_wild_horses'
    },
    {
      name: 'EIA Greenhouse Gas Emissions by Sector',
      query: 'Retrieve eia greenhouse gas emissions industrial sector analysis for Michigan',
      expectedId: 'eia_greenhouse_gases'
    },
    {
      name: 'IRS SOI Corporate Tax Return Balance Sheets',
      query: 'Retrieve irs soi corporate tax return balance sheets and net income tax liability',
      expectedId: 'irs_soi_corporate'
    },
    {
      name: 'FWS Critical Threatened & Endangered Species Habitats',
      query: 'Search fws critical habitat list and endangered species list recovery plans',
      expectedId: 'fws_critical_habitats'
    },
    {
      name: 'NHTSA Early Warning Reporting Defect Logs',
      query: 'Check nhtsa early warning reporting vehicle death claims and safety defect logs',
      expectedId: 'nhtsa_ewr_defects'
    },
    {
      name: 'OFAC Sanctions 50% Ownership Rule Compliance',
      query: 'Verify ofac 50 percent rule compliance for blocked entity ownership stakes',
      expectedId: 'ofac_fifty_percent_rule'
    },
    {
      name: 'BEA International Trade in Services',
      query: 'Analyze trade in services international computing and intellectual property trade exports',
      expectedId: 'bea_international_services'
    },
    {
      name: 'NIH Clinical Center Active Research Protocols',
      query: 'Check nih clinical protocol active trials for investigational drug eligibility',
      expectedId: 'nih_clinical_protocols'
    },
    {
      name: 'FAA Civil Pilot & Airman Certifications',
      query: 'Search active airman registry for faa pilot certificate ratings and medical classes',
      expectedId: 'faa_pilots_certification'
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
    console.log('🎉 All systems functional! All 10/10 Stage 49 Premium High-Value Public Grounding channels compile and run perfectly.');
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
