import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import {
  CREATIVE_WRITING_CONFIG,
  WRITING_TYPES,
  WRITING_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
} from './creative_writing.constant.js';
import httpStatus from 'http-status';

const {
  mockGenerateContent,
  mockGetGenerativeModel,
  mockGoogleGenerativeAI,
  mockApiError,
  mockLogger,
  mockUsageService,
  mockWorkspaceService,
  mockConversationService,
  mockConversationHelpers
} = vi.hoisted(() => {
  const mockGenerateContent = vi.fn();
  const mockGetGenerativeModel = vi.fn().mockImplementation(() => ({
    generateContent: mockGenerateContent,
  }));

  class mockGoogleGenerativeAI {
    constructor(apiKey) {
      this.apiKey = apiKey;
    }
    getGenerativeModel(config) {
      return mockGetGenerativeModel(config);
    }
  }

  const mockApiError = vi.fn().mockImplementation(function(status, message) {
    const error = new Error(message);
    error.statusCode = status;
    Object.setPrototypeOf(error, mockApiError.prototype);
    return error;
  });
  Object.setPrototypeOf(mockApiError.prototype, Error.prototype);

  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const mockUsageService = {
    checkLimits: vi.fn().mockResolvedValue(true),
    recordUsage: vi.fn().mockResolvedValue({}),
  };

  const mockWorkspaceService = {
    isManagerOf: vi.fn().mockResolvedValue(true),
  };

  const mockConversationService = {
    createConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
    updateConversationMetadata: vi.fn(),
  };

  const mockConversationHelpers = {
    getConversationById: vi.fn(),
  };

  return {
    mockGenerateContent,
    mockGetGenerativeModel,
    mockGoogleGenerativeAI,
    mockApiError,
    mockLogger,
    mockUsageService,
    mockWorkspaceService,
    mockConversationService,
    mockConversationHelpers
  };
});

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: mockGoogleGenerativeAI,
}));

vi.mock('../../../errors/ApiError.js', () => ({
  default: mockApiError,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));

vi.mock('../usage/usage.service.js', () => ({
  usageService: mockUsageService,
}));

vi.mock('../workspaces/workspace.service.js', () => ({
  workspaceService: mockWorkspaceService,
}));

vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: mockConversationService,
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: mockConversationHelpers,
}));

// Import the service under test
let creativeWritingService;
let objectIdSpy;

beforeEach(async () => {
  vi.clearAllMocks(); // Clear all mocks before each test
  
  // Set up ObjectId spy
  objectIdSpy = vi.spyOn(mongoose.Types, 'ObjectId').mockImplementation(function() {
    return {
      toString: () => 'mockObjectId123',
    };
  });

  mockUsageService.checkLimits.mockResolvedValue(true);
  mockUsageService.recordUsage.mockResolvedValue({});
  mockWorkspaceService.isManagerOf.mockResolvedValue(true);

  mockGetGenerativeModel.mockReturnValue({
    generateContent: mockGenerateContent,
  });
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => 'Generated creative writing text.',
    },
  });

  // Dynamically import the module to ensure mocks are applied
  const module = await import('./creative_writing.service.js');
  creativeWritingService = module.creativeWritingService;
});

