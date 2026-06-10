import { StateGraph, END, START, MemorySaver } from '@langchain/langgraph';
import { deepResearchAgentState } from './state.js';
import {
  initializeResearchNode,
  breadthFirstSearchNode,
  identifyPromisingLeadsNode,
  deepDiveResearchNode,
  synthesizeComprehensiveReportNode,
  boardDebateNode,
  refineSynthesisNode,
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
workflow.addNode('board_debate', boardDebateNode);
workflow.addNode('refine_synthesis', refineSynthesisNode);
workflow.addNode('save_research', saveDeepResearchNode);
workflow.addNode('generate_pdf', generateDeepResearchPDFNode);

// Define the workflow edges - Sequential flow for comprehensive research
workflow.addEdge(START, 'initialize');
workflow.addEdge('initialize', 'breadth_search');
workflow.addEdge('breadth_search', 'identify_leads');
workflow.addEdge('identify_leads', 'deep_dive');
workflow.addEdge('deep_dive', 'synthesize_report');
workflow.addEdge('synthesize_report', 'board_debate');
workflow.addEdge('board_debate', 'refine_synthesis');
workflow.addEdge('refine_synthesis', 'save_research');
workflow.addEdge('save_research', 'generate_pdf');
workflow.addEdge('generate_pdf', END);

// Compile immediately with in-memory checkpointer to avoid blocking startup
let checkpointer = new MemorySaver();

// Export the deep research agent app as a mutable variable so its checkpointer can be updated.
// It's initially compiled with an in-memory checkpointer.
export let deepResearchAgentApp = workflow.compile({
  checkpointer,
  debug: true,
});

// Deferred MongoDB checkpointer upgrade (non-blocking)
if (process.env.DISABLE_MONGO_CHECKPOINTER !== 'true') {
  // GCP Resiliency: Define MongoDB connection options for robust performance in a cloud environment.
  // These settings optimize connection pooling, timeouts, and keep-alive mechanisms to handle
  // transient network issues, scaling events, and long-lived connections through proxies or firewalls.
  const mongoResiliencyOptions = {
    // Connection Pooling: Optimize for serverless/containerized environments
    maxPoolSize: 50, // Increased pool size for concurrent serverless functions
    minPoolSize: 5, // Keep a few connections warm to reduce cold start latency
    maxIdleTimeMS: 60000, // Aggressively close idle connections to manage resources

    // Timeouts: Prevent indefinite hangs on network partitions or slow responses
    connectTimeoutMS: 30000, // Fail fast if a connection cannot be established
    socketTimeoutMS: 45000, // Timeout for individual socket operations
    serverSelectionTimeoutMS: 30000, // Time to find a suitable server before failing

    // KeepAlive: Essential for stable connections through GCP firewalls, NATs, or proxies
    keepAlive: true,
    keepAliveInitialDelay: 300000, // Send keep-alive pings every 5 minutes
  };

  // Construct the full connection URI with resiliency parameters.
  // This ensures that even if the base URI from config doesn't have these, they are applied.
  // It uses URLSearchParams to correctly format the query string.
  const baseUri = config.database_url; // Use production database URL from config
  const uri = new URL(baseUri);
  Object.entries(mongoResiliencyOptions).forEach(([key, value]) => {
    uri.searchParams.set(key, value.toString());
  });
  const resilientMongoUri = uri.toString();

  MongoDBSaver.fromUri(resilientMongoUri, 'deep_research_agent_checkpoints')
    .then((mongoCheckpointer) => {
      checkpointer = mongoCheckpointer;
      // Recompile and reassign the deepResearchAgentApp with the MongoDB checkpointer.
      // Using Object.assign on a const export might not correctly update the internal checkpointer
      // of a LangGraph Runnable. Reassigning the exported variable (now `let`) is more robust.
      deepResearchAgentApp = workflow.compile({ checkpointer, debug: true });
      console.log('✅ Deep research: MongoDB checkpointer connected with resiliency settings');
    })
    .catch((err) => {
      console.warn('⚠️ Deep research: MongoDB checkpointer unavailable, using in-memory fallback:', err.message);
    });
} else {
  console.log('ℹ️ Deep research: MongoDB checkpointer disabled, using in-memory MemorySaver');
}

// Export utility function to invoke the deep research agent
export const runDeepResearchAgent = async (query, options = {}) => {
  const {
    generatePdf = false,
    conversationId = null,
    history = [],
    maxDepth = 3,
    boardPersonas = ['McKinsey Strategy Partner', 'Gartner Research Director', 'YC Technical Architect'],
    consensusLevel = 'majority',
  } = options;

  // Determine a consistent threadId for both the initial state and the LangGraph checkpointer.
  // Prioritize provided conversationId, then a default from the imported config, then a new unique ID.
  // This resolves the `config` variable shadowing and ensures consistency between `initialState.conversationId`
  // and the `thread_id` used by the checkpointer.
  const currentThreadId = conversationId || config.configurable.thread_id || `deep_research_${Date.now()}`;

  const initialState = {
    originalQuery: query,
    conversationId: currentThreadId, // Use the consistent threadId
    generatePdf,
    history,
    maxDepth,
    currentDepth: 0,
    boardPersonas,
    consensusLevel,
    metadata: {
      timestamp: new Date(),
      totalSearches: 0,
      processingTime: null,
      researchStrategy: 'recursive_deep',
      confidence: null,
    },
  };

  // Configuration for the LangGraph invocation, using the consistent threadId for the checkpointer.
  const invokeConfig = { configurable: { thread_id: currentThreadId } };

  try {
    console.log(`Starting deep research for: "${query}" with threadId: ${currentThreadId}`);
    const result = await deepResearchAgentApp.invoke(initialState, invokeConfig);

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
      conversationId: currentThreadId, // Ensure the returned conversationId is the one actually used
      researchProgress: result.researchProgress,
    };
  } catch (error) {
    console.error('Error running deep research agent:', error);
    return {
      success: false,
      error: error.message,
      query,
      conversationId: currentThreadId, // Ensure the returned conversationId is the one actually used
    };
  }
};