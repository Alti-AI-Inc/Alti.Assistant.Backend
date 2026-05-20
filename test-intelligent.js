import dotenv from 'dotenv';
dotenv.config();

import { runIntelligentSearch } from './src/app/modules/search/intelligentSearch.js';

async function test() {
  console.log("Testing full intelligentSearch flow with real-time query...");
  try {
    const res = await runIntelligentSearch({
      query: 'When is the next Detroit Tigers home game?',
      timezone: 'America/New_York',
      conversationContext: []
    }, false);
    console.log("\n\nFINAL RESPONSE:", res.answer);
  } catch (err) {
    console.error("ERROR:", err);
  }
  process.exit(0);
}

test();
