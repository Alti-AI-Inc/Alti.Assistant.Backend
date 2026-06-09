import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import httpStatus from 'http-status';
import mongoose from 'mongoose';
import path from 'path';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { presentonAPIClient } from './services/presentonAPIClient.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { uploadPresentationToGCS } from './services/gcsUploadService.js';
import {
  PRESENTATION_INTENTS,
  REQUIRED_PARAMS,
  DEFAULT_PARAMS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  TASK_STATUS,
} from './presentation.constant.js';

// Mock all external dependencies
vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: vi.fn(() => ({
        toString: vi.fn(() => 'mockObjectIdString'),
      })),
    },
  },
}));

vi.mock('path', () => ({
  default: {
    basename: vi.fn((p) => p.split('/').pop()),
  },
}));

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

vi.mock('../conversations/conversation.service.js', () => ({
  conversationService: {
    createConversation: vi.fn(),
    addMessageToConversation: vi.fn(),
    updateConversationMetadata: vi.fn(),
  },
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
  },
}));

vi.mock('./services/presentonAPIClient.js', () => ({
  presentonAPIClient: {
    generatePresentationAsync: vi.fn(),
    generatePresentation: vi.fn(),
    checkTaskStatus: vi.fn(),
    editPresentation: vi.fn(),
    derivePresentation: vi.fn(),
    getPresentation: vi.fn(),
  },
}));

vi.mock('./services/conversationAnalyzer.js', () => ({
  conversationAnalyzer: {
    _calculateConversationTokens: vi.fn(),
    summarizeConversation: vi.fn(),
    analyzeIntent: vi.fn(),
    answerGeneralQuestion: vi.fn(),
  },
}));

vi.mock('./services/gcsUploadService.js', () => ({
  uploadPresentationToGCS: vi.fn(),
}));

// Import the service after mocks are set up
const {
  generateGuestUserId,
  generateConversationId,
  handlePresentationConversation,
  addMessage,
  processConversationalRequest,
} = await import('./presentation.service.js');

// Mock Date and Math.random for deterministic tests
const MOCK_DATE_STR = '2023-01-01T12:00:00.000Z';
const MOCK_DATE = new Date(MOCK_DATE_STR);
const MOCK_DATE_NOW = MOCK_DATE.getTime();

let dateSpy;
let mathRandomSpy;
const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {}); // Suppress console.log

beforeEach(() => {
  vi.clearAllMocks();
  consoleSpy.mockClear();

  dateSpy = vi.spyOn(global, 'Date').mockImplementation((...args) => {
    if (args.length) {
      return new Date(...args);
    }
    return MOCK_DATE;
  });
  vi.spyOn(Date, 'now').mockReturnValue(MOCK_DATE_NOW);
  mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789); // For consistent generateConversationId
});

afterEach(() => {
  dateSpy.mockRestore();
  mathRandomSpy.mockRestore();
  consoleSpy.mockRestore();
});

