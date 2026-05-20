import dotenv from 'dotenv';
dotenv.config();

import { executeToolBasedConversation } from './src/app/modules/search/services/reactAgent.js';
import { gemini3ProPreview, gemini2_5Flash } from './src/app/modules/search/services/geminiService.js';

async function test() {
  console.log("Testing gemini-3.5-flash with real-time query...");
  try {
    const res = await executeToolBasedConversation([
      { role: 'user', content: 'When is the next Detroit Tigers home game?' }
    ], {
      timezone: 'America/New_York'
    });
    console.log("RESPONSE:", res.responseMessage.answer);
  } catch (err) {
    console.error("ERROR:", err);
  }
}

test();
