import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateVideo,
  generateVideoWithVertexAI,
  getOperationStatus,
  checkVideoGenerationStatus,
  getAvailableVideoModels,
} from './videoService.js';
import { GoogleGenAI } from '@google/genai';
import { Storage } from '@google-cloud/storage';
import { GoogleAuth } from 'google-auth-library';
import globalConfig from '../../../../config/index.js'; // Adjust path as necessary

// Mock external dependencies
vi.mock('@google/genai');
vi.mock('@google-cloud/storage');
vi.mock('google-auth-library');
vi.mock('rate-limiter-flexible', () => ({
  RateLimiterRedis: class {
    constructor(opts) {
      this.opts = opts;
    }
    consume() {
      return Promise.resolve();
    }
  },
}));
vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-project-id',
      vertex_ai_region: 'us-central1',
      vertex_ai_endpoint: 'us-central1-aiplatform.googleapis.com',
      gcs_bucket_name: 'ai_video_inso',
    },
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('videoService', () => {
  let consoleLogSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockFetch.mockReset();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T12:00:00Z')); // Consistent Date.now()
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('generateVideo', () => {
    const mockGenerateVideos = vi.fn();
    const mockGetVideosOperation = vi.fn();
    const mockDownloadAsBuffer = vi.fn();
    const mockSave = vi.fn();
    const mockFile = { save: mockSave };
    const mockBucket = { file: vi.fn(() => mockFile) };

    beforeEach(() => {
      GoogleGenAI.mockImplementation(function() {
        return {
          models: {
            generateVideos: mockGenerateVideos,
          },
          operations: {
            getVideosOperation: mockGetVideosOperation,
          },
          files: {
            downloadAsBuffer: mockDownloadAsBuffer,
          },
        };
      });
      Storage.mockImplementation(function() {
        return {
          bucket: vi.fn(() => mockBucket),
        };
      });
    });

    it('should generate a video and upload it directly to GCS using video.uri', async () => {
      const prompt = 'A cat flying in space';
      const expectedVideoUri = 'https://genai.google.com/video/123.mp4';
      const expectedPublicUrl = `https://storage.googleapis.com/ai_video_inso/generated_video_1672574410000.mp4`;

      mockGenerateVideos.mockResolvedValueOnce({
        done: false,
        name: 'operations/123',
      });
      mockGetVideosOperation.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: expectedVideoUri } }],
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)), // Mock video content
      });
      mockSave.mockResolvedValueOnce();

      const promise = generateVideo({ prompt });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(GoogleGenAI).toHaveBeenCalledWith({
        vertexAI: {
          project: globalConfig.google.gcp_project_id,
          location: globalConfig.google.vertex_ai_region,
        },
      });
      expect(mockGenerateVideos).toHaveBeenCalledWith({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        config: { durationSeconds: 5, resolution: '1024x576' },
      });
      expect(mockGetVideosOperation).toHaveBeenCalledWith({ name: 'operations/123' });
      expect(mockFetch).toHaveBeenCalledWith(expectedVideoUri);
      expect(mockBucket.file).toHaveBeenCalledWith(`generated_video_${Date.now()}.mp4`);
      expect(mockSave).toHaveBeenCalledWith(expect.any(Buffer), {
        metadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });
      expect(result).toEqual({
        videoUrl: expectedPublicUrl,
        thumbnailUrl: expect.any(String),
        duration: 5,
        resolution: '1024x576',
        style: 'realistic',
        generatedAt: expect.any(String),
        prompt: prompt,
      });
    });

    it('should generate a video and upload it directly to GCS using ai.files.downloadAsBuffer if no video.uri', async () => {
      const prompt = 'A dog running in a field';
      const expectedVideoFileObject = { name: 'files/video-abc' };
      const expectedPublicUrl = `https://storage.googleapis.com/ai_video_inso/generated_video_1672574410000.mp4`;

      mockGenerateVideos.mockResolvedValueOnce({
        done: false,
        name: 'operations/456',
      });
      mockGetVideosOperation.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: expectedVideoFileObject }], // No URI here
        },
      });
      mockDownloadAsBuffer.mockResolvedValueOnce(Buffer.from('mock video content'));
      mockSave.mockResolvedValueOnce();

      const promise = generateVideo({ prompt });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockDownloadAsBuffer).toHaveBeenCalledWith({ file: expectedVideoFileObject });
      expect(mockBucket.file).toHaveBeenCalledWith(`generated_video_${Date.now()}.mp4`);
      expect(mockSave).toHaveBeenCalledWith(Buffer.from('mock video content'), {
        metadata: {
          contentType: 'video/mp4',
          cacheControl: 'public, max-age=31536000',
        },
        resumable: false,
      });
      expect(result.videoUrl).toBe(expectedPublicUrl);
    });

    it('should throw an error if video generation fails', async () => {
      const prompt = 'Failed video';
      const errorMessage = 'API error';
      mockGenerateVideos.mockRejectedValueOnce(new Error(errorMessage));

      const promise = generateVideo({ prompt });
      await expect(promise).rejects.toThrow(`Video generation failed: ${errorMessage}`);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error generating video:', expect.any(Error));
    });

    it('should throw an error if video fetch from URI fails', async () => {
      const prompt = 'Video fetch fail';
      const expectedVideoUri = 'https://genai.google.com/video/fail.mp4';

      mockGenerateVideos.mockResolvedValueOnce({
        done: false,
        name: 'operations/123',
      });
      mockGetVideosOperation.mockResolvedValueOnce({
        done: true,
        response: {
          generatedVideos: [{ video: { uri: expectedVideoUri } }],
        },
      });
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      const promise = generateVideo({ prompt });
      promise.catch(() => {}); // Prevent unhandled/async rejection warnings in Node
      await vi.runAllTimersAsync();
      await expect(promise).rejects.toThrow('Video generation failed: Failed to upload video directly to storage: Failed to fetch video from URI: Not Found');
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error uploading video directly to storage:', expect.any(Error));
    });

    it('should use default parameters if not provided', async () => {
      const prompt = 'Default test';
      const expectedVideoUri = 'https://genai.google.com/video/default.mp4';
      mockGenerateVideos.mockResolvedValueOnce({ done: false, name: 'op/1' });
      mockGetVideosOperation.mockResolvedValueOnce({ done: true, response: { generatedVideos: [{ video: { uri: expectedVideoUri } }] } });
      mockFetch.mockResolvedValueOnce({ ok: true, arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(8)) });
      mockSave.mockResolvedValueOnce();

      const promise = generateVideo({ prompt });
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(result.duration).toBe(5);
      expect(result.style).toBe('realistic');
      expect(result.resolution).toBe('1024x576');
    });
  });

  describe('generateVideoWithVertexAI', () => {
    const mockGetAccessToken = vi.fn();
    const mockGetClient = vi.fn();

    beforeEach(() => {
      GoogleAuth.mockImplementation(function() {
        return {
          getClient: mockGetClient.mockResolvedValue({
            getAccessToken: mockGetAccessToken.mockResolvedValue({ token: 'mock-vertex-token' }),
          }),
        };
      });
    });

    it('should successfully call Vertex AI predictLongRunning endpoint', async () => {
      const prompt = 'A futuristic city';
      const mockResponseData = {
        name: 'projects/test-project-id/locations/us-central1/operations/12345',
        metadata: {},
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockResponseData),
      });

      const result = await generateVideoWithVertexAI({ prompt });

      expect(GoogleAuth).toHaveBeenCalledWith({
        scopes: 'https://www.googleapis.com/auth/cloud-platform',
      });
      expect(mockGetClient).toHaveBeenCalled();
      expect(mockGetAccessToken).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        `https://${globalConfig.google.vertex_ai_endpoint}/v1/projects/${globalConfig.google.gcp_project_id}/locations/${globalConfig.google.vertex_ai_region}/publishers/google/models/veo-3.1-fast-generate-preview:predictLongRunning`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-vertex-token',
          },
          body: JSON.stringify({
            instances: [{ prompt: prompt }],
            parameters: {
              aspectRatio: '16:9',
              sampleCount: 1,
              storageUri: 'gs://ai_video_inso/',
            },
          }),
        }
      );
      expect(result).toEqual({ operationName: mockResponseData.name });
    });

    it('should throw an error if Vertex AI API call fails', async () => {
      const prompt = 'Error prompt';
      const errorResponse = { status: 400, statusText: 'Bad Request' };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(JSON.stringify(errorResponse)),
      });

      await expect(generateVideoWithVertexAI({ prompt })).rejects.toThrow(
        `HTTP error! status: 400, body: ${JSON.stringify(errorResponse)}`
      );
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // Error is thrown, not caught here
    });
  });

  describe('getOperationStatus', () => {
    const mockGetAccessToken = vi.fn();
    const mockGetClient = vi.fn();

    beforeEach(() => {
      GoogleAuth.mockImplementation(function() {
        return {
          getClient: mockGetClient.mockResolvedValue({
            getAccessToken: mockGetAccessToken.mockResolvedValue({ token: 'mock-vertex-token' }),
          }),
        };
      });
    });

    it('should successfully fetch operation status and convert GCS URI to public URL when done', async () => {
      const operationName = 'projects/test-project-id/locations/us-central1/operations/op123';
      const mockOperationResponse = {
        done: true,
        response: {
          videos: [{ gcsUri: 'gs://ai_video_inso/output/video.mp4' }],
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      const result = await getOperationStatus(operationName);

      expect(mockFetch).toHaveBeenCalledWith(
        `https://${globalConfig.google.vertex_ai_endpoint}/v1/${operationName}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-vertex-token',
          },
        }
      );
      expect(result).toEqual({
        ...mockOperationResponse,
        response: {
          ...mockOperationResponse.response,
          videoUrl: 'https://storage.googleapis.com/ai_video_inso/output/video.mp4',
        },
      });
    });

    it('should return operation status without public URL if not done', async () => {
      const operationName = 'projects/test-project-id/locations/us-central1/operations/op456';
      const mockOperationResponse = {
        done: false,
        metadata: { progress: 50 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      const result = await getOperationStatus(operationName);

      expect(result).toEqual(mockOperationResponse);
      expect(result.response?.videoUrl).toBeUndefined();
    });

    it('should throw an error if fetching operation status fails', async () => {
      const operationName = 'projects/test-project-id/locations/us-central1/operations/op789';
      const errorResponse = { status: 500, statusText: 'Internal Server Error' };
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: vi.fn().mockResolvedValue(JSON.stringify(errorResponse)),
      });

      await expect(getOperationStatus(operationName)).rejects.toThrow(
        `HTTP error! status: 500, body: ${JSON.stringify(errorResponse)}`
      );
    });
  });

  describe('checkVideoGenerationStatus', () => {
    const mockGetAccessToken = vi.fn();
    const mockGetClient = vi.fn();

    beforeEach(() => {
      GoogleAuth.mockImplementation(function() {
        return {
          getClient: mockGetClient.mockResolvedValue({
            getAccessToken: mockGetAccessToken.mockResolvedValue({ token: 'mock-vertex-token' }),
          }),
        };
      });
    });

    it('should return mock status for a generic job ID', async () => {
      const jobId = 'mock-job-123';
      const result = await checkVideoGenerationStatus(jobId);

      expect(result).toEqual({
        status: 'completed',
        videoUrl: `https://example.com/generated-videos/video_${jobId}.mp4`,
        progress: 100,
      });
      expect(mockFetch).not.toHaveBeenCalled(); // Should not call getOperationStatus
    });

    it('should call getOperationStatus for a Vertex AI operation ID (projects/)', async () => {
      const jobId = 'projects/test-project-id/locations/us-central1/operations/op123';
      const mockOperationResponse = {
        done: true,
        response: {
          videos: [{ gcsUri: 'gs://ai_video_inso/output/video.mp4' }],
          videoUrl: 'https://storage.googleapis.com/ai_video_inso/output/video.mp4', // Added by getOperationStatus
        },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      const result = await checkVideoGenerationStatus(jobId);

      expect(mockFetch).toHaveBeenCalled(); // Should call getOperationStatus
      expect(result).toEqual({
        id: jobId,
        status: 'completed',
        progress: 100,
        videoUrl: 'https://storage.googleapis.com/ai_video_inso/output/video.mp4',
        error: null,
        raw: mockOperationResponse,
      });
    });

    it('should call getOperationStatus for a Vertex AI operation ID (/operations/)', async () => {
      const jobId = 'projects/test-project-id/locations/us-central1/operations/op456'; // Shorter form also handled
      const mockOperationResponse = {
        done: false,
        metadata: { progress: 50 },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      const result = await checkVideoGenerationStatus(jobId);

      expect(mockFetch).toHaveBeenCalled(); // Should call getOperationStatus
      expect(result).toEqual({
        id: jobId,
        status: 'processing',
        progress: 50,
        videoUrl: null,
        error: null,
        raw: mockOperationResponse,
      });
    });

    it('should handle failed Vertex AI operation status', async () => {
      const jobId = 'projects/test-project-id/locations/us-central1/operations/op789';
      const mockOperationResponse = {
        done: true,
        error: { code: 500, message: 'Operation failed' },
      };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue(mockOperationResponse),
      });

      const result = await checkVideoGenerationStatus(jobId);

      expect(result).toEqual({
        id: jobId,
        status: 'failed',
        progress: 100,
        videoUrl: null,
        error: 'Operation failed',
        raw: mockOperationResponse,
      });
    });

    it('should throw an error if getOperationStatus fails', async () => {
      const jobId = 'projects/test-project-id/locations/us-central1/operations/op-error';
      const errorMessage = 'Network error';
      mockFetch.mockRejectedValueOnce(new Error(errorMessage));

      await expect(checkVideoGenerationStatus(jobId)).rejects.toThrow(
        `Failed to check video generation status: ${errorMessage}`
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking video generation status:', expect.any(Error));
    });
  });

  describe('getAvailableVideoModels', () => {
    it('should return a predefined list of video models', async () => {
      const models = await getAvailableVideoModels();
      expect(models).toEqual([
        {
          id: 'veo-3.1-fast-generate-preview',
          name: 'Google Veo 3.1 Fast',
          description: 'Optimized fast high-quality video generation model',
          maxDuration: 8,
          resolutions: ['720p', '1024x576'],
        },
        {
          id: 'veo-3.1-generate-preview',
          name: 'Google Veo 3.1 Standard',
          description: 'Cinematic high-fidelity video generation model',
          maxDuration: 10,
          resolutions: ['720p', '1080p', '1920x1080'],
        },
        {
          id: 'cinematic',
          name: 'Cinematic',
          description: 'Movie-like cinematic video generation',
          maxDuration: 8,
          resolutions: ['1920x1080', '2560x1440'],
        },
      ]);
    });
  });
});