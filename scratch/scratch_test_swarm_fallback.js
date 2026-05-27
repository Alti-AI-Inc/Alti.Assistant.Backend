import dotenv from 'dotenv';
import path from 'path';
import { SwarmService } from '../src/app/modules/swarm/swarm.service.js';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function verifySyncFallback() {
  console.log('\n--- VERIFYING SYNCHRONOUS SWARM FALLBACK ---');
  try {
    const response = await SwarmService.executeSwarmSync('What is quantum computing in one sentence?');
    console.log('🟢 Synchronous Swarm Response:', response);
  } catch (err) {
    console.error('❌ Synchronous Swarm failed:', err);
  }
}

async function verifyStreamFallback() {
  console.log('\n--- VERIFYING STREAMING SWARM FALLBACK ---');
  try {
    const stream = SwarmService.executeSwarmStream('Explain machine learning in one short sentence.');
    for await (const chunk of stream) {
      if (chunk.type === 'text') {
        process.stdout.write(chunk.content);
      } else {
        console.log(`\n[Metadata Chunk]:`, chunk);
      }
    }
    console.log('\n🟢 Streaming Swarm completed successfully.');
  } catch (err) {
    console.error('❌ Streaming Swarm failed:', err);
  }
}

async function run() {
  await verifySyncFallback();
  await verifyStreamFallback();
}

run();
