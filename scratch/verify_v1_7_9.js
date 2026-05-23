import mongoose from 'mongoose';
import { logger } from '../src/shared/logger.js';

// Load models
import LangchainChainVersion from '../src/app/modules/langchain/langchain-version.model.js';

// Load services
import { langchainVersionService } from '../src/app/modules/langchain/langchainVersion.service.js';
import { connectionRecoveryService } from '../src/app/modules/composio_v2/connectionRecovery.service.js';
import { graphRetrieverService } from '../src/app/modules/llamaindex/llamaindex.graphRetriever.js';

async function verifyAll() {
  console.log('=== VERIFYING ALTI.ASSISTANT V1.7.9 BACKEND PIPELINES ===');

  console.log('\n1. Checking Mongoose Model Compilation...');
  if (LangchainChainVersion && LangchainChainVersion.modelName === 'LangchainChainVersion') {
    console.log('  [PASS] LangchainChainVersion model compiled cleanly');
  } else {
    throw new Error('LangchainChainVersion model failed');
  }

  console.log('\n2. Checking Services Exports...');
  if (langchainVersionService && typeof langchainVersionService.createSnapshot === 'function') {
    console.log('  [PASS] langchainVersionService exports createSnapshot method');
  } else {
    throw new Error('langchainVersionService verify failed');
  }

  if (connectionRecoveryService && typeof connectionRecoveryService.attemptAutoRecovery === 'function') {
    console.log('  [PASS] connectionRecoveryService exports attemptAutoRecovery method');
  } else {
    throw new Error('connectionRecoveryService verify failed');
  }

  if (graphRetrieverService && typeof graphRetrieverService.getGraphEnrichedQueryContext === 'function') {
    console.log('  [PASS] graphRetrieverService exports getGraphEnrichedQueryContext method');
  } else {
    throw new Error('graphRetrieverService verify failed');
  }

  console.log('\n=== ALL v1.7.9 BACKEND SERVICES AND MODELS COMPILED SUCCESSFULLY ===');
}

verifyAll().catch((err) => {
  console.error('\n[FAIL] Verification encountered errors:', err);
  process.exit(1);
});
