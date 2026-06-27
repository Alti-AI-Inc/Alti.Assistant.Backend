import dotenv from 'dotenv';
dotenv.config();

// Ensure the live API key is set
process.env.MASSIVE_API_KEY = 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';

import { SearchEngineRegistry } from './src/app/helpers/SearchEngineRegistry.js';
import { UnifiedSmartRouter } from './src/app/helpers/UnifiedSmartRouter.js';

async function testQuery(label, query) {
  console.log(`\n==================================================`);
  console.log(`TESTING: ${label}`);
  console.log(`QUERY: "${query}"`);
  console.log(`==================================================`);
  try {
    const active = SearchEngineRegistry.detectActiveProviders(query);
    console.log(`🔍 Detected active providers:`, active.map(p => p.id));
    
    if (active.length === 0) {
      console.log('🔴 No providers matched the query.');
      return;
    }

    const enhanced = await SearchEngineRegistry.combinedRouteAndEnhance(query);
    if (enhanced === query) {
      console.log('🔴 Prompt remained unchanged.');
    } else {
      console.log('🟢 Prompt successfully enriched.');
      console.log('--- ENHANCED PROMPT (Snippet) ---');
      console.log(enhanced.substring(0, 800) + '\n...\n');
      
      const metadata = UnifiedSmartRouter.extractAndFlattenMetadata(enhanced);
      console.log('--- EXTRACTED TELEMETRY METADATA ---');
      console.log(JSON.stringify(metadata, null, 2));
    }
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
}

async function run() {
  console.log('🚀 Starting modular registry and telemetry tests...');
  
  // Test Sports Odds provider
  await testQuery('Sports Betting Matchup & Odds', 'Lakers vs Celtics live betting odds');
  
  // Test Real Estate provider
  await testQuery('Real Estate Valuation & Comps', '123 Main St Miami property details');
  
  // Test Financial Stock Ticker provider
  await testQuery('Financial Quotes & Fundamental Trends', 'AAPL current price and options chain');
  
  // Test Aviation status provider
  await testQuery('Aviation Flight Status & Delay tracking', 'Delta departures board at ATL airport');

  // Test BLS Economic provider
  await testQuery('BLS Labor & Inflation Statistics', 'Check CPI inflation rate on BLS');

  // Test BEA Economic provider
  await testQuery('BEA GDP & Economic Indicators', 'US GDP metrics from BEA');

  // Test Congress.gov provider
  await testQuery('Congress.gov Legislative Tracker', 'Active bills in Congress for climate');

  // Test OpenSecrets provider
  await testQuery('OpenSecrets PAC & Lobbying Inflows', 'Corporate political donations on OpenSecrets');

  // Test SAM.gov provider
  await testQuery('SAM.gov Vendor Exclusion Lookup', 'Debarment status of Altis on SAM');

  // Test GAO Reports provider
  await testQuery('GAO Federal Oversight Audit Reports', 'GAO report on defense spending');

  // Test eCFR Regulations provider
  await testQuery('eCFR Electronic Code of Regulations', 'eCFR Title 14 aviation regulations');

  // Test Federal Register provider
  await testQuery('Federal Register Daily Gazeteer', 'Federal Register rules for aviation');

  // Test EPA ECHO provider
  await testQuery('EPA ECHO Environmental Compliance', 'EPA environmental compliance for Chevron');

  // Test OSHA Workplace Safety provider
  await testQuery('OSHA Workplace Safety Records', 'OSHA safety inspections for Tesla');

  console.log('\n✅ Registry and telemetry tests finished.');
  process.exit(0);
}

run();
