import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { documentAnalysisService } from './document_analysis.service.js';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { rateLimiter } from '../../../shared/rateLimiter.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { usageService } from '../usage/usage.service.js';
import { fileProcessor } from './services/fileProcessor.js';
import { textAnalyzer } from './services/textAnalyzer.js';
import {
  ANALYSIS_TYPES,
  OUTPUT_FORMATS,
} from './document_analysis.constant.js';

// Mock dependencies
vi.mock('../../../errors/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
      this.name = 'ApiError';
    }
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/rateLimiter.js', () => ({
  rateLimiter: {
    limitByIp: vi.fn().mockResolvedValue(true),
    limitByUserId: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: {
    addMessageToConversation: vi.fn(),
    createConversation: vi.fn(),
    updateConversationMetadata: vi.fn(),
  },
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
  },
}));

vi.mock('../usage/usage.service.js', () => ({
  usageService: {
    checkUsageLimit: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('./services/fileProcessor.js', () => ({
  fileProcessor: {
    validateFile: vi.fn(),
    processFile: vi.fn(),
  },
}));

vi.mock('./services/textAnalyzer.js', () => ({
  textAnalyzer: {
    analyzeWithContext: vi.fn(),
    analyzeWithGemini: vi.fn(),
  },
}));

vi.mock('mongoose', async () => {
  const actualMongoose = await vi.importActual('mongoose');
  return {
    ...actualMongoose,
    default: {
      ...actualMongoose.default,
      Types: {
        ObjectId: vi.fn().mockImplementation(() => ({
          toString: () => 'mocked_object_id',
        })),
      },
    },
  };
});

describe('Document Analysis Service', () => {
  const mockUserId = 'user123';
  const mockGuestId = 'guest456';
  const mockConversationId = 'conv123';
  const mockReq = { ip: '127.0.0.1' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID using Mongoose ObjectId', () => {
      const guestId = documentAnalysisService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalled();
      expect(guestId).toBe('mocked_object_id');
    });
  });

  describe('generateConversationId', () => {
    it('should generate a unique conversation ID with the correct format', () => {
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1678886400000);
      const mathRandomSpy = vi
        .spyOn(Math, 'random')
        .mockReturnValue(0.123456789);

      const conversationId = documentAnalysisService.generateConversationId();
      expect(conversationId).toBe('analysis_1678886400000_4fzyo82m1');

      dateNowSpy.mockRestore();
      mathRandomSpy.mockRestore();
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve and format conversation history for a valid user and conversation', async () => {
      const mockConversation = {
        conversationId: mockConversationId,
        userId: mockUserId,
        title: 'Test Conversation',
        messages: [{ role: 'user', content: 'Hello' }],
        metadata: { category: 'document_analysis' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(
        mockConversation
      );

      const result = await documentAnalysisService.getConversationHistory(
        mockConversationId,
        mockUserId,
        mockReq
      );

      expect(rateLimiter.limitByUserId).toHaveBeenCalledWith(mockUserId, expect.any(Object));
      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(result).toEqual(mockConversation);
    });

    it('should throw a NOT_FOUND ApiError if the conversation is not found', async () => {
      conversationHelpers.getConversationById.mockResolvedValue(null);

      await expect(
        documentAnalysisService.getConversationHistory(
          mockConversationId,
          mockUserId,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      await expect(
        documentAnalysisService.getConversationHistory(
          mockConversationId,
          mockUserId,
          mockReq
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.NOT_FOUND);
    });

    it('should throw an INTERNAL_SERVER_ERROR ApiError on database failure', async () => {
      const dbError = new Error('Database connection lost');
      conversationHelpers.getConversationById.mockRejectedValue(dbError);

      await expect(
        documentAnalysisService.getConversationHistory(
          mockConversationId,
          mockUserId,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      await expect(
        documentAnalysisService.getConversationHistory(
          mockConversationId,
          mockUserId,
          mockReq
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
    });
  });

  describe('analyzeContent', () => {
    const mockFileInfo = {
      path: '/tmp/test.pdf',
      originalname: 'test.pdf',
      filename: 'unique-test.pdf',
    };
    const mockAnalysisResult = {
      analysis: 'This is a summary.',
      metadata: { tokens: 100 },
    };
    const mockNewConversation = {
      conversationId: 'new_conv_123',
      userId: mockUserId,
      messages: [],
      metadata: {},
    };
    const mockExistingConversation = {
      conversationId: mockConversationId,
      userId: mockUserId,
      messages: [{ role: 'user', content: 'Previous message' }],
      metadata: { uploadedFiles: [] },
    };

    beforeEach(() => {
      // Default happy path mocks
      usageService.checkUsageLimit.mockResolvedValue(true);
      fileProcessor.validateFile.mockReturnValue({ valid: true });
      fileProcessor.processFile.mockResolvedValue('File content.');
      textAnalyzer.analyzeWithGemini.mockResolvedValue(mockAnalysisResult);
      textAnalyzer.analyzeWithContext.mockResolvedValue(mockAnalysisResult);
      conversationService.createConversation.mockResolvedValue(
        mockNewConversation
      );
      conversationHelpers.getConversationById.mockResolvedValue(
        mockExistingConversation
      );
    });

    // Role/Context Boundary Tests
    it('should use rateLimiter.limitByUserId for an authenticated user', async () => {
      await documentAnalysisService.analyzeContent(
        mockUserId,
        'Hello',
        null,
        null,
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.TEXT,
        false, // isGuest = false
        mockReq
      );
      expect(rateLimiter.limitByUserId).toHaveBeenCalledWith(mockUserId, expect.any(Object));
      expect(rateLimiter.limitByIp).not.toHaveBeenCalled();
    });

    it('should use rateLimiter.limitByIp for a guest user', async () => {
      await documentAnalysisService.analyzeContent(
        mockGuestId,
        'Hello',
        null,
        null,
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.TEXT,
        true, // isGuest = true
        mockReq
      );
      expect(rateLimiter.limitByIp).toHaveBeenCalledWith(mockReq, expect.any(Object));
      expect(rateLimiter.limitByUserId).not.toHaveBeenCalled();
    });

    it('should include userId in the response for a guest user', async () => {
      const result = await documentAnalysisService.analyzeContent(
        mockGuestId,
        'Hello',
        null,
        null,
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.TEXT,
        true, // isGuest = true
        mockReq
      );
      expect(result.userId).toBe(mockGuestId);
    });

    it('should NOT include userId in the response for an authenticated user', async () => {
      const result = await documentAnalysisService.analyzeContent(
        mockUserId,
        'Hello',
        null,
        null,
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.TEXT,
        false, // isGuest = false
        mockReq
      );
      expect(result.userId).toBeUndefined();
    });

    // Happy Path Tests
    it('should perform analysis with a file for a new conversation', async () => {
      const result = await documentAnalysisService.analyzeContent(
        mockUserId,
        null,
        mockFileInfo,
        null,
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.JSON
      );

      expect(usageService.checkUsageLimit).toHaveBeenCalledWith(mockUserId, false);
      expect(fileProcessor.validateFile).toHaveBeenCalledWith(mockFileInfo, expect.any(Number));
      expect(fileProcessor.processFile).toHaveBeenCalledWith({
        path: mockFileInfo.path,
        originalName: mockFileInfo.originalname,
        filename: mockFileInfo.filename,
      });
      expect(conversationService.createConversation).toHaveBeenCalled();
      expect(textAnalyzer.analyzeWithGemini).toHaveBeenCalledWith(
        'File content.',
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.JSON,
        null
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(conversationService.updateConversationMetadata).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.conversationId).toBe(mockNewConversation.conversationId);
      expect(result.analysis).toBe(mockAnalysisResult.analysis);
      expect(result.metadata.fileProcessed).toBe(true);
      expect(result.metadata.fileName).toBe(mockFileInfo.originalname);
    });

    it('should perform analysis with a message in an existing conversation with history', async () => {
      const result = await documentAnalysisService.analyzeContent(
        mockUserId,
        'Follow up question',
        null,
        mockConversationId,
        ANALYSIS_TYPES.KEYWORDS,
        OUTPUT_FORMATS.TEXT
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        undefined
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(textAnalyzer.analyzeWithContext).toHaveBeenCalledWith(
        'Follow up question',
        mockExistingConversation.messages,
        ANALYSIS_TYPES.KEYWORDS,
        OUTPUT_FORMATS.TEXT,
        'Follow up question'
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(conversationService.updateConversationMetadata).not.toHaveBeenCalled();
      expect(result.conversationId).toBe(mockExistingConversation.conversationId);
    });

    it('should create a new conversation if the provided conversationId is not found', async () => {
      const notFoundError = new ApiError(httpStatus.NOT_FOUND, 'Not Found');
      conversationHelpers.getConversationById.mockRejectedValue(notFoundError);

      await documentAnalysisService.analyzeContent(
        mockUserId,
        'Hello',
        null,
        'non-existent-id',
        ANALYSIS_TYPES.SUMMARY,
        OUTPUT_FORMATS.TEXT
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'non-existent-id',
        mockUserId,
        undefined
      );
      expect(conversationService.createConversation).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Conversation non-existent-id not found for user user123, creating new one'
      );
    });

    // Error Path Tests
    it('should throw FORBIDDEN ApiError if usage limit is exceeded', async () => {
      usageService.checkUsageLimit.mockResolvedValue(false);

      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          'test',
          null,
          null,
          'summary',
          'text'
        )
      ).rejects.toThrow(ApiError);
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          'test',
          null,
          null,
          'summary',
          'text'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.FORBIDDEN);
    });

    it('should throw BAD_REQUEST ApiError if no content is provided', async () => {
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          null,
          null,
          null,
          'summary',
          'text'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.BAD_REQUEST);
    });

    it('should throw BAD_REQUEST ApiError for invalid analysisType', async () => {
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          'test',
          null,
          null,
          'invalid-type',
          'text'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.BAD_REQUEST);
    });

    it('should throw BAD_REQUEST ApiError for invalid outputFormat', async () => {
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          'test',
          null,
          null,
          'summary',
          'invalid-format'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.BAD_REQUEST);
    });

    it('should throw BAD_REQUEST ApiError if file validation fails', async () => {
      fileProcessor.validateFile.mockReturnValue({
        valid: false,
        error: 'File too large',
      });
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          null,
          mockFileInfo,
          null,
          'summary',
          'text'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.BAD_REQUEST);
    });

    it('should throw INTERNAL_SERVER_ERROR if file processing fails', async () => {
      fileProcessor.processFile.mockRejectedValue(new Error('Extraction failed'));
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          null,
          mockFileInfo,
          null,
          'summary',
          'text'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should re-throw non-404 errors from getConversationById', async () => {
      const dbError = new Error('DB connection error');
      conversationHelpers.getConversationById.mockRejectedValue(dbError);

      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          'test',
          null,
          mockConversationId,
          'summary',
          'text'
        )
      ).rejects.toThrow(dbError);
    });

    it('should throw INTERNAL_SERVER_ERROR if text analysis fails', async () => {
      textAnalyzer.analyzeWithGemini.mockRejectedValue(new Error('AI model error'));
      await expect(
        documentAnalysisService.analyzeContent(
          mockUserId,
          'test',
          null,
          null,
          'summary',
          'text'
        )
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
    });
  });
});