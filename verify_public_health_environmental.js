/**
 * verify_public_health_environmental.js
 *
 * Verification script for testing Alti's Stage 45 Premium Public Health, Space Weather,
 * and Environmental grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 45 Premium Public Health & Space Weather Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'NOAA Space Weather Solar Alerts',
      query: 'Check solar flares warnings and space weather geomagnetic storms aurora forecast',
      expectedId: 'noaa_space_weather'
    },
    {
      name: 'USGS Landslide Hazards Registry',
      query: 'Find active debris flow alerts and landslide risk slope stability for Oso Washington',
      expectedId: 'usgs_landslides'
    },
    {
      name: 'EPA Safe Drinking Water Information System (SDWIS)',
      query: 'Retrieve sdwis safe drinking water quality violations for Ann Arbor Water System',
      expectedId: 'epa_sdwis'
    },
    {
      name: 'NHTSA Safety Defect Recalls',
      query: 'Search safety defect recall campaign vehicle recalls for Tesla Model Y',
      expectedId: 'nhtsa_recalls'
    },
    {
      name: 'HRSA Health Center Program Registry',
      query: 'Find hrsa community health center program fqhc certified locations in Michigan',
      expectedId: 'hrsa_health_centers'
    },
    {
      name: 'CDC National Center for Health Statistics (NCHS)',
      query: 'Retrieve cdc health statistics vital statistics and leading cause of death mortality rate trend',
      expectedId: 'cdc_nchs'
    },
    {
      name: 'USDA Farmers Market Directory',
      query: 'Query usda farmers market directory snap farmers market listings in Ann Arbor Downtown',
      expectedId: 'usda_farmers_markets'
    },
    {
      name: 'FAA Airport Surface Safety & Runways',
      query: 'Check faa runway safety airport surface safety hotspots for DTW Airport',
      expectedId: 'faa_runway_safety'
    },
    {
      name: 'NSF Survey of Federal Funds for R&D',
      query: 'Search federal rd funding research development spending by NSF science funding agency',
      expectedId: 'nsf_rd_funding'
    },
    {
      name: 'TRAC Immigration Court & Enforcement Registry',
      query: 'Query trac immigration court backlog and deportation statistics for Detroit Court Sector',
      expectedId: 'trac_immigration'
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
