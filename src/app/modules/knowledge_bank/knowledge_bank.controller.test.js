import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock http-status codes
const httpStatus = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
};

// Mock shared utilities
// For testing purposes, catchAsync will just execute the function directly.
// The controller's internal try/catch blocks handle errors and call sendResponse.
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const {
  logger
} = vi.hoisted(() => {
  const logger = {
    info: vi.fn(),
    error: vi.fn(),
  };

  return {
    logger
  };
});
const sendResponse = vi.fn();

// Mock service and model
const knowledgeBankService = {
  uploadFile: vi.fn(),
  processUploadedFile: vi.fn(),
  getUserFiles: vi.fn(),
  getFileById: vi.fn(),
  deleteFile: vi.fn(),
  getUserStorageStats: vi.fn(),
  createFolder: vi.fn(),
  getUserFolders: vi.fn(),
  getFolderById: vi.fn(),
  updateFolder: vi.fn(),
  deleteFolder: vi.fn(),
  getFolderContents: vi.fn(),
};

const UserUsageModel = {
  updateStorage: vi.fn(),
};

// Mock the actual module imports
vi.mock('http-status', () => ({ default: httpStatus }));
vi.mock('../../../shared/catchAsync.js', () => ({ default: catchAsync }));
vi.mock('../../../shared/logger.js', () => ({ logger }));
vi.mock('../../../shared/sendResponse.js', () => ({ default: sendResponse }));
vi.mock('./knowledge_bank.service.js', () => ({ knowledgeBankService }));
vi.mock('../usage/userUsage.model.js', () => ({ default: UserUsageModel }));

// Import the actual controller after mocks are set up
import { knowledgeBankController } from '../knowledge_bank.controller.js';

