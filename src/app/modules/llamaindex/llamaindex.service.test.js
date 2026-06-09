import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ragService } from './llamaindex.service.js';

// Mock the dependency module
vi.mock('./llamaindex.indexer.js', () => ({
  createIndexFromFile: vi.fn(),
  askQuery: vi.fn(),
  askQueryStream: vi.fn(),
  askAdvancedQuery: vi.fn(),
  askAgentQuery: vi.fn(),
  askChatEngineQuery: vi.fn(),
  askSelfCorrectingQuery: vi.fn(),
  askHybridQuery: vi.fn(),
  askFullSpectrumQuery: vi.fn(),
  askObjectIndexAgent: vi.fn(),
  askSimpleChat: vi.fn(),
  compareDocuments: vi.fn(),
  exportCorpusSnapshot: vi.fn(),
  classifyAndRoute: vi.fn(),
  askContextAwareChat: vi.fn(),
  getIndexDiagnostics: vi.fn(),
  runPipelineHealthCheck: vi.fn(),
  batchProcessDocuments: vi.fn(),
  askStreamingQuery: vi.fn(),
  indexImageDocument: vi.fn(),
  getCompletePipelineIntrospection: vi.fn(),
  analyzeDocumentText: vi.fn(),
  validatePipelineConfiguration: vi.fn(),
  getConfigurationRegistry: vi.fn(),
  getPromptLibrary: vi.fn(),
  validateWithSchemas: vi.fn(),
  querySemanticallyCached: vi.fn(),
  getAdaptiveChunkingStrategy: vi.fn(),
  buildDocumentRelationshipGraph: vi.fn(),
  benchmarkRetrievalStrategies: vi.fn(),
  queryWithDecomposition: vi.fn(),
  runMetadataExtractionPipeline: vi.fn(),
  queryWithReranking: vi.fn(),
  submitQueryFeedback: vi.fn(),
  getQueryFeedbackAnalytics: vi.fn(),
  getCorpusAnalytics: vi.fn(),
  getPipelineObservability: vi.fn(),
  extractDocumentKeywords: vi.fn(),
  summarizeChatHistory: vi.fn(),
  listDocuments: vi.fn(),
  deleteDocument: vi.fn(),
  clearAllDocuments: vi.fn(),
  evaluateArbitraryResponse: vi.fn(),
  getEvaluationHistoryFromDisk: vi.fn(),
  streamLiveSession: vi.fn(),
  indexDocumentAdvancedWithStrategy: vi.fn(),
  runAgentWorkflowStepByStep: vi.fn(),
  optimizePromptWithHelper: vi.fn(),
}));

// Import the mocked module to access its functions
import * as llama from './llamaindex.indexer.js';

