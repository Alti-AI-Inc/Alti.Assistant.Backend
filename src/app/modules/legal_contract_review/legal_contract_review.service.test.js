import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { legalContractAnalyzer } from './services/legalContractAnalyzer.js';
import { fileProcessor } from '../document_review/services/fileProcessor.js';
import {
  LEGAL_CONTRACT_REVIEW_CONFIG,
  CONTRACT_REVIEW_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  RISK_LEVELS,
} from './legal_contract_review.constant.js';
import Conversation from '../conversations/conversation.model.js';

// Import the service functions to be tested
import { legalContractReviewService } from './legal_contract_review.service.js';

// Mock external modules
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  return {
    ...actualMongoose,
    Types: {
      ObjectId: vi.fn().mockImplementation(() => ({
        toString: vi.fn().mockImplementation(() => 'mockedObjectId'),
      })),
    },
  };
});

vi.mock('@google/generative-ai');
vi.mock('../../../errors/ApiError.js', () => ({
  default: class ApiError extends Error {
    constructor(statusCode, message) {
      super(message);
      this.statusCode = statusCode;
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
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mocked_gemini_key',
  },
}));
vi.mock('../conversations/conversation.service.js');
vi.mock('../conversations/conversation.helpers.js');
vi.mock('./services/legalContractAnalyzer.js');
vi.mock('../document_review/services/fileProcessor.js');
vi.mock('../conversations/conversation.model.js', () => ({
  default: {
    updateOne: vi.fn(),
  },
}));

// Mock the internal genAI instance
const mockGenerateContent = vi.fn().mockImplementation(() => ({
  response: {
    text: vi.fn().mockImplementation(() => 'Mocked AI review content'),
  },
}));
const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
  generateContent: mockGenerateContent,
}));
GoogleGenerativeAI.mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

