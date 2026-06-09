import { describe, it, expect, vi, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import {
  CREATIVE_WRITING_CONFIG,
  WRITING_TYPES,
  WRITING_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  INTENT_KEYWORDS,
  TYPE_KEYWORDS,
} from './creative_writing.constant.js';
import httpStatus from 'http-status';

// Mock external dependencies
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  return {
    ...actualMongoose,
    Types: {
      ObjectId: vi.fn(() => ({
        toString: vi.fn(() => 'mockObjectId123'),
      })),
    },
  };
});

vi.mock('@google/generative-ai');
vi.mock('../../../errors/ApiError.js');
vi.mock('../../../shared/logger.js');
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));
vi.mock('../conversations/conversation.service.js');
vi.mock('../conversations/conversation.helpers.js');

// Mock the GoogleGenerativeAI instance and its methods
const mockGenerateContent = vi.fn();
const mockGetGenerativeModel = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));
GoogleGenerativeAI.mockImplementation(() => ({
  getGenerativeModel: mockGetGenerativeModel,
}));

// Mock ApiError constructor
ApiError.mockImplementation((status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  return error;
});

// Mock logger
logger.info = vi.fn();
logger.warn = vi.fn();
logger.error = vi.fn();

// Mock conversationService
conversationService.createConversation = vi.fn();
conversationService.addMessageToConversation = vi.fn();
conversationService.updateConversationMetadata = vi.fn();

// Mock conversationHelpers
conversationHelpers.getConversationById = vi.fn();

// Import the service under test
let creativeWritingService;

beforeEach(async () => {
  vi.clearAllMocks(); // Clear all mocks before each test
  // Reset mock implementations if they were changed in a previous test
  GoogleGenerativeAI.mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  }));
  mockGetGenerativeModel.mockReturnValue({
    generateContent: mockGenerateContent,
  });
  mockGenerateContent.mockResolvedValue({
    response: {
      text: () => 'Generated creative writing text.',
    },
  });

  ApiError.mockImplementation((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  });

  logger.info.mockClear();
  logger.warn.mockClear();
  logger.error.mockClear();

  conversationService.createConversation.mockClear();
  conversationService.addMessageToConversation.mockClear();
  conversationService.updateConversationMetadata.mockClear();
  conversationHelpers.getConversationById.mockClear();

  // Dynamically import the module to ensure mocks are applied
  const module = await import('./creative_writing.service.js');
  creativeWritingService = module.creativeWritingService;
});

