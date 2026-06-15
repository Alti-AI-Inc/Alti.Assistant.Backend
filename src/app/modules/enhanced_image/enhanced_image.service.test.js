import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { enhancedImageService } from '../enhanced_image.service.js';

// Mock external dependencies
vi.mock('http-status', () => ({
  default: {
    INTERNAL_SERVER_ERROR: 500,
    NOT_FOUND: 404,
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
  },
}));

vi.mock('../conversations/conversation.helpers.js', () => ({
  conversationHelpers: {
    getConversationById: vi.fn(),
    getUserConversations: vi.fn(),
  },
}));

vi.mock('mongoose', () => ({
  default: {
    Types: {
      ObjectId: vi.fn().mockImplementation(() => ({
        toString: vi.fn().mockImplementation(() => 'mockObjectIdString'),
      })),
    },
  },
}));

vi.mock('../../shared/openMemoryClient.js', () => ({
  openMemoryClient: {
    enabled: true,
    addMemory: vi.fn(),
  },
}));

vi.mock('../utils/imagegen2.5.service.js', () => ({
  imagen3: vi.fn(),
}));

vi.mock('../utils/imagegen4.service.js', () => ({
  imagegen_4: vi.fn(),
}));

vi.mock('../utils/intentClassifier.js', () => ({
  routeImageGenRequest: vi.fn(),
}));

vi.mock('../utils/imageIntentAnalyzer.js', () => ({
  analyzeImageIntent: vi.fn(), // This is aliased as analyzeIntent
}));

vi.mock('../utils/imagen3.service.js', () => ({
  editImageWithImagen3: vi.fn(),
}));

vi.mock('path', () => ({
  default: {
    join: vi.fn().mockImplementation((...args) => args.join('/')), // Simple join for testing
    dirname: vi.fn().mockImplementation(() => '/mock/path'),
  },
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn().mockImplementation(() => '/mock/path/file.js'),
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock_gemini_key',
  },
}));

// Mock dynamic imports
vi.mock('../utils/promptEvaluator.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    evaluatePromptQuality: vi.fn(),
    buildEnhancedPrompt: vi.fn(),
  };
});

// Re-import the service after all mocks are set up
// This is important if the service uses the mocked values at module load time
const { logger } = await import('../../../shared/logger.js');
const { conversationService } = await import('../conversations/conversation.service.js');
const { conversationHelpers } = await import('../conversations/conversation.helpers.js');
const { openMemoryClient } = await import('../../shared/openMemoryClient.js');
const { imagen3 } = await import('../utils/imagegen2.5.service.js');
const { imagegen_4 } = await import('../utils/imagegen4.service.js');
const { routeImageGenRequest } = await import('../utils/intentClassifier.js');
const { analyzeImageIntent: analyzeIntent } = await import('../utils/imageIntentAnalyzer.js');
const { editImageWithImagen3 } = await import('../utils/imagen3.service.js');
const { evaluatePromptQuality, buildEnhancedPrompt } = await import('../utils/promptEvaluator.js');
const mongoose = await import('mongoose');
const path = await import('path');

