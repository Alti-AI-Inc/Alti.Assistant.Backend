import * as llama from './llamaindex.indexer.js';

const uploadAndIndexDocumentService = async (filePath, originalName, userId) => {
  return await llama.createIndexFromFile(filePath, originalName, userId);
};

const queryDocument = async (query, userId) => {
  return await llama.askQuery(query, userId);
};

const queryDocumentStream = async (query, userId, onChunk) => {
  return await llama.askQueryStream(query, userId, onChunk);
};

// Phase 5: Advanced query with RouterQueryEngine / SubQuestionQueryEngine
const queryDocumentAdvanced = async (query, userId, mode) => {
  return await llama.askAdvancedQuery(query, userId, mode);
};

// Phase 6: ReAct Agent query with tool calling
const queryDocumentAgent = async (query, userId) => {
  return await llama.askAgentQuery(query, userId);
};

// Phase 6: CondenseQuestionChatEngine with ChatSummaryMemoryBuffer
const queryDocumentChatEngine = async (query, userId) => {
  return await llama.askChatEngineQuery(query, userId);
};

// Phase 7: Self-Correcting Query Pipeline
const queryDocumentSelfCorrecting = async (query, userId) => {
  return await llama.askSelfCorrectingQuery(query, userId);
};

// Phase 7: Hybrid Search (Vector + Keyword Fusion via RRF)
const queryDocumentHybrid = async (query, userId) => {
  return await llama.askHybridQuery(query, userId);
};

// Phase 8: Full-Spectrum Retrieval (6 Retriever Types + RRF + MMR)
const queryDocumentFullSpectrum = async (query, userId) => {
  return await llama.askFullSpectrumQuery(query, userId);
};

// Phase 8: ObjectIndex Agent (SimpleToolNodeMapping)
const queryDocumentObjectAgent = async (query, userId) => {
  return await llama.askObjectIndexAgent(query, userId);
};

// Phase 8: Simple Chat (no index required)
const querySimpleChat = async (message, userId) => {
  return await llama.askSimpleChat(message, userId);
};

// Phase 8: Document Comparison
const compareDocuments = async (docId1, docId2, userId) => {
  return await llama.compareDocuments(docId1, docId2, userId);
};

// Phase 8: Export Corpus Snapshot
const exportCorpusSnapshot = async (userId) => {
  return await llama.exportCorpusSnapshot(userId);
};

// Phase 9: Intelligent Query Classifier (auto-routes to best engine)
const classifyAndRoute = async (query, userId) => {
  return await llama.classifyAndRoute(query, userId);
};

// Phase 9: Context-Aware Chat (DefaultContextGenerator)
const queryContextAwareChat = async (message, userId) => {
  return await llama.askContextAwareChat(message, userId);
};

// Phase 9: Index Diagnostics (node introspection)
const getIndexDiagnostics = async (userId) => {
  return await llama.getIndexDiagnostics(userId);
};

// Phase 9: Pipeline Health Check (MockLLM self-test)
const runPipelineHealthCheck = async () => {
  return await llama.runPipelineHealthCheck();
};

// Phase 9: Batch Document Processing
const batchProcessDocuments = async (userId) => {
  return await llama.batchProcessDocuments(userId);
};

// Phase 9: Enhanced Streaming Query
const queryStreamingQuery = async (query, userId) => {
  return await llama.askStreamingQuery(query, userId);
};

// Phase 10: Multi-Modal Image Document Indexing
const indexImageDocument = async (imagePath, originalName, userId) => {
  return await llama.indexImageDocument(imagePath, originalName, userId);
};

// Phase 10: Complete Pipeline Introspection
const getCompletePipelineIntrospection = async (userId) => {
  return await llama.getCompletePipelineIntrospection(userId);
};

// Phase 10: Advanced Text Analysis
const analyzeDocumentText = async (docId, userId) => {
  return await llama.analyzeDocumentText(docId, userId);
};

