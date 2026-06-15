import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TogetherAiService } from './togeterAi.service.js';

// Mock dependencies
// Mock config to control the API key
vi.mock('../../../../config/index.js', () => ({
  default: {
    gemini_secret_key: 'mock-gemini-key',
  },
}));

// Mock GoogleGenAI and its methods
const mockGenerateImages = vi.fn();
const {
  mockGoogleGenAI
} = vi.hoisted(() => {
  const mockGoogleGenAI = vi.fn().mockImplementation(() => ({
    models: {
      generateImages: mockGenerateImages,
    },
  }));

  return {
    mockGoogleGenAI
  };
});

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

describe('TogetherAiService', () => {
  beforeEach(() => {
    // Reset mocks before each test to ensure isolation
    mockGenerateImages.mockReset();
    mockGoogleGenAI.mockClear();
  });

  describe('TogetherAiImgGenerationService', () => {
    const mockData = {
      user: 'testUser',
      sessionId: 'testSessionId',
      prompt: 'a beautiful landscape with mountains and a lake',
    };

    it('should successfully generate an image and return its base64 URL', async () => {
      // Mock image bytes (e.g., a simple "Hello" string converted to bytes)
      const mockImageBytes = new Uint8Array([72, 101, 108, 108, 111]);
      const expectedBase64 = Buffer.from(mockImageBytes).toString('base64');

      mockGenerateImages.mockResolvedValueOnce({
        generatedImages: [{
          image: {
            imageBytes: mockImageBytes,
          },
        }],
      });

      const result = await TogetherAiService.TogetherAiImgGenerationService(mockData);

      // Expect GoogleGenAI to be initialized with the mocked key
      expect(mockGoogleGenAI).toHaveBeenCalledWith({ apiKey: 'mock-gemini-key' });

      // Expect generateImages to be called with correct parameters
      expect(mockGenerateImages).toHaveBeenCalledWith({
        model: 'imagen-4.0-generate-001',
        prompt: mockData.prompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1',
        },
      });

      // Expect the result to be in the specified format with the base64 URL
      expect(result).toEqual({
        data: [{
          url: `data:image/png;base64,${expectedBase64}`,
        }],
      });
    });

    it('should throw an error if prompt is missing', async () => {
      const dataWithoutPrompt = { ...mockData, prompt: undefined };

      await expect(TogetherAiService.TogetherAiImgGenerationService(dataWithoutPrompt))
        .rejects
        .toThrow('Prompt is required for image generation.');
    });

    it('should throw an error if generateImages returns no generatedImages property', async () => {
      mockGenerateImages.mockResolvedValueOnce({}); // Simulate API response with no generatedImages

      await expect(TogetherAiService.TogetherAiImgGenerationService(mockData))
        .rejects
        .toThrow('Imagen 4 returned no image data.');
    });

    it('should throw an error if generateImages returns an empty generatedImages array', async () => {
      mockGenerateImages.mockResolvedValueOnce({ generatedImages: [] }); // Simulate API response with empty array

      await expect(TogetherAiService.TogetherAiImgGenerationService(mockData))
        .rejects
        .toThrow('Imagen 4 returned no image data.');
    });

    it('should throw an error if the first generated image has no "image" property', async () => {
      mockGenerateImages.mockResolvedValueOnce({
        generatedImages: [{ /* missing image property */ }],
      });

      await expect(TogetherAiService.TogetherAiImgGenerationService(mockData))
        .rejects
        .toThrow('Imagen 4 returned no image data.');
    });

    it('should throw an error if the first generated image has no "imageBytes" property', async () => {
      mockGenerateImages.mockResolvedValueOnce({
        generatedImages: [{
          image: { /* missing imageBytes property */ },
        }],
      });

      await expect(TogetherAiService.TogetherAiImgGenerationService(mockData))
        .rejects
        .toThrow('Imagen 4 returned no image data.');
    });

    it('should throw an error if the generateImages call itself rejects', async () => {
      const mockError = new Error('API call failed');
      mockGenerateImages.mockRejectedValueOnce(mockError);

      await expect(TogetherAiService.TogetherAiImgGenerationService(mockData))
        .rejects
        .toThrow(mockError);
    });
  });
});