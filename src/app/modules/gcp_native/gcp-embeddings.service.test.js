import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// Mock external dependencies
const {
  mockClientRequest,
  mockGetClient,
  mockConfig,
  mockLogger
} = vi.hoisted(() => {
  const mockClientRequest = vi.fn();
  const mockGetClient = vi.fn().mockImplementation(() => ({
    request: mockClientRequest,
  }));

  const mockConfig = {
    google: {
      gcp_project_id: 'test-project-id',
      gcp_location: 'us-central1',
    },
  };

  const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockClientRequest,
    mockGetClient,
    mockConfig,
    mockLogger
  };
});

vi.mock('google-auth-library', () => ({
  GoogleAuth: class {
    constructor() {}
    getClient = mockGetClient;
  }
}));

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Import the service after mocks are set up
// Using await import because the module creates an 'auth' instance at the top level,
// which needs the mocked GoogleAuth to be in place.
const { GcpEmbeddingsService } = await import('./gcp-embeddings.service.js');

describe('GcpEmbeddingsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Ensure default config values are present for most tests
    mockConfig.google.gcp_project_id = 'test-project-id';
    mockConfig.google.gcp_location = 'us-central1';
    // Reset process.env for project ID and location
    process.env = { ...originalEnv }; // Restore original env, then delete specific ones
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCP_LOCATION;
  });

  afterEach(() => {
    process.env = originalEnv; // Restore original process.env after all tests
  });

  describe('getTextEmbeddings', () => {
    it('should generate embeddings for a single text input successfully with default taskType', async () => {
      const mockEmbedding = Array(768).fill(0.123);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ embeddings: { values: mockEmbedding } }],
        },
      });

      const text = 'Hello, world!';
      const result = await GcpEmbeddingsService.getTextEmbeddings(text);

      expect(mockLogger.info).toHaveBeenCalledWith('Embeddings API: Generating embeddings for 1 inputs...');
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: `https://${mockConfig.google.gcp_location}-aiplatform.googleapis.com/v1/projects/${mockConfig.google.gcp_project_id}/locations/${mockConfig.google.gcp_location}/publishers/google/models/text-embedding-004:predict`,
        method: 'POST',
        data: { instances: [{ content: text, taskType: 'RETRIEVAL_DOCUMENT' }] }, // Default taskType
      });
      expect(result).toEqual({
        success: true,
        embeddings: mockEmbedding,
        model: 'text-embedding-004',
        dimensions: 768,
      });
    });

    it('should generate embeddings for an array of text inputs successfully with specified taskType', async () => {
      const mockEmbedding1 = Array(768).fill(0.1);
      const mockEmbedding2 = Array(768).fill(0.2);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [
            { embeddings: { values: mockEmbedding1 } },
            { embeddings: { values: mockEmbedding2 } },
          ],
        },
      });

      const texts = ['Text one', 'Text two'];
      const result = await GcpEmbeddingsService.getTextEmbeddings(texts, 'SEMANTIC_SIMILARITY');

      expect(mockLogger.info).toHaveBeenCalledWith('Embeddings API: Generating embeddings for 2 inputs...');
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: `https://${mockConfig.google.gcp_location}-aiplatform.googleapis.com/v1/projects/${mockConfig.google.gcp_project_id}/locations/${mockConfig.google.gcp_location}/publishers/google/models/text-embedding-004:predict`,
        method: 'POST',
        data: {
          instances: [
            { content: 'Text one', taskType: 'SEMANTIC_SIMILARITY' },
            { content: 'Text two', taskType: 'SEMANTIC_SIMILARITY' },
          ],
        },
      });
      expect(result).toEqual({
        success: true,
        embeddings: [mockEmbedding1, mockEmbedding2],
        model: 'text-embedding-004',
        dimensions: 768,
      });
    });

    it('should throw an error if GCP Project ID is not configured in config or process.env', async () => {
      mockConfig.google.gcp_project_id = null;
      delete process.env.GCP_PROJECT_ID; // Ensure it's not in env either

      await expect(GcpEmbeddingsService.getTextEmbeddings('test')).rejects.toThrow('GCP Project ID is not configured.');
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Embeddings Service Error:', expect.any(Error));
      expect(mockGetClient).not.toHaveBeenCalled();
      expect(mockClientRequest).not.toHaveBeenCalled();
    });

    it('should use GCP Project ID from process.env if config is missing', async () => {
      mockConfig.google.gcp_project_id = null;
      process.env.GCP_PROJECT_ID = 'env-project-id';
      const mockEmbedding = Array(768).fill(0.123);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ embeddings: { values: mockEmbedding } }],
        },
      });

      await GcpEmbeddingsService.getTextEmbeddings('test');
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/projects/env-project-id/'),
        })
      );
    });

    it('should use GCP Location from process.env if config is missing', async () => {
      mockConfig.google.gcp_location = null;
      process.env.GCP_LOCATION = 'europe-west1';
      const mockEmbedding = Array(768).fill(0.123);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ embeddings: { values: mockEmbedding } }],
        },
      });

      await GcpEmbeddingsService.getTextEmbeddings('test');
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://europe-west1-aiplatform.googleapis.com/'),
        })
      );
    });

    it('should handle API request failure gracefully', async () => {
      const errorMessage = 'API request failed';
      mockClientRequest.mockRejectedValueOnce(new Error(errorMessage));

      await expect(GcpEmbeddingsService.getTextEmbeddings('test')).rejects.toThrow(
        `GCP Embeddings generation failed: ${errorMessage}`
      );
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Embeddings Service Error:', expect.any(Error));
    });

    it('should return empty embeddings if API response data is malformed (no predictions)', async () => {
      mockClientRequest.mockResolvedValueOnce({ data: {} }); // No predictions
      const text = 'Test text';
      const result = await GcpEmbeddingsService.getTextEmbeddings(text);

      expect(result).toEqual({
        success: true,
        embeddings: [],
        model: 'text-embedding-004',
        dimensions: 768, // Default dimension
      });
    });

    it('should return empty embeddings if API response predictions are empty', async () => {
      mockClientRequest.mockResolvedValueOnce({ data: { predictions: [] } });
      const text = 'Test text';
      const result = await GcpEmbeddingsService.getTextEmbeddings(text);

      expect(result).toEqual({
        success: true,
        embeddings: [],
        model: 'text-embedding-004',
        dimensions: 768, // Default dimension
      });
    });

    it('should return empty embeddings and 0 dimensions if API response embeddings values are empty', async () => {
      mockClientRequest.mockResolvedValueOnce({ data: { predictions: [{ embeddings: { values: [] } }] } });
      const text = 'Test text';
      const result = await GcpEmbeddingsService.getTextEmbeddings(text);

      expect(result).toEqual({
        success: true,
        embeddings: [],
        model: 'text-embedding-004',
        dimensions: 0, // Dimension should be 0 if the first embedding is empty
      });
    });
  });

  describe('getMultimodalEmbeddings', () => {
    it('should generate multimodal embeddings for text input successfully', async () => {
      const mockTextEmbedding = Array(1408).fill(0.3);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ textEmbedding: mockTextEmbedding }],
        },
      });

      const text = 'Multimodal text input';
      const result = await GcpEmbeddingsService.getMultimodalEmbeddings(text);

      expect(mockLogger.info).toHaveBeenCalledWith('Embeddings API: Generating multimodal embedding (hasText: true, hasImage: false)...');
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: `https://${mockConfig.google.gcp_location}-aiplatform.googleapis.com/v1/projects/${mockConfig.google.gcp_project_id}/locations/${mockConfig.google.gcp_location}/publishers/google/models/multimodalembedding@001:predict`,
        method: 'POST',
        data: { instances: [{ text: text }] },
      });
      expect(result).toEqual({
        success: true,
        textEmbedding: mockTextEmbedding,
        imageEmbedding: null,
        model: 'multimodalembedding@001',
        dimensions: 1408,
      });
    });

    it('should generate multimodal embeddings for image buffer successfully', async () => {
      const mockImageEmbedding = Array(1408).fill(0.4);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ imageEmbedding: mockImageEmbedding }],
        },
      });

      const imageBuffer = Buffer.from('fake-image-data');
      const result = await GcpEmbeddingsService.getMultimodalEmbeddings(null, imageBuffer);

      expect(mockLogger.info).toHaveBeenCalledWith('Embeddings API: Generating multimodal embedding (hasText: false, hasImage: true)...');
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: `https://${mockConfig.google.gcp_location}-aiplatform.googleapis.com/v1/projects/${mockConfig.google.gcp_project_id}/locations/${mockConfig.google.gcp_location}/publishers/google/models/multimodalembedding@001:predict`,
        method: 'POST',
        data: { instances: [{ image: { bytesBase64Encoded: imageBuffer.toString('base64') } }] },
      });
      expect(result).toEqual({
        success: true,
        textEmbedding: null,
        imageEmbedding: mockImageEmbedding,
        model: 'multimodalembedding@001',
        dimensions: 1408,
      });
    });

    it('should generate multimodal embeddings for both text and image successfully', async () => {
      const mockTextEmbedding = Array(1408).fill(0.5);
      const mockImageEmbedding = Array(1408).fill(0.6);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ textEmbedding: mockTextEmbedding, imageEmbedding: mockImageEmbedding }],
        },
      });

      const text = 'Combined input';
      const imageBuffer = Buffer.from('another-fake-image');
      const result = await GcpEmbeddingsService.getMultimodalEmbeddings(text, imageBuffer);

      expect(mockLogger.info).toHaveBeenCalledWith('Embeddings API: Generating multimodal embedding (hasText: true, hasImage: true)...');
      expect(mockGetClient).toHaveBeenCalledTimes(1);
      expect(mockClientRequest).toHaveBeenCalledWith({
        url: `https://${mockConfig.google.gcp_location}-aiplatform.googleapis.com/v1/projects/${mockConfig.google.gcp_project_id}/locations/${mockConfig.google.gcp_location}/publishers/google/models/multimodalembedding@001:predict`,
        method: 'POST',
        data: {
          instances: [{
            text: text,
            image: { bytesBase64Encoded: imageBuffer.toString('base64') },
          }],
        },
      });
      expect(result).toEqual({
        success: true,
        textEmbedding: mockTextEmbedding,
        imageEmbedding: mockImageEmbedding,
        model: 'multimodalembedding@001',
        dimensions: 1408,
      });
    });

    it('should throw an error if GCP Project ID is not configured in config or process.env', async () => {
      mockConfig.google.gcp_project_id = null;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpEmbeddingsService.getMultimodalEmbeddings('test')).rejects.toThrow('GCP Project ID is not configured.');
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Multimodal Embeddings Service Error:', expect.any(Error));
      expect(mockGetClient).not.toHaveBeenCalled();
      expect(mockClientRequest).not.toHaveBeenCalled();
    });

    it('should use GCP Project ID from process.env if config is missing', async () => {
      mockConfig.google.gcp_project_id = null;
      process.env.GCP_PROJECT_ID = 'env-project-id';
      const mockTextEmbedding = Array(1408).fill(0.3);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ textEmbedding: mockTextEmbedding }],
        },
      });

      await GcpEmbeddingsService.getMultimodalEmbeddings('test');
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('/projects/env-project-id/'),
        })
      );
    });

    it('should use GCP Location from process.env if config is missing', async () => {
      mockConfig.google.gcp_location = null;
      process.env.GCP_LOCATION = 'europe-west1';
      const mockTextEmbedding = Array(1408).fill(0.3);
      mockClientRequest.mockResolvedValueOnce({
        data: {
          predictions: [{ textEmbedding: mockTextEmbedding }],
        },
      });

      await GcpEmbeddingsService.getMultimodalEmbeddings('test');
      expect(mockClientRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('https://europe-west1-aiplatform.googleapis.com/'),
        })
      );
    });

    it('should throw an error if neither text nor imageBuffer is provided', async () => {
      await expect(GcpEmbeddingsService.getMultimodalEmbeddings(null, null)).rejects.toThrow(
        'Either text or imageBuffer must be provided for multimodal embedding.'
      );
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Multimodal Embeddings Service Error:', expect.any(Error));
      expect(mockGetClient).not.toHaveBeenCalled();
      expect(mockClientRequest).not.toHaveBeenCalled();
    });

    it('should handle API request failure gracefully', async () => {
      const errorMessage = 'Multimodal API request failed';
      mockClientRequest.mockRejectedValueOnce(new Error(errorMessage));

      await expect(GcpEmbeddingsService.getMultimodalEmbeddings('test')).rejects.toThrow(
        `GCP Multimodal Embeddings failed: ${errorMessage}`
      );
      expect(mockLogger.error).toHaveBeenCalledWith('GCP Multimodal Embeddings Service Error:', expect.any(Error));
    });

    it('should return null embeddings if API response data is malformed (no predictions)', async () => {
      mockClientRequest.mockResolvedValueOnce({ data: {} }); // No predictions
      const text = 'Test text';
      const result = await GcpEmbeddingsService.getMultimodalEmbeddings(text);

      expect(result).toEqual({
        success: true,
        textEmbedding: null,
        imageEmbedding: null,
        model: 'multimodalembedding@001',
        dimensions: 1408, // Default dimension
      });
    });

    it('should return null embeddings if API response predictions are empty', async () => {
      mockClientRequest.mockResolvedValueOnce({ data: { predictions: [] } });
      const text = 'Test text';
      const result = await GcpEmbeddingsService.getMultimodalEmbeddings(text);

      expect(result).toEqual({
        success: true,
        textEmbedding: null,
        imageEmbedding: null,
        model: 'multimodalembedding@001',
        dimensions: 1408, // Default dimension
      });
    });

    it('should return null embeddings if API response embeddings are empty arrays', async () => {
      mockClientRequest.mockResolvedValueOnce({ data: { predictions: [{ textEmbedding: [], imageEmbedding: [] }] } });
      const text = 'Test text';
      const result = await GcpEmbeddingsService.getMultimodalEmbeddings(text);

      expect(result).toEqual({
        success: true,
        textEmbedding: null,
        imageEmbedding: null,
        model: 'multimodalembedding@001',
        dimensions: 1408, // Default dimension
      });
    });
  });
});