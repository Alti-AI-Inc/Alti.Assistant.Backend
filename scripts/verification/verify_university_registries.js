/**
 * verify_university_registries.js
 *
 * Verification script for testing Alti's Stage 47 Premium Ivy League and
 * University research data grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 47 Premium University Registries Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'University of Michigan ICPSR Research Database',
      query: 'Search social surveys and demographics in UMich ICPSR political research database study 38401',
      expectedId: 'umich_icpsr_social'
    },
    {
      name: 'Harvard University Dataverse Network',
      query: 'Query harvard dataverse network open dataset research data DOI 10.7910/DVN',
      expectedId: 'harvard_dataverse'
    },
    {
      name: 'MIT Sloan Billion Prices Project (BPP)',
      query: 'Check mit billion prices mit bpp daily price scrap and mit inflation index online consumer good',
      expectedId: 'mit_bpp_inflation'
    },
    {
      name: 'Stanford CRFM HELM Benchmarks',
      query: 'Check stanford helm benchmarks CRFM holistic evaluation language model accuracy scores for Altis',
      expectedId: 'stanford_helm_benchmarks'
    },
    {
      name: 'Columbia University CIESIN GPW Grid',
      query: 'Search columbia ciesin gridded population world GPW population density grids for Detroit 48201',
      expectedId: 'columbia_ciesin_population'
    },
    {
      name: 'Yale Environmental Performance Index (EPI)',
      query: 'Query country environmental performance index and yale environmental index EPI country score for USA',
      expectedId: 'yale_epi_environmental'
    },
    {
      name: 'Princeton University Eviction Lab',
      query: 'Retrieve princeton eviction filings and housing insecurity index eviction lab data for Detroit',
      expectedId: 'princeton_eviction_lab'
    },
    {
      name: 'UPenn Penn World Table (PWT)',
      query: 'Search relative real GDP and total factor productivity in upenn pwt penn world tables for USA',
      expectedId: 'upenn_pwt_macro'
    },
    {
      name: 'Cornell Lab of Ornithology eBird Biodiversity',
      query: 'Query cornell ebird database avian distribution and bird migration tracker sightings count for Bald Eagle',
      expectedId: 'cornell_ebird_biodiversity'
    },
    {
      name: 'Brown Watson Institute Cost of War',
      query: 'Retrieve global military conflict casualty and defense campaign expenses from brown cost of war watson institute',
      expectedId: 'brown_cost_of_war'
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
