import dotenv from 'dotenv';
dotenv.config();

// Ensure the live API key is set
process.env.MASSIVE_API_KEY = 'gyJwOQtsm3yZXPsGqOjewhzezPzJm4l3';

import { massiveSmartRouter } from './src/app/helpers/massiveSmartRouter.js';

async function testQuery(label, query) {
  console.log(`\n========================================`);
  console.log(`TESTING: ${label}`);
  console.log(`QUERY: "${query}"`);
  console.log(`========================================`);
  try {
    const result = await massiveSmartRouter.routeAndEnhancePrompt(query);
    if (result === query) {
      console.log('🔴 RESULT: NOT ENRICHED (Prompt unchanged)');
    } else {
      console.log('🟢 RESULT: ENRICHED');
      console.log(result.substring(0, 1200) + '\n...');
    }
  } catch (error) {
    console.error('❌ ERROR:', error);
  }
}

async function run() {
  // Test Watchlist Intent
  await testQuery('Watchlist Batch Quotes', 'Quotes for AAPL, MSFT, TSLA, NVDA');
  
  // Test Upcoming Earnings Dashboard (without ticker)
  await testQuery('Upcoming Earnings Calendar', 'Show me the upcoming earnings calendar');

  // Test Company-Specific Earnings Trend (with ticker)
  await testQuery('Company Earnings Trend', 'AAPL historical earnings trends');

  // Test Options Contract Fallback
  await testQuery('Options Contract with Fallback', 'AAPL call options strike 200 expiring June');

  process.exit(0);
}

run();
