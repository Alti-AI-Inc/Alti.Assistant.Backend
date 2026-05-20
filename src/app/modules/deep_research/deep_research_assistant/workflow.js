import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { deepResearchAgentState } from './state.js';
import {
  initializeResearchNode,
  breadthFirstSearchNode,
  identifyPromisingLeadsNode,
  deepDiveResearchNode,
  synthesizeComprehensiveReportNode,
  saveDeepResearchNode,
  generateDeepResearchPDFNode,
} from './nodes.js';
import config from '../../../../../config/index.js';
import { MongoDBSaver } from '../../code/code_assistant/MongoDBSaver.js';

// Create the deep research agent workflow
const workflow = new StateGraph({ channels: deepResearchAgentState });

// Add all nodes for the recursive deep research process
workflow.addNode('initialize', initializeResearchNode);
workflow.addNode('breadth_search', breadthFirstSearchNode);
workflow.addNode('identify_leads', identifyPromisingLeadsNode);
workflow.addNode('deep_dive', deepDiveResearchNode);
workflow.addNode('synthesize_report', synthesizeComprehensiveReportNode);
workflow.addNode('save_research', saveDeepResearchNode);
workflow.addNode('generate_pdf', generateDeepResearchPDFNode);

// Define the workflow edges - Sequential flow for comprehensive research
workflow.addEdge(START, 'initialize');
workflow.addEdge('initialize', 'breadth_search');
workflow.addEdge('breadth_search', 'identify_leads');
workflow.addEdge('identify_leads', 'deep_dive');
workflow.addEdge('deep_dive', 'synthesize_report');
workflow.addEdge('synthesize_report', 'save_research');
workflow.addEdge('save_research', 'generate_pdf');
workflow.addEdge('generate_pdf', END);

// Initialize MongoDB checkpointer for conversation persistence
let checkpointer;
try {
  checkpointer = await MongoDBSaver.fromUri(config.database_local, 'deep_research_agent_checkpoints');
} catch (err) {
  console.warn('⚠️ Deep research: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
  checkpointer = new MemorySaver();
}

// Compile the workflow with checkpointer
export const deepResearchAgentApp = workflow.compile({
  checkpointer,
  debug: true,
});

// Export utility function to invoke the deep research agent
export const runDeepResearchAgent = async (query, options = {}) => {
  const {
    generatePdf = false,
    conversationId = null,
    history = [],
    maxDepth = 3,
  } = options;

  const initialState = {
    originalQuery: query,
    generatePdf,
    history,
    maxDepth,
    currentDepth: 0,
    metadata: {
      timestamp: new Date(),
      totalSearches: 0,
      processingTime: null,
      researchStrategy: 'recursive_deep',
      confidence: null,
    },
  };

  const config = conversationId
    ? { configurable: { thread_id: conversationId } }
    : { configurable: { thread_id: `deep_research_${Date.now()}` } };

  try {
    console.log(`Starting deep research for: "${query}"`);
    const result = await deepResearchAgentApp.invoke(initialState, config);

    return {
      success: true,
      query: result.originalQuery,
      answer: result.finalReport,
      classification: 'deep_research',
      sources: result.allSources,
      promisingLeads: result.promisingLeads,
      deepDiveResults: result.deepDiveResults,
      qualityMetrics: result.qualityMetrics,
      knowledgeGraph: result.knowledgeGraph,
      metadata: result.metadata,
      pdfData: result.pdfData,
      conversationId: config.configurable.thread_id,
      researchProgress: result.researchProgress,
    };
  } catch (error) {
    console.error('Error running deep research agent:', error);
    return {
      success: false,
      error: error.message,
      query,
      conversationId: config.configurable.thread_id,
    };
  }
};
