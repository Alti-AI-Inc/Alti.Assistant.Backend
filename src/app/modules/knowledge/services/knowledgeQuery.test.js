import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';

// Mock external dependencies
vi.mock('../../auth/auth.service.js', () => ({
  authorizeKnowledgeAccess: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../usage/usage.service.js', () => ({
  usageService: {
    checkQueryLimits: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(),
  })),
}));

vi.mock('rag-system-pgvector', () => ({
  RAGSystem: vi.fn(() => ({
    initialize: vi.fn(),
    query: vi.fn(),
    search: vi.fn(),
    llm: null, // Will be set dynamically by the module under test
  })),
}));

vi.mock('../../../../shared/hybridSearch.js', () => ({
  enableHybridSearch: vi.fn(),
}));

vi.mock('../../../../shared/embeddings.js', () => ({
  SafeGoogleGenerativeAIEmbeddings: vi.fn(() => ({})),
}));

vi.mock('@langchain/google-genai', () => ({
  ChatGoogleGenerativeAI: vi.fn((options) => ({
    // Mock a simple object for LLM instances
    model: options.model,
    temperature: options.temperature,
  })),
}));

vi.mock('../knowledge.constant.js', () => ({
  KNOWLEDGE_CONFIG: {
    MODEL: 'gemini-3.5-flash',
    COMPLEX_MODEL: 'gemini-1.5-pro',
    TEMPERATURE: 0.7,
    COMPLEXITY_THRESHOLD: 0.5,
  },
  RAG_DATABASE_CONFIG: {
    HOST: 'localhost',
    PORT: 5432,
    DATABASE: 'testdb',
    USERNAME: 'testuser',
    PASSWORD: 'testpassword',
  },
  OWNER_TYPES: {
    USER: 'user',
    ORGANIZATION: 'organization',
  },
  QUERY_MODES: {
    CONVERSATIONAL: 'conversational',
    SEMANTIC_SEARCH: 'semantic_search',
    KNOWLEDGE_QUERY: 'knowledge_query',
  },
  COMPLEXITY_INDICATORS: {
    HIGH_COMPLEXITY_KEYWORDS: ['analyze', 'compare', 'explain in detail', 'implications', 'evaluate', 'complex calculation'],
    MEDIUM_COMPLEXITY_KEYWORDS: ['how to', 'what is', 'tell me about', 'steps', 'process', 'list'],
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-gemini-key',
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../../errors/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../../conversations/conversation.service.js', () => ({
  conversationService: {
    createConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
  },
}));

vi.mock('../../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
    getConversationMessages: vi.fn(),
  },
}));

vi.mock('../knowledge.model.js', () => ({
  default: {
    find: vi.fn(),
  },
}));

// Import the module under test AFTER all mocks are set up
const { knowledgeQueryService } = await import('./knowledgeQuery.js');

// Get references to the mocked classes/instances for manipulation
const { RAGSystem } = await import('rag-system-pgvector');
const { ChatGoogleGenerativeAI } = await import('@langchain/google-genai');
const { KNOWLEDGE_CONFIG, OWNER_TYPES } = await import('../knowledge.constant.js');
const { logger } = await import('../../../../shared/logger.js');
const { conversationService } = await import('../../conversations/conversation.service.js');
const { conversationHelpers } = await import('../../conversations/conversation.helpers.js');
const KnowledgeFile = (await import('../knowledge.model.js')).default;

