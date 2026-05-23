import mongoose from 'mongoose';
import { logger } from '../src/shared/logger.js';

// Load models
import EventTrigger from '../src/app/modules/composio_v2/models/eventTrigger.model.js';
import DocumentRelationship from '../src/app/modules/llamaindex/llamaindex.relationship.model.js';

// Load services
import { langchainOptimizerService } from '../src/app/modules/langchain/langchainOptimizer.service.js';
import { eventTriggerService } from '../src/app/modules/composio_v2/eventTrigger.service.js';
import { relationshipGraphService } from '../src/app/modules/llamaindex/llamaindex.relationshipGraph.js';

async function verifyAll() {
  console.log('=== VERIFYING ALTI.ASSISTANT V1.7.8 BACKEND PIPELINES ===');

  console.log('\n1. Checking Mongoose Model Compilation...');
  if (EventTrigger && EventTrigger.modelName === 'EventTrigger') {
    console.log('  [PASS] EventTrigger model compiled cleanly');
  } else {
    throw new Error('EventTrigger model failed');
  }

  if (DocumentRelationship && DocumentRelationship.modelName === 'DocumentRelationship') {
    console.log('  [PASS] DocumentRelationship model compiled cleanly');
  } else {
    throw new Error('DocumentRelationship model failed');
  }

  console.log('\n2. Checking Services Exports...');
  if (langchainOptimizerService && typeof langchainOptimizerService.optimizeChain === 'function') {
    console.log('  [PASS] langchainOptimizerService exports optimizeChain method');
  } else {
    throw new Error('langchainOptimizerService verify failed');
  }

  if (eventTriggerService && typeof eventTriggerService.registerTrigger === 'function') {
    console.log('  [PASS] eventTriggerService exports registerTrigger method');
  } else {
    throw new Error('eventTriggerService verify failed');
  }

  if (relationshipGraphService && typeof relationshipGraphService.buildRelationshipGraph === 'function') {
    console.log('  [PASS] relationshipGraphService exports buildRelationshipGraph method');
  } else {
    throw new Error('relationshipGraphService verify failed');
  }

  console.log('\n=== ALL v1.7.8 BACKEND SERVICES AND MODELS COMPILED SUCCESSFULLY ===');
}

verifyAll().catch((err) => {
  console.error('\n[FAIL] Verification encountered errors:', err);
  process.exit(1);
});