describe('enhancedImageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openMemoryClient.enabled = true; // Reset to default enabled state
    // Ensure dynamic imports are mocked correctly for each test
    vi.mock('../utils/imageIntentAnalyzer.js', () => ({
      analyzeImageIntent: vi.fn(),
    }));
    vi.mock('../utils/promptEvaluator.js', () => ({
      evaluatePromptQuality: vi.fn(),
      buildEnhancedPrompt: vi.fn(),
    }));
  });

  describe('generateGuestUserId', () => {
    it('should generate a unique guest user ID', () => {
      const userId = enhancedImageService.generateGuestUserId();
      expect(mongoose.default.Types.ObjectId).toHaveBeenCalledTimes(1);
      expect(userId).toBe('mockObjectIdString');
    });
  });

  describe('generateImageConversationId', () => {
    it('should generate a unique image conversation ID', () => {
      const id = enhancedImageService.generateImageConversationId();
      expect(id).toMatch(/^image-\d{13}-[a-z0-9]{9}$/);
    });
  });

  describe('handleImageConversation', () => {
    const mockUserId = 'user123';
    const mockPrompt = 'a beautiful landscape';
    const mockReq = {};

    it('should create a new conversation if conversationId is not provided (authenticated)', async () => {
      const newConvId = 'newConv123';
      vi.spyOn(enhancedImageService, 'generateImageConversationId').mockReturnValue(newConvId);
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found')); // Simulate not found
      conversationService.createConversation.mockResolvedValue({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
      });

      const conversation = await enhancedImageService.handleImageConversation(
        mockUserId,
        null,
        mockPrompt,
        false,
        'image_generation',
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        null, // conversationId is null
        mockUserId,
        mockReq,
        true
      );
      expect(enhancedImageService.generateImageConversationId).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Image: ${mockPrompt.substring(0, 50)}...`,
          metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
        },
        newConvId,
        mockReq
      );
      expect(conversation).toEqual({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
      });
    });

    it('should create a new conversation if conversationId is not provided (guest)', async () => {
      const newConvId = 'newGuestConv123';
      vi.spyOn(enhancedImageService, 'generateImageConversationId').mockReturnValue(newConvId);
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Not found'));
      conversationService.createConversation.mockResolvedValue({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'guest', isGuest: true },
      });

      const conversation = await enhancedImageService.handleImageConversation(
        mockUserId,
        null,
        mockPrompt,
        true,
        'image_generation',
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        null,
        null,
        mockReq,
        true
      );
      expect(enhancedImageService.generateImageConversationId).toHaveBeenCalledTimes(1);
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Image: ${mockPrompt.substring(0, 50)}...`,
          metadata: { category: 'image_generation', model: 'imagen', userType: 'guest', isGuest: true },
        },
        newConvId,
        mockReq
      );
      expect(conversation).toEqual({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'guest', isGuest: true },
      });
    });

    it('should retrieve an existing conversation if conversationId is provided', async () => {
      const existingConvId = 'existingConv123';
      const mockConversation = {
        _id: existingConvId,
        userId: mockUserId,
        title: 'Existing Image Conversation',
        metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
      };
      conversationHelpers.getConversationById.mockResolvedValue(mockConversation);

      const conversation = await enhancedImageService.handleImageConversation(
        mockUserId,
        existingConvId,
        mockPrompt,
        false,
        'image_generation',
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        existingConvId,
        mockUserId,
        mockReq,
        true
      );
      expect(conversationService.createConversation).not.toHaveBeenCalled();
      expect(conversation).toEqual(mockConversation);
    });

    it('should create a new conversation if existing conversationId is not found', async () => {
      const existingConvId = 'nonExistentConv123';
      const newConvId = 'newConvAfterNotFound';
      vi.spyOn(enhancedImageService, 'generateImageConversationId').mockReturnValue(newConvId);
      conversationHelpers.getConversationById.mockRejectedValue(new Error('Conversation not found'));
      conversationService.createConversation.mockResolvedValue({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
      });

      const conversation = await enhancedImageService.handleImageConversation(
        mockUserId,
        existingConvId,
        mockPrompt,
        false,
        'image_generation',
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        existingConvId,
        mockUserId,
        mockReq,
        true
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Conversation ${existingConvId} not found for user ${mockUserId}, creating new one`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Image: ${mockPrompt.substring(0, 50)}...`,
          metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
        },
        existingConvId, // Should use the provided conversationId if not found
        mockReq
      );
      expect(conversation).toEqual({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'authenticated' },
      });
    });

    it('should create a new conversation if guest user tries to access non-guest conversation', async () => {
      const existingConvId = 'authConv123';
      const newConvId = 'newGuestConvAfterAuthAccess';
      vi.spyOn(enhancedImageService, 'generateImageConversationId').mockReturnValue(newConvId);
      conversationHelpers.getConversationById.mockResolvedValue({
        _id: existingConvId,
        userId: 'someOtherUser',
        metadata: { userType: 'authenticated' },
      });
      conversationService.createConversation.mockResolvedValue({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'guest', isGuest: true },
      });

      const conversation = await enhancedImageService.handleImageConversation(
        mockUserId,
        existingConvId,
        mockPrompt,
        true,
        'image_generation',
        mockReq
      );

      expect(conversationHelpers.getConversationById).toHaveBeenCalledWith(
        existingConvId,
        null, // userId is null for guest
        mockReq,
        true
      );
      expect(logger.warn).toHaveBeenCalledWith(
        `Guest user ${mockUserId} trying to access non-guest conversation ${existingConvId}`
      );
      expect(conversationService.createConversation).toHaveBeenCalledWith(
        {
          userId: mockUserId,
          title: `Image: ${mockPrompt.substring(0, 50)}...`,
          metadata: { category: 'image_generation', model: 'imagen', userType: 'guest', isGuest: true },
        },
        existingConvId, // Should use the provided conversationId if not found
        mockReq
      );
      expect(conversation).toEqual({
        _id: newConvId,
        userId: mockUserId,
        title: `Image: ${mockPrompt.substring(0, 50)}...`,
        metadata: { category: 'image_generation', model: 'imagen', userType: 'guest', isGuest: true },
      });
    });

    it('should throw ApiError on internal service error', async () => {
      conversationHelpers.getConversationById.mockRejectedValue(new Error('DB error'));
      conversationService.createConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        enhancedImageService.handleImageConversation(mockUserId, null, mockPrompt)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.handleImageConversation(mockUserId, null, mockPrompt)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling image conversation:',
        expect.any(Error)
      );
    });
  });

  describe('addImageRequestMessage', () => {
    const mockConvId = 'conv123';
    const mockUserId = 'user123';
    const mockPrompt = 'a cat astronaut';
    const mockMetadata = { custom: 'data' };
    const mockSavedMessage = { _id: 'msg1', role: 'user', content: mockPrompt };

    it('should add an image request message to conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);
      openMemoryClient.addMemory.mockResolvedValue({});

      const result = await enhancedImageService.addImageRequestMessage(
        mockConvId,
        mockUserId,
        mockPrompt,
        mockMetadata
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConvId,
        mockUserId,
        expect.objectContaining({
          role: 'user',
          content: mockPrompt,
          metadata: expect.objectContaining({
            type: 'image_request',
            custom: 'data',
            timestamp: expect.any(String),
          }),
        })
      );
      expect(openMemoryClient.addMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockPrompt,
          userId: mockUserId,
          tags: ['image', 'request'],
          metadata: expect.objectContaining({
            conversationId: mockConvId,
            type: 'image_request',
            isGuest: false,
            timestamp: expect.any(String),
          }),
          sector: 'episodic',
        })
      );
      expect(result).toEqual(mockSavedMessage);
    });

    it('should not call openMemoryClient.addMemory if openMemoryClient is disabled', async () => {
      openMemoryClient.enabled = false;
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);

      await enhancedImageService.addImageRequestMessage(
        mockConvId,
        mockUserId,
        mockPrompt,
        mockMetadata
      );

      expect(openMemoryClient.addMemory).not.toHaveBeenCalled();
    });

    it('should log a warning if openMemoryClient.addMemory fails but not throw', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);
      openMemoryClient.addMemory.mockRejectedValue(new Error('Memory client error'));

      const result = await enhancedImageService.addImageRequestMessage(
        mockConvId,
        mockUserId,
        mockPrompt,
        mockMetadata
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist image request in OpenMemory',
        expect.any(Error)
      );
      expect(result).toEqual(mockSavedMessage); // Still returns the saved message
    });

    it('should throw ApiError on internal service error', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        enhancedImageService.addImageRequestMessage(mockConvId, mockUserId, mockPrompt)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.addImageRequestMessage(mockConvId, mockUserId, mockPrompt)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding image request message:',
        expect.any(Error)
      );
    });
  });

  describe('addImageResultMessage', () => {
    const mockConvId = 'conv123';
    const mockUserId = 'user123';
    const mockResult = 'http://image.url/generated.png';
    const mockMetadata = { model: 'imagen3' };
    const mockSavedMessage = { _id: 'msg2', role: 'assistant', content: mockResult };

    it('should add an image result message to conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);
      openMemoryClient.addMemory.mockResolvedValue({});

      const result = await enhancedImageService.addImageResultMessage(
        mockConvId,
        mockUserId,
        mockResult,
        mockMetadata
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConvId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: mockResult,
          metadata: expect.objectContaining({
            type: 'image_result',
            model: 'imagen3',
            timestamp: expect.any(String),
          }),
        })
      );
      expect(openMemoryClient.addMemory).toHaveBeenCalledWith(
        expect.objectContaining({
          content: mockResult,
          userId: mockUserId,
          tags: ['image', 'result'],
          metadata: expect.objectContaining({
            conversationId: mockConvId,
            type: 'image_result',
            isGuest: false,
            model: 'imagen3',
          }),
          sector: 'semantic',
        })
      );
      expect(result).toEqual(mockSavedMessage);
    });

    it('should not call openMemoryClient.addMemory if openMemoryClient is disabled', async () => {
      openMemoryClient.enabled = false;
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);

      await enhancedImageService.addImageResultMessage(
        mockConvId,
        mockUserId,
        mockResult,
        mockMetadata
      );

      expect(openMemoryClient.addMemory).not.toHaveBeenCalled();
    });

    it('should log a warning if openMemoryClient.addMemory fails but not throw', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);
      openMemoryClient.addMemory.mockRejectedValue(new Error('Memory client error'));

      const result = await enhancedImageService.addImageResultMessage(
        mockConvId,
        mockUserId,
        mockResult,
        mockMetadata
      );

      expect(logger.warn).toHaveBeenCalledWith(
        'Failed to persist image result in OpenMemory',
        expect.any(Error)
      );
      expect(result).toEqual(mockSavedMessage); // Still returns the saved message
    });

    it('should throw ApiError on internal service error', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      await expect(
        enhancedImageService.addImageResultMessage(mockConvId, mockUserId, mockResult)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.addImageResultMessage(mockConvId, mockUserId, mockResult)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error adding image result message:',
        expect.any(Error)
      );
    });
  });

  describe('addErrorMessage', () => {
    const mockConvId = 'conv123';
    const mockUserId = 'user123';
    const mockErrorMessage = 'Something went wrong';
    const mockOriginalError = new Error('Detailed error');
    const mockSavedMessage = { _id: 'msg3', role: 'assistant', content: mockErrorMessage };

    it('should add an error message to conversation', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);

      const result = await enhancedImageService.addErrorMessage(
        mockConvId,
        mockUserId,
        mockErrorMessage,
        mockOriginalError
      );

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConvId,
        mockUserId,
        expect.objectContaining({
          role: 'assistant',
          content: mockErrorMessage,
          metadata: expect.objectContaining({
            type: 'error',
            timestamp: expect.any(String),
            error: mockOriginalError.message,
          }),
        })
      );
      expect(result).toEqual(mockSavedMessage);
    });

    it('should handle unknown original error', async () => {
      conversationService.addMessageToConversation.mockResolvedValue(mockSavedMessage);

      await enhancedImageService.addErrorMessage(mockConvId, mockUserId, mockErrorMessage, null);

      expect(conversationService.addMessageToConversation).toHaveBeenCalledWith(
        mockConvId,
        mockUserId,
        expect.objectContaining({
          metadata: expect.objectContaining({
            error: 'Unknown error',
          }),
        })
      );
    });

    it('should log an error if adding message fails but not throw', async () => {
      conversationService.addMessageToConversation.mockRejectedValue(new Error('DB error'));

      const result = await enhancedImageService.addErrorMessage(
        mockConvId,
        mockUserId,
        mockErrorMessage,
        mockOriginalError
      );

      expect(logger.error).toHaveBeenCalledWith('Error adding error message:', expect.any(Error));
      expect(result).toBeUndefined(); // Because the inner call failed
    });
  });

  describe('generateImage', () => {
    const mockPrompt = 'a futuristic city';
    const mockFilename = 'test_image.png';
    const mockOptions = { referenceImage: 'ref.png', aspectRatio: '16:9', negativePrompt: 'ugly' };
    const mockApiKey = 'mock_gemini_key';

    it('should generate image using imagen4 service', async () => {
      routeImageGenRequest.mockResolvedValue({
        service: 'imagen4',
        reasoning: 'high quality',
        confidence: 0.9,
      });
      imagegen_4.mockResolvedValue('http://imagen4.url/test_image.png');

      const result = await enhancedImageService.generateImage(
        mockPrompt,
        mockFilename,
        mockOptions
      );

      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).toHaveBeenCalledWith(
        '/mock/path',
        '..',
        '..',
        '..',
        'uploads',
        'images'
      );
      expect(path.join).toHaveBeenCalledWith(
        '/mock/path/../../../uploads/images',
        mockFilename
      );
      expect(imagegen_4).toHaveBeenCalledWith(
        mockPrompt,
        '/mock/path/../../../uploads/images/test_image.png'
      );
      expect(imagen3).not.toHaveBeenCalled();
      expect(result).toEqual({
        filename: mockFilename,
        url: 'http://imagen4.url/test_image.png',
        service: 'imagen4',
        reasoning: 'high quality',
        confidence: 0.9,
      });
    });

    it('should generate image using gemini2.5flash service', async () => {
      routeImageGenRequest.mockResolvedValue({
        service: 'gemini2.5flash',
        reasoning: 'fast generation',
        confidence: 0.8,
      });
      imagen3.mockResolvedValue('http://imagen3.url/test_image.png');

      const result = await enhancedImageService.generateImage(
        mockPrompt,
        mockFilename,
        mockOptions
      );

      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(imagegen_4).not.toHaveBeenCalled();
      expect(imagen3).toHaveBeenCalledWith(
        mockPrompt,
        mockOptions.referenceImage,
        mockFilename
      );
      expect(result).toEqual({
        filename: mockFilename,
        url: 'http://imagen3.url/test_image.png',
        service: 'gemini2.5flash',
        reasoning: 'fast generation',
        confidence: 0.8,
      });
    });

    it('should throw ApiError on internal service error', async () => {
      routeImageGenRequest.mockRejectedValue(new Error('Routing error'));

      await expect(
        enhancedImageService.generateImage(mockPrompt, mockFilename)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.generateImage(mockPrompt, mockFilename)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error generating image:', expect.any(Error));
    });
  });

  describe('editImage', () => {
    const mockPrompt = 'make it sunset';
    const mockImageBase64 = 'base64string';
    const mockFilename = 'edited_image.png';
    const mockOptions = { strength: 0.5 };
    const mockApiKey = 'mock_gemini_key';

    it('should edit image using editImageWithImagen3 service', async () => {
      editImageWithImagen3.mockResolvedValue('http://edited.url/edited_image.png');

      const result = await enhancedImageService.editImage(
        mockPrompt,
        mockImageBase64,
        mockFilename,
        mockOptions
      );

      expect(editImageWithImagen3).toHaveBeenCalledWith(
        mockPrompt,
        mockImageBase64,
        mockFilename,
        mockApiKey
      );
      expect(result).toEqual({
        filename: mockFilename,
        url: 'http://edited.url/edited_image.png',
        service: 'imagen3',
      });
    });

    it('should throw ApiError on internal service error', async () => {
      editImageWithImagen3.mockRejectedValue(new Error('Edit service error'));

      await expect(
        enhancedImageService.editImage(mockPrompt, mockImageBase64, mockFilename)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.editImage(mockPrompt, mockImageBase64, mockFilename)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith('Error editing image:', expect.any(Error));
    });
  });

  describe('analyzeImageIntent', () => {
    const mockPrompt = 'generate a dog';
    const mockApiKey = 'mock_gemini_key';
    const mockAnalysisResult = { intent: 'image_generation', keywords: ['dog'] };

    it('should analyze image intent', async () => {
      analyzeIntent.mockResolvedValue(mockAnalysisResult);

      const result = await enhancedImageService.analyzeImageIntent(mockPrompt);

      expect(analyzeIntent).toHaveBeenCalledWith(mockPrompt, false, 'No previous context.', {
        apiKey: mockApiKey,
      });
      expect(result).toEqual(mockAnalysisResult);
    });

    it('should throw ApiError on internal service error', async () => {
      analyzeIntent.mockRejectedValue(new Error('Analysis error'));

      await expect(enhancedImageService.analyzeImageIntent(mockPrompt)).rejects.toThrow(ApiError);
      await expect(enhancedImageService.analyzeImageIntent(mockPrompt)).rejects.toHaveProperty(
        'statusCode',
        httpStatus.INTERNAL_SERVER_ERROR
      );
      expect(logger.error).toHaveBeenCalledWith('Error analyzing image intent:', expect.any(Error));
    });
  });

  describe('analyzeImageIntentWithContext', () => {
    const mockPrompt = 'edit the image';
    const mockHasImage = true;
    const mockContext = 'previous conversation history';
    const mockApiKey = 'mock_gemini_key';
    const mockAnalysisResult = { intent: 'image_editing', keywords: ['edit'] };

    // Mock the dynamic import for this specific test
    beforeEach(() => {
      vi.mock('../utils/imageIntentAnalyzer.js', () => ({
        analyzeImageIntent: vi.fn(), // Original export
        analyzeImageIntent: vi.fn(), // This is the one used by analyzeImageIntent
        analyzeImageIntent: vi.fn().mockImplementation((...args) => { // This is the one used by analyzeImageIntentWithContext
          if (args[0] === mockPrompt && args[1] === mockHasImage && args[2] === mockContext) {
            return Promise.resolve(mockAnalysisResult);
          }
          return Promise.reject(new Error('Unexpected call to analyzeImageIntentFull'));
        }),
      }));
    });

    it('should analyze image intent with context using dynamic import', async () => {
      const result = await enhancedImageService.analyzeImageIntentWithContext(
        mockPrompt,
        mockHasImage,
        mockContext
      );

      // The mock for analyzeImageIntent is set up to handle this specific call
      // We can't directly assert on the dynamically imported function, but we can assert its effect
      expect(result).toEqual(mockAnalysisResult);
    });

    it('should throw ApiError on internal service error', async () => {
      vi.mock('../utils/imageIntentAnalyzer.js', () => ({
        analyzeImageIntent: vi.fn().mockImplementation(() => Promise.reject(new Error('Dynamic analysis error'))),
      }));

      await expect(
        enhancedImageService.analyzeImageIntentWithContext(mockPrompt, mockHasImage, mockContext)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.analyzeImageIntentWithContext(mockPrompt, mockHasImage, mockContext)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error analyzing image intent with context:',
        expect.any(Error)
      );
    });
  });

  describe('evaluatePromptQuality', () => {
    const mockPrompt = 'a bad prompt';
    const mockHistory = 'some history';
    const mockApiKey = 'mock_gemini_key';
    const mockEvaluationResult = { score: 2, feedback: 'Needs more detail' };

    beforeEach(() => {
      evaluatePromptQuality.mockResolvedValue(mockEvaluationResult);
    });

    it('should evaluate prompt quality using dynamic import', async () => {
      const result = await enhancedImageService.evaluatePromptQuality(mockPrompt, mockHistory);

      expect(evaluatePromptQuality).toHaveBeenCalledWith(mockPrompt, mockHistory, {
        apiKey: mockApiKey,
      });
      expect(result).toEqual(mockEvaluationResult);
    });

    it('should throw ApiError on internal service error', async () => {
      evaluatePromptQuality.mockRejectedValue(new Error('Evaluation error'));

      await expect(
        enhancedImageService.evaluatePromptQuality(mockPrompt, mockHistory)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.evaluatePromptQuality(mockPrompt, mockHistory)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error evaluating prompt quality:',
        expect.any(Error)
      );
    });
  });

  describe('buildEnhancedPromptFromHistory', () => {
    const mockConversationHistory = [{ role: 'user', content: 'cat' }];
    const mockApiKey = 'mock_gemini_key';
    const mockEnhancedPrompt = 'a fluffy cat sitting on a couch';

    beforeEach(() => {
      buildEnhancedPrompt.mockResolvedValue(mockEnhancedPrompt);
    });

    it('should build enhanced prompt from history using dynamic import', async () => {
      const result = await enhancedImageService.buildEnhancedPromptFromHistory(
        mockConversationHistory
      );

      expect(buildEnhancedPrompt).toHaveBeenCalledWith(mockConversationHistory, {
        apiKey: mockApiKey,
      });
      expect(result).toEqual(mockEnhancedPrompt);
    });

    it('should throw ApiError on internal service error', async () => {
      buildEnhancedPrompt.mockRejectedValue(new Error('Build prompt error'));

      await expect(
        enhancedImageService.buildEnhancedPromptFromHistory(mockConversationHistory)
      ).rejects.toThrow(ApiError);
      await expect(
        enhancedImageService.buildEnhancedPromptFromHistory(mockConversationHistory)
      ).rejects.toHaveProperty('statusCode', httpStatus.INTERNAL_SERVER_ERROR);
      expect(logger.error).toHaveBeenCalledWith(
        'Error building enhanced prompt:',
        expect.any(Error)
      );
    });
  });

  describe('getImageStats', () => {
    const mockUserId = 'user123';
    const mockReq = {};

    it('should return correct image statistics', async () => {
      conversationHelpers.getUserConversations
        .mockResolvedValueOnce({
          conversations: [
            { _id: 'gen1', messageCount: 2 },
            { _id: 'gen2', messageCount: 4 },
          ],
        }) // image_generation
        .mockResolvedValueOnce({
          conversations: [{ _id: 'edit1', messageCount: 3 }],
        }); // image_editing

      const stats = await enhancedImageService.getImageStats(mockUserId, mockReq);

      expect(conversationHelpers.getUserConversations).toHaveBeenCalledTimes(2);
      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        mockUserId,
        { page: 1, limit: 1000, category: 'image_generation' },
        true
      );
      expect(conversationHelpers.getUserConversations).toHaveBeenCalledWith(
        mockUserId,
        { page: 1, limit: 1000, category: 'image_editing' },
        true
      );
      expect(stats).toEqual({
        totalImageConversations: 3,
        totalGenerations: 2,
        totalEdits: 1,
        totalMessages: 9, // 2+4+3
      });
    });

    it('should return zero stats if no conversations are found', async () => {
      conversationHelpers.getUserConversations
        .mockResolvedValueOnce({ conversations: [] })
        .mockResolvedValueOnce({ conversations: [] });

      const stats = await enhancedImageService.getImageStats(mockUserId, mockReq);

      expect(stats).toEqual({
        totalImageConversations: 0,
        totalGenerations: 0,
        totalEdits: 0,
        totalMessages: 0,
      });
    });

    it('should return zero stats and log error on internal service error', async () => {
      conversationHelpers.getUserConversations.mockRejectedValue(new Error('DB error'));

      const stats = await enhancedImageService.getImageStats(mockUserId, mockReq);

      expect(logger.error).toHaveBeenCalledWith('Error getting image stats:', expect.any(Error));
      expect(stats).toEqual({
        totalImageConversations: 0,
        totalGenerations: 0,
        totalEdits: 0,
        totalMessages: 0,
      });
    });
  });
});