describe('knowledgeQueryService', () => {
  let ragInstance;
  let geminiLLMInstance;
  let claudeLLMInstance;

  const longSourceContent =
    'This is a very long source content that should be truncated when stored in the message metadata. It contains a lot of information that might exceed the 200 character limit for the content field in the metadata. This part should be cut off to ensure the metadata is not too large.';

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-instantiate ChatGoogleGenerativeAI to get fresh mock instances
    geminiLLMInstance = new ChatGoogleGenerativeAI({
      apiKey: 'test-gemini-key',
      model: KNOWLEDGE_CONFIG.MODEL,
      temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
    });
    claudeLLMInstance = new ChatGoogleGenerativeAI({
      apiKey: 'test-gemini-key',
      model: KNOWLEDGE_CONFIG.COMPLEX_MODEL,
      temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
    });

    // Get the RAGSystem instance created by the module.
    // This assumes RAGSystem is instantiated once at module load.
    // If it's not yet instantiated, calling `new RAGSystem()` here would create a new mock instance,
    // which might not be the one used by the module under test.
    // A more robust way would be to ensure the module under test is imported *after* all mocks,
    // and then access the mock instance via `RAGSystem.mock.results[0].value`.
    // The current setup with `await import('./knowledgeQuery.js');` should ensure this.
    ragInstance = RAGSystem.mock.results[0]?.value;
    if (!ragInstance) {
      throw new Error("RAGSystem instance not found. Ensure module is imported after mocks.");
    }

    // Mock specific methods for the instances
    ragInstance.initialize.mockResolvedValue(undefined);
    ragInstance.query.mockResolvedValue({
      answer: 'Mocked RAG answer',
      sources: [{ documentId: 'doc1', content: longSourceContent, score: 0.9 }],
    });
    ragInstance.search.mockResolvedValue([
      { documentId: 'doc1', content: 'search result content', score: 0.8 },
    ]);

    conversationService.createConversation.mockResolvedValue({
      conversationId: 'new-conv-id',
      userId: 'user123',
      title: 'Knowledge Query: test message...',
      metadata: { category: 'knowledge' },
      messages: [],
    });
    conversationService.addMessageToConversation.mockResolvedValue({
      conversationId: 'conv-id-123',
      messages: [{ role: 'user', content: 'test message' }],
    });
    conversationHelpers.getConversationById.mockResolvedValue({
      conversationId: 'conv-id-123',
      userId: 'user123',
      title: 'Existing conversation',
      metadata: { category: 'knowledge' },
      messages: [],
    });
    conversationHelpers.getConversationMessages.mockResolvedValue([]);

    KnowledgeFile.find.mockResolvedValue([
      {
        _id: 'file1',
        documentId: 'doc1',
        originalName: 'file1.pdf',
        fileType: 'pdf',
        ownerType: OWNER_TYPES.USER,
        ownerId: 'owner123',
        isProcessed: true,
        isActive: true,
      },
    ]);
  });

  afterEach(() => {
    // Reset RAGSystem's llm property to its initial state after each test
    // The module under test sets `rag.llm` dynamically. We need to ensure it's reset.
    // The initial `rag.llm` is `geminiLLM` (KNOWLEDGE_CONFIG.MODEL).
    if (ragInstance) {
      ragInstance.llm = geminiLLMInstance;
    }
  });

  describe('queryKnowledge', () => {
    const userId = 'user123';
    const ownerType = OWNER_TYPES.USER;
    const ownerId = 'owner123';
    const query = 'What is the capital of France?';

    it('should successfully query knowledge and return an answer with sources', async () => {
      const result = await knowledgeQueryService.queryKnowledge(
        userId,
        query,
        ownerType,
        ownerId
      );

      expect(KnowledgeFile.find).toHaveBeenCalledWith({
        ownerType,
        ownerId,
        isProcessed: true,
        isActive: true,
      });
      expect(ragInstance.initialize).toHaveBeenCalled();
      expect(ragInstance.query).toHaveBeenCalledWith(query, {
        filter: { ownerType, ownerId },
        topK: 5,
      });
      expect(result).toEqual({
        success: true,
        answer: 'Mocked RAG answer',
        sources: [{ documentId: 'doc1', content: longSourceContent, score: 0.9 }],
        relevantFiles: 1,
        query,
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Knowledge] Querying knowledge'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Knowledge] RAG query complete'));
    });

    it('should return a message if no processed files are found', async () => {
      KnowledgeFile.find.mockResolvedValueOnce([]);

      const result = await knowledgeQueryService.queryKnowledge(
        userId,
        query,
        ownerType,
        ownerId
      );

      expect(KnowledgeFile.find).toHaveBeenCalledWith({
        ownerType,
        ownerId,
        isProcessed: true,
        isActive: true,
      });
      expect(ragInstance.initialize).not.toHaveBeenCalled();
      expect(ragInstance.query).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'No processed files found. Please upload and process files first.',
        answer: "I don't have any documents to search through yet. Please upload some files first.",
        sources: [],
      });
    });

    it('should handle errors during the query process', async () => {
      const errorMessage = 'Database connection failed';
      ragInstance.initialize.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        knowledgeQueryService.queryKnowledge(userId, query, ownerType, ownerId)
      ).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Error querying knowledge:',
        expect.any(Error)
      );
    });

    it('should use custom topK option if provided', async () => {
      const customTopK = 10;
      await knowledgeQueryService.queryKnowledge(userId, query, ownerType, ownerId, {
        topK: customTopK,
      });
      expect(ragInstance.query).toHaveBeenCalledWith(query, {
        filter: { ownerType, ownerId },
        topK: customTopK,
      });
    });
  });

  describe('conversationalQuery', () => {
    const userId = 'user123';
    const ownerType = OWNER_TYPES.USER;
    const ownerId = 'owner123';
    const message = 'Tell me about the project timeline.';
    const existingConversationId = 'conv-id-123';

    it('should create a new conversation if no conversationId is provided', async () => {
      conversationHelpers.getConversationById.mockRejectedValueOnce(new Error('Not found')); // Simulate no existing conversation

      const result = await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        message
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: expect.stringContaining('Knowledge Query:'),
          metadata: {
            category: 'knowledge',
            model: KNOWLEDGE_CONFIG.MODEL,
            ownerType,
            ownerId,
            fileIds: [],
          },
        }),
        expect.stringMatching(/^knowledge_\d+_[a-z0-9]+$/)
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2); // User and assistant messages
      expect(result.conversationId).toBe('new-conv-id');
      expect(result.success).toBe(true);
      expect(result.modelUsed).toBe(KNOWLEDGE_CONFIG.MODEL); // Default model for simple query
      expect(result.complexity.isComplex).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Knowledge] Created new conversation'));
    });

    it('should use an existing conversation if conversationId is provided', async () => {
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);

      const result = await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        message,
        existingConversationId
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        existingConversationId,
        userId
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(result.conversationId).toBe(existingConversationId);
      expect(result.success).toBe(true);
      expect(result.modelUsed).toBe(KNOWLEDGE_CONFIG.MODEL);
      expect(result.complexity.isComplex).toBe(false);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Knowledge] Fetched conversation'));
    });

    it('should use the complex model for complex queries', async () => {
      const complexMessage =
        'Can you analyze the financial implications of the Q3 report and compare it with the previous quarter, providing a detailed explanation of the variances? This requires complex calculation.';
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);

      const result = await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        complexMessage,
        existingConversationId
      );

      expect(result.modelUsed).toBe(KNOWLEDGE_CONFIG.COMPLEX_MODEL);
      expect(result.complexity.isComplex).toBe(true);
      expect(ragInstance.llm).toEqual(claudeLLMInstance); // Check if RAG's LLM was updated
      expect(ragInstance.initialize).toHaveBeenCalled();
      expect(ragInstance.query).toHaveBeenCalledWith(
        expect.stringContaining(complexMessage),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Model Selection - Complexity: HIGH'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using Model: ${KNOWLEDGE_CONFIG.COMPLEX_MODEL}`));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing RAG with Gemini 1.5 Pro'));
    });

    it('should use the default model for simple queries', async () => {
      const simpleMessage = 'What is the current status?';
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);

      const result = await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        simpleMessage,
        existingConversationId
      );

      expect(result.modelUsed).toBe(KNOWLEDGE_CONFIG.MODEL);
      expect(result.complexity.isComplex).toBe(false);
      expect(ragInstance.llm).toEqual(geminiLLMInstance); // Check if RAG's LLM was updated
      expect(ragInstance.initialize).toHaveBeenCalled();
      expect(ragInstance.query).toHaveBeenCalledWith(
        expect.stringContaining(simpleMessage),
        expect.any(Object)
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Model Selection - Complexity: LOW'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Using Model: ${KNOWLEDGE_CONFIG.MODEL}`));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Initializing RAG with Gemini 3.5 Flash'));
    });

    it('should return a specific message if no processed files are found', async () => {
      KnowledgeFile.find.mockResolvedValueOnce([]);
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);

      const result = await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        message,
        existingConversationId
      );

      expect(result.success).toBe(true);
      expect(result.answer).toBe(
        "I don't have any documents to search through yet. Please upload and process some files first, then I can help answer questions about them."
      );
      expect(result.sources).toEqual([]);
      expect(result.hasProcessedFiles).toBe(false);
      expect(ragInstance.query).not.toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        existingConversationId,
        userId,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining("I don't have any documents"),
          metadata: expect.objectContaining({ sources: [], modelUsed: KNOWLEDGE_CONFIG.MODEL }),
        })
      );
    });

    it('should format conversation history correctly for RAG query', async () => {
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);
      conversationHelpers.getConversationMessages.mockResolvedValueOnce([
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ]);

      await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        message,
        existingConversationId
      );

      expect(ragInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('Previous conversation:\nUSER: Hello\n\nASSISTANT: Hi there!\n\nCurrent question: Tell me about the project timeline.'),
        expect.any(Object)
      );
    });

    it('should handle errors during the conversational query process', async () => {
      const errorMessage = 'Conversation service error';
      conversationService.createConversation.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        knowledgeQueryService.conversationalQuery(userId, ownerType, ownerId, message)
      ).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Error in conversational query:',
        expect.any(Error)
      );
    });

    it('should pass custom topK option to RAG query', async () => {
      const customTopK = 8;
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);

      await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        message,
        existingConversationId,
        { topK: customTopK }
      );

      expect(ragInstance.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ topK: customTopK })
      );
    });

    it('should store truncated source content in assistant message metadata', async () => {
      const existingConv = {
        conversationId: existingConversationId,
        userId,
        title: 'Existing conversation',
        metadata: { category: 'knowledge' },
        messages: [],
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce(existingConv);

      await knowledgeQueryService.conversationalQuery(
        userId,
        ownerType,
        ownerId,
        message,
        existingConversationId
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          role: 'assistant',
          content: 'Mocked RAG answer',
          metadata: {
            sources: [
              {
                documentId: 'doc1',
                content: longSourceContent.substring(0, 200), // Expect truncated content
                score: 0.9,
              },
            ],
            modelUsed: KNOWLEDGE_CONFIG.MODEL,
            complexityScore: expect.any(Number),
          },
        })
      );
    });
  });

  describe('semanticSearch', () => {
    const userId = 'user123';
    const ownerType = OWNER_TYPES.USER;
    const ownerId = 'owner123';
    const query = 'search for project documents';

    it('should successfully perform a semantic search and return results', async () => {
      const result = await knowledgeQueryService.semanticSearch(
        userId,
        query,
        ownerType,
        ownerId
      );

      expect(KnowledgeFile.find).toHaveBeenCalledWith({
        ownerType,
        ownerId,
        isProcessed: true,
        isActive: true,
      });
      expect(ragInstance.initialize).toHaveBeenCalled();
      expect(ragInstance.search).toHaveBeenCalledWith(query, {
        filter: { ownerType, ownerId },
        topK: 10,
      });
      expect(result).toEqual({
        success: true,
        results: [
          {
            documentId: 'doc1',
            content: 'search result content',
            score: 0.8,
            fileName: 'file1.pdf',
            fileType: 'pdf',
            fileId: 'file1',
          },
        ],
        totalResults: 1,
        query,
      });
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[Knowledge] Semantic search'));
    });

    it('should return a message if no processed files are found', async () => {
      KnowledgeFile.find.mockResolvedValueOnce([]);

      const result = await knowledgeQueryService.semanticSearch(
        userId,
        query,
        ownerType,
        ownerId
      );

      expect(KnowledgeFile.find).toHaveBeenCalledWith({
        ownerType,
        ownerId,
        isProcessed: true,
        isActive: true,
      });
      expect(ragInstance.initialize).not.toHaveBeenCalled();
      expect(ragInstance.search).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        message: 'No processed files found',
        results: [],
      });
    });

    it('should handle errors during the semantic search process', async () => {
      const errorMessage = 'Search service unavailable';
      ragInstance.initialize.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        knowledgeQueryService.semanticSearch(userId, query, ownerType, ownerId)
      ).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Error in semantic search:',
        expect.any(Error)
      );
    });

    it('should use custom limit option if provided', async () => {
      const customLimit = 5;
      await knowledgeQueryService.semanticSearch(userId, query, ownerType, ownerId, {
        limit: customLimit,
      });
      expect(ragInstance.search).toHaveBeenCalledWith(query, {
        filter: { ownerType, ownerId },
        topK: customLimit,
      });
    });
  });

  describe('getConversationHistory', () => {
    const conversationId = 'conv-id-123';
    const userId = 'user123';

    it('should successfully retrieve conversation and messages', async () => {
      const mockConversation = {
        conversationId,
        userId,
        title: 'Test Conversation',
        metadata: {},
      };
      const mockMessages = [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello!' },
      ];

      conversationHelpers.getConversationById.mockResolvedValueOnce(mockConversation);
      conversationHelpers.getConversationMessages.mockResolvedValueOnce(mockMessages);

      const result = await knowledgeQueryService.getConversationHistory(
        conversationId,
        userId
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        conversationId,
        userId
      );
      expect(conversationHelpers.getConversationMessages).toHaveBeenCalledWith(
        conversationId,
        userId
      );
      expect(result).toEqual({
        conversation: mockConversation,
        messages: mockMessages,
      });
    });

    it('should handle errors during history retrieval', async () => {
      const errorMessage = 'Conversation not found';
      conversationHelpers.getConversationById.mockRejectedValueOnce(new Error(errorMessage));

      await expect(
        knowledgeQueryService.getConversationHistory(conversationId, userId)
      ).rejects.toThrow(errorMessage);
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Error getting conversation history:',
        expect.any(Error)
      );
    });
  });
});