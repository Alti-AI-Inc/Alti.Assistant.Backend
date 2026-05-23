import dotenv from 'dotenv';
dotenv.config();

console.log('Starting verification of Alti.Assistant Backend v1.8.0 improvements...');

// 1. Verify Imports
try {
  console.log('Importing LangChain Evaluator service...');
  const { langchainEvaluatorService } = await import('../src/app/modules/langchain/langchainEvaluator.service.js');
  if (langchainEvaluatorService && typeof langchainEvaluatorService.benchmarkVersions === 'function') {
    console.log('🟢 LangChain Evaluator service imported and verified successfully!');
  } else {
    throw new Error('langchainEvaluatorService or benchmarkVersions is missing!');
  }

  console.log('Importing Composio Diagnostics service...');
  const { connectionDiagnosticsService } = await import('../src/app/modules/composio_v2/connectionDiagnostics.service.js');
  if (connectionDiagnosticsService && 
      typeof connectionDiagnosticsService.getConnectionDiagnostics === 'function' && 
      typeof connectionDiagnosticsService.getSingleConnectionDiagnostics === 'function') {
    console.log('🟢 Composio Diagnostics service imported and verified successfully!');
  } else {
    throw new Error('connectionDiagnosticsService is missing diagnostics functions!');
  }

  console.log('Importing LlamaIndex Graph Coherence Pruner service...');
  const { contextPrunerService } = await import('../src/app/modules/llamaindex/llamaindex.contextPruner.js');
  if (contextPrunerService && typeof contextPrunerService.pruneAndRerank === 'function') {
    console.log('🟢 LlamaIndex Graph Coherence Pruner service imported and verified successfully!');
  } else {
    throw new Error('contextPrunerService or pruneAndRerank is missing!');
  }
  
  console.log('\nAll v1.8.0 backend services verified successfully!');
} catch (error) {
  console.error('❌ Verification failed due to import/syntax error:', error);
  process.exit(1);
}

process.exit(0);
