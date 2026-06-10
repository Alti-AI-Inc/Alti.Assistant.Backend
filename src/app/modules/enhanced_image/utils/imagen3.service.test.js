import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockUploadBuffer = vi.fn();
vi.mock('../services/gcpStorageService.js', () => {
  return {
    GCPStorageService: vi.fn().mockImplementation(() => {
      return {
        uploadBuffer: mockUploadBuffer,
      };
    }),
  };
});

const mockGenerateContent = vi.fn();
vi.mock('@google/genai', () => {
  return {
    GoogleGenAI: vi.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: mockGenerateContent,
        },
      };
    }),
  };
});

import { editImageWithImagen3, generateImageWithImagen3 } from './imagen3.service.js';

describe('imagen3.service.js', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('editImageWithImagen3', () => {
    it('should successfully edit an image with base64 prefix and upload to GCP', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'edited_base64_data',
                    mimeType: 'image/png',
                  },
                },
              ],
            },
          },
        ],
      });
      mockUploadBuffer.mockResolvedValue('https://gcp.com/edited.png');

      const result = await editImageWithImagen3(
        'make it blue',
        'data:image/png;base64,input_base64_data',
        'edited.png',
        'fake-api-key'
      );

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image',
        contents: [
          { text: 'make it blue' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'input_base64_data',
            },
          },
        ],
      });

      expect(mockUploadBuffer).toHaveBeenCalledWith(
        Buffer.from('edited_base64_data', 'base64'),
        'edited.png',
        'image/png'
      );

      expect(result).toEqual({
        url: 'https://gcp.com/edited.png',
        filename: 'edited.png',
        service: 'imagen3-edit',
        reasoning: 'Image edited using Gemini 3.1 Flash Image (Imagen 3)',
      });
    });

    it('should successfully edit an image without base64 prefix', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'edited_base64_data',
                  },
                },
              ],
            },
          },
        ],
      });
      mockUploadBuffer.mockResolvedValue('https://gcp.com/edited.png');

      await editImageWithImagen3(
        'make it blue',
        'input_base64_data',
        'edited.png',
        'fake-api-key'
      );

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'gemini-3.1-flash-image',
        contents: [
          { text: 'make it blue' },
          {
            inlineData: {
              mimeType: 'image/png',
              data: 'input_base64_data',
            },
          },
        ],
      });
    });

    it('should throw an error if the AI response is empty or invalid', async () => {
      mockGenerateContent.mockResolvedValue({});

      await expect(
        editImageWithImagen3('prompt', 'data', 'file.png', 'key')
      ).rejects.toThrow('Failed to edit image with Imagen 3: Invalid or empty response from AI model');
    });

    it('should throw an error if no inlineData is found in the response parts', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                { text: 'no image here' },
              ],
            },
          },
        ],
      });

      await expect(
        editImageWithImagen3('prompt', 'data', 'file.png', 'key')
      ).rejects.toThrow('Failed to edit image with Imagen 3: No image data (inlineData) found in AI model response.');
    });

    it('should throw an error if the AI model call fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      await expect(
        editImageWithImagen3('prompt', 'data', 'file.png', 'key')
      ).rejects.toThrow('Failed to edit image with Imagen 3: API Error');
    });
  });

  describe('generateImageWithImagen3', () => {
    it('should successfully generate an image and upload to GCP', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 'generated_base64_data',
                    mimeType: 'image/jpeg',
                  },
                },
              ],
            },
          },
        ],
      });
      mockUploadBuffer.mockResolvedValue('https://gcp.com/generated.png');

      const result = await generateImageWithImagen3(
        'a beautiful sunset',
        'generated.png',
        'fake-api-key'
      );

      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'imagen-3.0-generate-002',
        contents: [{ text: 'a beautiful sunset' }],
      });

      expect(mockUploadBuffer).toHaveBeenCalledWith(
        Buffer.from('generated_base64_data', 'base64'),
        'generated.png',
        'image/jpeg'
      );

      expect(result).toEqual({
        url: 'https://gcp.com/generated.png',
        filename: 'generated.png',
        service: 'imagen3-generate',
        reasoning: 'Image generated using Imagen 3.0 Generate 002',
      });
    });

    it('should throw an error if the AI response is empty or invalid', async () => {
      mockGenerateContent.mockResolvedValue({ candidates: [] });

      await expect(
        generateImageWithImagen3('prompt', 'file.png', 'key')
      ).rejects.toThrow('Failed to generate image with Imagen 3: Invalid or empty response from AI model');
    });

    it('should throw an error if no inlineData is found in the response parts', async () => {
      mockGenerateContent.mockResolvedValue({
        candidates: [
          {
            content: {
              parts: [
                { text: 'no image here' },
              ],
            },
          },
        ],
      });

      await expect(
        generateImageWithImagen3('prompt', 'file.png', 'key')
      ).rejects.toThrow('Failed to generate image with Imagen 3: No image data (inlineData) found in AI model response.');
    });

    it('should throw an error if the AI model call fails', async () => {
      mockGenerateContent.mockRejectedValue(new Error('API Error'));

      await expect(
        generateImageWithImagen3('prompt', 'file.png', 'key')
      ).rejects.toThrow('Failed to generate image with Imagen 3: API Error');
    });
  });
});