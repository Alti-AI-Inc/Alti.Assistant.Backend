import { describe, it, expect, vi, beforeEach } from 'vitest';
import { imagegen_4 } from './imagegen4.service.js';

// Mock external dependencies
// Mock @google/genai
const mockGenerateImages = vi.fn();
const mockGoogleGenAI = vi.fn(() => ({
  models: {
    generateImages: mockGenerateImages,
  },
}));
vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

// Mock GCPStorageService
const mockUploadBuffer = vi.fn();
const mockGCPStorageService = vi.fn(() => ({
  uploadBuffer: mockUploadBuffer,
}));
vi.mock('../services/gcpStorageService.js', () => ({
  GCPStorageService: mockGCPStorageService,
}));

// Mock config
const mockConfig = {
  google: {
    gcp_project_id: 'test-project',
    vertex_ai_region: 'us-central1',
  },
};
vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig,
}));

// Mock console.error to prevent actual logging during tests and to assert calls
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

describe('imagegen_4', () => {
  const mockPrompt = 'A futuristic city at sunset';
  const mockImageBytes = 'base64encodedimagebytes';
  const mockUploadedUrl = 'https://storage.googleapis.com/test-bucket/imagen-1.png';
  const mockCustomFilename = 'my_custom_image.png';
  const mockCustomFilenameWithPath = '/tmp/my_custom_image.png';
  const expectedBasename = 'my_custom_image.png';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set up default successful mock responses
    mockGenerateImages.mockResolvedValue({
      generatedImages: [
        {
          image: {
            imageBytes: mockImageBytes,
          },
        },
      ],
    });
    mockUploadBuffer.mockResolvedValue(mockUploadedUrl);
    consoleErrorSpy.mockClear(); // Clear spy calls
  });

  it('should generate an image and upload it to GCP Storage with a default filename', async () => {
    const result = await imagegen_4(mockPrompt);

    // Verify GoogleGenAI initialization
    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      vertexAI: {
        project: mockConfig.google.gcp_project_id,
        location: mockConfig.google.vertex_ai_region,
      },
    });

    // Verify generateImages call
    expect(mockGenerateImages).toHaveBeenCalledWith({
      model: 'imagen-4.0-generate-001',
      prompt: mockPrompt,
      config: {
        numberOfImages: 1,
        personGeneration: 'allow_all',
        imageSize: '1K',
      },
    });

    // Verify Buffer creation and uploadBuffer call with default filename
    const expectedBuffer = Buffer.from(mockImageBytes, 'base64');
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer), // Check if it's a Buffer instance
      'imagen-1.png', // Default filename
      'image/png'
    );
    // More specific check for the buffer content
    expect(mockUploadBuffer.mock.calls[0][0].toString('base64')).toBe(expectedBuffer.toString('base64'));

    // Verify the returned URL
    expect(result).toBe(mockUploadedUrl);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should generate an image and upload it to GCP Storage with a custom filename', async () => {
    const result = await imagegen_4(mockPrompt, mockCustomFilename);

    expect(mockGenerateImages).toHaveBeenCalledOnce();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      mockCustomFilename, // Custom filename
      'image/png'
    );
    expect(result).toBe(mockUploadedUrl);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should generate an image and upload it to GCP Storage, using basename for a custom filename with path', async () => {
    const result = await imagegen_4(mockPrompt, mockCustomFilenameWithPath);

    expect(mockGenerateImages).toHaveBeenCalledOnce();
    expect(mockUploadBuffer).toHaveBeenCalledWith(
      expect.any(Buffer),
      expectedBasename, // Basename of the provided path
      'image/png'
    );
    expect(result).toBe(mockUploadedUrl);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('should throw an error if image generation fails', async () => {
    const genAIError = new Error('Failed to generate image from Google GenAI');
    mockGenerateImages.mockRejectedValue(genAIError);

    await expect(imagegen_4(mockPrompt)).rejects.toThrow(
      `Failed to generate or upload image: ${genAIError.message}`
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error during image generation or upload:',
      genAIError
    );
    expect(mockUploadBuffer).not.toHaveBeenCalled(); // Should not attempt to upload
  });

  it('should throw an error if image upload fails', async () => {
    const uploadError = new Error('Failed to upload image to GCP Storage');
    mockUploadBuffer.mockRejectedValue(uploadError);

    await expect(imagegen_4(mockPrompt)).rejects.toThrow(
      `Failed to generate or upload image: ${uploadError.message}`
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Error during image generation or upload:',
      uploadError
    );
    expect(mockGenerateImages).toHaveBeenCalledOnce(); // Should have generated image successfully
  });

  it('should return null if no images are generated (empty generatedImages array)', async () => {
    mockGenerateImages.mockResolvedValue({
      generatedImages: [], // Simulate an empty array, though unlikely with numberOfImages: 1
    });

    const result = await imagegen_4(mockPrompt);

    expect(mockGenerateImages).toHaveBeenCalledOnce();
    expect(mockUploadBuffer).not.toHaveBeenCalled(); // No images to upload
    expect(result).toBeNull(); // No URL returned if no images were processed
    expect(consoleErrorSpy).not.toHaveBeenCalled(); // No error if it's just an empty array
  });

  it('should use default vertexAI location if not provided in config', async () => {
    // Temporarily modify mockConfig for this test
    const originalVertexAIRegion = mockConfig.google.vertex_ai_region;
    delete mockConfig.google.vertex_ai_region;

    await imagegen_4(mockPrompt);

    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      vertexAI: {
        project: mockConfig.google.gcp_project_id,
        location: 'us-central1', // Expect default
      },
    });

    // Restore original config
    mockConfig.google.vertex_ai_region = originalVertexAIRegion;
  });
});