describe('legalContractReviewService', () => {
  const userId = 'testUserId123';
  const mockReq = { user: { id: userId } }; // Mock request object for context

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mocks for each test
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: mockGetGenerativeModel,
    }));
    mockGetGenerativeModel.mockClear();
    mockGenerateContent.mockClear();
    mockGenerateContent.mockReturnValue({
      response: {
        text: vi.fn().mockImplementation(() => 'Mocked AI review content'),
      },
    });

    // Default mock implementations for common dependencies
    conversationService.createConversation.mockResolvedValue({
      conversationId: 'new_conv_id_123',
      userId: userId,
      title: 'Legal Contract Review: User message...',
      messages: [],
      metadata: {
        category: CONVERSATION_CATEGORY,
        model: CONVERSATION_MODEL,
        userType: 'authenticated',
        isGuest: false,
        collectedParams: {},
        uploadedContracts: [],
      },
      contracts_metadata: { contracts: [], currentContractId: null },
    });
    conversationService.addMessageToConversation.mockResolvedValue({});
    conversationService.updateConversationMetadata.mockResolvedValue({});
    conversationHelpers.getConversationById.mockResolvedValue(null); // Default to not found
    legalContractAnalyzer.analyzeIntent.mockResolvedValue({
      intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
      confidence: 0.9,
      parameters: {
        reviewType: 'general_review',
        reviewDepth: 'standard',
        contractType: 'general',
      },
    });
    fileProcessor.extractTextFromFile.mockResolvedValue('Mocked contract text content');
    fileProcessor.uploadToGCS.mockResolvedValue({
      publicUrl: 'http://mocked.url/file.pdf',
      gcsPath: 'mocked/path/file.pdf',
      storageType: 'GCS',
    });
    fileProcessor.cleanupFile.mockResolvedValue(true);
    Conversation.updateOne.mockResolvedValue({ acknowledged: true, modifiedCount: 1 });

    // Mock Date.now() for predictable conversation IDs
    vi.spyOn(Date, 'now').mockReturnValue(1678886400000); // March 15, 2023 00:00:00 GMT
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID using mongoose ObjectId', () => {
      const guestId = legalContractReviewService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(guestId).toBe('mockedObjectId');
    });
  });

  describe('generateConversationId', () => {
    it('should generate a unique conversation ID with a specific prefix and timestamp', () => {
      const convId = legalContractReviewService.generateConversationId();
      expect(convId).toMatch(/^contract_review_\d{13}_[a-z0-9]{9}$/);
      expect(convId).toBe('contract_review_1678886400000_2s6x7y8z9'); // Based on mocked Date.now and Math.random
    });
  });

  describe('processConversationalRequest', () => {
    const userMessage = 'Review this contract for me.';
    const fileInfo = {
      path: '/tmp/test.pdf',
      filename: 'test.pdf',
      originalName: 'MyContract.pdf',
      size: 1024,
      mimetype: 'application/pdf',
    };
    const mockConversationId = 'existing_conv_id_456';

    it('should create a new conversation if conversationId is not provided or not found', async () => {
      const result = await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        null, // No conversationId
        null, // No file
        'text',
        false
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        undefined,
        userId,
        undefined
      );
      expect(conversationService.createConversation).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          title: expect.stringContaining('Legal Contract Review:'),
          metadata: expect.objectContaining({
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
          }),
          contracts_metadata: { contracts: [], currentContractId: null },
        }),
        expect.stringMatching(/^contract_review_\d{13}_[a-z0-9]{9}$/),
        undefined
      );
      expect(result.conversationId).toBe('new_conv_id_123');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created new legal contract review conversation')
      );
    });

    it('should retrieve an existing conversation if conversationId is provided', async () => {
      conversationHelpers.getConversationById.mockResolvedValueOnce({
        conversationId: mockConversationId,
        userId: userId,
        messages: [],
        metadata: { collectedParams: {}, uploadedContracts: [] },
        contracts_metadata: { contracts: [], currentContractId: null },
      });

      await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        mockConversationId,
        null,
        'text',
        false
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        userId,
        undefined
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Fetched conversation with ID: ${mockConversationId}`)
      );
    });

    it('should add the user message to the conversation', async () => {
      await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        null,
        null,
        'text',
        false
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'new_conv_id_123',
        userId,
        expect.objectContaining({
          role: 'user',
          content: userMessage,
          metadata: { hasFile: false },
        }),
        undefined
      );
    });

    it('should store an uploaded contract and use it for review', async () => {
      const mockContractData = {
        id: 'contract_1678886400000_2s6x7y8z9',
        originalName: fileInfo.originalName,
        filename: fileInfo.filename,
        publicUrl: 'http://mocked.url/file.pdf',
        gcsPath: 'mocked/path/file.pdf',
        storageType: 'GCS',
        extractedText: 'Mocked contract text content',
        textLength: 'Mocked contract text content'.length,
        textTruncated: false,
        size: fileInfo.size,
        mimetype: fileInfo.mimetype,
        uploadedAt: expect.any(Date),
        extractedAt: expect.any(Date),
      };

      const result = await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        null,
        fileInfo,
        'text',
        false
      );

      expect(fileProcessor.extractTextFromFile).toHaveBeenCalledWith(fileInfo);
      expect(fileProcessor.uploadToGCS).toHaveBeenCalledWith(
        fileInfo.path,
        fileInfo.filename,
        expect.objectContaining({ userId, originalName: fileInfo.originalName })
      );
      expect(Conversation.updateOne).toHaveBeenCalledWith(
        { conversationId: 'new_conv_id_123' },
        {
          $push: { 'contracts_metadata.contracts': expect.objectContaining({ id: mockContractData.id }) },
          $set: { 'contracts_metadata.currentContractId': mockContractData.id },
        }
      );
      expect(fileProcessor.cleanupFile).toHaveBeenCalledWith(fileInfo.path);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('New contract uploaded and stored')
      );
      expect(result.contractInfo).toEqual(
        expect.objectContaining({
          filename: mockContractData.originalName,
          contractId: mockContractData.id,
        })
      );
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(result.response).toBe('Mocked AI review content');
    });

    it('should use contract text from user message if no file and no cached contract', async () => {
      const longUserMessage = 'This is a very long message that contains contract text. ' + 'a'.repeat(300);
      conversationService.createConversation.mockResolvedValueOnce({
        conversationId: 'new_conv_id_123',
        userId: userId,
        messages: [],
        metadata: { collectedParams: {}, uploadedContracts: [] },
        contracts_metadata: { contracts: [], currentContractId: null },
      });

      const result = await legalContractReviewService.processConversationalRequest(
        userId,
        longUserMessage,
        null,
        null, // No file
        'text',
        false
      );

      expect(fileProcessor.extractTextFromFile).not.toHaveBeenCalled();
      expect(fileProcessor.uploadToGCS).not.toHaveBeenCalled();
      expect(Conversation.updateOne).not.toHaveBeenCalled();
      expect(legalContractAnalyzer.analyzeIntent).toHaveBeenCalledWith(
        longUserMessage,
        expect.any(Array),
        {}
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        'new_conv_id_123',
        userId,
        expect.objectContaining({
          contractText: longUserMessage,
        }),
        undefined
      );
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining(`Contract Content:\n${longUserMessage}`)
      );
      expect(result.response).toBe('Mocked AI review content');
    });

    it('should use a cached contract from conversation metadata if available', async () => {
      const cachedContract = {
        id: 'cached_contract_1',
        originalName: 'CachedContract.pdf',
        extractedText: 'Cached contract content',
        textLength: 'Cached contract content'.length,
        publicUrl: 'http://cached.url/file.pdf',
      };
      conversationHelpers.getConversationById.mockResolvedValueOnce({
        conversationId: mockConversationId,
        userId: userId,
        messages: [],
        metadata: { collectedParams: {}, uploadedContracts: [] },
        contracts_metadata: {
          contracts: [cachedContract],
          currentContractId: 'cached_contract_1',
        },
      });

      const result = await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        mockConversationId,
        null, // No new file
        'text',
        false
      );

      expect(fileProcessor.extractTextFromFile).not.toHaveBeenCalled();
      expect(fileProcessor.uploadToGCS).not.toHaveBeenCalled();
      expect(Conversation.updateOne).not.toHaveBeenCalled(); // No new contract to store
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Using cached contract from conversation')
      );
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining(`Contract Content:\n${cachedContract.extractedText}`)
      );
      expect(result.contractInfo).toEqual(
        expect.objectContaining({
          filename: cachedContract.originalName,
          contractId: cachedContract.id,
        })
      );
    });

    it('should return "needsContract" if no contract is provided (file or text) and no cached contract', async () => {
      const shortUserMessage = 'Just a short question.'; // Not long enough to be considered contract text
      conversationService.createConversation.mockResolvedValueOnce({
        conversationId: 'new_conv_id_123',
        userId: userId,
        messages: [],
        metadata: { collectedParams: {}, uploadedContracts: [] },
        contracts_metadata: { contracts: [], currentContractId: null },
      });

      const result = await legalContractReviewService.processConversationalRequest(
        userId,
        shortUserMessage,
        null,
        null, // No file
        'text',
        false
      );

      expect(result.needsContract).toBe(true);
      expect(result.response).toBe(RESPONSE_MESSAGES.NEED_CONTRACT);
      expect(mockGenerateContent).not.toHaveBeenCalled(); // No AI review performed
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'new_conv_id_123',
        userId,
        expect.objectContaining({
          role: 'assistant',
          content: RESPONSE_MESSAGES.NEED_CONTRACT,
        }),
        false
      );
    });

    it('should handle errors during conversation creation gracefully', async () => {
      conversationService.createConversation.mockRejectedValueOnce(
        new Error('DB error')
      );

      await expect(
        legalContractReviewService.processConversationalRequest(
          userId,
          userMessage,
          null,
          null,
          'text',
          false
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error handling legal contract review conversation:'),
        expect.any(Error)
      );
    });

    it('should handle errors during contract storage gracefully', async () => {
      fileProcessor.extractTextFromFile.mockRejectedValueOnce(
        new Error('Extraction failed')
      );

      await expect(
        legalContractReviewService.processConversationalRequest(
          userId,
          userMessage,
          null,
          fileInfo,
          'text',
          false
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error storing contract in conversation:'),
        expect.any(Error)
      );
      expect(fileProcessor.cleanupFile).toHaveBeenCalledWith(fileInfo.path); // Cleanup should still be attempted
    });

    it('should handle errors during intent analysis gracefully', async () => {
      legalContractAnalyzer.analyzeIntent.mockRejectedValueOnce(
        new Error('Analysis failed')
      );

      await expect(
        legalContractReviewService.processConversationalRequest(
          userId,
          userMessage,
          null,
          fileInfo,
          'text',
          false
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in conversational contract review request:'),
        expect.any(Error)
      );
    });

    it('should handle errors during contract review gracefully', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('Gemini error'));

      await expect(
        legalContractReviewService.processConversationalRequest(
          userId,
          userMessage,
          null,
          fileInfo,
          'text',
          false
        )
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error performing legal contract review:'),
        expect.any(Error)
      );
    });

    it('should pass outputFormat to performContractReview and include it in assistant message metadata', async () => {
      const outputFormat = 'markdown';
      const result = await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        null,
        fileInfo,
        outputFormat,
        false
      );

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining(
          'Please format your response using Markdown with appropriate headings, lists, and emphasis.'
        )
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        'new_conv_id_123',
        userId,
        expect.objectContaining({
          role: 'assistant',
          metadata: expect.objectContaining({
            outputFormat,
          }),
        }),
        false
      );
      expect(result.outputFormat).toBe(outputFormat);
    });

    it('should correctly merge and update conversation parameters', async () => {
      const existingParams = { reviewType: 'specific_clause', contractType: 'NDA' };
      conversationService.createConversation.mockResolvedValueOnce({
        conversationId: 'new_conv_id_123',
        userId: userId,
        messages: [],
        metadata: { collectedParams: existingParams, uploadedContracts: [] },
        contracts_metadata: { contracts: [], currentContractId: null },
      });
      legalContractAnalyzer.analyzeIntent.mockResolvedValueOnce({
        intent: CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW,
        confidence: 0.9,
        parameters: { reviewDepth: 'detailed', additionalInstructions: 'Focus on risks' },
      });

      await legalContractReviewService.processConversationalRequest(
        userId,
        userMessage,
        null,
        fileInfo,
        'text',
        false
      );

      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        'new_conv_id_123',
        userId,
        expect.objectContaining({
          reviewType: 'specific_clause',
          contractType: 'NDA',
          reviewDepth: 'detailed',
          additionalInstructions: 'Focus on risks',
        }),
        undefined
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Review Depth: Provide a detailed clause-by-clause analysis')
      );
    });
  });

  describe('reviewContract', () => {
    const fileInfo = {
      path: '/tmp/direct_test.pdf',
      filename: 'direct_test.pdf',
      originalName: 'DirectContract.pdf',
      size: 2048,
      mimetype: 'application/pdf',
    };
    const reviewParams = {
      reviewType: 'risk_assessment',
      reviewDepth: 'comprehensive',
      contractType: 'SaaS',
      outputFormat: 'markdown',
    };

    it('should perform a direct contract review successfully', async () => {
      const result = await legalContractReviewService.reviewContract(
        fileInfo,
        reviewParams,
        userId,
        false
      );

      expect(fileProcessor.extractTextFromFile).toHaveBeenCalledWith(fileInfo);
      expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Review Depth: Provide the most thorough analysis possible')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Contract Type: SaaS')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Please format your response using Markdown')
      );
      expect(fileProcessor.cleanupFile).toHaveBeenCalledWith(fileInfo.path);
      expect(result.success).toBe(true);
      expect(result.review).toBe('Mocked AI review content');
      expect(result.contractInfo).toEqual(
        expect.objectContaining({
          filename: fileInfo.originalName,
          size: fileInfo.size,
          contentLength: 'Mocked contract text content'.length,
        })
      );
      expect(result.reviewParams).toEqual(expect.objectContaining(reviewParams));
    });

    it('should throw ApiError if file extraction fails', async () => {
      fileProcessor.extractTextFromFile.mockRejectedValueOnce(
        new Error('PDF parsing failed')
      );

      await expect(
        legalContractReviewService.reviewContract(fileInfo, reviewParams, userId, false)
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error in direct contract review:'),
        expect.any(Error)
      );
      expect(fileProcessor.cleanupFile).toHaveBeenCalledWith(fileInfo.path); // Cleanup still attempted
    });

    it('should throw ApiError if contract review (AI generation) fails', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('AI service unavailable'));

      await expect(
        legalContractReviewService.reviewContract(fileInfo, reviewParams, userId, false)
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error performing legal contract review:'),
        expect.any(Error)
      );
      expect(fileProcessor.cleanupFile).toHaveBeenCalledWith(fileInfo.path); // Cleanup still attempted
    });

    it('should handle empty extracted text gracefully', async () => {
      fileProcessor.extractTextFromFile.mockResolvedValueOnce('');

      await expect(
        legalContractReviewService.reviewContract(fileInfo, reviewParams, userId, false)
      ).rejects.toThrow(ApiError);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error performing legal contract review:'),
        expect.any(ApiError)
      );
      expect(fileProcessor.cleanupFile).toHaveBeenCalledWith(fileInfo.path);
    });
  });
});