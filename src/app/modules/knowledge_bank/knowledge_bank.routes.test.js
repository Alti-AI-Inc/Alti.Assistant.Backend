import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import multer from 'multer';
import { knowledgeBankController } from './knowledge_bank.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

// Mock dependencies
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

const mockAuthMiddleware = vi.fn((req, res, next) => next());
const mockExtractTenantContextMiddleware = vi.fn((req, res, next) => next());
const mockCheckRAGFeatureMiddleware = vi.fn((req, res, next) => next());
const mockCheckStorageLimitMiddleware = vi.fn((req, res, next) => next());
const mockUploadAnyMiddleware = vi.fn((req, res, next) => next());

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

const mockUpload = {
  any: vi.fn(() => mockUploadAnyMiddleware),
};
vi.mock('multer', () => ({
  default: vi.fn(() => mockUpload),
  memoryStorage: vi.fn(),
}));

vi.mock('./knowledge_bank.controller.js', () => ({
  knowledgeBankController: {
    uploadFile: vi.fn(),
    getUserFiles: vi.fn(),
    getFileById: vi.fn(),
    deleteFile: vi.fn(),
    processFile: vi.fn(),
    createFolder: vi.fn(),
    getUserFolders: vi.fn(),
    getFolderById: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    getFolderContents: vi.fn(),
    getUserStorageStats: vi.fn(),
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => mockAuthMiddleware),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContextMiddleware,
}));

vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: mockCheckRAGFeatureMiddleware,
}));

vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: mockCheckStorageLimitMiddleware,
}));

// Dynamically import the router file to ensure mocks are applied
await import('./knowledge_bank.routes.js');

describe('Knowledge Bank Routes', () => {
  beforeEach(() => {
    // The router methods are called only once when the module is imported.
    // We don't need to clear mocks for this type of test.
  });

  it('should ensure all routes are protected by auth and tenant context middlewares', () => {
    const totalRoutes =
      mockRouter.get.mock.calls.length +
      mockRouter.post.mock.calls.length +
      mockRouter.put.mock.calls.length +
      mockRouter.delete.mock.calls.length;

    expect(totalRoutes).toBe(12);

    const allCalls = [
      ...mockRouter.get.mock.calls,
      ...mockRouter.post.mock.calls,
      ...mockRouter.put.mock.calls,
      ...mockRouter.delete.mock.calls,
    ];

    allCalls.forEach(call => {
      const middlewares = call.slice(1); // all arguments after the path
      // Check for auth middleware (always first after path)
      expect(middlewares[0]).toBe(mockAuthMiddleware);
      // Check for tenant context middleware (always second after path)
      expect(middlewares[1]).toBe(mockExtractTenantContextMiddleware);
    });
  });

  describe('File Routes', () => {
    it('POST /upload should be configured with correct middlewares and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/upload',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        mockCheckStorageLimitMiddleware,
        mockUploadAnyMiddleware,
        mockCheckRAGFeatureMiddleware,
        knowledgeBankController.uploadFile
      );
    });

    it('GET /files should be configured with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/files',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.getUserFiles
      );
    });

    it('GET /files/:fileId should be configured with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/files/:fileId',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.getFileById
      );
    });

    it('DELETE /files/:fileId should be configured with correct middlewares and controller', () => {
      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/files/:fileId',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.deleteFile
      );
    });

    it('POST /files/:fileId/process should be configured with correct middlewares and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/files/:fileId/process',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        mockCheckRAGFeatureMiddleware,
        knowledgeBankController.processFile
      );
    });
  });

  describe('Folder Routes', () => {
    it('POST /folders should be configured with correct middlewares and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/folders',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        mockCheckRAGFeatureMiddleware,
        knowledgeBankController.createFolder
      );
    });

    it('GET /folders should be configured with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/folders',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.getUserFolders
      );
    });

    it('GET /folders/:folderId should be configured with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/folders/:folderId',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.getFolderById
      );
    });

    it('PUT /folders/:folderId should be configured with correct middlewares and controller', () => {
      expect(mockRouter.put).toHaveBeenCalledWith(
        '/folders/:folderId',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.updateFolder
      );
    });

    it('DELETE /folders/:folderId should be configured with correct middlewares and controller', () => {
      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/folders/:folderId',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.deleteFolder
      );
    });

    it('GET /folders/:folderId/contents should be configured with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/folders/:folderId/contents',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.getFolderContents
      );
    });
  });

  describe('Stats Routes', () => {
    it('GET /stats should be configured with correct middlewares and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/stats',
        mockAuthMiddleware,
        mockExtractTenantContextMiddleware,
        knowledgeBankController.getUserStorageStats
      );
    });
  });
});