import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { rateLimit } from 'express-rate-limit';

import {
  uploadLimiterAuthenticated,
  uploadLimiterPublic,
  translationUploadMiddleware,
} from './uploadTranslation.js';
import WorkspaceService from '../../workspace/workspace.service.js';
import UsageService from '../../usage/usage.service.js';
import ApiError from '../../../utils/ApiError.js';

// Mock dependencies
vi.mock('multer');
vi.mock('fs');
vi.mock('express-rate-limit', () => ({
  rateLimit: vi.fn((options) => options),
}));
vi.mock('rate-limit-redis', () => ({
  RedisStore: vi.fn(),
}));
vi.mock('../../../config/redis.js', () => ({
  default: {
    sendCommand: vi.fn(),
  },
}));
vi.mock('../../workspace/workspace.service.js');
vi.mock('../../usage/usage.service.js');
vi.mock('../../../utils/ApiError.js');
vi.mock('../translation.constant.js', () => ({
  FILE_SIZE_LIMITS: { SUPER_ADMIN_MAX_FILE_SIZE: 104857600 }, // 100MB
  STORAGE_CONFIG: { TEMP_FOLDER: '/tmp/uploads' },
  SUPPORTED_DOCUMENT_FORMATS: ['.docx', '.pdf', '.txt'],
}));

