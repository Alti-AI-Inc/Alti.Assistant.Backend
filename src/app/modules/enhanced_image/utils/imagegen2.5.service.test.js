import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenAI } from '@google/genai';
import { GCPStorageService } from '../services/gcpStorageService.js';
import redisClient from '../../../../shared/redis.js';
import { checkImageGenerationLimit, recordImageGeneration } from '../../usage/usage.service.js';
import { imagen3 } from './imagegen2.5.service.js';

// Mock dependencies
vi.mock('@google/genai', () => {
  const mockGenerateContent = vi.fn();
  const GoogleGenAI = vi.fn().mockImplementation(() => ({
    models: {
      generateContent: mockGenerateContent,
    },
  }));
  return { GoogleGenAI };
});

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

vi.mock('../services/gcpStorageService.js', () => {
  const GCPStorageService = vi.fn().mockImplementation(() => ({
    uploadBuffer: vi.fn(),
  }));
  return { GCPStorageService };
});

vi.mock('../../../../../config/index.js', {
  default: {
    google: {
      gemini_image_model: 'test-model',
      gcp_project_id: 'test-project',
      vertex_ai_region: 'test-region',
    },
    gcp: {
      storage_bucket_name: 'test-bucket',
      key_file_path: '/fake/path/key.json',
    },
  },
});

vi.mock('../../../../shared/redis.js', () => {
  const mockExec = vi.fn();
  const mockIncr = vi.fn().mockImplementation(() => ({
    incr: vi.fn().mockReturnThis(),
    exec: mockExec,
  }));
  const mockMulti = vi.fn().mockImplementation(() => ({
    incr: mockIncr,
  }));
  return {
    default: {
      multi: mockMulti,
      expire: vi.fn(),
      _mockExec: mockExec, // Export for test control
    },
  };
});

vi.mock('../../usage/usage.service.js', () => ({
  checkImageGenerationLimit: vi.fn(),
  recordImageGeneration: vi.fn(),
}));

const {
  mockGenerateContent
} = vi.hoisted(() => {
  // Get mock instances for manipulation in tests
  const mockGenerateContent = new GoogleGenAI().models.generateContent;

  return {
    mockGenerateContent
  };
});
const mockUploadBuffer = new GCPStorageService().uploadBuffer;

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

// Define user contexts for different roles
const userContextUser = { id: 'user-123', workspaceId: 'ws-abc', role: 'user' };
const userContextManager = { id: 'manager-456', workspaceId: 'ws-abc', role: 'manager' };
const userContextAdmin = { id: 'admin-789', workspaceId: 'ws-abc', role: 'admin' };
const userContextSuperAdmin = { id: 'super-000', workspaceId: 'ws-xyz', role: 'super_admin' };

const mockAiImageResponse = {
  candidates: [{
    content: {
      parts: [{
        inlineData: {
          mimeType: 'image/png',
          data: 'fake-base64-image-data',
        },
      }],
    },
  }],
};

const mockAiTextResponse = {
  candidates: [{
    content: {
      parts: [{ text: 'I cannot generate this image.' }],
    },
  }],
};

const SAFE_UPLOADS_DIR = path.resolve(process.cwd(), 'temp_uploads');

