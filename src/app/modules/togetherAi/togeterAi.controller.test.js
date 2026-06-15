import { vi, describe, it, expect, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { TogetherAiController } from './togeterAi.controller.js';

const {
  mockGenerateImages,
  mockSendResponse,
  mockIncrementImagesUsed
} = vi.hoisted(() => {
  // Mock dependencies
  const mockGenerateImages = vi.fn();

  const mockSendResponse = vi.fn();

  const mockIncrementImagesUsed = vi.fn();

  return {
    mockGenerateImages,
    mockSendResponse,
    mockIncrementImagesUsed
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(() => ({
    models: {
      generateImages: mockGenerateImages,
    },
  })),
}));

vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'test-secret-key',
  },
}));

vi.mock('../../../shared/catchAsync.js', () => ({
  default: fn => fn, // Return the function itself for direct testing
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: mockSendResponse,
}));

vi.mock('../payment/payment.controller.js', () => ({
  paymentController: {
    incrementImagesUsed: mockIncrementImagesUsed,
  },
}));

describe('TogetherAiController', () => {
  let req;
  let res;

  beforeEach(() => {
    req = {
      body: {
        user: { _id: 'user123', email: 'test@example.com', role: 'user' },
        sessionId: 'session-abc',
        prompt: 'A futuristic city at sunset',
      },
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    vi.clearAllMocks();
  });

  describe('TogetherAiImgGeneration', () => {
    it('should generate an image and send a success response on valid input for a "user" role', async () => {
      // Arrange
      const mockImageBytes = Buffer.from('fake-image-data');
      const mockBase64Image = mockImageBytes.toString('base64');
      mockGenerateImages.mockResolvedValue({
        generatedImages: [{
          image: { imageBytes: mockImageBytes },
        }],
      });
      mockIncrementImagesUsed.mockResolvedValue({ success: true });

      // Act
      await TogetherAiController.TogetherAiImgGeneration(req, res);

      // Assert
      expect(mockGenerateImages).toHaveBeenCalledWith({
        model: 'imagen-4.0-generate-001',
        prompt: req.body.prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1',
        },
      });

      // Context Boundary Check: Ensure the correct user object is passed for usage tracking
      expect(mockIncrementImagesUsed).toHaveBeenCalledWith(req.body.user);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get Response successfully',
        data: {
          data: [{
            url: `data:image/png;base64,${mockBase64Image}`,
          }],
        },
      });
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should correctly handle requests from an "admin" role, passing their context to the payment controller', async () => {
      // Arrange
      req.body.user = { _id: 'admin456', email: 'admin@example.com', role: 'admin' };
      const mockImageBytes = Buffer.from('fake-image-data-for-admin');
      const mockBase64Image = mockImageBytes.toString('base64');
      mockGenerateImages.mockResolvedValue({
        generatedImages: [{
          image: { imageBytes: mockImageBytes },
        }],
      });
      mockIncrementImagesUsed.mockResolvedValue({ success: true });

      // Act
      await TogetherAiController.TogetherAiImgGeneration(req, res);

      // Assert
      // Context Boundary Check: Ensure the admin user object is passed for usage tracking
      expect(mockIncrementImagesUsed).toHaveBeenCalledWith(req.body.user);

      expect(mockSendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Get Response successfully',
        data: {
          data: [{
            url: `data:image/png;base64,${mockBase64Image}`,
          }],
        },
      });
    });

    it('should throw an error if the prompt is missing', async () => {
      // Arrange
      req.body.prompt = '';

      // Act & Assert
      await expect(TogetherAiController.TogetherAiImgGeneration(req, res)).rejects.toThrow(
        'Prompt is required for image generation.'
      );
      expect(mockGenerateImages).not.toHaveBeenCalled();
      expect(mockIncrementImagesUsed).not.toHaveBeenCalled();
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should throw an error if the AI API returns no image data', async () => {
      // Arrange
      mockGenerateImages.mockResolvedValue({ generatedImages: [] }); // No images in array

      // Act & Assert
      await expect(TogetherAiController.TogetherAiImgGeneration(req, res)).rejects.toThrow(
        'Imagen 4 returned no image data.'
      );

      // Arrange 2
      mockGenerateImages.mockResolvedValue({ generatedImages: [{ image: {} }] }); // No imageBytes property

      // Act & Assert 2
      await expect(TogetherAiController.TogetherAiImgGeneration(req, res)).rejects.toThrow(
        'Imagen 4 returned no image data.'
      );

      expect(mockGenerateImages).toHaveBeenCalledTimes(2);
      expect(mockIncrementImagesUsed).not.toHaveBeenCalled();
    });

    it('should return a 400 error if incrementImagesUsed reports failure (e.g., insufficient credits)', async () => {
      // Arrange
      const mockImageBytes = Buffer.from('fake-image-data');
      mockGenerateImages.mockResolvedValue({
        generatedImages: [{
          image: { imageBytes: mockImageBytes },
        }],
      });
      mockIncrementImagesUsed.mockResolvedValue({
        success: false,
        message: 'Insufficient credits.',
      });

      // Act
      await TogetherAiController.TogetherAiImgGeneration(req, res);

      // Assert
      expect(mockIncrementImagesUsed).toHaveBeenCalledWith(req.body.user);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Insufficient credits.',
      });
      expect(mockSendResponse).not.toHaveBeenCalled();
    });

    it('should return a 400 error if incrementImagesUsed throws an exception', async () => {
      // Arrange
      const mockImageBytes = Buffer.from('fake-image-data');
      mockGenerateImages.mockResolvedValue({
        generatedImages: [{
          image: { imageBytes: mockImageBytes },
        }],
      });
      const paymentError = new Error('Database connection failed');
      mockIncrementImagesUsed.mockRejectedValue(paymentError);

      // Act
      await TogetherAiController.TogetherAiImgGeneration(req, res);

      // Assert
      expect(mockIncrementImagesUsed).toHaveBeenCalledWith(req.body.user);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Database connection failed',
      });
      expect(mockSendResponse).not.toHaveBeenCalled();
    });
  });
});