// Phase 10: Pipeline Configuration Validation
const validatePipelineConfiguration = () => {
  return llama.validatePipelineConfiguration();
};

// Phase 6: Corpus analytics & insights
const getCorpusAnalytics = async (userId) => {
  return await llama.getCorpusAnalytics(userId);
};

// Phase 7: Pipeline observability
const getPipelineObservability = () => {
  return llama.getPipelineObservability();
};

// Phase 7: Document keyword extraction
const extractDocumentKeywords = async (userId) => {
  return await llama.extractDocumentKeywords(userId);
};

// Phase 6: Chat history summarization
const summarizeChatHistory = async (userId) => {
  return await llama.summarizeChatHistory(userId);
};

const listDocuments = async (userId) => {
  return await llama.listDocuments(userId);
};

const deleteDocument = async (userId, docId) => {
  return await llama.deleteDocument(userId, docId);
};

const clearAllDocuments = async (userId) => {
  return await llama.clearAllDocuments(userId);
};

// Phase 11: Configuration Registry
const getConfigurationRegistry = () => {
  return llama.getConfigurationRegistry();
};

// Phase 11: Prompt Library
const getPromptLibrary = () => {
  return llama.getPromptLibrary();
};

// Phase 11: Schema Validation
const validateWithSchemas = (data, schemaName) => {
  return llama.validateWithSchemas(data, schemaName);
};

// Phase 12: Semantic Query Cache
const querySemanticallyCached = async (query, userId) => {
  return await llama.querySemanticallycached(query, userId);
};

// Phase 12: Adaptive Chunking Strategy
const getAdaptiveChunkingStrategy = (fileName) => {
  return llama.getAdaptiveChunkingStrategy(fileName);
};

// Phase 12: Document Relationship Graph
const buildDocumentRelationshipGraph = async (userId) => {
  return await llama.buildDocumentRelationshipGraph(userId);
};

// Phase 12: Retrieval Benchmark
const benchmarkRetrievalStrategies = async (query, userId) => {
  return await llama.benchmarkRetrievalStrategies(query, userId);
};

// Phase 13: Query Decomposition
const queryWithDecomposition = async (query, userId) => {
  return await llama.queryWithDecomposition(query, userId);
};

// Phase 13: Metadata Extraction Pipeline
const runMetadataExtractionPipeline = async (userId) => {
  return await llama.runMetadataExtractionPipeline(userId);
};

// Phase 13: Custom Re-Ranking
const queryWithReranking = async (query, userId, options) => {
  return await llama.queryWithReranking(query, userId, options);
};

// Phase 13: Query Feedback
const submitQueryFeedback = async (userId, feedbackData) => {
  return await llama.submitQueryFeedback(userId, feedbackData);
};

// Phase 13: Feedback Analytics
const getQueryFeedbackAnalytics = async (userId) => {
  return await llama.getQueryFeedbackAnalytics(userId);
};

// Phase 14: Automated Evaluation Pipeline
const evaluateArbitraryResponse = async (query, response, context, userId) => {
  return await llama.evaluateArbitraryResponse(query, response, context, userId);
};

const getEvaluationHistory = async (userId) => {
  return await llama.getEvaluationHistoryFromDisk(userId);
};

// Phase 15: Event-Driven Live Sessions
const streamLiveSession = async (query, userId, onChunk) => {
  return await llama.streamLiveSession(query, userId, onChunk);
};

// Phase 16: Advanced Storage Strategies
const indexDocumentAdvanced = async (filePath, originalName, userId, strategyOption) => {
  return await llama.indexDocumentAdvancedWithStrategy(filePath, originalName, userId, strategyOption);
};

// Phase 17: Multi-Step Agent Workflows
const runAgentWorkflow = async (query, userId) => {
  return await llama.runAgentWorkflowStepByStep(query, userId);
};

// Phase 18: Prompt Optimization API
const optimizePrompt = async (promptText, userId) => {
  return llama.optimizePromptWithHelper(promptText, userId);
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