describe('imagen3 Service', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    // Default happy path mocks
    uuidv4.mockReturnValue('mock-uuid');
    mockUploadBuffer.mockResolvedValue('https://storage.googleapis.com/test-bucket/mock-url.png');
    checkImageGenerationLimit.mockResolvedValue(true);
    recordImageGeneration.mockResolvedValue(undefined);
    fs.default.readFile.mockResolvedValue(Buffer.from('fake-image-bytes'));
    mockGenerateContent.mockResolvedValue(mockAiImageResponse);

    // Default Redis mock for success (not rate-limited)
    redisClient._mockExec.mockResolvedValue([
      [null, 1], // minute count
      [null, 10], // hour count
    ]);
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  describe('Input Validation', () => {
    it('should throw an error for missing user context', async () => {
      await expect(imagen3(null, 'a prompt')).rejects.toThrow('User context including ID, workspace ID, and role is required for image generation.');
    });

    it('should throw an error for incomplete user context', async () => {
      await expect(imagen3({ id: 'user-123', workspaceId: 'ws-abc' }, 'a prompt')).rejects.toThrow('User context including ID, workspace ID, and role is required for image generation.');
    });

    it('should throw an error for an empty prompt', async () => {
      await expect(imagen3(userContextUser, ' ')).rejects.toThrow('A non-empty prompt is required for image generation.');
    });

    it('should throw an error if the number of reference images exceeds the maximum (5)', async () => {
      const tooManyImages = new Array(6).fill({ path: 'path/to/img.png', mimeType: 'image/png' });
      await expect(imagen3(userContextUser, 'a prompt', tooManyImages)).rejects.toThrow('The number of reference images cannot exceed 5.');
    });
  });

  describe('Rate Limiting', () => {
    it('should throw a 429 error if the per-minute rate limit is exceeded', async () => {
      redisClient._mockExec.mockResolvedValue([
        [null, 6], // minute count > 5
        [null, 10], // hour count
      ]);
      const errorPromise = imagen3(userContextUser, 'a prompt');
      await expect(errorPromise).rejects.toThrow('Too many image generation requests. Please try again later.');
      await expect(errorPromise).rejects.toHaveProperty('status', 429);
    });

    it('should throw a 429 error if the per-hour rate limit is exceeded', async () => {
      redisClient._mockExec.mockResolvedValue([
        [null, 5], // minute count
        [null, 51], // hour count > 50
      ]);
      const errorPromise = imagen3(userContextUser, 'a prompt');
      await expect(errorPromise).rejects.toThrow('Too many image generation requests. Please try again later.');
      await expect(errorPromise).rejects.toHaveProperty('status', 429);
    });

    it('should set Redis key expiration on the first request in a window', async () => {
      redisClient._mockExec.mockResolvedValue([
        [null, 1], // First request in minute window
        [null, 1], // First request in hour window
      ]);
      await imagen3(userContextUser, 'a prompt');
      expect(redisClient.expire).toHaveBeenCalledWith(`rate-limit:imagegen:${userContextUser.id}:minute`, 60);
      expect(redisClient.expire).toHaveBeenCalledWith(`rate-limit:imagegen:${userContextUser.id}:hour`, 3600);
    });

    it('should not set Redis key expiration if not the first request', async () => {
      redisClient._mockExec.mockResolvedValue([
        [null, 2],
        [null, 2],
      ]);
      await imagen3(userContextUser, 'a prompt');
      expect(redisClient.expire).not.toHaveBeenCalled();
    });

    it('should proceed but log an error if Redis fails (fail-open)', async () => {
      const redisError = new Error('Redis connection failed');
      redisClient._mockExec.mockRejectedValue(redisError);

      await imagen3(userContextUser, 'a prompt');

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Redis connection error during rate limiting'), redisError);
      // Verify that the function continued execution
      expect(checkImageGenerationLimit).toHaveBeenCalledWith(userContextUser.workspaceId);
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  describe('Role-Based Access & Usage Limits', () => {
    it.each([
      { role: 'user', context: userContextUser },
      { role: 'manager', context: userContextManager },
      { role: 'admin', context: userContextAdmin },
    ])('should throw a 402 error for a "$role" if the workspace limit is reached', async ({ context }) => {
      checkImageGenerationLimit.mockResolvedValue(false);
      const errorPromise = imagen3(context, 'a prompt');
      await expect(errorPromise).rejects.toThrow('Workspace image generation limit reached.');
      await expect(errorPromise).rejects.toHaveProperty('status', 402);
      expect(checkImageGenerationLimit).toHaveBeenCalledWith(context.workspaceId);
    });

    it('should NOT check usage limits and proceed for a "super_admin" role', async () => {
      checkImageGenerationLimit.mockResolvedValue(false); // Set to false to prove it's not checked
      await imagen3(userContextSuperAdmin, 'a prompt');
      expect(checkImageGenerationLimit).not.toHaveBeenCalled();
      expect(mockGenerateContent).toHaveBeenCalled();
    });

    it('should proceed for a "user" role if the workspace limit has not been reached', async () => {
      checkImageGenerationLimit.mockResolvedValue(true);
      await imagen3(userContextUser, 'a prompt');
      expect(checkImageGenerationLimit).toHaveBeenCalledWith(userContextUser.workspaceId);
      expect(mockGenerateContent).toHaveBeenCalled();
    });
  });

  describe('Core Logic & Happy Path', () => {
    it('should successfully generate an image with only a prompt', async () => {
      const result = await imagen3(userContextUser, 'a beautiful landscape');
      expect(result).toBe('https://storage.googleapis.com/test-bucket/mock-url.png');
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'test-model',
        contents: [{ text: 'a beautiful landscape' }],
      });
      expect(mockUploadBuffer).toHaveBeenCalled();
      expect(recordImageGeneration).toHaveBeenCalledWith(userContextUser.id, userContextUser.workspaceId);
    });

    it('should generate a correct, tenant-isolated storage path', async () => {
      await imagen3(userContextUser, 'a prompt');
      const expectedPath = `workspaces/${userContextUser.workspaceId}/users/${userContextUser.id}/generated/mock-uuid.png`;
      const imageBuffer = Buffer.from('fake-base64-image-data', 'base64');
      expect(mockUploadBuffer).toHaveBeenCalledWith(imageBuffer, expectedPath, 'image/png');
    });

    it('should successfully generate an image with a prompt and reference images', async () => {
      const referenceImages = [
        { path: path.join(SAFE_UPLOADS_DIR, 'ref1.jpg'), mimeType: 'image/jpeg' },
        { path: path.join(SAFE_UPLOADS_DIR, 'ref2.png'), mimeType: 'image/png' },
      ];
      fs.default.readFile.mockResolvedValue(Buffer.from('fake-image-bytes'));

      await imagen3(userContextUser, 'merge these images', referenceImages);

      expect(fs.default.readFile).toHaveBeenCalledTimes(2);
      expect(fs.default.readFile).toHaveBeenCalledWith(referenceImages[0].path);
      expect(fs.default.readFile).toHaveBeenCalledWith(referenceImages[1].path);

      const expectedBase64 = Buffer.from('fake-image-bytes').toString('base64');
      expect(mockGenerateContent).toHaveBeenCalledWith({
        model: 'test-model',
        contents: [
          { text: 'merge these images' },
          { inlineData: { mimeType: 'image/jpeg', data: expectedBase64 } },
          { inlineData: { mimeType: 'image/png', data: expectedBase64 } },
        ],
      });
      expect(mockUploadBuffer).toHaveBeenCalled();
      expect(recordImageGeneration).toHaveBeenCalled();
    });
  });

  describe('Security & Error Handling', () => {
    it('should throw an error for a reference image path outside the safe directory (path traversal)', async () => {
      const maliciousPath = path.resolve(process.cwd(), '../secrets.txt');
      const referenceImages = [{ path: maliciousPath, mimeType: 'image/png' }];
      await expect(imagen3(userContextUser, 'a prompt', referenceImages)).rejects.toThrow('Access denied: Reference image path is outside the allowed directory.');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Security violation'));
    });

    it('should throw an error for an invalid reference image object', async () => {
      const invalidImages = [{ path: 'path/to/img.png' }]; // Missing mimeType
      await expect(imagen3(userContextUser, 'a prompt', invalidImages)).rejects.toThrow('Invalid reference image object. Both path and mimeType are required.');
    });



    it('should return null and log a warning if the AI model returns text instead of an image', async () => {
      mockGenerateContent.mockResolvedValue(mockAiTextResponse);
      const result = await imagen3(userContextUser, 'a prompt');
      expect(result).toBeNull();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('AI model did not return an image'));
      expect(mockUploadBuffer).not.toHaveBeenCalled();
      expect(recordImageGeneration).not.toHaveBeenCalled();
    });

    it('should throw an error if the AI model returns an invalid or empty response', async () => {
      mockGenerateContent.mockResolvedValue({ candidates: [] });
      await expect(imagen3(userContextUser, 'a prompt')).rejects.toThrow('Failed to generate image. The AI model returned an unexpected response.');
    });

    it('should re-throw errors from the GCP storage service', async () => {
      const storageError = new Error('GCS upload failed');
      mockUploadBuffer.mockRejectedValue(storageError);
      await expect(imagen3(userContextUser, 'a prompt')).rejects.toThrow('GCS upload failed');
    });

    it('should return the URL but log a critical error if usage recording fails', async () => {
      const usageError = new Error('DB connection error');
      recordImageGeneration.mockRejectedValue(usageError);

      const result = await imagen3(userContextUser, 'a prompt');

      expect(result).toBe('https://storage.googleapis.com/test-bucket/mock-url.png');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('CRITICAL: Failed to record image generation usage'), usageError);
    });
  });
});