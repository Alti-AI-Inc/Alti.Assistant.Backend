import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createImageController } from '../imageController.js';
import config from '../../../../../config/index.js'; // Import the actual config to mock it

// Mock the config module
vi.mock('../../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-api-key',
  },
}));

// Mock the dynamic import for imagen3.service.js
const mockEditImageWithImagen3 = vi.fn();
vi.mock('../utils/imagen3.service.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    editImageWithImagen3: mockEditImageWithImagen3,
  };
});

describe('imageController', () => {
  let sessionManager;
  let imageService;
  let promptService;
  let imageController;
  let req;
  let res;
  let consoleErrorSpy;

  beforeEach(() => {
    sessionManager = {
      getSession: vi.fn(),
      getConversationHistory: vi.fn(),
      deleteSession: vi.fn(),
    };
    imageService = {
      generateImage: vi.fn(),
    };
    promptService = {
      buildEnhancedPrompt: vi.fn(),
    };

    imageController = createImageController(
      sessionManager,
      imageService,
      promptService
    );

    req = {
      body: {},
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockRestore();
  });

  describe('editImage', () => {
    it('should successfully edit an image and return 200', async () => {
      const mockPrompt = 'Make the cat wear a tiny hat';
      const mockImageBase64 = 'data:image/png;base64,mockImageBase64';
      const mockEditedImageUrl = 'https://example.com/edited-image.png';

      req.body = { prompt: mockPrompt, imageBase64: mockImageBase64 };
      mockEditImageWithImagen3.mockResolvedValue(mockEditedImageUrl);

      await imageController.editImage(req, res);

      expect(mockEditImageWithImagen3).toHaveBeenCalledWith(
        mockPrompt,
        mockImageBase64,
        expect.stringMatching(/^image-edit-\d+\.png$/),
        config.default.gemini_secret_key
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        image: mockEditedImageUrl,
        prompt: mockPrompt,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 if prompt is missing', async () => {
      req.body = { imageBase64: 'data:image/png;base64,mockImageBase64' };

      await imageController.editImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'prompt is required',
      });
      expect(mockEditImageWithImagen3).not.toHaveBeenCalled();
    });

    it('should return 400 if imageBase64 is missing', async () => {
      req.body = { prompt: 'Make the cat wear a tiny hat' };

      await imageController.editImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'imageBase64 is required',
      });
      expect(mockEditImageWithImagen3).not.toHaveBeenCalled();
    });

    it('should return 500 if image editing service throws an error', async () => {
      const mockPrompt = 'Make the cat wear a tiny hat';
      const mockImageBase64 = 'data:image/png;base64,mockImageBase64';
      const mockError = new Error('Service unavailable');

      req.body = { prompt: mockPrompt, imageBase64: mockImageBase64 };
      mockEditImageWithImagen3.mockRejectedValue(mockError);

      await imageController.editImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: mockError.message,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error editing image:',
        mockError
      );
    });
  });

  describe('generateImage', () => {
    const mockSessionId = 'user-session-123';
    const mockGeneratedImageUrl = 'https://example.com/generated-image.png';

    it('should generate an image using a custom prompt and return 200', async () => {
      const mockCustomPrompt = 'A futuristic city at sunset';
      req.body = { sessionId: mockSessionId, prompt: mockCustomPrompt };

      sessionManager.getSession.mockReturnValue({ id: mockSessionId });
      imageService.generateImage.mockResolvedValue(mockGeneratedImageUrl);

      await imageController.generateImage(req, res);

      expect(sessionManager.getSession).toHaveBeenCalledWith(mockSessionId);
      expect(promptService.buildEnhancedPrompt).not.toHaveBeenCalled();
      expect(imageService.generateImage).toHaveBeenCalledWith(
        mockCustomPrompt,
        expect.stringMatching(/^image-user-session-123-\d+\.png$/)
      );
      expect(sessionManager.deleteSession).toHaveBeenCalledWith(mockSessionId);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        image: mockGeneratedImageUrl,
        prompt: mockCustomPrompt,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should generate an image using enhanced prompt from history and return 200', async () => {
      const mockConversationHistory = [
        { role: 'user', content: 'Draw a dog' },
        { role: 'assistant', content: 'Okay, what kind of dog?' },
      ];
      const mockEnhancedPrompt = 'A happy golden retriever playing in a park';
      req.body = { sessionId: mockSessionId };

      sessionManager.getSession.mockReturnValue({ id: mockSessionId });
      sessionManager.getConversationHistory.mockReturnValue(
        mockConversationHistory
      );
      promptService.buildEnhancedPrompt.mockResolvedValue(mockEnhancedPrompt);
      imageService.generateImage.mockResolvedValue(mockGeneratedImageUrl);

      await imageController.generateImage(req, res);

      expect(sessionManager.getSession).toHaveBeenCalledWith(mockSessionId);
      expect(sessionManager.getConversationHistory).toHaveBeenCalledWith(
        mockSessionId
      );
      expect(promptService.buildEnhancedPrompt).toHaveBeenCalledWith(
        mockConversationHistory
      );
      expect(imageService.generateImage).toHaveBeenCalledWith(
        mockEnhancedPrompt,
        expect.stringMatching(/^image-user-session-123-\d+\.png$/)
      );
      expect(sessionManager.deleteSession).toHaveBeenCalledWith(mockSessionId);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        image: mockGeneratedImageUrl,
        prompt: mockEnhancedPrompt,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 if sessionId is missing', async () => {
      req.body = { prompt: 'A custom prompt' }; // Missing sessionId

      await imageController.generateImage(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'sessionId is required',
      });
      expect(sessionManager.getSession).not.toHaveBeenCalled();
      expect(imageService.generateImage).not.toHaveBeenCalled();
    });

    it('should return 404 if session is not found', async () => {
      req.body = { sessionId: 'non-existent-session' };
      sessionManager.getSession.mockReturnValue(null);

      await imageController.generateImage(req, res);

      expect(sessionManager.getSession).toHaveBeenCalledWith(
        'non-existent-session'
      );
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Session not found',
      });
      expect(imageService.generateImage).not.toHaveBeenCalled();
      expect(sessionManager.deleteSession).not.toHaveBeenCalled();
    });

    it('should return 500 if promptService.buildEnhancedPrompt throws an error', async () => {
      const mockError = new Error('Failed to build prompt');
      req.body = { sessionId: mockSessionId };

      sessionManager.getSession.mockReturnValue({ id: mockSessionId });
      sessionManager.getConversationHistory.mockReturnValue([]);
      promptService.buildEnhancedPrompt.mockRejectedValue(mockError);

      await imageController.generateImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: mockError.message,
      });
      expect(imageService.generateImage).not.toHaveBeenCalled();
      expect(sessionManager.deleteSession).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error generating image:',
        mockError
      );
    });

    it('should return 500 if imageService.generateImage throws an error', async () => {
      const mockCustomPrompt = 'A futuristic city at sunset';
      const mockError = new Error('Image generation failed');
      req.body = { sessionId: mockSessionId, prompt: mockCustomPrompt };

      sessionManager.getSession.mockReturnValue({ id: mockSessionId });
      imageService.generateImage.mockRejectedValue(mockError);

      await imageController.generateImage(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: mockError.message,
      });
      expect(sessionManager.deleteSession).not.toHaveBeenCalled(); // Should not delete session on failure
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error generating image:',
        mockError
      );
    });
  });

  describe('generateImageDirect', () => {
    const mockPrompt = 'A serene landscape with a flowing river and mountains.';
    const mockGeneratedImageUrl = 'https://example.com/direct-image.png';

    it('should successfully generate an image directly and return 200', async () => {
      req.body = { prompt: mockPrompt };
      imageService.generateImage.mockResolvedValue(mockGeneratedImageUrl);

      await imageController.generateImageDirect(req, res);

      expect(imageService.generateImage).toHaveBeenCalledWith(
        mockPrompt,
        expect.stringMatching(/^image-direct-\d+\.png$/)
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        image: mockGeneratedImageUrl,
        prompt: mockPrompt,
      });
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 400 if prompt is missing', async () => {
      req.body = {}; // Missing prompt

      await imageController.generateImageDirect(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'prompt is required',
      });
      expect(imageService.generateImage).not.toHaveBeenCalled();
    });

    it('should return 500 if imageService.generateImage throws an error', async () => {
      const mockError = new Error('Direct image generation failed');
      req.body = { prompt: mockPrompt };
      imageService.generateImage.mockRejectedValue(mockError);

      await imageController.generateImageDirect(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: mockError.message,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error generating image:',
        mockError
      );
    });
  });
});