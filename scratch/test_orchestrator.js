import dotenv from 'dotenv';
dotenv.config();

import { orchestratorService } from '../src/app/modules/orchestrator/orchestrator.service.js';

async function run() {
  console.log("Testing Orchestrator Service with test prompt...");
  try {
    const res = await orchestratorService.classifyAndDispatch(
      "Hello, who are you?",
      "test-session",
      "test-user-id-123",
      "new-chat"
    );
    console.log("ORCHESTRATOR RESPONSE:", JSON.stringify(res, null, 2));
  } catch (err) {
    console.error("ORCHESTRATOR ERROR:", err);
  }
}

run();