describe('creativeWritingService', () => {
  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID', () => {
      const userId = creativeWritingService.generateGuestUserId();
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(userId).toBe('mockObjectId123');
    });
  });

  describe('getConversationHistory', () => {
    const mockUserId = 'user123';
    const mockConversationId = 'conv123';
    const mockReq = {};

    it('should return conversation history if found', async () => {
      const mockConversation = {
        conversationId: mockConversationId,
        title: 'Test Conversation',
        messages: [{ role: 'user', content: 'hello' }],
        metadata: { category: 'creative_writing' },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const result = await creativeWritingService.getConversationHistory(
        mockConversationId,
        mockUserId,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(result).toEqual(mockConversation);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should throw ApiError if conversation not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Not found')
      );

      await expect(
        creativeWritingService.getConversationHistory(
          mockConversationId,
          mockUserId,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.NOT_FOUND,
        'Conversation not found'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error getting conversation history:',
        expect.any(Error)
      );
    });
  });

  describe('processConversationalRequest', () => {
    const mockUserId = 'user123';
    const mockGuestUserId = 'guest123';
    const mockReq = {};
    const mockExistingConversationId = 'existingConv123';
    const mockNewConversationId = 'creative_12345_abcde'; // Example format
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

      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      ); // Simulate no existing conversation
      conversationService.createConversation.mockResolvedValue({
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
        null, // No conversationId
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        null,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
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
        expect.stringMatching(/^creative_\d+_[a-z0-9]{9}$/), // Expect a generated ID
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2); // User and assistant messages
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
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
        expect.stringContaining('Create original creative writing based on the following request: User Request: Write a short story about a brave knight.')
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
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
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockNewConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: generatedText }),
        expect.objectContaining({
          writingType: WRITING_TYPES.SHORT_STORY,
          intent: WRITING_INTENTS.CREATE_NEW,
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
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created new creative writing conversation'),
        expect.any(String),
        'for user',
        mockUserId
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Creative writing generated successfully',
        expect.objectContaining({
          conversationId: mockNewConversationId,
          textLength: generatedText.length,
        })
      );
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

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
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

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockExistingConversationId,
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2); // User and assistant messages
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockExistingConversationId,
        mockUserId,
        expect.objectContaining({ role: 'user', content: userMessage }),
        mockReq
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Continue the following story naturally, maintaining the same style, characters, and narrative thread:')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Previous conversation context:\nuser: Write a story about a knight.\nassistant: Once upon a time...')
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockExistingConversationId,
        mockUserId,
        expect.objectContaining({
          writingHistory: expect.arrayContaining([
            ...existingConversation.metadata.writingHistory,
            expect.objectContaining({
              userRequest: userMessage,
              generatedText: generatedText,
              writingType: WRITING_TYPES.GENERAL, // Default if not specified in message
              intent: WRITING_INTENTS.CONTINUE_STORY,
            }),
          ]),
          lastWritingType: WRITING_TYPES.GENERAL,
        }),
        mockReq
      );
      expect(result).toEqual({
        success: true,
        conversationId: mockExistingConversationId,
        response: generatedText,
        writingParams: expect.objectContaining({
          writingType: WRITING_TYPES.GENERAL,
          intent: WRITING_INTENTS.CONTINUE_STORY,
        }),
        analysis: expect.objectContaining({
          intent: WRITING_INTENTS.CONTINUE_STORY,
          writingType: null, // Not explicitly mentioned in "Continue the story."
        }),
      });
    });

    it('should handle guest user flow', async () => {
      const userMessage = 'Write a poem.';
      const generatedText = 'A poem about a guest...';

      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      conversationService.createConversation.mockResolvedValue({
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
        true, // isGuest = true
        mockReq
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
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

      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      conversationService.createConversation.mockResolvedValue({
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

      expect(conversationService.createConversation).toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2); // User and assistant messages
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockNewConversationId,
        mockUserId,
        expect.objectContaining({ role: 'user', content: userMessage }),
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockNewConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: clarificationMessage,
          metadata: { needsClarification: true },
        }),
        mockReq
      );
      expect(mockGenerateContent).not.toHaveBeenCalled(); // No AI generation for clarification
      expect(conversationService.updateConversationMetadata).not.toHaveBeenCalled(); // No writing stored
      expect(result).toEqual({
        success: true,
        conversationId: mockNewConversationId,
        response: clarificationMessage,
        needsClarification: true,
        analysis: expect.objectContaining({
          intent: WRITING_INTENTS.CREATE_NEW, // Default for first vague message
          writingType: null,
        }),
      });
    });

    it('should handle API error during conversation creation', async () => {
      const userMessage = 'Write a story.';
      conversationHelpers.getConversationById.mockRejectedValue(
        new Error('Conversation not found')
      );
      conversationService.createConversation.mockRejectedValue(
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
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to handle conversation'
      );
      expect(logger.error).toHaveBeenCalledWith(
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
      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockRejectedValue(new Error('Gemini API error'));

      await expect(
        creativeWritingService.processConversationalRequest(
          mockUserId,
          userMessage,
          mockExistingConversationId,
          false,
          mockReq
        )
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.INTERNAL_SERVER_ERROR,
        'Failed to generate creative writing: Gemini API error'
      );
      expect(logger.error).toHaveBeenCalledWith(
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

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
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
      expect(result.analysis.writingType).toBe(WRITING_TYPES.POEM); // Detected from history context or message
      expect(result.analysis.wordCount).toBe(100);
      expect(result.analysis.style).toBe('romantic');
      expect(result.writingParams.intent).toBe(WRITING_INTENTS.EXPAND);
      expect(result.writingParams.writingType).toBe(WRITING_TYPES.POEM);
      expect(result.writingParams.wordCount).toBe(100);
      expect(result.writingParams.style).toBe('romantic');

      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Expand on the following text, adding more detail, depth, and development:')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Target length: approximately 100 words')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Style: romantic')
      );
    });

    it('should handle revise intent', async () => {
      const userMessage = 'Revise this paragraph to be more concise.';
      const generatedText = 'Revised concise paragraph.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
        messages: [
          { role: 'user', content: 'Write a paragraph.' },
          { role: 'assistant', content: 'A lengthy paragraph.' },
        ],
      };

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
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
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining("Revise and improve the following text based on the user's feedback:")
      );
    });

    it('should handle change style intent', async () => {
      const userMessage = 'Change the style of this story to dramatic.';
      const generatedText = 'A dramatic story.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
        messages: [
          { role: 'user', content: 'Write a story.' },
          { role: 'assistant', content: 'A simple story.' },
        ],
      };

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
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
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Rewrite the following text in a different style as requested:')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Style: dramatic')
      );
    });

    it('should handle brainstorm intent', async () => {
      const userMessage = 'Brainstorm ideas for a sci-fi novel.';
      const generatedText = 'Here are some ideas...';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
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
      expect(result.analysis.writingType).toBe(WRITING_TYPES.NOVEL);
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Brainstorm multiple creative ideas and possibilities for:')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining(SYSTEM_PROMPTS[WRITING_TYPES.NOVEL])
      );
    });

    it('should handle get ideas intent', async () => {
      const userMessage = 'Give me ideas for a short story about a detective.';
      const generatedText = 'Detective story ideas...';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
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
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining('Provide creative ideas and suggestions based on the following request:')
      );
      expect(mockGenerateContent).toHaveBeenCalledWith(
        expect.stringContaining(SYSTEM_PROMPTS[WRITING_TYPES.SHORT_STORY])
      );
    });

    it('should log a warning but not throw if storing writing fails', async () => {
      const userMessage = 'Write a short story.';
      const generatedText = 'A short story.';
      const existingConversation = {
        ...mockConversation,
        conversationId: mockExistingConversationId,
      };

      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);
      mockGenerateContent.mockResolvedValue({
        response: { text: () => generatedText },
      });
      conversationService.updateConversationMetadata.mockRejectedValue(
        new Error('DB update failed')
      );

      const result = await creativeWritingService.processConversationalRequest(
        mockUserId,
        userMessage,
        mockExistingConversationId,
        false,
        mockReq
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Error storing writing in conversation:',
        expect.any(Error)
      );
      // The process should still succeed and return the generated text
      expect(result.success).toBe(true);
      expect(result.response).toBe(generatedText);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(2); // User and assistant messages
    });
  });
});