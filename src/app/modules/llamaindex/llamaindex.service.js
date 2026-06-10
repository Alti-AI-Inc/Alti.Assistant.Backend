import * as llama from './llamaindex.indexer.js';
import logger from '../../../utils/logger.js';
import ApiError from '../../../utils/ApiError.js';

const uploadAndIndexDocumentService = async (filePath, originalName, userId) => {
  try {
    return await llama.createIndexFromFile(filePath, originalName, userId);
  } catch (error) {
    // GCP Cloud Logging expects a single JSON payload for structured logging.
    // The 'severity' field is automatically added by Winston's log levels (e.g., logger.error -> severity: 'ERROR').
    // We structure the log entry with a clear message, context for filtering, and a dedicated error object.
    logger.error({
      message: `Error in uploadAndIndexDocumentService: ${error.message}`,
      context: {
        functionName: 'uploadAndIndexDocumentService',
        userId,
        originalName,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to upload and index document', true, error.stack);
  }
};

const queryDocument = async (query, userId) => {
  try {
    return await llama.askQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocument: ${error.message}`,
      context: {
        functionName: 'queryDocument',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query document', true, error.stack);
  }
};

const queryDocumentStream = async (query, userId, onChunk) => {
  try {
    return await llama.askQueryStream(query, userId, onChunk);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentStream: ${error.message}`,
      context: {
        functionName: 'queryDocumentStream',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query document stream', true, error.stack);
  }
};

// Phase 5: Advanced query with RouterQueryEngine / SubQuestionQueryEngine
const queryDocumentAdvanced = async (query, userId, mode) => {
  try {
    return await llama.askAdvancedQuery(query, userId, mode);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentAdvanced: ${error.message}`,
      context: {
        functionName: 'queryDocumentAdvanced',
        userId,
        mode,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform advanced query', true, error.stack);
  }
};

// Phase 6: ReAct Agent query with tool calling
const queryDocumentAgent = async (query, userId) => {
  try {
    return await llama.askAgentQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentAgent: ${error.message}`,
      context: {
        functionName: 'queryDocumentAgent',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform agent query', true, error.stack);
  }
};

// Phase 6: CondenseQuestionChatEngine with ChatSummaryMemoryBuffer
const queryDocumentChatEngine = async (query, userId) => {
  try {
    return await llama.askChatEngineQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentChatEngine: ${error.message}`,
      context: {
        functionName: 'queryDocumentChatEngine',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query chat engine', true, error.stack);
  }
};

// Phase 7: Self-Correcting Query Pipeline
const queryDocumentSelfCorrecting = async (query, userId) => {
  try {
    return await llama.askSelfCorrectingQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentSelfCorrecting: ${error.message}`,
      context: {
        functionName: 'queryDocumentSelfCorrecting',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform self-correcting query', true, error.stack);
  }
};

// Phase 7: Hybrid Search (Vector + Keyword Fusion via RRF)
const queryDocumentHybrid = async (query, userId) => {
  try {
    return await llama.askHybridQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentHybrid: ${error.message}`,
      context: {
        functionName: 'queryDocumentHybrid',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform hybrid query', true, error.stack);
  }
};

// Phase 8: Full-Spectrum Retrieval (6 Retriever Types + RRF + MMR)
const queryDocumentFullSpectrum = async (query, userId) => {
  try {
    return await llama.askFullSpectrumQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentFullSpectrum: ${error.message}`,
      context: {
        functionName: 'queryDocumentFullSpectrum',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform full-spectrum query', true, error.stack);
  }
};

// Phase 8: ObjectIndex Agent (SimpleToolNodeMapping)
const queryDocumentObjectAgent = async (query, userId) => {
  try {
    return await llama.askObjectIndexAgent(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryDocumentObjectAgent: ${error.message}`,
      context: {
        functionName: 'queryDocumentObjectAgent',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query object index agent', true, error.stack);
  }
};

// Phase 8: Simple Chat (no index required)
const querySimpleChat = async (message, userId) => {
  try {
    return await llama.askSimpleChat(message, userId);
  } catch (error) {
    logger.error({
      message: `Error in querySimpleChat: ${error.message}`,
      context: {
        functionName: 'querySimpleChat',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform simple chat', true, error.stack);
  }
};

// Phase 8: Document Comparison
const compareDocuments = async (docId1, docId2, userId) => {
  try {
    return await llama.compareDocuments(docId1, docId2, userId);
  } catch (error) {
    logger.error({
      message: `Error in compareDocuments: ${error.message}`,
      context: {
        functionName: 'compareDocuments',
        userId,
        docId1,
        docId2,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to compare documents', true, error.stack);
  }
};

// Phase 8: Export Corpus Snapshot
const exportCorpusSnapshot = async (userId) => {
  try {
    return await llama.exportCorpusSnapshot(userId);
  } catch (error) {
    logger.error({
      message: `Error in exportCorpusSnapshot: ${error.message}`,
      context: {
        functionName: 'exportCorpusSnapshot',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to export corpus snapshot', true, error.stack);
  }
};

// Phase 9: Intelligent Query Classifier (auto-routes to best engine)
const classifyAndRoute = async (query, userId) => {
  try {
    return await llama.classifyAndRoute(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in classifyAndRoute: ${error.message}`,
      context: {
        functionName: 'classifyAndRoute',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to classify and route query', true, error.stack);
  }
};

// Phase 9: Context-Aware Chat (DefaultContextGenerator)
const queryContextAwareChat = async (message, userId) => {
  try {
    return await llama.askContextAwareChat(message, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryContextAwareChat: ${error.message}`,
      context: {
        functionName: 'queryContextAwareChat',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform context-aware chat', true, error.stack);
  }
};

// Phase 9: Index Diagnostics (node introspection)
const getIndexDiagnostics = async (userId) => {
  try {
    return await llama.getIndexDiagnostics(userId);
  } catch (error) {
    logger.error({
      message: `Error in getIndexDiagnostics: ${error.message}`,
      context: {
        functionName: 'getIndexDiagnostics',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get index diagnostics', true, error.stack);
  }
};

// Phase 9: Pipeline Health Check (MockLLM self-test)
const runPipelineHealthCheck = async () => {
  try {
    return await llama.runPipelineHealthCheck();
  } catch (error) {
    logger.error({
      message: `Error in runPipelineHealthCheck: ${error.message}`,
      context: {
        functionName: 'runPipelineHealthCheck',
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to run pipeline health check', true, error.stack);
  }
};

// Phase 9: Batch Document Processing
const batchProcessDocuments = async (userId) => {
  try {
    return await llama.batchProcessDocuments(userId);
  } catch (error) {
    logger.error({
      message: `Error in batchProcessDocuments: ${error.message}`,
      context: {
        functionName: 'batchProcessDocuments',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to batch process documents', true, error.stack);
  }
};

// Phase 9: Enhanced Streaming Query
const queryStreamingQuery = async (query, userId) => {
  try {
    return await llama.askStreamingQuery(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryStreamingQuery: ${error.message}`,
      context: {
        functionName: 'queryStreamingQuery',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to perform streaming query', true, error.stack);
  }
};

// Phase 10: Multi-Modal Image Document Indexing
const indexImageDocument = async (imagePath, originalName, userId) => {
  try {
    return await llama.indexImageDocument(imagePath, originalName, userId);
  } catch (error) {
    logger.error({
      message: `Error in indexImageDocument: ${error.message}`,
      context: {
        functionName: 'indexImageDocument',
        userId,
        originalName,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to index image document', true, error.stack);
  }
};

// Phase 10: Complete Pipeline Introspection
const getCompletePipelineIntrospection = async (userId) => {
  try {
    return await llama.getCompletePipelineIntrospection(userId);
  } catch (error) {
    logger.error({
      message: `Error in getCompletePipelineIntrospection: ${error.message}`,
      context: {
        functionName: 'getCompletePipelineIntrospection',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get pipeline introspection', true, error.stack);
  }
};

// Phase 10: Advanced Text Analysis
const analyzeDocumentText = async (docId, userId) => {
  try {
    return await llama.analyzeDocumentText(docId, userId);
  } catch (error) {
    logger.error({
      message: `Error in analyzeDocumentText: ${error.message}`,
      context: {
        functionName: 'analyzeDocumentText',
        userId,
        docId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to analyze document text', true, error.stack);
  }
};

// Phase 10: Pipeline Configuration Validation
const validatePipelineConfiguration = () => {
  try {
    return llama.validatePipelineConfiguration();
  } catch (error) {
    logger.error({
      message: `Error in validatePipelineConfiguration: ${error.message}`,
      context: {
        functionName: 'validatePipelineConfiguration',
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to validate pipeline configuration', true, error.stack);
  }
};

// Phase 6: Corpus analytics & insights
const getCorpusAnalytics = async (userId) => {
  try {
    return await llama.getCorpusAnalytics(userId);
  } catch (error) {
    logger.error({
      message: `Error in getCorpusAnalytics: ${error.message}`,
      context: {
        functionName: 'getCorpusAnalytics',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get corpus analytics', true, error.stack);
  }
};

// Phase 7: Pipeline observability
const getPipelineObservability = () => {
  try {
    return llama.getPipelineObservability();
  } catch (error) {
    logger.error({
      message: `Error in getPipelineObservability: ${error.message}`,
      context: {
        functionName: 'getPipelineObservability',
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get pipeline observability', true, error.stack);
  }
};

// Phase 7: Document keyword extraction
const extractDocumentKeywords = async (userId) => {
  try {
    return await llama.extractDocumentKeywords(userId);
  } catch (error) {
    logger.error({
      message: `Error in extractDocumentKeywords: ${error.message}`,
      context: {
        functionName: 'extractDocumentKeywords',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to extract document keywords', true, error.stack);
  }
};

// Phase 6: Chat history summarization
const summarizeChatHistory = async (userId) => {
  try {
    return await llama.summarizeChatHistory(userId);
  } catch (error) {
    logger.error({
      message: `Error in summarizeChatHistory: ${error.message}`,
      context: {
        functionName: 'summarizeChatHistory',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to summarize chat history', true, error.stack);
  }
};

const listDocuments = async (userId) => {
  try {
    return await llama.listDocuments(userId);
  } catch (error) {
    logger.error({
      message: `Error in listDocuments: ${error.message}`,
      context: {
        functionName: 'listDocuments',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to list documents', true, error.stack);
  }
};

const deleteDocument = async (userId, docId) => {
  try {
    return await llama.deleteDocument(userId, docId);
  } catch (error) {
    logger.error({
      message: `Error in deleteDocument: ${error.message}`,
      context: {
        functionName: 'deleteDocument',
        userId,
        docId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to delete document', true, error.stack);
  }
};

const clearAllDocuments = async (userId) => {
  try {
    return await llama.clearAllDocuments(userId);
  } catch (error) {
    logger.error({
      message: `Error in clearAllDocuments: ${error.message}`,
      context: {
        functionName: 'clearAllDocuments',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to clear all documents', true, error.stack);
  }
};

// Phase 11: Configuration Registry
const getConfigurationRegistry = () => {
  try {
    return llama.getConfigurationRegistry();
  } catch (error) {
    logger.error({
      message: `Error in getConfigurationRegistry: ${error.message}`,
      context: {
        functionName: 'getConfigurationRegistry',
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get configuration registry', true, error.stack);
  }
};

// Phase 11: Prompt Library
const getPromptLibrary = () => {
  try {
    return llama.getPromptLibrary();
  } catch (error) {
    logger.error({
      message: `Error in getPromptLibrary: ${error.message}`,
      context: {
        functionName: 'getPromptLibrary',
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get prompt library', true, error.stack);
  }
};

// Phase 11: Schema Validation
const validateWithSchemas = (data, schemaName) => {
  try {
    return llama.validateWithSchemas(data, schemaName);
  } catch (error) {
    logger.error({
      message: `Error in validateWithSchemas: ${error.message}`,
      context: {
        functionName: 'validateWithSchemas',
        schemaName,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to validate with schemas', true, error.stack);
  }
};

// Phase 12: Semantic Query Cache
const querySemanticallyCached = async (query, userId) => {
  try {
    return await llama.querySemanticallyCached(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in querySemanticallyCached: ${error.message}`,
      context: {
        functionName: 'querySemanticallyCached',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query semantically cached', true, error.stack);
  }
};

// Phase 12: Adaptive Chunking Strategy
const getAdaptiveChunkingStrategy = (fileName) => {
  try {
    return llama.getAdaptiveChunkingStrategy(fileName);
  } catch (error) {
    logger.error({
      message: `Error in getAdaptiveChunkingStrategy: ${error.message}`,
      context: {
        functionName: 'getAdaptiveChunkingStrategy',
        fileName,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get adaptive chunking strategy', true, error.stack);
  }
};

// Phase 12: Document Relationship Graph
const buildDocumentRelationshipGraph = async (userId) => {
  try {
    return await llama.buildDocumentRelationshipGraph(userId);
  } catch (error) {
    logger.error({
      message: `Error in buildDocumentRelationshipGraph: ${error.message}`,
      context: {
        functionName: 'buildDocumentRelationshipGraph',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to build document relationship graph', true, error.stack);
  }
};

// Phase 12: Retrieval Benchmark
const benchmarkRetrievalStrategies = async (query, userId) => {
  try {
    return await llama.benchmarkRetrievalStrategies(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in benchmarkRetrievalStrategies: ${error.message}`,
      context: {
        functionName: 'benchmarkRetrievalStrategies',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to benchmark retrieval strategies', true, error.stack);
  }
};

// Phase 13: Query Decomposition
const queryWithDecomposition = async (query, userId) => {
  try {
    return await llama.queryWithDecomposition(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in queryWithDecomposition: ${error.message}`,
      context: {
        functionName: 'queryWithDecomposition',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query with decomposition', true, error.stack);
  }
};

// Phase 13: Metadata Extraction Pipeline
const runMetadataExtractionPipeline = async (userId) => {
  try {
    return await llama.runMetadataExtractionPipeline(userId);
  } catch (error) {
    logger.error({
      message: `Error in runMetadataExtractionPipeline: ${error.message}`,
      context: {
        functionName: 'runMetadataExtractionPipeline',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to run metadata extraction pipeline', true, error.stack);
  }
};

// Phase 13: Custom Re-Ranking
const queryWithReranking = async (query, userId, options) => {
  try {
    return await llama.queryWithReranking(query, userId, options);
  } catch (error) {
    logger.error({
      message: `Error in queryWithReranking: ${error.message}`,
      context: {
        functionName: 'queryWithReranking',
        userId,
        options,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to query with reranking', true, error.stack);
  }
};

// Phase 13: Query Feedback
const submitQueryFeedback = async (userId, feedbackData) => {
  try {
    return await llama.submitQueryFeedback(userId, feedbackData);
  } catch (error) {
    logger.error({
      message: `Error in submitQueryFeedback: ${error.message}`,
      context: {
        functionName: 'submitQueryFeedback',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to submit query feedback', true, error.stack);
  }
};

// Phase 13: Feedback Analytics
const getQueryFeedbackAnalytics = async (userId) => {
  try {
    return await llama.getQueryFeedbackAnalytics(userId);
  } catch (error) {
    logger.error({
      message: `Error in getQueryFeedbackAnalytics: ${error.message}`,
      context: {
        functionName: 'getQueryFeedbackAnalytics',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get query feedback analytics', true, error.stack);
  }
};

// Phase 14: Automated Evaluation Pipeline
const evaluateArbitraryResponse = async (query, response, context, userId) => {
  try {
    return await llama.evaluateArbitraryResponse(query, response, context, userId);
  } catch (error) {
    logger.error({
      message: `Error in evaluateArbitraryResponse: ${error.message}`,
      context: {
        functionName: 'evaluateArbitraryResponse',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to evaluate response', true, error.stack);
  }
};

const getEvaluationHistory = async (userId) => {
  try {
    return await llama.getEvaluationHistoryFromDisk(userId);
  } catch (error) {
    logger.error({
      message: `Error in getEvaluationHistory: ${error.message}`,
      context: {
        functionName: 'getEvaluationHistory',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to get evaluation history', true, error.stack);
  }
};

// Phase 15: Event-Driven Live Sessions
const streamLiveSession = async (query, userId, onChunk) => {
  try {
    return await llama.streamLiveSession(query, userId, onChunk);
  } catch (error) {
    logger.error({
      message: `Error in streamLiveSession: ${error.message}`,
      context: {
        functionName: 'streamLiveSession',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to stream live session', true, error.stack);
  }
};

// Phase 16: Advanced Storage Strategies
const indexDocumentAdvanced = async (filePath, originalName, userId, strategyOption) => {
  try {
    return await llama.indexDocumentAdvancedWithStrategy(filePath, originalName, userId, strategyOption);
  } catch (error) {
    logger.error({
      message: `Error in indexDocumentAdvanced: ${error.message}`,
      context: {
        functionName: 'indexDocumentAdvanced',
        userId,
        originalName,
        strategyOption,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to index document with advanced strategy', true, error.stack);
  }
};

// Phase 17: Multi-Step Agent Workflows
const runAgentWorkflow = async (query, userId) => {
  try {
    return await llama.runAgentWorkflowStepByStep(query, userId);
  } catch (error) {
    logger.error({
      message: `Error in runAgentWorkflow: ${error.message}`,
      context: {
        functionName: 'runAgentWorkflow',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to run agent workflow', true, error.stack);
  }
};

// Phase 18: Prompt Optimization API
const optimizePrompt = async (promptText, userId) => {
  try {
    return await llama.optimizePromptWithHelper(promptText, userId);
  } catch (error) {
    logger.error({
      message: `Error in optimizePrompt: ${error.message}`,
      context: {
        functionName: 'optimizePrompt',
        userId,
      },
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw error instanceof ApiError ? error : new ApiError(500, error.message || 'Failed to optimize prompt', true, error.stack);
  }
};

export const ragService = {
  uploadAndIndexDocumentService,
  queryDocument,
  queryDocumentStream,
  queryDocumentAdvanced,
  queryDocumentAgent,
  queryDocumentChatEngine,
  queryDocumentSelfCorrecting,
  queryDocumentHybrid,
  queryDocumentFullSpectrum,
  queryDocumentObjectAgent,
  querySimpleChat,
  compareDocuments,
  exportCorpusSnapshot,
  classifyAndRoute,
  queryContextAwareChat,
  getIndexDiagnostics,
  runPipelineHealthCheck,
  batchProcessDocuments,
  queryStreamingQuery,
  indexImageDocument,
  getCompletePipelineIntrospection,
  analyzeDocumentText,
  validatePipelineConfiguration,
  getConfigurationRegistry,
  getPromptLibrary,
  validateWithSchemas,
  querySemanticallyCached,
  getAdaptiveChunkingStrategy,
  buildDocumentRelationshipGraph,
  benchmarkRetrievalStrategies,
  queryWithDecomposition,
  runMetadataExtractionPipeline,
  queryWithReranking,
  submitQueryFeedback,
  getQueryFeedbackAnalytics,
  getCorpusAnalytics,
  getPipelineObservability,
  extractDocumentKeywords,
  summarizeChatHistory,
  listDocuments,
  deleteDocument,
  clearAllDocuments,
  evaluateArbitraryResponse,
  getEvaluationHistory,
  streamLiveSession,
  indexDocumentAdvanced,
  runAgentWorkflow,
  optimizePrompt,
};