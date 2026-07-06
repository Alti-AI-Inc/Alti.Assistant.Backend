import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateImage, generateImageUsingVertexAI } from './googleService.js';

const {
  mockConfig,
  mockPredictionServiceClient,
  mockGoogleAuth
} = vi.hoisted(() => {
  // Mock external dependencies
  const mockConfig = {
    gcpProjectId: 'test-project-id',
    gcpLocation: 'us-central1',
    google: {
      vertex_ai_endpoint: 'test-vertex-ai-endpoint.googleapis.com',
      vertex_ai_region: 'us-central1',
      model_id: 'imagen-4.0-generate-preview-06-06', // This is the value from config, but the code hardcodes the model name in fetch
      gcp_project_id: 'test-project-id-2',
    },
  };

  const mockPredictionServiceClient = {
    predict: vi.fn(),
  };

  const mockGoogleAuth = vi.fn().mockImplementation(() => ({
    getClient: vi.fn().mockImplementation(() => Promise.resolve(mockGoogleAuthClient)),
  }));

  return {
    mockConfig,
    mockPredictionServiceClient,
    mockGoogleAuth
  };
});

const mockGoogleAuthClient = {
  getAccessToken: vi.fn().mockImplementation(() => Promise.resolve({ token: 'mock-access-token' })),
};

// Mock the modules
vi.mock('../../../../config/index.js', () => ({
  default: mockConfig,
}));

vi.mock('./llm.js', () => ({
  predictionServiceClient: mockPredictionServiceClient,
}));

vi.mock('google-auth-library', () => ({
  GoogleAuth: mockGoogleAuth,
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock console.error and console.log to prevent clutter during tests
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

describe('Image Generation Services', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockClear();
    consoleLogSpy.mockClear();
  });

  describe('generateImage', () => {
    const prompt = 'A futuristic city at sunset, highly detailed, cinematic.';
    const expectedEndpoint = `projects/${mockConfig.gcpProjectId}/locations/${mockConfig.gcpLocation}/publishers/google/models/imagen-4.0-generate-002`;
    const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent PNG

    it('should return a base64 image URL on successful generation', async () => {
      mockPredictionServiceClient.predict.mockResolvedValueOnce([
        {
          predictions: [
            {
              bytesBase64Encoded: mockBase64Image,
            },
          ],
        },
      ]);

      const result = await generateImage(prompt);

      expect(mockPredictionServiceClient.predict).toHaveBeenCalledTimes(1);
      expect(mockPredictionServiceClient.predict).toHaveBeenCalledWith({
        endpoint: expectedEndpoint,
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: '1:1',
          outputFormat: 'png',
        },
      });
      expect(result).toBe(`data:image/png;base64,${mockBase64Image}`);
      expect(consoleLogSpy).toHaveBeenCalledWith('Sending request to Vertex AI with prompt:', prompt);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return null if no predictions are returned', async () => {
      mockPredictionServiceClient.predict.mockResolvedValueOnce([
        {
          predictions: [], // Empty predictions array
        },
      ]);

      const result = await generateImage(prompt);

      expect(mockPredictionServiceClient.predict).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Vertex AI returned no predictions.');
    });

    it('should return null if predictions property is missing', async () => {
      mockPredictionServiceClient.predict.mockResolvedValueOnce([
        {}, // No predictions property
      ]);

      const result = await generateImage(prompt);

      expect(mockPredictionServiceClient.predict).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Vertex AI returned no predictions.');
    });

    it('should return null on API error', async () => {
      const apiError = new Error('Vertex AI API error');
      mockPredictionServiceClient.predict.mockRejectedValueOnce(apiError);

      const result = await generateImage(prompt);

      expect(mockPredictionServiceClient.predict).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating image with Vertex AI:', apiError);
    });
  });

  describe('generateImageUsingVertexAI', () => {
    const prompt = 'A serene landscape, digital art.';
    const mockBase64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='; // 1x1 transparent PNG
    // Note: The original code hardcodes the model name 'imagen-4.0-generate-preview-06-06' in the fetch URL,
    // instead of using config.google.model_id. The test reflects this current behavior.
    const expectedFetchUrl = `https://${mockConfig.google.vertex_ai_endpoint}/v1/projects/${mockConfig.google.gcp_project_id}/locations/${mockConfig.google.vertex_ai_region}/publishers/google/models/imagen-4.0-generate-preview-06-06:predict`;

    it('should return a base64 image URL on successful generation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          predictions: [
            {
              bytesBase64Encoded: mockBase64Image,
            },
          ],
        }),
      });

      const result = await generateImageUsingVertexAI(prompt);

      expect(mockGoogleAuth).toHaveBeenCalledTimes(1);
      expect(mockGoogleAuthClient.getAccessToken).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expectedFetchUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-access-token',
          },
          body: JSON.stringify({
            instances: [{ prompt: prompt }],
            parameters: {
              aspectRatio: '1:1',
              sampleCount: 1,
            },
          }),
        }
      );
      expect(result).toBe(`data:image/png;base64,${mockBase64Image}`);
      expect(consoleLogSpy).toHaveBeenCalledWith('Using access token for endpoint: mock-access-token');
      expect(consoleLogSpy).toHaveBeenCalledWith('Endpoint:', expectedFetchUrl);
      // The function logs the request body 'data', not the response.
      expect(consoleLogSpy).toHaveBeenCalledWith('Received response from Vertex AI:', expect.any(Object));
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if fetch response is not ok', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid prompt' }),
      };
      mockFetch.mockResolvedValueOnce(mockResponse);

      await expect(generateImageUsingVertexAI(prompt)).rejects.toThrow(
        `HTTP error! status: ${JSON.stringify(mockResponse)}`
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // The function throws, doesn't catch and log error
    });

    it('should throw an error if no predictions are returned in the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ predictions: [] }), // Empty predictions
      });

      await expect(generateImageUsingVertexAI(prompt)).rejects.toThrow(
        'No predictions returned from Vertex AI.'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if predictions property is missing from the response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ someOtherData: 'value' }), // Missing predictions
      });

      await expect(generateImageUsingVertexAI(prompt)).rejects.toThrow(
        'No predictions returned from Vertex AI.'
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if fetch fails', async () => {
      const fetchError = new Error('Network error');
      mockFetch.mockRejectedValueOnce(fetchError);

      await expect(generateImageUsingVertexAI(prompt)).rejects.toThrow(fetchError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return null if bytesBase64Encoded is missing from prediction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          predictions: [
            {
              // bytesBase64Encoded is missing
              someOtherProp: 'value'
            },
          ],
        }),
      });

      const result = await generateImageUsingVertexAI(prompt);
      expect(result).toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});