describe('ragService', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
  });

  describe('uploadAndIndexDocumentService', () => {
    it('should call llama.createIndexFromFile with correct arguments and return its result', async () => {
      const filePath = 'path/to/doc.pdf';
      const originalName = 'doc.pdf';
      const userId = 'user123';
      const mockResult = { success: true, docId: 'doc-abc' };
      llama.createIndexFromFile.mockResolvedValue(mockResult);

      const result = await ragService.uploadAndIndexDocumentService(filePath, originalName, userId);

      expect(llama.createIndexFromFile).toHaveBeenCalledWith(filePath, originalName, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocument', () => {
    it('should call llama.askQuery with correct arguments and return its result', async () => {
      const query = 'What is the capital of France?';
      const userId = 'user123';
      const mockResult = 'Paris is the capital of France.';
      llama.askQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocument(query, userId);

      expect(llama.askQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentStream', () => {
    it('should call llama.askQueryStream with correct arguments and return its result', async () => {
      const query = 'Stream me the answer.';
      const userId = 'user123';
      const onChunk = vi.fn();
      const mockResult = { stream: true };
      llama.askQueryStream.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentStream(query, userId, onChunk);

      expect(llama.askQueryStream).toHaveBeenCalledWith(query, userId, onChunk);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentAdvanced', () => {
    it('should call llama.askAdvancedQuery with correct arguments and return its result', async () => {
      const query = 'Advanced query.';
      const userId = 'user123';
      const mode = 'router';
      const mockResult = 'Advanced response.';
      llama.askAdvancedQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentAdvanced(query, userId, mode);

      expect(llama.askAdvancedQuery).toHaveBeenCalledWith(query, userId, mode);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentAgent', () => {
    it('should call llama.askAgentQuery with correct arguments and return its result', async () => {
      const query = 'Agent query.';
      const userId = 'user123';
      const mockResult = 'Agent response.';
      llama.askAgentQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentAgent(query, userId);

      expect(llama.askAgentQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentChatEngine', () => {
    it('should call llama.askChatEngineQuery with correct arguments and return its result', async () => {
      const query = 'Chat engine query.';
      const userId = 'user123';
      const mockResult = 'Chat engine response.';
      llama.askChatEngineQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentChatEngine(query, userId);

      expect(llama.askChatEngineQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentSelfCorrecting', () => {
    it('should call llama.askSelfCorrectingQuery with correct arguments and return its result', async () => {
      const query = 'Self-correcting query.';
      const userId = 'user123';
      const mockResult = 'Self-corrected response.';
      llama.askSelfCorrectingQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentSelfCorrecting(query, userId);

      expect(llama.askSelfCorrectingQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentHybrid', () => {
    it('should call llama.askHybridQuery with correct arguments and return its result', async () => {
      const query = 'Hybrid query.';
      const userId = 'user123';
      const mockResult = 'Hybrid response.';
      llama.askHybridQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentHybrid(query, userId);

      expect(llama.askHybridQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentFullSpectrum', () => {
    it('should call llama.askFullSpectrumQuery with correct arguments and return its result', async () => {
      const query = 'Full spectrum query.';
      const userId = 'user123';
      const mockResult = 'Full spectrum response.';
      llama.askFullSpectrumQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentFullSpectrum(query, userId);

      expect(llama.askFullSpectrumQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryDocumentObjectAgent', () => {
    it('should call llama.askObjectIndexAgent with correct arguments and return its result', async () => {
      const query = 'Object agent query.';
      const userId = 'user123';
      const mockResult = 'Object agent response.';
      llama.askObjectIndexAgent.mockResolvedValue(mockResult);

      const result = await ragService.queryDocumentObjectAgent(query, userId);

      expect(llama.askObjectIndexAgent).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('querySimpleChat', () => {
    it('should call llama.askSimpleChat with correct arguments and return its result', async () => {
      const message = 'Hello there.';
      const userId = 'user123';
      const mockResult = 'General Kenobi!';
      llama.askSimpleChat.mockResolvedValue(mockResult);

      const result = await ragService.querySimpleChat(message, userId);

      expect(llama.askSimpleChat).toHaveBeenCalledWith(message, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('compareDocuments', () => {
    it('should call llama.compareDocuments with correct arguments and return its result', async () => {
      const docId1 = 'doc-1';
      const docId2 = 'doc-2';
      const userId = 'user123';
      const mockResult = { comparison: 'Documents are similar.' };
      llama.compareDocuments.mockResolvedValue(mockResult);

      const result = await ragService.compareDocuments(docId1, docId2, userId);

      expect(llama.compareDocuments).toHaveBeenCalledWith(docId1, docId2, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('exportCorpusSnapshot', () => {
    it('should call llama.exportCorpusSnapshot with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { snapshotPath: '/tmp/snapshot.zip' };
      llama.exportCorpusSnapshot.mockResolvedValue(mockResult);

      const result = await ragService.exportCorpusSnapshot(userId);

      expect(llama.exportCorpusSnapshot).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('classifyAndRoute', () => {
    it('should call llama.classifyAndRoute with correct arguments and return its result', async () => {
      const query = 'Classify this query.';
      const userId = 'user123';
      const mockResult = { route: 'queryDocument' };
      llama.classifyAndRoute.mockResolvedValue(mockResult);

      const result = await ragService.classifyAndRoute(query, userId);

      expect(llama.classifyAndRoute).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryContextAwareChat', () => {
    it('should call llama.askContextAwareChat with correct arguments and return its result', async () => {
      const message = 'Contextual message.';
      const userId = 'user123';
      const mockResult = 'Contextual response.';
      llama.askContextAwareChat.mockResolvedValue(mockResult);

      const result = await ragService.queryContextAwareChat(message, userId);

      expect(llama.askContextAwareChat).toHaveBeenCalledWith(message, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getIndexDiagnostics', () => {
    it('should call llama.getIndexDiagnostics with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { health: 'good', nodes: 100 };
      llama.getIndexDiagnostics.mockResolvedValue(mockResult);

      const result = await ragService.getIndexDiagnostics(userId);

      expect(llama.getIndexDiagnostics).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('runPipelineHealthCheck', () => {
    it('should call llama.runPipelineHealthCheck and return its result', async () => {
      const mockResult = { status: 'healthy' };
      llama.runPipelineHealthCheck.mockResolvedValue(mockResult);

      const result = await ragService.runPipelineHealthCheck();

      expect(llama.runPipelineHealthCheck).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });
  });

  describe('batchProcessDocuments', () => {
    it('should call llama.batchProcessDocuments with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { processedCount: 5 };
      llama.batchProcessDocuments.mockResolvedValue(mockResult);

      const result = await ragService.batchProcessDocuments(userId);

      expect(llama.batchProcessDocuments).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryStreamingQuery', () => {
    it('should call llama.askStreamingQuery with correct arguments and return its result', async () => {
      const query = 'Streaming query.';
      const userId = 'user123';
      const mockResult = { streamId: 'stream-123' };
      llama.askStreamingQuery.mockResolvedValue(mockResult);

      const result = await ragService.queryStreamingQuery(query, userId);

      expect(llama.askStreamingQuery).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('indexImageDocument', () => {
    it('should call llama.indexImageDocument with correct arguments and return its result', async () => {
      const imagePath = 'path/to/image.png';
      const originalName = 'image.png';
      const userId = 'user123';
      const mockResult = { success: true, docId: 'img-abc' };
      llama.indexImageDocument.mockResolvedValue(mockResult);

      const result = await ragService.indexImageDocument(imagePath, originalName, userId);

      expect(llama.indexImageDocument).toHaveBeenCalledWith(imagePath, originalName, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getCompletePipelineIntrospection', () => {
    it('should call llama.getCompletePipelineIntrospection with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { pipeline: 'details' };
      llama.getCompletePipelineIntrospection.mockResolvedValue(mockResult);

      const result = await ragService.getCompletePipelineIntrospection(userId);

      expect(llama.getCompletePipelineIntrospection).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('analyzeDocumentText', () => {
    it('should call llama.analyzeDocumentText with correct arguments and return its result', async () => {
      const docId = 'doc-abc';
      const userId = 'user123';
      const mockResult = { analysis: 'positive' };
      llama.analyzeDocumentText.mockResolvedValue(mockResult);

      const result = await ragService.analyzeDocumentText(docId, userId);

      expect(llama.analyzeDocumentText).toHaveBeenCalledWith(docId, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('validatePipelineConfiguration', () => {
    it('should call llama.validatePipelineConfiguration and return its result', () => {
      const mockResult = { valid: true };
      llama.validatePipelineConfiguration.mockReturnValue(mockResult);

      const result = ragService.validatePipelineConfiguration();

      expect(llama.validatePipelineConfiguration).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });
  });

  describe('getConfigurationRegistry', () => {
    it('should call llama.getConfigurationRegistry and return its result', () => {
      const mockResult = { configs: ['config1', 'config2'] };
      llama.getConfigurationRegistry.mockReturnValue(mockResult);

      const result = ragService.getConfigurationRegistry();

      expect(llama.getConfigurationRegistry).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });
  });

  describe('getPromptLibrary', () => {
    it('should call llama.getPromptLibrary and return its result', () => {
      const mockResult = { prompts: ['prompt1', 'prompt2'] };
      llama.getPromptLibrary.mockReturnValue(mockResult);

      const result = ragService.getPromptLibrary();

      expect(llama.getPromptLibrary).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });
  });

  describe('validateWithSchemas', () => {
    it('should call llama.validateWithSchemas with correct arguments and return its result', () => {
      const data = { name: 'test' };
      const schemaName = 'userSchema';
      const mockResult = { isValid: true };
      llama.validateWithSchemas.mockReturnValue(mockResult);

      const result = ragService.validateWithSchemas(data, schemaName);

      expect(llama.validateWithSchemas).toHaveBeenCalledWith(data, schemaName);
      expect(result).toEqual(mockResult);
    });
  });

  describe('querySemanticallyCached', () => {
    it('should call llama.querySemanticallyCached with correct arguments and return its result', async () => {
      const query = 'Cached query.';
      const userId = 'user123';
      const mockResult = 'Cached response.';
      llama.querySemanticallyCached.mockResolvedValue(mockResult);

      const result = await ragService.querySemanticallyCached(query, userId);

      expect(llama.querySemanticallyCached).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getAdaptiveChunkingStrategy', () => {
    it('should call llama.getAdaptiveChunkingStrategy with correct arguments and return its result', () => {
      const fileName = 'document.txt';
      const mockResult = { strategy: 'adaptive' };
      llama.getAdaptiveChunkingStrategy.mockReturnValue(mockResult);

      const result = ragService.getAdaptiveChunkingStrategy(fileName);

      expect(llama.getAdaptiveChunkingStrategy).toHaveBeenCalledWith(fileName);
      expect(result).toEqual(mockResult);
    });
  });

  describe('buildDocumentRelationshipGraph', () => {
    it('should call llama.buildDocumentRelationshipGraph with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { graph: {} };
      llama.buildDocumentRelationshipGraph.mockResolvedValue(mockResult);

      const result = await ragService.buildDocumentRelationshipGraph(userId);

      expect(llama.buildDocumentRelationshipGraph).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('benchmarkRetrievalStrategies', () => {
    it('should call llama.benchmarkRetrievalStrategies with correct arguments and return its result', async () => {
      const query = 'Benchmark query.';
      const userId = 'user123';
      const mockResult = { scores: { rrf: 0.8 } };
      llama.benchmarkRetrievalStrategies.mockResolvedValue(mockResult);

      const result = await ragService.benchmarkRetrievalStrategies(query, userId);

      expect(llama.benchmarkRetrievalStrategies).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryWithDecomposition', () => {
    it('should call llama.queryWithDecomposition with correct arguments and return its result', async () => {
      const query = 'Decompose this.';
      const userId = 'user123';
      const mockResult = 'Decomposed response.';
      llama.queryWithDecomposition.mockResolvedValue(mockResult);

      const result = await ragService.queryWithDecomposition(query, userId);

      expect(llama.queryWithDecomposition).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('runMetadataExtractionPipeline', () => {
    it('should call llama.runMetadataExtractionPipeline with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { extracted: 5 };
      llama.runMetadataExtractionPipeline.mockResolvedValue(mockResult);

      const result = await ragService.runMetadataExtractionPipeline(userId);

      expect(llama.runMetadataExtractionPipeline).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('queryWithReranking', () => {
    it('should call llama.queryWithReranking with correct arguments and return its result', async () => {
      const query = 'Rerank this.';
      const userId = 'user123';
      const options = { topK: 3 };
      const mockResult = 'Reranked response.';
      llama.queryWithReranking.mockResolvedValue(mockResult);

      const result = await ragService.queryWithReranking(query, userId, options);

      expect(llama.queryWithReranking).toHaveBeenCalledWith(query, userId, options);
      expect(result).toEqual(mockResult);
    });
  });

  describe('submitQueryFeedback', () => {
    it('should call llama.submitQueryFeedback with correct arguments and return its result', async () => {
      const userId = 'user123';
      const feedbackData = { query: 'test', rating: 5 };
      const mockResult = { success: true };
      llama.submitQueryFeedback.mockResolvedValue(mockResult);

      const result = await ragService.submitQueryFeedback(userId, feedbackData);

      expect(llama.submitQueryFeedback).toHaveBeenCalledWith(userId, feedbackData);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getQueryFeedbackAnalytics', () => {
    it('should call llama.getQueryFeedbackAnalytics with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { analytics: { positive: 10 } };
      llama.getQueryFeedbackAnalytics.mockResolvedValue(mockResult);

      const result = await ragService.getQueryFeedbackAnalytics(userId);

      expect(llama.getQueryFeedbackAnalytics).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getCorpusAnalytics', () => {
    it('should call llama.getCorpusAnalytics with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { analytics: { docs: 10 } };
      llama.getCorpusAnalytics.mockResolvedValue(mockResult);

      const result = await ragService.getCorpusAnalytics(userId);

      expect(llama.getCorpusAnalytics).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getPipelineObservability', () => {
    it('should call llama.getPipelineObservability and return its result', () => {
      const mockResult = { metrics: { latency: '10ms' } };
      llama.getPipelineObservability.mockReturnValue(mockResult);

      const result = ragService.getPipelineObservability();

      expect(llama.getPipelineObservability).toHaveBeenCalledWith();
      expect(result).toEqual(mockResult);
    });
  });

  describe('extractDocumentKeywords', () => {
    it('should call llama.extractDocumentKeywords with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { keywords: ['llama', 'index'] };
      llama.extractDocumentKeywords.mockResolvedValue(mockResult);

      const result = await ragService.extractDocumentKeywords(userId);

      expect(llama.extractDocumentKeywords).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('summarizeChatHistory', () => {
    it('should call llama.summarizeChatHistory with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = 'Summary of chat history.';
      llama.summarizeChatHistory.mockResolvedValue(mockResult);

      const result = await ragService.summarizeChatHistory(userId);

      expect(llama.summarizeChatHistory).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('listDocuments', () => {
    it('should call llama.listDocuments with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = [{ id: 'doc1' }];
      llama.listDocuments.mockResolvedValue(mockResult);

      const result = await ragService.listDocuments(userId);

      expect(llama.listDocuments).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('deleteDocument', () => {
    it('should call llama.deleteDocument with correct arguments and return its result', async () => {
      const userId = 'user123';
      const docId = 'doc1';
      const mockResult = { success: true };
      llama.deleteDocument.mockResolvedValue(mockResult);

      const result = await ragService.deleteDocument(userId, docId);

      expect(llama.deleteDocument).toHaveBeenCalledWith(userId, docId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('clearAllDocuments', () => {
    it('should call llama.clearAllDocuments with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = { success: true, clearedCount: 5 };
      llama.clearAllDocuments.mockResolvedValue(mockResult);

      const result = await ragService.clearAllDocuments(userId);

      expect(llama.clearAllDocuments).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('evaluateArbitraryResponse', () => {
    it('should call llama.evaluateArbitraryResponse with correct arguments and return its result', async () => {
      const query = 'test query';
      const response = 'test response';
      const context = 'test context';
      const userId = 'user123';
      const mockResult = { score: 0.9 };
      llama.evaluateArbitraryResponse.mockResolvedValue(mockResult);

      const result = await ragService.evaluateArbitraryResponse(query, response, context, userId);

      expect(llama.evaluateArbitraryResponse).toHaveBeenCalledWith(query, response, context, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getEvaluationHistory', () => {
    it('should call llama.getEvaluationHistoryFromDisk with correct arguments and return its result', async () => {
      const userId = 'user123';
      const mockResult = [{ id: 'eval1', score: 0.8 }];
      llama.getEvaluationHistoryFromDisk.mockResolvedValue(mockResult);

      const result = await ragService.getEvaluationHistory(userId);

      expect(llama.getEvaluationHistoryFromDisk).toHaveBeenCalledWith(userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('streamLiveSession', () => {
    it('should call llama.streamLiveSession with correct arguments and return its result', async () => {
      const query = 'live session query';
      const userId = 'user123';
      const onChunk = vi.fn();
      const mockResult = { sessionId: 'session-123' };
      llama.streamLiveSession.mockResolvedValue(mockResult);

      const result = await ragService.streamLiveSession(query, userId, onChunk);

      expect(llama.streamLiveSession).toHaveBeenCalledWith(query, userId, onChunk);
      expect(result).toEqual(mockResult);
    });
  });

  describe('indexDocumentAdvanced', () => {
    it('should call llama.indexDocumentAdvancedWithStrategy with correct arguments and return its result', async () => {
      const filePath = 'path/to/doc.pdf';
      const originalName = 'doc.pdf';
      const userId = 'user123';
      const strategyOption = 'hybrid';
      const mockResult = { success: true, docId: 'doc-advanced' };
      llama.indexDocumentAdvancedWithStrategy.mockResolvedValue(mockResult);

      const result = await ragService.indexDocumentAdvanced(filePath, originalName, userId, strategyOption);

      expect(llama.indexDocumentAdvancedWithStrategy).toHaveBeenCalledWith(filePath, originalName, userId, strategyOption);
      expect(result).toEqual(mockResult);
    });
  });

  describe('runAgentWorkflow', () => {
    it('should call llama.runAgentWorkflowStepByStep with correct arguments and return its result', async () => {
      const query = 'run workflow';
      const userId = 'user123';
      const mockResult = { workflowResult: 'completed' };
      llama.runAgentWorkflowStepByStep.mockResolvedValue(mockResult);

      const result = await ragService.runAgentWorkflow(query, userId);

      expect(llama.runAgentWorkflowStepByStep).toHaveBeenCalledWith(query, userId);
      expect(result).toEqual(mockResult);
    });
  });

  describe('optimizePrompt', () => {
    it('should call llama.optimizePromptWithHelper with correct arguments and return its result', async () => {
      const promptText = 'initial prompt';
      const userId = 'user123';
      const mockResult = 'optimized prompt';
      llama.optimizePromptWithHelper.mockResolvedValue(mockResult); // Assuming it's async based on other functions

      const result = await ragService.optimizePrompt(promptText, userId);

      expect(llama.optimizePromptWithHelper).toHaveBeenCalledWith(promptText, userId);
      expect(result).toEqual(mockResult);
    });
  });
});