describe('Upload Translation Middlewares', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      user: null,
      ip: '127.0.0.1',
    };
    res = {};
    next = vi.fn();

    vi.clearAllMocks();
  });

  describe('uploadLimiterAuthenticated', () => {
    it('should generate key from user ID if available', () => {
      req.user = { id: 'user-123' };
      const key = uploadLimiterAuthenticated.keyGenerator(req);
      expect(key).toBe('user-123');
    });

    it('should fall back to IP for key generation if user ID is not available', () => {
      const key = uploadLimiterAuthenticated.keyGenerator(req);
      expect(key).toBe('127.0.0.1');
    });

    it('should skip if user is not authenticated', () => {
      expect(uploadLimiterAuthenticated.skip(req)).toBe(true);
    });

    it('should not skip if user is authenticated', () => {
      req.user = { id: 'user-123' };
      expect(uploadLimiterAuthenticated.skip(req)).toBe(false);
    });

    it('should call the handler with an ApiError on rate limit exceeded', () => {
      const options = { statusCode: 429 };
      uploadLimiterAuthenticated.handler(req, res, next, options);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(
        429,
        'Too many file upload attempts. Please try again in 15 minutes.'
      );
    });
  });

  describe('uploadLimiterPublic', () => {
    it('should skip if user is authenticated', () => {
      req.user = { id: 'user-123' };
      expect(uploadLimiterPublic.skip(req)).toBe(true);
    });

    it('should not skip if user is not authenticated', () => {
      expect(uploadLimiterPublic.skip(req)).toBe(false);
    });

    it('should call the handler with an ApiError on rate limit exceeded', () => {
      const options = { statusCode: 429 };
      uploadLimiterPublic.handler(req, res, next, options);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(
        429,
        'Too many file upload attempts from this IP. Please try again in 15 minutes.'
      );
    });
  });

  describe('translationUploadMiddleware', () => {
    let mockUpload;

    beforeEach(() => {
      mockUpload = vi.fn((req, res, callback) => callback(null));
      const mockMulterInstance = {
        single: vi.fn().mockReturnValue(mockUpload),
      };
      multer.mockReturnValue(mockMulterInstance);
      multer.diskStorage = vi.fn((options) => options);
      multer.MulterError = class extends Error {
        constructor(code, field) {
          super(code);
          this.code = code;
          this.field = field;
          this.name = 'MulterError';
        }
      };
    });

    it('should call next with 401 ApiError if user is not authenticated', async () => {
      await translationUploadMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(401, 'Authentication required for file upload.');
    });

    it('should call next with 400 ApiError if non-super_admin user has no workspaceId', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: null };
      await translationUploadMiddleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(400, 'User is not associated with a workspace.');
    });

    it('should call next with 404 ApiError if workspace is not found', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
      WorkspaceService.findById.mockResolvedValue(null);
      await translationUploadMiddleware(req, res, next);
      expect(WorkspaceService.findById).toHaveBeenCalledWith('ws-1');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(404, 'Workspace or subscription plan not found.');
    });

    it('should call next with 429 ApiError if workspace usage limit is exceeded', async () => {
      req.user = { id: 'user-1', role: 'manager', workspaceId: 'ws-1' };
      const mockWorkspace = { id: 'ws-1', plan: { maxFileSize: 5242880 } };
      WorkspaceService.findById.mockResolvedValue(mockWorkspace);
      UsageService.getWorkspaceUsage.mockResolvedValue({
        usage: { monthlyDocuments: 100 },
        limits: { monthlyDocuments: 100 },
      });

      await translationUploadMiddleware(req, res, next);

      expect(UsageService.getWorkspaceUsage).toHaveBeenCalledWith('ws-1');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(
        429,
        'Workspace has exceeded its monthly document upload limit.'
      );
    });

    it('should handle super_admin role correctly', async () => {
      req.user = { id: 'su-1', role: 'super_admin' };
      fs.existsSync.mockReturnValue(false);

      await translationUploadMiddleware(req, res, next);

      const expectedDir = path.join('/tmp/uploads', 'super_admin');
      expect(WorkspaceService.findById).not.toHaveBeenCalled();
      expect(UsageService.getWorkspaceUsage).not.toHaveBeenCalled();
      expect(fs.existsSync).toHaveBeenCalledWith(expectedDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
      expect(multer).toHaveBeenCalledWith(
        expect.objectContaining({
          limits: { fileSize: 104857600 },
        })
      );
      expect(mockUpload).toHaveBeenCalled();
      expect(req.uploadContext).toEqual({
        destinationDir: expectedDir,
        fileSizeLimit: 104857600,
        bypassUsageCheck: true,
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle regular user role correctly', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
      const mockWorkspace = { id: 'ws-1', plan: { maxFileSize: 5242880 } };
      WorkspaceService.findById.mockResolvedValue(mockWorkspace);
      UsageService.getWorkspaceUsage.mockResolvedValue({
        usage: { monthlyDocuments: 50 },
        limits: { monthlyDocuments: 100 },
      });
      fs.existsSync.mockReturnValue(true);

      await translationUploadMiddleware(req, res, next);

      const expectedDir = path.join('/tmp/uploads', 'ws-1');
      expect(fs.existsSync).toHaveBeenCalledWith(expectedDir);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
      expect(multer).toHaveBeenCalledWith(
        expect.objectContaining({
          limits: { fileSize: 5242880 },
        })
      );
      expect(mockUpload).toHaveBeenCalled();
      expect(req.uploadContext).toEqual({
        destinationDir: expectedDir,
        fileSizeLimit: 5242880,
        bypassUsageCheck: false,
        workspaceId: 'ws-1',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle Multer LIMIT_FILE_SIZE error', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
      const mockWorkspace = { id: 'ws-1', plan: { maxFileSize: 1048576 } }; // 1MB
      WorkspaceService.findById.mockResolvedValue(mockWorkspace);
      UsageService.getWorkspaceUsage.mockResolvedValue({
        usage: { monthlyDocuments: 1 },
        limits: { monthlyDocuments: 100 },
      });
      fs.existsSync.mockReturnValue(true);

      const multerError = new multer.MulterError('LIMIT_FILE_SIZE');
      mockUpload.mockImplementation((req, res, callback) => callback(multerError));

      await translationUploadMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(413, 'File is too large. Maximum size is 1.00 MB.');
    });

    it('should handle other Multer errors', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
      const mockWorkspace = { id: 'ws-1', plan: { maxFileSize: 1048576 } };
      WorkspaceService.findById.mockResolvedValue(mockWorkspace);
      UsageService.getWorkspaceUsage.mockResolvedValue({
        usage: { monthlyDocuments: 1 },
        limits: { monthlyDocuments: 100 },
      });
      fs.existsSync.mockReturnValue(true);

      const multerError = new multer.MulterError('LIMIT_FIELD_COUNT', 'Too many fields');
      mockUpload.mockImplementation((req, res, callback) => callback(multerError));

      await translationUploadMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(400, `File upload error: ${multerError.message}`);
    });

    it('should handle custom fileFilter errors', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
      const mockWorkspace = { id: 'ws-1', plan: { maxFileSize: 1048576 } };
      WorkspaceService.findById.mockResolvedValue(mockWorkspace);
      UsageService.getWorkspaceUsage.mockResolvedValue({
        usage: { monthlyDocuments: 1 },
        limits: { monthlyDocuments: 100 },
      });
      fs.existsSync.mockReturnValue(true);

      const customError = new Error('Invalid file content');
      mockUpload.mockImplementation((req, res, callback) => callback(customError));

      await translationUploadMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(ApiError).toHaveBeenCalledWith(400, 'Invalid file content');
    });

    it('should catch and forward async errors during pre-validation', async () => {
      req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
      const dbError = new Error('Database connection failed');
      WorkspaceService.findById.mockRejectedValue(dbError);

      await translationUploadMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(dbError);
    });

    describe('Dynamic Multer Config', () => {
      beforeEach(async () => {
        req.user = { id: 'user-1', role: 'user', workspaceId: 'ws-1' };
        const mockWorkspace = { id: 'ws-1', plan: { maxFileSize: 5242880 } };
        WorkspaceService.findById.mockResolvedValue(mockWorkspace);
        UsageService.getWorkspaceUsage.mockResolvedValue({
          usage: { monthlyDocuments: 1 },
          limits: { monthlyDocuments: 100 },
        });
        fs.existsSync.mockReturnValue(true);
        await translationUploadMiddleware(req, res, next);
      });

      it('should configure fileFilter to accept supported formats', () => {
        const multerOptions = multer.mock.calls[0][0];
        const fileFilter = multerOptions.fileFilter;
        const cb = vi.fn();

        fileFilter(req, { originalname: 'document.docx' }, cb);
        expect(cb).toHaveBeenCalledWith(null, true);

        cb.mockClear();
        fileFilter(req, { originalname: 'report.pdf' }, cb);
        expect(cb).toHaveBeenCalledWith(null, true);
      });

      it('should configure fileFilter to reject unsupported formats', () => {
        const multerOptions = multer.mock.calls[0][0];
        const fileFilter = multerOptions.fileFilter;
        const cb = vi.fn();

        fileFilter(req, { originalname: 'image.jpg' }, cb);
        expect(cb).toHaveBeenCalledWith(expect.any(Error));
        expect(cb.mock.calls[0][0].message).toContain('File type not supported');
      });

      it('should configure storage destination correctly', () => {
        const storageOptions = multer.diskStorage.mock.calls[0][0];
        const cb = vi.fn();
        storageOptions.destination(req, {}, cb);
        expect(cb).toHaveBeenCalledWith(null, req.uploadContext.destinationDir);
      });

      it('should configure storage filename correctly', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2023-10-27T10:00:00Z'));
        const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

        const storageOptions = multer.diskStorage.mock.calls[0][0];
        const cb = vi.fn();
        storageOptions.filename(req, { originalname: 'test-file.txt' }, cb);

        const expectedTimestamp = 1698397200000; // Date.now()
        const expectedRandom = 123456789; // Math.round(Math.random() * 1e9)
        const expectedFilename = `translation-${expectedTimestamp}-${expectedRandom}.txt`;

        expect(cb).toHaveBeenCalledWith(null, expectedFilename);

        randomSpy.mockRestore();
        vi.useRealTimers();
      });
    });
  });
});