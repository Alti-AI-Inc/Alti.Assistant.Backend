import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// Direct imports using relative paths inside Alti.Assistant.Backend
import { SwarmService } from './src/app/modules/swarm/swarm.service.js';
import LangchainRepository from './src/app/modules/langchain/langchain-repository.model.js';
import TemporalRepository from './src/app/modules/temporal/temporal-repository.model.js';
import GoogleRepository from './src/app/modules/gcp_native/gcp-repository.model.js';

const mongoUrl = process.env.DATABASE_URL || 'mongodb://127.0.0.1:27017/alti';

async function testSovereignRetrieval() {
  console.log('📡 [Test] Connecting to MongoDB at:', mongoUrl);
  await mongoose.connect(mongoUrl);
  console.log('✅ [Test] MongoDB connected successfully.');

  // Check database catalog count
  const langchainCount = await LangchainRepository.countDocuments({});
  const temporalCount = await TemporalRepository.countDocuments({});
  const googleCount = await GoogleRepository.countDocuments({});
  
  console.log(`📊 [Catalog Stats] LangChain repos: ${langchainCount}, Temporal repos: ${temporalCount}, GCP repos: ${googleCount}`);

  // Test LangChain query
  console.log('\n--- TEST CASE 1: LangChain Query ---');
  const langchainResult = await SwarmService.getSovereignRepositoryContext('How do I build an agent using langchain and langgraph?');
  console.log('Result length:', langchainResult.length);
  if (langchainResult) {
    console.log(langchainResult.substring(0, 1000) + '\n... [TRUNCATED]');
  } else {
    console.log('No grounding retrieved.');
  }

  // Test Temporal query
  console.log('\n--- TEST CASE 2: Temporal Query ---');
  const temporalResult = await SwarmService.getSovereignRepositoryContext('What is temporal workflow activity structure?');
  console.log('Result length:', temporalResult.length);
  if (temporalResult) {
    console.log(temporalResult.substring(0, 1000) + '\n... [TRUNCATED]');
  } else {
    console.log('No grounding retrieved.');
  }

  await mongoose.disconnect();
  console.log('\n📡 [Test] Disconnected from MongoDB.');
}

testSovereignRetrieval().catch(err => {
  console.error('❌ Test failed:', err);
  mongoose.disconnect();
});
