import mongoose from 'mongoose';
import { logger } from '../src/shared/logger.js';

// Load models
import LangchainChain from '../src/app/modules/langchain/langchain-chain.model.js';
import LangchainExecution from '../src/app/modules/langchain/langchain-execution.model.js';
import DocumentMetadata from '../src/app/modules/llamaindex/llamaindex.metadata.model.js';

// Load services
import { LangchainExecutionService } from '../src/app/modules/langchain/langchainExecution.service.js';
import { appDiscoveryService } from '../src/app/modules/composio_v2/appDiscovery.service.js';
import { metadataAgentService } from '../src/app/modules/llamaindex/llamaindex.metadataAgent.js';
import { queryRouterService } from '../src/app/modules/llamaindex/llamaindex.queryRouter.js';

async function verifyAll() {
  console.log('=== VERIFYING ALTI.ASSISTANT V1.7.7 BACKEND PIPELINES ===');

  console.log('\n1. Checking Mongoose Model Compilation...');
  if (LangchainChain && LangchainChain.modelName === 'LangchainChain') {
    console.log('  [PASS] LangchainChain model compiled cleanly');
  } else {
    throw new Error('LangchainChain model failed');
  }

  if (LangchainExecution && LangchainExecution.modelName === 'LangchainExecution') {
    console.log('  [PASS] LangchainExecution model compiled cleanly');
  } else {
    throw new Error('LangchainExecution model failed');
  }

  if (DocumentMetadata && DocumentMetadata.modelName === 'DocumentMetadata') {
    console.log('  [PASS] DocumentMetadata model compiled cleanly');
  } else {
    throw new Error('DocumentMetadata model failed');
  }

  console.log('\n2. Checking Services Exports...');
  if (LangchainExecutionService && typeof LangchainExecutionService.executeChain === 'function') {
    console.log('  [PASS] LangchainExecutionService exports executeChain method');
  } else {
    throw new Error('LangchainExecutionService verify failed');
  }

  if (appDiscoveryService && typeof appDiscoveryService.getRecommendations === 'function') {
    console.log('  [PASS] appDiscoveryService exports getRecommendations method');
  } else {
    throw new Error('appDiscoveryService verify failed');
  }

  if (metadataAgentService && typeof metadataAgentService.enrichDocument === 'function') {
    console.log('  [PASS] metadataAgentService exports enrichDocument method');
  } else {
    throw new Error('metadataAgentService verify failed');
  }

  if (queryRouterService && typeof queryRouterService.route === 'function') {
    console.log('  [PASS] queryRouterService exports route method');
  } else {
    throw new Error('queryRouterService verify failed');
  }

  console.log('\n=== ALL v1.7.7 BACKEND SERVICES AND MODELS COMPILED SUCCESSFULLY ===');
}

verifyAll().catch((err) => {
  console.error('\n[FAIL] Verification encountered errors:', err);
  process.exit(1);
});
