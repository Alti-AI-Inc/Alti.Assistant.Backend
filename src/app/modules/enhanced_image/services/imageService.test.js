import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ImageGenerationService } from './imageService.js';

// Mock external dependencies
vi.mock('../utils/imagegen2.5.service.js', () => ({
  imagen3: vi.fn(),
}));
vi.mock('../utils/imagegen4.service.js', () => ({
  imagegen_4: vi.fn(),
}));
vi.mock('../utils/intentClassifier.js', () => ({
  routeImageGenRequest: vi.fn(),
}));
vi.mock('path', () => ({
  default: {
    join: vi.fn((...args) => args.join('/')), // Mock path.join for consistent testing across OS
  },
}));

// Import the mocked modules to access their mock functions
import { imagen3 } from '../utils/imagegen2.5.service.js';
import { imagegen_4 } from '../utils/imagegen4.service.js';
import { routeImageGenRequest } from '../utils/intentClassifier.js';
import path from 'path'; // Import path to access its mock

describe('ImageGenerationService', () => {
  const mockApiKey = 'test-api-key';
  const mockImagesDir = '/mock/images';
  let service;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    service = new ImageGenerationService(mockApiKey, mockImagesDir);
  });

  it('should be instantiated correctly with apiKey and imagesDir', () => {
    expect(service.apiKey).toBe(mockApiKey);
    expect(service.imagesDir).toBe(mockImagesDir);
  });

  describe('generateImage', () => {
    const mockPrompt = 'a beautiful landscape';
    const mockFilename = 'test-image.jpg';
    const expectedFilepath = `${mockImagesDir}/${mockFilename}`; // Based on our path.join mock

    it('should call imagegen_4 and return correct data when intent classifier routes to "imagen4"', async () => {
      const mockImagen4Url = 'http://example.com/imagen4/test-image.jpg';
      routeImageGenRequest.mockResolvedValue({
        service: 'imagen4',
        reasoning: 'Prompt suggests high quality image',
        confidence: 0.95,
      });
      imagegen_4.mockResolvedValue(mockImagen4Url);

      const result = await service.generateImage(mockPrompt, mockFilename);

      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).toHaveBeenCalledWith(mockImagesDir, mockFilename);
      expect(imagegen_4).toHaveBeenCalledWith(mockPrompt, expectedFilepath);
      expect(imagen3).not.toHaveBeenCalled(); // Ensure imagen3 is not called

      expect(result).toEqual({
        filename: mockFilename,
        url: mockImagen4Url,
        service: 'imagen4',
        reasoning: 'Prompt suggests high quality image',
        confidence: 0.95,
      });
    });

    it('should call imagen3 and return correct data when intent classifier routes to "gemini2.5flash"', async () => {
      const mockImagen3Url = 'http://example.com/gemini2.5flash/test-image.jpg';
      routeImageGenRequest.mockResolvedValue({
        service: 'gemini2.5flash',
        reasoning: 'Prompt suggests quick generation',
        confidence: 0.88,
      });
      imagen3.mockResolvedValue(mockImagen3Url);

      const result = await service.generateImage(mockPrompt, mockFilename);

      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).toHaveBeenCalledWith(mockImagesDir, mockFilename);
      expect(imagen3).toHaveBeenCalledWith(mockPrompt, null, mockFilename);
      expect(imagegen_4).not.toHaveBeenCalled(); // Ensure imagegen_4 is not called

      expect(result).toEqual({
        filename: mockFilename,
        url: mockImagen3Url,
        service: 'gemini2.5flash',
        reasoning: 'Prompt suggests quick generation',
        confidence: 0.88,
      });
    });

    it('should return undefined url if intent classifier routes to an unknown service', async () => {
      routeImageGenRequest.mockResolvedValue({
        service: 'unknown_service',
        reasoning: 'No specific service matched',
        confidence: 0.5,
      });

      const result = await service.generateImage(mockPrompt, mockFilename);

      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).toHaveBeenCalledWith(mockImagesDir, mockFilename);
      expect(imagegen_4).not.toHaveBeenCalled();
      expect(imagen3).not.toHaveBeenCalled();

      expect(result).toEqual({
        filename: mockFilename,
        url: undefined, // Expect publicUrl to be undefined as no service matched
        service: 'unknown_service',
        reasoning: 'No specific service matched',
        confidence: 0.5,
      });
    });

    it('should handle errors from routeImageGenRequest', async () => {
      const mockError = new Error('Failed to classify intent');
      routeImageGenRequest.mockRejectedValue(mockError);

      await expect(service.generateImage(mockPrompt, mockFilename)).rejects.toThrow(mockError);
      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).not.toHaveBeenCalled(); // Should not proceed to path.join if intent classification fails
      expect(imagegen_4).not.toHaveBeenCalled();
      expect(imagen3).not.toHaveBeenCalled();
    });

    it('should handle errors from imagegen_4', async () => {
      const mockError = new Error('Imagegen4 failed');
      routeImageGenRequest.mockResolvedValue({
        service: 'imagen4',
        reasoning: 'Prompt suggests high quality image',
        confidence: 0.95,
      });
      imagegen_4.mockRejectedValue(mockError);

      await expect(service.generateImage(mockPrompt, mockFilename)).rejects.toThrow(mockError);
      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).toHaveBeenCalledWith(mockImagesDir, mockFilename);
      expect(imagegen_4).toHaveBeenCalledWith(mockPrompt, expectedFilepath);
      expect(imagen3).not.toHaveBeenCalled();
    });

    it('should handle errors from imagen3', async () => {
      const mockError = new Error('Imagen3 failed');
      routeImageGenRequest.mockResolvedValue({
        service: 'gemini2.5flash',
        reasoning: 'Prompt suggests quick generation',
        confidence: 0.88,
      });
      imagen3.mockRejectedValue(mockError);

      await expect(service.generateImage(mockPrompt, mockFilename)).rejects.toThrow(mockError);
      expect(routeImageGenRequest).toHaveBeenCalledWith(mockPrompt, { apiKey: mockApiKey });
      expect(path.join).toHaveBeenCalledWith(mockImagesDir, mockFilename);
      expect(imagen3).toHaveBeenCalledWith(mockPrompt, null, mockFilename);
      expect(imagegen_4).not.toHaveBeenCalled();
    });
  });
});