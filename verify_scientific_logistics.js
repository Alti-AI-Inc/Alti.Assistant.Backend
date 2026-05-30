/**
 * verify_scientific_logistics.js
 *
 * Verification script for testing Alti's Stage 46 Premium Scientific Research,
 * Transport, and Logistics grounding channels.
 */

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';

async function runVerification() {
  console.log('🏁 Starting Stage 46 Premium Scientific & Logistics Grounding verification tests...\n');

  const testQueries = [
    {
      name: 'DOE SETO Solar Installations & Capacity',
      query: 'Check solar installation capacity and photovoltaic PV data project registry for Altis Solar Array',
      expectedId: 'doe_solar_installations'
    },
    {
      name: 'EPA RadNet Environmental Radiation',
      query: 'Retrieve environmental radiation gamma radiation count from radnet monitor in Detroit',
      expectedId: 'epa_radnet'
    },
    {
      name: 'NIST Reference Clocks & Standard Time',
      query: 'Query official nist time atomic clock drifts leap second announce and time synchronization telemetry',
      expectedId: 'nist_standard_time'
    },
    {
      name: 'USDA FSIS Meat & Poultry Recalls',
      query: 'Search meat recall poultry recall food safety recalls from usda fsis recall list for Establishment EST-1245',
      expectedId: 'usda_fsis_recalls'
    },
    {
      name: 'HRSA National Organ Transplant Registry (OPTN)',
      query: 'Check organ transplant waiting list optn statistics for Michigan Transplant Center',
      expectedId: 'hrsa_optn_transplants'
    },
    {
      name: 'CDC NCEH Childhood Lead Poisoning',
      query: 'Get childhood lead poisoning elevated blood lead level statistics for Zip Sector 48201',
      expectedId: 'cdc_nceh_lead'
    },
    {
      name: 'USDA Selective Aquaculture Breeding',
      query: 'Query selective fish breeding and aquaculture performance metrics in coldwater fish NCCCWA registry',
      expectedId: 'usda_aquaculture'
    },
    {
      name: 'FAA Commercial Space Transportation Launches',
      query: 'Retrieve space launch license commercial space launch details for Falcon 9',
      expectedId: 'faa_space_launches'
    },
    {
      name: 'NPS Wilderness Visitor & Camping Registry',
      query: 'Find wilderness permit backcountry camping permit count in Yosemite National Park',
      expectedId: 'nps_visitor_registry'
    },
    {
      name: 'FMC Ocean Transportation Intermediaries (OTI)',
      query: 'Retrieve ocean freight forwarder nvocc registry FMC shipping license for Altis Shipping Forwarder',
      expectedId: 'fmc_oti_ocean_shipping'
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
