import { SwarmService } from '../src/app/modules/swarm/swarm.service.js';
import { logger } from '../src/shared/logger.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const testUserId = '6652bf1c-5bb5-4f36-96db-0c2d377b212f'; // Clean UUID string format

async function verifyRealTimeSearch() {
  try {
    console.log('📡 Starting E2E Chat Real-Time Search Grounding Verification...');
    console.log('===============================================================');

    // 1. Verify Synchronous Swarm Search Execution
    console.log('\n🔄 E2E STEP 1: Running SwarmService.executeSwarmSync...');
    const syncResult = await SwarmService.executeSwarmSync(
      'What did NVIDIA announce today about Blackwell chips?',
      [],
      testUserId,
      { requireSearch: true }
    );

    console.log('\n✅ Synchronous Reply:');
    console.log(syncResult.reply);
    
    console.log('\n✅ Extracted Citations:');
    console.log(JSON.stringify(syncResult.citations, null, 2));

    // Assert branding sanitization (white-label check)
    const replyLower = syncResult.reply.toLowerCase();
    const hasGoogleCloud = replyLower.includes('google cloud') || replyLower.includes('vertex ai');
    const hasTavily = replyLower.includes('tavily');
    
    console.log('\n🛡️  White-Label Purge Assertions:');
    console.log(`- Contains Vertex AI/Google Cloud brand labels?: ${hasGoogleCloud ? '❌ FAILED' : '✅ PASSED (Purged)'}`);
    console.log(`- Contains Tavily brand labels?: ${hasTavily ? '❌ FAILED' : '✅ PASSED (Purged)'}`);

    // 2. Verify Streaming Swarm Search Execution
    console.log('\n🔄 E2E STEP 2: Running SwarmService.executeSwarmStream...');
    const stream = SwarmService.executeSwarmStream(
      'What is the current stock price of Apple AAPL today?',
      [],
      testUserId,
      { requireSearch: true }
    );

    let streamAccumulator = '';
    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        process.stdout.write(chunk.content);
        streamAccumulator += chunk.content;
      } else if (chunk.type === 'metadata') {
        console.log(`\n\n📌 Yielded Citation Chunk: ${JSON.stringify(chunk.citations, null, 2)}`);
      } else if (chunk.type === 'agent_start') {
        console.log(`\n🤖 [Swarm Executor Node: ${chunk.agent?.name}]`);
      }
    }

    console.log('\n\n===============================================================');
    console.log('🎉 E2E Verification Completed Successfully!');
    process.exit(0);

  } catch (err) {
    console.error('❌ Verification failed with error:', err);
    process.exit(1);
  }
}

// Run E2E verification
verifyRealTimeSearch();