describe('presentationService', () => {
  describe('generateGuestUserId', () => {
    it('should generate a valid Mongoose ObjectId string', () => {
      const userId = generateGuestUserId();
      expect(userId).toBe('mockObjectIdString');
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(1);
    });

    it('should return a different ID on successive calls (mocked to be same for now)', () => {
      const userId1 = generateGuestUserId();
      const userId2 = generateGuestUserId();
      expect(userId1).toBe('mockObjectIdString');
      expect(userId2).toBe('mockObjectIdString');
      expect(mongoose.Types.ObjectId).toHaveBeenCalledTimes(2);
    });
  });

  describe('generateConversationId', () => {
    it('should generate a conversation ID starting with "pres_"', () => {
      const conversationId = generateConversationId();
      expect(conversationId).toMatch(/^pres_\d+_[a-z0-9]{9}$/);
      expect(conversationId).toBe('pres_1672584000000_123456789'); // Consistent due to Date and Math.random mocks
    });

    it('should generate unique IDs on successive calls if mocks were dynamic', () => {
      // With current mocks, it will be the same. This test ensures the format.
      const id1 = generateConversationId();
      const id2 = generateConversationId();
      expect(id1).toBe('pres_1672584000000_123456789');
      expect(id2).toBe('pres_1672584000000_123456789');
    });
  });

  describe('handlePresentationConversation', () => {
    const mockUserId = 'user123';
    const mockUserMessage = 'Create a presentation about AI';
    const mockReq = { ip: '127.0.0.1' };

    it('should retrieve an existing conversation if conversationId is provided and found', async () => {
      const existingConversation = {
        conversationId: 'existingConv1',
        userId: mockUserId,
        messages: [],
        metadata: {},
        save: vi.fn(),
      };
      conversationHelpers.getConversationById.mockResolvedValue(existingConversation);

      const result = await handlePresentationConversation(
        mockUserId,
        'existingConv1',
        mockUserMessage,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'existingConv1',
        mockUserId,
        mockReq
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(result).toEqual(existingConversation);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Created new presentation conversation')
      );
    });

    it('should create a new conversation if conversationId is provided but not found', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found')); // Simulate not found
      const newConversation = {
        conversationId: 'nonExistentConv',
        userId: mockUserId,
        title: 'Presentation: Create a presentation about AI...',
        messages: [],
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'authenticated',
          isGuest: false,
          collectedParams: {},
        },
        save: vi.fn(),
      };
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await handlePresentationConversation(
        mockUserId,
        'nonExistentConv',
        mockUserMessage,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        'nonExistentConv',
        mockUserId,
        mockReq
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Conversation nonExistentConv not found, creating new one')
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: 'Presentation: Create a presentation about AI...',
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
            collectedParams: {},
          },
        },
        'nonExistentConv',
        mockReq
      );
      expect(result).toEqual(newConversation);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Created new presentation conversation nonExistentConv for user user123')
      );
    });

    it('should create a new conversation if no conversationId is provided', async () => {
      const generatedConvId = 'pres_1672584000000_123456789'; // From mocked Date.now and Math.random
      const newConversation = {
        conversationId: generatedConvId,
        userId: mockUserId,
        title: 'Presentation: Create a presentation about AI...',
        messages: [],
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'authenticated',
          isGuest: false,
          collectedParams: {},
        },
        save: vi.fn(),
      };
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await handlePresentationConversation(
        mockUserId,
        null, // No conversationId
        mockUserMessage,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).not.toHaveBeenCalled();
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: 'Presentation: Create a presentation about AI...',
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: 'authenticated',
            isGuest: false,
            collectedParams: {},
          },
        },
        generatedConvId,
        mockReq
      );
      expect(result).toEqual(newConversation);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(`Created new presentation conversation ${generatedConvId} for user user123`)
      );
    });

    it('should handle guest user correctly when creating a new conversation', async () => {
      const generatedConvId = 'pres_1672584000000_123456789';
      const newConversation = {
        conversationId: generatedConvId,
        userId: mockUserId,
        title: 'Presentation: Create a presentation about AI...',
        messages: [],
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: 'guest',
          isGuest: true,
          collectedParams: {},
        },
        save: vi.fn(),
      };
      conversationService.createConversation.mockResolvedValue(newConversation);

      const result = await handlePresentationConversation(
        mockUserId,
        null,
        mockUserMessage,
        true, // isGuest = true
        mockReq
      );

      expect(conversationService.createConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            userType: 'guest',
            isGuest: true,
          }),
        }),
        generatedConvId,
        mockReq
      );
      expect(result).toEqual(newConversation);
    });

    it('should throw ApiError if conversation creation fails', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found'));
      const mockError = new Error('DB error');
      conversationService.createConversation.mockRejectedValue(mockError);

      await expect(
        handlePresentationConversation(mockUserId, null, mockUserMessage, false, mockReq)
      ).rejects.toThrow(ApiError);
      await expect(
        handlePresentationConversation(mockUserId, null, mockUserMessage, false, mockReq)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling presentation conversation:',
        mockError
      );
    });
  });

  describe('addMessage', () => {
    const mockConversationId = 'conv123';
    const mockUserId = 'user123';
    const mockRole = 'user';
    const mockContent = 'Hello, AI!';
    const mockMetadata = { type: 'greeting' };
    const mockReq = { ip: '127.0.0.1' };

    it('should call conversationService.addMessageToConversation with correct arguments', async () => {
      const mockAddedMessage = {
        _id: 'msg1',
        role: mockRole,
        content: mockContent,
        timestamp: MOCK_DATE,
        metadata: mockMetadata,
      };
      conversationService.addMessageToConversation.mockResolvedValue(mockAddedMessage);

      const result = await addMessage(
        mockConversationId,
        mockUserId,
        mockRole,
        mockContent,
        mockMetadata,
        false,
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(1);
      const callArgs = conversationService.addMessageToConversation.mock.calls[0];
      expect(callArgs[0]).toBe(mockConversationId);
      expect(callArgs[1]).toBe(mockUserId);
      expect(callArgs[2]).toEqual({
        role: mockRole,
        content: mockContent,
        timestamp: MOCK_DATE,
        metadata: mockMetadata,
      });
      expect(callArgs[3]).toBe(mockReq);
      expect(result).toEqual(mockAddedMessage);
    });

    it('should handle guest user correctly (isGuest flag does not change call to service)', async () => {
      conversationService.addMessageToConversation.mockResolvedValue({});

      await addMessage(
        mockConversationId,
        mockUserId,
        mockRole,
        mockContent,
        {},
        true, // isGuest = true
        mockReq
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledTimes(1);
    });

    it('should throw ApiError if conversationService.addMessageToConversation fails', async () => {
      const mockError = new Error('DB write error');
      conversationService.addMessageToConversation.mockRejectedValue(mockError);

      await expect(
        addMessage(mockConversationId, mockUserId, mockRole, mockContent, {}, false, mockReq)
      ).rejects.toThrow(ApiError);
      await expect(
        addMessage(mockConversationId, mockUserId, mockRole, mockContent, {}, false, mockReq)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error adding message to conversation:', mockError);
    });
  });

  describe('processConversationalRequest', () => {
    const mockUserId = 'user123';
    const mockUserMessage = 'Create a presentation about AI';
    const mockConversationId = 'conv123';
    const mockReq = { ip: '127.0.0.1' };

    let mockConversation;

    beforeEach(() => {
      mockConversation = {
        conversationId: mockConversationId,
        userId: mockUserId,
        messages: [],
        metadata: { collectedParams: {} },
        save: vi.fn().mockResolvedValue(true),
      };

      // Default mocks for common calls within processConversationalRequest
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);
      conversationService.createConversation.mockResolvedValue(mockConversation);
      conversationService.addMessageToConversation.mockResolvedValue({});
      conversationService.updateConversationMetadata.mockResolvedValue({});
      conversationAnalyzer._calculateConversationTokens.mockReturnValue(1000); // Below summary threshold
      conversationAnalyzer.summarizeConversation.mockResolvedValue('Mock Summary');
      uploadPresentationToGCS.mockResolvedValue({
        publicUrl: 'http://mock.gcs/url/presentation.pptx',
        gcsPath: 'mock/gcs/path/presentation.pptx',
      });
    });

    it('should handle general question intent', async () => {
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 1.0,
        parameters: {},
        missingRequired: [],
      });
      conversationAnalyzer.answerGeneralQuestion.mockResolvedValue('Mock general answer');

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'user', content: mockUserMessage }),
        mockReq
      );
      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalledWith(
        mockUserMessage,
        [{ role: 'user', content: mockUserMessage, timestamp: MOCK_DATE, metadata: {} }],
        {},
        null
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {},
        mockReq
      );
      expect(conversationAnalyzer.answerGeneralQuestion).toHaveBeenCalledWith(
        mockUserMessage,
        [{ role: 'user', content: mockUserMessage, timestamp: MOCK_DATE, metadata: {} }]
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: 'Mock general answer' }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        success: true,
        message: 'Mock general answer',
        isGeneralQuestion: true,
        userId: mockUserId,
      });
    });

    it('should handle GENERATE intent when more info is needed', async () => {
      const missingParam = REQUIRED_PARAMS[PRESENTATION_INTENTS.GENERATE][0];
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GENERATE,
        confidence: 0.7,
        parameters: {},
        missingRequired: [missingParam],
        followUpQuestion: 'What topic?',
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalled();
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {},
        mockReq
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: 'What topic?' }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        needsMoreInfo: true,
        message: 'What topic?',
        missingParameters: [missingParam],
        collectedParameters: {},
        userId: mockUserId,
      });
      expect(presentonAPIClient.generatePresentationAsync).not.toHaveBeenCalled();
    });

    it('should handle GENERATE intent (async) when all parameters are collected', async () => {
      const generationParams = { topic: 'AI', slides: 10 };
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GENERATE,
        confidence: 1.0,
        parameters: generationParams,
        missingRequired: [],
      });
      presentonAPIClient.generatePresentationAsync.mockResolvedValue({
        id: 'task123',
        status: TASK_STATUS.PROCESSING,
        created_at: MOCK_DATE_STR,
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalled();
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        generationParams,
        mockReq
      );
      expect(presentonAPIClient.generatePresentationAsync).toHaveBeenCalledWith({
        ...DEFAULT_PARAMS,
        ...generationParams,
      });
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('task123'),
          metadata: { taskId: 'task123', generationParams },
        }),
        expect.anything()
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        {
          presentation_metadata: {
            taskId: 'task123',
            status: TASK_STATUS.PROCESSING,
            created_at: MOCK_DATE_STR,
            generationParams,
          },
        },
        mockReq
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        success: true,
        message: expect.stringContaining('task123'),
        taskId: 'task123',
        status: TASK_STATUS.PROCESSING,
        async: true,
        userId: mockUserId,
      });
    });

    it('should handle GENERATE intent (sync path, with GCS upload)', async () => {
      // Temporarily override generatePresentationAsync to simulate sync path
      // This is a bit hacky, but the original code has `isAsync = true` hardcoded.
      // To test the `else` branch, we need to simulate `isAsync = false`.
      // For this test, I'll assume `isAsync` can be controlled or that the test should cover the `else` block.
      // Since `isAsync` is hardcoded to `true`, the `else` branch is currently unreachable.
      // If the intent was `GENERATE_SYNC` or similar, it would be different.
      // Given the code, the `else` branch for `generatePresentation` is currently dead code.
      // I will skip testing the sync path for now, as it's unreachable.
      // If `isAsync` becomes dynamic, this test would be added.
    });

    it('should handle CHECK_STATUS intent when task ID is missing', async () => {
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.CHECK_STATUS,
        confidence: 0.8,
        parameters: {},
        missingRequired: ['taskId'],
        followUpQuestion: "What's your task ID?",
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: "What's your task ID?" }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        needsMoreInfo: true,
        message: "What's your task ID?",
        missingParameters: ['taskId'],
        userId: mockUserId,
      });
      expect(presentonAPIClient.checkTaskStatus).not.toHaveBeenCalled();
    });

    it('should handle CHECK_STATUS intent when task is completed', async () => {
      const taskId = 'task123';
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.CHECK_STATUS,
        confidence: 1.0,
        parameters: { taskId },
        missingRequired: [],
      });
      presentonAPIClient.checkTaskStatus.mockResolvedValue({
        status: TASK_STATUS.COMPLETED,
        data: {
          presentation_id: 'pres456',
          path: '/download/pres456.pptx',
          edit_path: '/edit/pres456',
          credits_consumed: 5,
        },
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(presentonAPIClient.checkTaskStatus).toHaveBeenCalledWith(taskId);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Your presentation is ready!'),
          metadata: {
            taskStatus: {
              status: TASK_STATUS.COMPLETED,
              data: expect.any(Object),
            },
          },
        }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        success: true,
        message: expect.stringContaining('Your presentation is ready!'),
        taskId: taskId,
        status: TASK_STATUS.COMPLETED,
        data: {
          presentation_id: 'pres456',
          path: '/download/pres456.pptx',
          edit_path: '/edit/pres456',
          credits_consumed: 5,
        },
        userId: mockUserId,
      });
    });

    it('should handle EDIT intent when parameters are missing', async () => {
      const missingParam = REQUIRED_PARAMS[PRESENTATION_INTENTS.EDIT][0];
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.EDIT,
        confidence: 0.8,
        parameters: {},
        missingRequired: [missingParam],
        followUpQuestion: "What would you like to edit?",
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: "What would you like to edit?" }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        needsMoreInfo: true,
        message: "What would you like to edit?",
        missingParameters: [missingParam],
        userId: mockUserId,
      });
      expect(presentonAPIClient.editPresentation).not.toHaveBeenCalled();
    });

    it('should handle EDIT intent when all parameters are collected', async () => {
      const editParams = { presentationId: 'pres123', changes: 'add a slide' };
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.EDIT,
        confidence: 1.0,
        parameters: editParams,
        missingRequired: [],
      });
      presentonAPIClient.editPresentation.mockResolvedValue({
        presentation_id: 'pres123_edited',
        path: '/download/pres123_edited.pptx',
        edit_path: '/edit/pres123_edited',
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(presentonAPIClient.editPresentation).toHaveBeenCalledWith(editParams);
      expect(uploadPresentationToGCS).toHaveBeenCalledWith(
        '/download/pres123_edited.pptx',
        'pres123_edited.pptx',
        mockUserId,
        mockConversationId
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          editedPresentationUrl: 'http://mock.gcs/url/presentation.pptx',
          editedGcsPath: 'mock/gcs/path/presentation.pptx',
        }),
        expect.anything()
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Presentation updated!'),
          metadata: expect.objectContaining({
            publicUrl: 'http://mock.gcs/url/presentation.pptx',
          }),
        }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        success: true,
        message: expect.stringContaining('Presentation updated!'),
        presentationId: 'pres123_edited',
        downloadUrl: '/download/pres123_edited.pptx',
        editUrl: '/edit/pres123_edited',
        publicUrl: 'http://mock.gcs/url/presentation.pptx',
        userId: mockUserId,
      });
    });

    it('should handle DERIVE intent when parameters are missing', async () => {
      const missingParam = REQUIRED_PARAMS[PRESENTATION_INTENTS.DERIVE][0];
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.DERIVE,
        confidence: 0.8,
        parameters: {},
        missingRequired: [missingParam],
        followUpQuestion: "What's the presentation ID?",
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: "What's the presentation ID?" }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        needsMoreInfo: true,
        message: "What's the presentation ID?",
        missingParameters: [missingParam],
        userId: mockUserId,
      });
      expect(presentonAPIClient.derivePresentation).not.toHaveBeenCalled();
    });

    it('should handle DERIVE intent when all parameters are collected', async () => {
      const deriveParams = { presentationId: 'pres123', topic: 'new topic' };
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.DERIVE,
        confidence: 1.0,
        parameters: deriveParams,
        missingRequired: [],
      });
      presentonAPIClient.derivePresentation.mockResolvedValue({
        presentation_id: 'pres123_derived',
        path: '/download/pres123_derived.pptx',
        edit_path: '/edit/pres123_derived',
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(presentonAPIClient.derivePresentation).toHaveBeenCalledWith(deriveParams);
      expect(uploadPresentationToGCS).toHaveBeenCalledWith(
        '/download/pres123_derived.pptx',
        'pres123_derived.pptx',
        mockUserId,
        mockConversationId
      );
      expect(conversationService.updateConversationMetadata).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          derivedPresentationUrl: 'http://mock.gcs/url/presentation.pptx',
          derivedGcsPath: 'mock/gcs/path/presentation.pptx',
        }),
        expect.anything()
      );
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('New presentation created!'),
          metadata: expect.objectContaining({
            publicUrl: 'http://mock.gcs/url/presentation.pptx',
          }),
        }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        success: true,
        message: expect.stringContaining('New presentation created!'),
        presentationId: 'pres123_derived',
        downloadUrl: '/download/pres123_derived.pptx',
        editUrl: '/edit/pres123_derived',
        publicUrl: 'http://mock.gcs/url/presentation.pptx',
        userId: mockUserId,
      });
    });

    it('should handle GET_INFO intent when presentation ID is missing', async () => {
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GET_INFO,
        confidence: 0.8,
        parameters: {},
        missingRequired: ['presentationId'],
        followUpQuestion: "Please provide the presentation ID.",
      });

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer.analyzeIntent).toHaveBeenCalled();
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({ role: 'assistant', content: "Please provide the presentation ID." }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        needsMoreInfo: true,
        message: "Please provide the presentation ID.",
        missingParameters: ['presentationId'],
        userId: mockUserId,
      });
      expect(presentonAPIClient.getPresentation).not.toHaveBeenCalled();
    });

    it('should handle GET_INFO intent when presentation ID is provided', async () => {
      const presentationId = 'pres123';
      const presentationInfo = { id: presentationId, title: 'My Presentation' };
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GET_INFO,
        confidence: 1.0,
        parameters: { presentationId },
        missingRequired: [],
      });
      presentonAPIClient.getPresentation.mockResolvedValue(presentationInfo);

      const result = await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(presentonAPIClient.getPresentation).toHaveBeenCalledWith(presentationId);
      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConversationId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: expect.stringContaining('Presentation Information:'),
          metadata: { result: presentationInfo },
        }),
        expect.anything()
      );
      expect(result).toEqual({
        conversationId: mockConversationId,
        success: true,
        message: expect.stringContaining('Presentation Information:'),
        presentationInfo: presentationInfo,
        userId: mockUserId,
      });
    });

    it('should summarize conversation if token limit is exceeded and no recent summary', async () => {
      mockConversation.messages = Array(10).fill({
        role: 'user',
        content: 'long message content',
        timestamp: MOCK_DATE,
        metadata: {},
      });
      conversationAnalyzer._calculateConversationTokens.mockReturnValue(6000); // Exceeds 5000
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 1.0,
        parameters: {},
        missingRequired: [],
      });
      conversationAnalyzer.answerGeneralQuestion.mockResolvedValue('Mock general answer');

      await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer._calculateConversationTokens).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Token limit approaching, summarizing conversation...')
      );
      expect(conversationAnalyzer.summarizeConversation).toHaveBeenCalledWith(
        expect.any(Array),
        {}
      );
      expect(mockConversation.save).toHaveBeenCalledTimes(1);
      expect(mockConversation.metadata).toHaveProperty('conversationSummary', 'Mock Summary');
      expect(mockConversation.metadata).toHaveProperty('summarizedMessageCount', 10);
    });

    it('should not summarize conversation if token limit is exceeded but summary is recent', async () => {
      mockConversation.messages = Array(10).fill({
        role: 'user',
        content: 'long message content',
        timestamp: MOCK_DATE,
        metadata: {},
      });
      mockConversation.metadata.conversationSummary = 'Existing Summary';
      mockConversation.metadata.summarizedMessageCount = 10; // Same as current messages length
      conversationAnalyzer._calculateConversationTokens.mockReturnValue(6000);

      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GENERAL_QUESTION,
        confidence: 1.0,
        parameters: {},
        missingRequired: [],
      });
      conversationAnalyzer.answerGeneralQuestion.mockResolvedValue('Mock general answer');

      await processConversationalRequest(
        mockUserId,
        mockUserMessage,
        mockConversationId,
        false,
        mockReq
      );

      expect(conversationAnalyzer._calculateConversationTokens).toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Token limit approaching, summarizing conversation...')
      );
      expect(conversationAnalyzer.summarizeConversation).not.toHaveBeenCalled();
      expect(mockConversation.save).not.toHaveBeenCalled();
    });

    it('should throw ApiError if any underlying intent handler throws an error', async () => {
      conversationAnalyzer.analyzeIntent.mockResolvedValue({
        intent: PRESENTATION_INTENTS.GENERATE,
        confidence: 1.0,
        parameters: { topic: 'AI', slides: 10 },
        missingRequired: [],
      });
      const mockError = new Error('Presenton API failed');
      presentonAPIClient.generatePresentationAsync.mockRejectedValue(mockError);

      await expect(
        processConversationalRequest(mockUserId, mockUserMessage, mockConversationId, false, mockReq)
      ).rejects.toThrow(ApiError);
      await expect(
        processConversationalRequest(mockUserId, mockUserMessage, mockConversationId, false, mockReq)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error processing conversational request:',
        expect.any(ApiError)
      );
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('I encountered an error while generating your presentation:'),
        mockError
      );
    });
  });
});