describe('creativeWritingService', () => {
  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID', () => {
      const userId = creativeWritingService.generateGuestUserId();
      expect(objectIdSpy).toHaveBeenCalledTimes(1);
      expect(userId).toBe('mockObjectId123');
    });
  });

  describe('getConversationHistory', () => {
    const mockUserId = 'user123';
    const mockConversationId = 'conv123';
    const mockReq = {
      user: {
        id: mockUserId,
        role: 'user',
        workspaceId: 'workspace123',
      },
    };

    it('should return conversation history if found', async () => {
      const mockConversation = {
        conversationId: mockConversationId,
        title: 'Test Conversation',
        messages: [{ role: 'user', content: 'hello' }],
        metadata: { category: 'creative_writing' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockConversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await creativeWritingService.getConversationHistory(
        mockConversationId,
        mockUserId,
        mockReq
      );

      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq,
        { lean: true }
      );
      expect(result).toEqual(mockConversation);
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should throw ApiError if conversation not found', async () => {
      const mockError = new mockApiError(httpStatus.NOT_FOUND, 'Conversation not found');
      mockConversationHelpers.getConversationById.mockRejectedValue(mockError);

      await expect(
        creativeWritingService.getConversationHistory(
          mockConversationId,
          mockUserId,
          mockReq
        )
      ).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(
        httpStatus.NOT_FOUND,
        'Conversation not found'
      );
    });
  });

  describe('processConversationalRequest', () => {
    const mockUserId = 'user123';
    const mockGuestUserId = 'guest123';
    const mockReq = {
      user: {
        id: mockUserId,
        role: 'user',
        workspaceId: 'workspace123',
      },
    };
    const mockExistingConversationId = 'existingConv123';
    const mockNewConversationId = 'creative_12345_abcde';
    const mockConversation = {
      conversationId: mockExistingConversationId,
      userId: mockUserId,
      title: 'Existing Conversation',
      messages: [],
      metadata: {
        category: CONVERSATION_CATEGORY,
        model: CONVERSATION_MODEL,
        userType: 'authenticated',
        isGuest: false,
        collectedParams: {},
        writingHistory: [],
      },
    };

    it('should create a new conversation and generate writing if no conversationId is provided', async () => {
      const userMessage = 'Write a short story about a brave knight.';
      const generatedText = 'Once upon a time, there was a brave knight...';

      mockConversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      mockConversationService.createConversation.mockResolvedValue({
        ...mockConversation,
        conversationId: mockNewConversationId,
        title: `Creative Writing: ${userMessage.substring(0, 50)}...`,
      });
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        null,
        false,
        mockReq
      );

      expect(mockConversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          title: `Creative Writing: ${userMessage.substring(0, 50)}...`,
          metadata: expect.objectContaining({
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
          }),
        }),
        expect.stringMatching(/^creative_\d+_[a-z0-9]{9}$/),
        mockReq
      );
      expect(mockConversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(mockConversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockNewConversationId,
        mockUserId,
        expect.objectContaining({ role: 'user', content: userMessage }),
        mockReq
      );
      expect(mockGetGenerativeModel).toHaveBeenCalledWith({
        model: CREATIVE_WRITING_CONFIG.MODEL,
        generationConfig: {
          temperature: DEFAULT_PARAMS.temperature,
          maxOutputTokens: CREATIVE_WRITING_CONFIG.MAX_OUTPUT_TOKENS,
        },
      });
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Create original creative writing based on the following request:')
      );
      expect(mockConversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockNewConversationId,
        mockUserId,
        expect.objectContaining({
          writingHistory: expect.arrayContaining([
            expect.objectContaining({
              userRequest: userMessage,
              generatedText: generatedText,
              writingType: WRITING_TYPES.SHORT_STORY,
              intent: WRITING_INTENTS.CREATE_NEW,
            }),
          ]),
          lastWritingType: WRITING_TYPES.SHORT_STORY,
        }),
        mockReq
      );
      expect(result).toEqual({
        success: true,
        conversationId: mockNewConversationId,
        response: generatedText,
        writingParams: expect.objectContaining({
          writingType: WRITING_TYPES.SHORT_STORY,
          intent: WRITING_INTENTS.CREATE_NEW,
        }),
        analysis: expect.objectContaining({
          intent: WRITING_INTENTS.CREATE_NEW,
          writingType: WRITING_TYPES.SHORT_STORY,
        }),
      });
    });

    it('should use an existing conversation and generate writing', async () => {
      const userMessage = 'Continue the story.';
      const generatedText = '...and the knight continued his journey.';
      const existingConversation = {
        ...mockConversation,
        messages: [
          { role: 'user', content: 'Write a story about a knight.' },
          { role: 'assistant', content: 'Once upon a time...' },
        ],
        metadata: {
          ...mockConversation.metadata,
          writingHistory: [
            {
              userRequest: 'Write a story about a knight.',
              generatedText: 'Once upon a time...',
              writingType: WRITING_TYPES.SHORT_STORY,
              intent: WRITING_INTENTS.CREATE_NEW,
            },
          ],
        },
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(mockConversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockExistingConversationId,
        mockUserId,
        mockReq,
        { lean: true }
      );
      expect(mockConversationService.createConversation).not.toHaveBeenCalled();
      expect(mockConversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(mockConversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockExistingConversationId,
        mockUserId,
        expect.objectContaining({ role: 'user', content: userMessage }),
        mockReq
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Continue the following story naturally, maintaining the same style, characters, and narrative thread:')
      );
      expect(result).toEqual({
        success: true,
        conversationId: mockExistingConversationId,
        response: generatedText,
        writingParams: {
          writingType: WRITING_TYPES.SHORT_STORY,
          writingStyle: null,
          tone: null,
          wordCount: null,
          temperature: 0.9,
          style: null,
          intent: WRITING_INTENTS.CONTINUE_STORY,
        },
        analysis: {
          intent: WRITING_INTENTS.CONTINUE_STORY,
          writingType: WRITING_TYPES.SHORT_STORY,
          wordCount: null,
          style: null,
          originalMessage: userMessage,
        },
      });
    });

    it('should handle guest user flow', async () => {
      const userMessage = 'Write a poem.';
      const generatedText = 'A poem about a guest...';

      mockConversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      mockConversationService.createConversation.mockResolvedValue({
        ...mockConversation,
        conversationId: mockNewConversationId,
        userId: mockGuestUserId,
        metadata: {
          ...mockConversation.metadata,
          userType: 'guest',
          isGuest: true,
        },
      });
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockGuestUserId,
        userMessage,
        null,
        true,
        mockReq
      );

      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockGuestUserId,
          metadata: expect.objectContaining({
            userType: 'guest',
            isGuest: true,
          }),
        }),
        expect.any(String),
        mockReq
      );
      expect(result.conversationId).toBe(mockNewConversationId);
      expect(result.response).toBe(generatedText);
      expect(result.writingParams.writingType).toBe(WRITING_TYPES.POEM);
    });

    it('should request clarification for vague initial messages', async () => {
      const userMessage = 'write something';
      const clarificationMessage =
        "I'd love to help you with creative writing! What type of writing would you like to create? For example: a poem, short story, song lyrics, script, or something else?";

      mockConversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      mockConversationService.createConversation.mockResolvedValue({
        ...mockConversation,
        conversationId: mockNewConversationId,
        messages: [],
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        null,
        false,
        mockReq
      );

      expect(mockConversationService.createConversation).toHaveBeenCalled();
      expect(mockConversationService.addMessageToConversation).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        success: true,
        conversationId: mockNewConversationId,
        response: clarificationMessage,
        needsClarification: true,
        analysis: expect.objectContaining({
          intent: WRITING_INTENTS.CREATE_NEW,
          writingType: null,
        }),
      });
    });

    it('should handle API error during conversation creation', async () => {
      const userMessage = 'Write a story.';
      mockConversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      mockConversationService.createConversation.mockRejectedValue(
        new Error('DB error')
      );

      await expect(
        creativeWritingService.processConversationalRequest(
          mockUserId,
          userMessage,
          null,
          false,
          mockReq
        )
      ).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to handle conversation'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error handling creative writing conversation:',
        expect.any(Error)
      );
    });

    it('should handle API error during AI content generation', async () => {
      const userMessage = 'Write a poem.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };
      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockRejectedValue(new Error('Gemini API error'));

      await expect(
        creativeWritingService.processConversationalRequest(
          mockUserId,
          userMessage,
          mockExistingConversationId,
          false,
          mockReq
        )
      ).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to generate creative writing: Gemini API error'
      );
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error generating creative writing:',
        expect.any(Error)
      );
    });

    it('should correctly detect intent and type for specific requests', async () => {
      const userMessage = 'Expand on this poem with 100 words in a romantic style.';
      const generatedText = 'Expanded romantic poem...';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
        messages: [
          { role: 'user', content: 'Write a short poem.' },
          { role: 'assistant', content: 'A short poem.' },
        ],
        metadata: {
          ...mockConversation.metadata,
          writingHistory: [
            {
              userRequest: 'Write a short poem.',
              generatedText: 'A short poem.',
              writingType: WRITING_TYPES.POEM,
              intent: WRITING_INTENTS.CREATE_NEW,
            },
          ],
        },
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(result.analysis.intent).toBe(WRITING_INTENTS.EXPAND);
      expect(result.analysis.writingType).toBe(WRITING_TYPES.POEM);
      expect(result.analysis.wordCount).toBe(100);
      expect(result.analysis.style).toBe('romantic');
    });

    it('should handle revise intent', async () => {
      const userMessage = 'Edit and revise this paragraph to be concise.';
      const generatedText = 'Revised concise paragraph.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
        messages: [
          { role: 'user', content: 'Write a paragraph.' },
          { role: 'assistant', content: 'A lengthy paragraph.' },
        ],
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(result.analysis.intent).toBe(WRITING_INTENTS.REVISE);
    });

    it('should handle change style intent', async () => {
      const userMessage = 'Change style of this story to dramatic, make it a different style.';
      const generatedText = 'A dramatic story.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
        messages: [
          { role: 'user', content: 'Write a story.' },
          { role: 'assistant', content: 'A simple story.' },
        ],
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(result.analysis.intent).toBe(WRITING_INTENTS.CHANGE_STYLE);
      expect(result.analysis.style).toBe('dramatic');
    });

    it('should handle brainstorm intent', async () => {
      const userMessage = 'Come up with multiple possibilities and brainstorm for a sci-fi novel.';
      const generatedText = 'Here are some ideas...';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(result.analysis.intent).toBe(WRITING_INTENTS.BRAINSTORM);
      expect(result.analysis.writingType).toBe(WRITING_TYPES.NOVEL_CHAPTER);
    });

    it('should handle get ideas intent', async () => {
      const userMessage = 'Give me ideas for a short story about a detective.';
      const generatedText = 'Detective story ideas...';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(result.analysis.intent).toBe(WRITING_INTENTS.GET_IDEAS);
      expect(result.analysis.writingType).toBe(WRITING_TYPES.SHORT_STORY);
    });

    it('should log a warning but not throw if storing writing fails', async () => {
      const userMessage = 'Write a short story.';
      const generatedText = 'A short story.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };

      mockConversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });
      mockConversationService.updateConversationMetadata.mockRejectedValue(
        new Error('DB update failed')
      );

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Error storing writing in conversation:',
        expect.any(Error)
      );
      expect(result.success).toBe(true);
      expect(result.response).toBe(generatedText);
    });
  });
});