describe('KnowledgeBank Controller', () => {
  let req, res, next;
  const userId = 'testUserId123';
  const tenantId = 'testTenantId456';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    req = {
      user: { userId: userId },
      files: [],
      body: {},
      params: {},
      query: {},
      ip: '127.0.0.1',
      currentTenantId: tenantId,
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn(); // For catchAsync error handling, though controller handles most errors internally
  });

  // --- uploadFile tests ---
  describe('uploadFile', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      await knowledgeBankController.uploadFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if no file is provided', async () => {
      await knowledgeBankController.uploadFile(req, res, next); // req.files is empty by default

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'No file provided',
      });
      expect(knowledgeBankService.uploadFile).not.toHaveBeenCalled();
    });

    it('should upload file successfully and update storage', async () => {
      const uploadedFile = {
        originalname: 'test.pdf',
        size: 1024,
        buffer: Buffer.from('file content'),
      };
      req.files = [uploadedFile];
      knowledgeBankService.uploadFile.mockResolvedValue({ fileId: 'file1', url: 'http://example.com/file1' });
      UserUsageModel.updateStorage.mockResolvedValue({});

      await knowledgeBankController.uploadFile(req, res, next);

      expect(knowledgeBankService.uploadFile).toHaveBeenCalledWith(
        uploadedFile,
        userId,
        {
          description: undefined,
          tags: [],
          folderId: null,
          uploadSource: 'web',
          ipAddress: req.ip,
          metadata: {},
        },
        req
      );
      expect(UserUsageModel.updateStorage).toHaveBeenCalledWith(userId, tenantId, uploadedFile.size);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File uploaded successfully',
        data: { fileId: 'file1', url: 'http://example.com/file1' },
      });
      expect(logger.info).toHaveBeenCalledWith(
        `[KnowledgeBank] File upload by user: ${userId}, file: ${uploadedFile.originalname}`
      );
    });

    it('should upload file with description, tags, folderId, metadata and process immediately', async () => {
      const uploadedFile = {
        originalname: 'test.docx',
        size: 2048,
        buffer: Buffer.from('doc content'),
      };
      req.files = [uploadedFile];
      req.body = {
        description: 'A test document',
        tags: JSON.stringify(['tag1', 'tag2']),
        folderId: 'folder123',
        metadata: JSON.stringify({ author: 'Test User' }),
        processImmediately: 'true',
      };
      knowledgeBankService.uploadFile.mockResolvedValue({ fileId: 'file2', url: 'http://example.com/file2' });
      UserUsageModel.updateStorage.mockResolvedValue({});
      knowledgeBankService.processUploadedFile.mockResolvedValue({});

      await knowledgeBankController.uploadFile(req, res, next);

      expect(knowledgeBankService.uploadFile).toHaveBeenCalledWith(
        uploadedFile,
        userId,
        {
          description: 'A test document',
          tags: ['tag1', 'tag2'],
          folderId: 'folder123',
          uploadSource: 'web',
          ipAddress: req.ip,
          metadata: { author: 'Test User' },
        },
        req
      );
      expect(UserUsageModel.updateStorage).toHaveBeenCalledWith(userId, tenantId, uploadedFile.size);
      expect(knowledgeBankService.processUploadedFile).toHaveBeenCalledWith('file2', req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File uploaded successfully',
        data: { fileId: 'file2', url: 'http://example.com/file2' },
      });
      expect(logger.info).toHaveBeenCalledWith(`[KnowledgeBank] File processed: file2`);
    });

    it('should return BAD_REQUEST for invalid JSON tags', async () => {
      req.files = [{ originalname: 'test.txt', size: 500 }];
      req.body = { tags: 'not-json' };

      await knowledgeBankController.uploadFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Invalid JSON format for tags',
      });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[KnowledgeBank] Invalid JSON for tags in uploadFile:'));
      expect(knowledgeBankService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST for invalid JSON metadata', async () => {
      req.files = [{ originalname: 'test.txt', size: 500 }];
      req.body = { metadata: '{invalid json' };

      await knowledgeBankController.uploadFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Invalid JSON format for metadata',
      });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('[KnowledgeBank] Invalid JSON for metadata in uploadFile:'));
      expect(knowledgeBankService.uploadFile).not.toHaveBeenCalled();
    });

    it('should handle service error during file upload', async () => {
      req.files = [{ originalname: 'error.txt', size: 100 }];
      const serviceError = new Error('Upload failed');
      knowledgeBankService.uploadFile.mockRejectedValue(serviceError);

      await knowledgeBankController.uploadFile(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] File upload error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: serviceError.message,
      });
      expect(UserUsageModel.updateStorage).not.toHaveBeenCalled();
    });

    it('should log storage increment error but still send success response', async () => {
      const uploadedFile = {
        originalname: 'test.pdf',
        size: 1024,
        buffer: Buffer.from('file content'),
      };
      req.files = [uploadedFile];
      knowledgeBankService.uploadFile.mockResolvedValue({ fileId: 'file1', url: 'http://example.com/file1' });
      const storageError = new Error('Storage update failed');
      UserUsageModel.updateStorage.mockRejectedValue(storageError);

      await knowledgeBankController.uploadFile(req, res, next);

      expect(knowledgeBankService.uploadFile).toHaveBeenCalled();
      expect(UserUsageModel.updateStorage).toHaveBeenCalledWith(userId, tenantId, uploadedFile.size);
      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Storage increment error:', storageError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File uploaded successfully',
        data: { fileId: 'file1', url: 'http://example.com/file1' },
      });
    });

    it('should log processing error but still send success response', async () => {
      const uploadedFile = {
        originalname: 'test.pdf',
        size: 1024,
        buffer: Buffer.from('file content'),
      };
      req.files = [uploadedFile];
      req.body.processImmediately = 'true';
      knowledgeBankService.uploadFile.mockResolvedValue({ fileId: 'file1', url: 'http://example.com/file1' });
      UserUsageModel.updateStorage.mockResolvedValue({});
      const processingError = new Error('Processing failed');
      knowledgeBankService.processUploadedFile.mockRejectedValue(processingError);

      await knowledgeBankController.uploadFile(req, res, next);

      expect(knowledgeBankService.uploadFile).toHaveBeenCalled();
      expect(knowledgeBankService.processUploadedFile).toHaveBeenCalledWith('file1', req);
      expect(logger.error).toHaveBeenCalledWith(`[KnowledgeBank] Error processing file: file1`, processingError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File uploaded successfully',
        data: { fileId: 'file1', url: 'http://example.com/file1' },
      });
    });
  });

  // --- getUserFiles tests ---
  describe('getUserFiles', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      await knowledgeBankController.getUserFiles(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getUserFiles).not.toHaveBeenCalled();
    });

    it('should retrieve user files with default filters', async () => {
      const mockFiles = [{ id: 'f1', name: 'file1' }];
      knowledgeBankService.getUserFiles.mockResolvedValue({ data: mockFiles, total: 1 });

      await knowledgeBankController.getUserFiles(req, res, next);

      expect(knowledgeBankService.getUserFiles).toHaveBeenCalledWith(
        userId,
        { limit: 100, skip: 0, folderId: undefined, fileType: undefined, isProcessed: undefined, processingStatus: undefined },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Files retrieved successfully',
        data: {
          files: mockFiles,
          totalCount: 1,
          filters: { fileType: undefined, processingStatus: undefined, isProcessed: undefined },
        },
      });
    });

    it('should retrieve user files with specific query filters', async () => {
      req.query = {
        fileType: 'pdf',
        processingStatus: 'completed',
        isProcessed: 'true',
        folderId: 'folderABC',
        limit: '50',
        skip: '10',
      };
      const mockFiles = [{ id: 'f2', name: 'file2' }];
      knowledgeBankService.getUserFiles.mockResolvedValue({ data: mockFiles, total: 1 });

      await knowledgeBankController.getUserFiles(req, res, next);

      expect(knowledgeBankService.getUserFiles).toHaveBeenCalledWith(
        userId,
        {
          fileType: 'pdf',
          processingStatus: 'completed',
          isProcessed: true,
          folderId: 'folderABC',
          limit: 50,
          skip: 10,
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Files retrieved successfully',
        data: {
          files: mockFiles,
          totalCount: 1,
          filters: { fileType: 'pdf', processingStatus: 'completed', isProcessed: true },
        },
      });
    });

    it('should handle isProcessed=false and folderId=null', async () => {
      req.query = {
        isProcessed: 'false',
        folderId: 'null',
      };
      const mockFiles = [{ id: 'f3', name: 'file3' }];
      knowledgeBankService.getUserFiles.mockResolvedValue({ data: mockFiles, total: 1 });

      await knowledgeBankController.getUserFiles(req, res, next);

      expect(knowledgeBankService.getUserFiles).toHaveBeenCalledWith(
        userId,
        {
          limit: 100,
          skip: 0,
          fileType: undefined,
          processingStatus: undefined,
          isProcessed: false,
          folderId: null,
        },
        req
      );
    });

    it('should handle service error during file retrieval', async () => {
      const serviceError = new Error('Failed to get files');
      knowledgeBankService.getUserFiles.mockRejectedValue(serviceError);

      await knowledgeBankController.getUserFiles(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Get user files error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving files',
      });
    });
  });

  // --- getFileById tests ---
  describe('getFileById', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.fileId = 'someFileId';
      await knowledgeBankController.getFileById(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getFileById).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if fileId is missing', async () => {
      req.params.fileId = undefined;
      await knowledgeBankController.getFileById(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID is required',
      });
      expect(knowledgeBankService.getFileById).not.toHaveBeenCalled();
    });

    it('should retrieve file by ID successfully', async () => {
      const fileId = 'file123';
      const mockFile = { id: fileId, name: 'document.pdf' };
      req.params.fileId = fileId;
      knowledgeBankService.getFileById.mockResolvedValue(mockFile);

      await knowledgeBankController.getFileById(req, res, next);

      expect(knowledgeBankService.getFileById).toHaveBeenCalledWith(fileId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File retrieved successfully',
        data: mockFile,
      });
    });

    it('should return NOT_FOUND if file is not found', async () => {
      const fileId = 'nonExistentFile';
      req.params.fileId = fileId;
      knowledgeBankService.getFileById.mockResolvedValue(null);

      await knowledgeBankController.getFileById(req, res, next);

      expect(knowledgeBankService.getFileById).toHaveBeenCalledWith(fileId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
    });

    it('should handle service error during file retrieval by ID', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      const serviceError = new Error('DB error');
      knowledgeBankService.getFileById.mockRejectedValue(serviceError);

      await knowledgeBankController.getFileById(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Get file error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving the file',
      });
    });
  });

  // --- deleteFile tests ---
  describe('deleteFile', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.fileId = 'someFileId';
      await knowledgeBankController.deleteFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.deleteFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if fileId is missing', async () => {
      req.params.fileId = undefined;
      await knowledgeBankController.deleteFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID is required',
      });
      expect(knowledgeBankService.deleteFile).not.toHaveBeenCalled();
    });

    it('should delete file successfully and decrement storage', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      knowledgeBankService.deleteFile.mockResolvedValue({ fileId: fileId, fileSize: 500 });
      UserUsageModel.updateStorage.mockResolvedValue({});

      await knowledgeBankController.deleteFile(req, res, next);

      expect(knowledgeBankService.deleteFile).toHaveBeenCalledWith(fileId, userId, req);
      expect(UserUsageModel.updateStorage).toHaveBeenCalledWith(userId, tenantId, -500);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File deleted successfully',
      });
    });

    it('should return NOT_FOUND if file not found or could not be deleted', async () => {
      const fileId = 'nonExistentFile';
      req.params.fileId = fileId;
      knowledgeBankService.deleteFile.mockResolvedValue(null);

      await knowledgeBankController.deleteFile(req, res, next);

      expect(knowledgeBankService.deleteFile).toHaveBeenCalledWith(fileId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found or could not be deleted',
      });
      expect(UserUsageModel.updateStorage).not.toHaveBeenCalled();
    });

    it('should handle service error during file deletion', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      const serviceError = new Error('Deletion failed');
      knowledgeBankService.deleteFile.mockRejectedValue(serviceError);

      await knowledgeBankController.deleteFile(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Delete file error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while deleting the file',
      });
      expect(UserUsageModel.updateStorage).not.toHaveBeenCalled();
    });

    it('should log storage decrement error but still send success response', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      knowledgeBankService.deleteFile.mockResolvedValue({ fileId: fileId, fileSize: 500 });
      const storageError = new Error('Storage update failed');
      UserUsageModel.updateStorage.mockRejectedValue(storageError);

      await knowledgeBankController.deleteFile(req, res, next);

      expect(knowledgeBankService.deleteFile).toHaveBeenCalled();
      expect(UserUsageModel.updateStorage).toHaveBeenCalledWith(userId, tenantId, -500);
      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Storage decrement error:', storageError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File deleted successfully',
      });
    });
  });

  // --- processFile tests ---
  describe('processFile', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.fileId = 'someFileId';
      await knowledgeBankController.processFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getFileById).not.toHaveBeenCalled();
      expect(knowledgeBankService.processUploadedFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if fileId is missing', async () => {
      req.params.fileId = undefined;
      await knowledgeBankController.processFile(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID is required',
      });
      expect(knowledgeBankService.getFileById).not.toHaveBeenCalled();
      expect(knowledgeBankService.processUploadedFile).not.toHaveBeenCalled();
    });

    it('should process file successfully', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      knowledgeBankService.getFileById.mockResolvedValue({ id: fileId, isProcessed: false });
      knowledgeBankService.processUploadedFile.mockResolvedValue({ documentId: 'doc1', status: 'processed' });

      await knowledgeBankController.processFile(req, res, next);

      expect(knowledgeBankService.getFileById).toHaveBeenCalledWith(fileId, userId, req);
      expect(knowledgeBankService.processUploadedFile).toHaveBeenCalledWith(fileId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File processed successfully',
        data: { documentId: 'doc1', status: 'processed' },
      });
    });

    it('should return NOT_FOUND if file not found for processing', async () => {
      const fileId = 'nonExistentFile';
      req.params.fileId = fileId;
      knowledgeBankService.getFileById.mockResolvedValue(null);

      await knowledgeBankController.processFile(req, res, next);

      expect(knowledgeBankService.getFileById).toHaveBeenCalledWith(fileId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
      expect(knowledgeBankService.processUploadedFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if file is already processed', async () => {
      const fileId = 'processedFile';
      req.params.fileId = fileId;
      knowledgeBankService.getFileById.mockResolvedValue({ id: fileId, isProcessed: true, documentId: 'docXYZ', processedAt: new Date() });

      await knowledgeBankController.processFile(req, res, next);

      expect(knowledgeBankService.getFileById).toHaveBeenCalledWith(fileId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File has already been processed',
        data: {
          documentId: 'docXYZ',
          processedAt: expect.any(Date),
        },
      });
      expect(knowledgeBankService.processUploadedFile).not.toHaveBeenCalled();
    });

    it('should handle service error during file verification', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      const serviceError = new Error('Verification failed');
      knowledgeBankService.getFileById.mockRejectedValue(serviceError);

      await knowledgeBankController.processFile(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Process file error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: serviceError.message,
      });
      expect(knowledgeBankService.processUploadedFile).not.toHaveBeenCalled();
    });

    it('should handle service error during file processing', async () => {
      const fileId = 'file123';
      req.params.fileId = fileId;
      knowledgeBankService.getFileById.mockResolvedValue({ id: fileId, isProcessed: false });
      const serviceError = new Error('Processing failed');
      knowledgeBankService.processUploadedFile.mockRejectedValue(serviceError);

      await knowledgeBankController.processFile(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Process file error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: serviceError.message,
      });
    });
  });

  // --- getUserStorageStats tests ---
  describe('getUserStorageStats', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      await knowledgeBankController.getUserStorageStats(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getUserStorageStats).not.toHaveBeenCalled();
    });

    it('should retrieve user storage statistics successfully', async () => {
      const mockStats = { totalSize: 102400, fileCount: 10 };
      knowledgeBankService.getUserStorageStats.mockResolvedValue(mockStats);

      await knowledgeBankController.getUserStorageStats(req, res, next);

      expect(knowledgeBankService.getUserStorageStats).toHaveBeenCalledWith(userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Storage statistics retrieved successfully',
        data: mockStats,
      });
    });

    it('should handle service error during storage stats retrieval', async () => {
      const serviceError = new Error('Failed to get stats');
      knowledgeBankService.getUserStorageStats.mockRejectedValue(serviceError);

      await knowledgeBankController.getUserStorageStats(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Get storage stats error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving storage statistics',
      });
    });
  });

  // --- createFolder tests ---
  describe('createFolder', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.body.name = 'New Folder';
      await knowledgeBankController.createFolder(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.createFolder).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folder name is missing', async () => {
      req.body.name = ''; // Empty name
      await knowledgeBankController.createFolder(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder name is required',
      });
      expect(knowledgeBankService.createFolder).not.toHaveBeenCalled();
    });

    it('should create a folder successfully', async () => {
      req.body = {
        name: 'My New Folder',
        parentFolderId: 'parent123',
        description: 'A folder for documents',
        color: '#FF0000',
        icon: 'folder-icon',
        tags: ['work', 'project'],
      };
      const mockFolder = { id: 'folder1', name: 'My New Folder' };
      knowledgeBankService.createFolder.mockResolvedValue(mockFolder);

      await knowledgeBankController.createFolder(req, res, next);

      expect(knowledgeBankService.createFolder).toHaveBeenCalledWith(
        userId,
        {
          name: 'My New Folder',
          parentFolderId: 'parent123',
          description: 'A folder for documents',
          color: '#FF0000',
          icon: 'folder-icon',
          tags: ['work', 'project'],
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Folder created successfully',
        data: mockFolder,
      });
    });

    it('should create a root folder if parentFolderId is not provided', async () => {
      req.body = { name: 'Root Folder' };
      const mockFolder = { id: 'folder2', name: 'Root Folder', parentFolderId: null };
      knowledgeBankService.createFolder.mockResolvedValue(mockFolder);

      await knowledgeBankController.createFolder(req, res, next);

      expect(knowledgeBankService.createFolder).toHaveBeenCalledWith(
        userId,
        {
          name: 'Root Folder',
          parentFolderId: null,
          description: undefined,
          color: undefined,
          icon: undefined,
          tags: undefined,
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Folder created successfully',
        data: mockFolder,
      });
    });

    it('should handle service error during folder creation', async () => {
      req.body.name = 'Error Folder';
      const serviceError = new Error('Folder creation failed');
      knowledgeBankService.createFolder.mockRejectedValue(serviceError);

      await knowledgeBankController.createFolder(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Create folder error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: serviceError.message,
      });
    });
  });

  // --- getUserFolders tests ---
  describe('getUserFolders', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      await knowledgeBankController.getUserFolders(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getUserFolders).not.toHaveBeenCalled();
    });

    it('should retrieve user folders successfully (root folders)', async () => {
      req.query.parentFolderId = 'root';
      const mockFolders = [{ id: 'fld1', name: 'Root Folder 1' }];
      knowledgeBankService.getUserFolders.mockResolvedValue({ data: mockFolders, total: 1 });

      await knowledgeBankController.getUserFolders(req, res, next);

      expect(knowledgeBankService.getUserFolders).toHaveBeenCalledWith(
        userId,
        { parentFolderId: null },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folders retrieved successfully',
        data: {
          folders: mockFolders,
          totalCount: 1,
        },
      });
    });

    it('should retrieve user folders successfully (subfolders)', async () => {
      req.query.parentFolderId = 'parent123';
      const mockFolders = [{ id: 'subfld1', name: 'Sub Folder 1' }];
      knowledgeBankService.getUserFolders.mockResolvedValue({ data: mockFolders, total: 1 });

      await knowledgeBankController.getUserFolders(req, res, next);

      expect(knowledgeBankService.getUserFolders).toHaveBeenCalledWith(
        userId,
        { parentFolderId: 'parent123' },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folders retrieved successfully',
        data: {
          folders: mockFolders,
          totalCount: 1,
        },
      });
    });

    it('should handle service error during folder retrieval', async () => {
      const serviceError = new Error('Failed to get folders');
      knowledgeBankService.getUserFolders.mockRejectedValue(serviceError);

      await knowledgeBankController.getUserFolders(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Get folders error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving folders',
      });
    });
  });

  // --- getFolderById tests ---
  describe('getFolderById', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.folderId = 'someFolderId';
      await knowledgeBankController.getFolderById(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getFolderById).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folderId is missing', async () => {
      req.params.folderId = undefined;
      await knowledgeBankController.getFolderById(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder ID is required',
      });
      expect(knowledgeBankService.getFolderById).not.toHaveBeenCalled();
    });

    it('should retrieve folder by ID successfully', async () => {
      const folderId = 'folder123';
      const mockFolder = { id: folderId, name: 'My Folder' };
      req.params.folderId = folderId;
      knowledgeBankService.getFolderById.mockResolvedValue(mockFolder);

      await knowledgeBankController.getFolderById(req, res, next);

      expect(knowledgeBankService.getFolderById).toHaveBeenCalledWith(folderId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder retrieved successfully',
        data: mockFolder,
      });
    });

    it('should return NOT_FOUND if folder is not found', async () => {
      const folderId = 'nonExistentFolder';
      req.params.folderId = folderId;
      knowledgeBankService.getFolderById.mockResolvedValue(null);

      await knowledgeBankController.getFolderById(req, res, next);

      expect(knowledgeBankService.getFolderById).toHaveBeenCalledWith(folderId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found',
      });
    });

    it('should handle service error during folder retrieval by ID', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      const serviceError = new Error('DB error');
      knowledgeBankService.getFolderById.mockRejectedValue(serviceError);

      await knowledgeBankController.getFolderById(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Get folder error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving the folder',
      });
    });
  });

  // --- updateFolder tests ---
  describe('updateFolder', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.folderId = 'someFolderId';
      await knowledgeBankController.updateFolder(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.updateFolder).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folderId is missing', async () => {
      req.params.folderId = undefined;
      await knowledgeBankController.updateFolder(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder ID is required',
      });
      expect(knowledgeBankService.updateFolder).not.toHaveBeenCalled();
    });

    it('should update folder successfully', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      req.body = {
        name: 'Updated Folder Name',
        description: 'New description',
        color: '#00FF00',
        icon: 'new-icon',
        tags: ['updated', 'tags'],
      };
      const mockUpdatedFolder = { id: folderId, name: 'Updated Folder Name' };
      knowledgeBankService.updateFolder.mockResolvedValue(mockUpdatedFolder);

      await knowledgeBankController.updateFolder(req, res, next);

      expect(knowledgeBankService.updateFolder).toHaveBeenCalledWith(
        folderId,
        userId,
        {
          name: 'Updated Folder Name',
          description: 'New description',
          color: '#00FF00',
          icon: 'new-icon',
          tags: ['updated', 'tags'],
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder updated successfully',
        data: mockUpdatedFolder,
      });
    });

    it('should handle service error during folder update', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      req.body.name = 'Error Folder';
      const serviceError = new Error('Update failed');
      knowledgeBankService.updateFolder.mockRejectedValue(serviceError);

      await knowledgeBankController.updateFolder(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Update folder error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: serviceError.message,
      });
    });
  });

  // --- deleteFolder tests ---
  describe('deleteFolder', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.folderId = 'someFolderId';
      await knowledgeBankController.deleteFolder(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.deleteFolder).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folderId is missing', async () => {
      req.params.folderId = undefined;
      await knowledgeBankController.deleteFolder(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder ID is required',
      });
      expect(knowledgeBankService.deleteFolder).not.toHaveBeenCalled();
    });

    it('should delete folder successfully (non-recursive)', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      req.query.recursive = 'false';
      knowledgeBankService.deleteFolder.mockResolvedValue({ deletedCount: 1 });

      await knowledgeBankController.deleteFolder(req, res, next);

      expect(knowledgeBankService.deleteFolder).toHaveBeenCalledWith(folderId, userId, false, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder deleted successfully',
      });
    });

    it('should delete folder successfully (recursive)', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      req.query.recursive = 'true';
      knowledgeBankService.deleteFolder.mockResolvedValue({ deletedCount: 1, filesDeleted: 5 });

      await knowledgeBankController.deleteFolder(req, res, next);

      expect(knowledgeBankService.deleteFolder).toHaveBeenCalledWith(folderId, userId, true, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder deleted successfully',
      });
    });

    it('should return NOT_FOUND if folder not found or could not be deleted', async () => {
      const folderId = 'nonExistentFolder';
      req.params.folderId = folderId;
      knowledgeBankService.deleteFolder.mockResolvedValue(null);

      await knowledgeBankController.deleteFolder(req, res, next);

      expect(knowledgeBankService.deleteFolder).toHaveBeenCalledWith(folderId, userId, false, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found or could not be deleted',
      });
    });

    it('should handle service error during folder deletion', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      const serviceError = new Error('Deletion failed');
      knowledgeBankService.deleteFolder.mockRejectedValue(serviceError);

      await knowledgeBankController.deleteFolder(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Delete folder error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: serviceError.message,
      });
    });
  });

  // --- getFolderContents tests ---
  describe('getFolderContents', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params.folderId = 'someFolderId';
      await knowledgeBankController.getFolderContents(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeBankService.getFolderContents).not.toHaveBeenCalled();
    });

    it('should retrieve folder contents successfully for a specific folderId', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      const mockContents = { files: [{ id: 'f1' }], folders: [{ id: 'subf1' }] };
      knowledgeBankService.getFolderContents.mockResolvedValue(mockContents);

      await knowledgeBankController.getFolderContents(req, res, next);

      expect(knowledgeBankService.getFolderContents).toHaveBeenCalledWith(folderId, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder contents retrieved successfully',
        data: mockContents,
      });
    });

    it('should retrieve root folder contents successfully when folderId is "root"', async () => {
      req.params.folderId = 'root';
      const mockContents = { files: [{ id: 'f2' }], folders: [{ id: 'rootf1' }] };
      knowledgeBankService.getFolderContents.mockResolvedValue(mockContents);

      await knowledgeBankController.getFolderContents(req, res, next);

      expect(knowledgeBankService.getFolderContents).toHaveBeenCalledWith(null, userId, req);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder contents retrieved successfully',
        data: mockContents,
      });
    });

    it('should handle service error during folder contents retrieval', async () => {
      const folderId = 'folder123';
      req.params.folderId = folderId;
      const serviceError = new Error('Failed to get contents');
      knowledgeBankService.getFolderContents.mockRejectedValue(serviceError);

      await knowledgeBankController.getFolderContents(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('[KnowledgeBank] Get folder contents error:', serviceError);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving folder contents',
      });
    });
  });
});