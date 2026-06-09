import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { knowledgeService } from './knowledge.service.js';
import { knowledgeQueryService } from './services/knowledgeQuery.js';
import { OWNER_TYPES } from './knowledge.constant.js';
import {
  uploadFile,
  processFile,
  getFiles,
  getFileById,
  deleteFile,
  getStorageStats,
  createFolder,
  getFolders,
  getFolderById,
  updateFolder,
  deleteFolder,
  getFolderContents,
  conversationalQuery,
  queryKnowledge,
  semanticSearch,
  getConversationHistory,
} from './knowledge.controller.js';

// Mock external modules
vi.mock('http-status', () => ({
  default: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => fn, // Mock catchAsync to just return the async function
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));

vi.mock('./knowledge.service.js', () => ({
  knowledgeService: {
    uploadFile: vi.fn(),
    processFile: vi.fn(),
    getFiles: vi.fn(),
    getFileById: vi.fn(),
    deleteFile: vi.fn(),
    getStorageStats: vi.fn(),
    createFolder: vi.fn(),
    getFolders: vi.fn(),
    getFolderById: vi.fn(),
    updateFolder: vi.fn(),
    deleteFolder: vi.fn(),
    getFolderContents: vi.fn(),
  },
}));

vi.mock('./services/knowledgeQuery.js', () => ({
  knowledgeQueryService: {
    conversationalQuery: vi.fn(),
    queryKnowledge: vi.fn(),
    semanticSearch: vi.fn(),
    getConversationHistory: vi.fn(),
  },
}));

vi.mock('./knowledge.constant.js', () => ({
  OWNER_TYPES: {
    USER: 'user',
    BOT: 'bot',
  },
}));

describe('Knowledge Controller', () => {
  const mockUserId = 'user123';
  const mockBotId = 'bot456';
  let req, res;

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    req = {
      user: {
        userId: mockUserId,
        _id: mockUserId, // For cases where _id might be used
      },
      body: {},
      params: {},
      query: {},
      file: undefined,
      ip: '127.0.0.1',
    };
    res = {}; // sendResponse is mocked, so res doesn't need methods like status/json
  });

  describe('uploadFile', () => {
    it('should upload file successfully and send response', async () => {
      req.file = { originalname: 'test.pdf', mimetype: 'application/pdf' };
      req.body = {
        ownerType: OWNER_TYPES.USER,
        description: 'A test file',
        tags: '["tag1", "tag2"]',
        folderId: 'folder123',
      };
      const uploadResult = { fileId: 'file123', fileName: 'test.pdf' };
      knowledgeService.uploadFile.mockResolvedValue(uploadResult);

      await uploadFile(req, res);

      expect(knowledgeService.uploadFile).toHaveBeenCalledWith(
        req.file,
        OWNER_TYPES.USER,
        mockUserId,
        {
          description: 'A test file',
          tags: ['tag1', 'tag2'],
          folderId: 'folder123',
          uploadSource: 'web',
          ipAddress: '127.0.0.1',
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message:
          'File uploaded successfully. Process manually or set processImmediately=true',
        data: uploadResult,
      });
      expect(logger.info).toHaveBeenCalled();
    });

    it('should upload and process file immediately if processImmediately is true', async () => {
      req.file = { originalname: 'test.pdf', mimetype: 'application/pdf' };
      req.body = {
        ownerType: OWNER_TYPES.USER,
        processImmediately: 'true',
      };
      const uploadResult = { fileId: 'file123', fileName: 'test.pdf' };
      const processResult = { status: 'processed' };
      knowledgeService.uploadFile.mockResolvedValue(uploadResult);
      knowledgeService.processFile.mockResolvedValue(processResult);

      await uploadFile(req, res);

      expect(knowledgeService.uploadFile).toHaveBeenCalled();
      expect(knowledgeService.processFile).toHaveBeenCalledWith(
        uploadResult.fileId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File uploaded and processed successfully',
        data: { ...uploadResult, processing: processResult },
      });
      expect(logger.info).toHaveBeenCalledWith(
        `[Knowledge] Processing file immediately: ${uploadResult.fileId}`
      );
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: OWNER_TYPES.USER };

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if no file is provided', async () => {
      req.file = undefined;
      req.body = { ownerType: OWNER_TYPES.USER };

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'No file provided',
      });
      expect(knowledgeService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: undefined };

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is invalid', async () => {
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: 'invalidType' };

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeService.uploadFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is bot but ownerId is missing', async () => {
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: OWNER_TYPES.BOT, ownerId: undefined };
      req.user = { userId: null, _id: null }; // Ensure no userId is picked up

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Owner ID is required for bot files',
      });
      expect(knowledgeService.uploadFile).not.toHaveBeenCalled();
    });

    it('should use ownerId from body if provided for bot', async () => {
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: OWNER_TYPES.BOT, ownerId: mockBotId };
      const uploadResult = { fileId: 'file123', fileName: 'test.pdf' };
      knowledgeService.uploadFile.mockResolvedValue(uploadResult);

      await uploadFile(req, res);

      expect(knowledgeService.uploadFile).toHaveBeenCalledWith(
        req.file,
        OWNER_TYPES.BOT,
        mockBotId,
        expect.any(Object),
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: expect.any(String),
        data: uploadResult,
      });
    });

    it('should handle service error during upload', async () => {
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service upload failed';
      knowledgeService.uploadFile.mockRejectedValue(new Error(errorMessage));

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] File upload error:',
        expect.any(Error)
      );
    });

    it('should handle service error during immediate processing', async () => {
      req.file = { originalname: 'test.pdf' };
      req.body = { ownerType: OWNER_TYPES.USER, processImmediately: 'true' };
      const uploadResult = { fileId: 'file123', fileName: 'test.pdf' };
      const errorMessage = 'Service process failed';
      knowledgeService.uploadFile.mockResolvedValue(uploadResult);
      knowledgeService.processFile.mockRejectedValue(new Error(errorMessage));

      await uploadFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] File upload error:',
        expect.any(Error)
      );
    });

    it('should parse tags correctly when provided as stringified JSON', async () => {
      req.file = { originalname: 'test.pdf', mimetype: 'application/pdf' };
      req.body = {
        ownerType: OWNER_TYPES.USER,
        tags: '["tagA", "tagB"]',
      };
      const uploadResult = { fileId: 'file123', fileName: 'test.pdf' };
      knowledgeService.uploadFile.mockResolvedValue(uploadResult);

      await uploadFile(req, res);

      expect(knowledgeService.uploadFile).toHaveBeenCalledWith(
        req.file,
        OWNER_TYPES.USER,
        mockUserId,
        {
          description: '',
          tags: ['tagA', 'tagB'],
          folderId: null,
          uploadSource: 'web',
          ipAddress: '127.0.0.1',
        },
        req
      );
    });

    it('should use empty array for tags if not provided', async () => {
      req.file = { originalname: 'test.pdf', mimetype: 'application/pdf' };
      req.body = {
        ownerType: OWNER_TYPES.USER,
      };
      const uploadResult = { fileId: 'file123', fileName: 'test.pdf' };
      knowledgeService.uploadFile.mockResolvedValue(uploadResult);

      await uploadFile(req, res);

      expect(knowledgeService.uploadFile).toHaveBeenCalledWith(
        req.file,
        OWNER_TYPES.USER,
        mockUserId,
        {
          description: '',
          tags: [],
          folderId: null,
          uploadSource: 'web',
          ipAddress: '127.0.0.1',
        },
        req
      );
    });
  });

  describe('processFile', () => {
    it('should process file successfully', async () => {
      req.params = { fileId: 'file123' };
      const processResult = { status: 'processed' };
      knowledgeService.processFile.mockResolvedValue(processResult);

      await processFile(req, res);

      expect(knowledgeService.processFile).toHaveBeenCalledWith(
        'file123',
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File processed successfully',
        data: processResult,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { fileId: 'file123' };

      await processFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.processFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if fileId is missing', async () => {
      req.params = { fileId: undefined };

      await processFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID is required',
      });
      expect(knowledgeService.processFile).not.toHaveBeenCalled();
    });

    it('should handle service error during processing', async () => {
      req.params = { fileId: 'file123' };
      const errorMessage = 'Service process failed';
      knowledgeService.processFile.mockRejectedValue(new Error(errorMessage));

      await processFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] File processing error:',
        expect.any(Error)
      );
    });
  });

  describe('getFiles', () => {
    it('should retrieve files successfully with default filters', async () => {
      req.query = { ownerType: OWNER_TYPES.USER };
      const mockFiles = [{ id: 'file1' }, { id: 'file2' }];
      knowledgeService.getFiles.mockResolvedValue(mockFiles);

      await getFiles(req, res);

      expect(knowledgeService.getFiles).toHaveBeenCalledWith(
        OWNER_TYPES.USER,
        mockUserId,
        {
          limit: 100,
          skip: 0,
          fileType: undefined,
          processingStatus: undefined,
          isProcessed: undefined,
          folderId: undefined,
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Files retrieved successfully',
        data: {
          files: mockFiles,
          totalCount: mockFiles.length,
          filters: {
            ownerType: OWNER_TYPES.USER,
            ownerId: mockUserId,
            fileType: undefined,
            processingStatus: undefined,
            isProcessed: undefined,
          },
        },
      });
    });

    it('should retrieve files with specific filters', async () => {
      req.query = {
        ownerType: OWNER_TYPES.BOT,
        ownerId: mockBotId,
        fileType: 'document',
        processingStatus: 'completed',
        isProcessed: 'true',
        folderId: 'folder456',
        limit: '10',
        skip: '5',
      };
      const mockFiles = [{ id: 'file3' }];
      knowledgeService.getFiles.mockResolvedValue(mockFiles);

      await getFiles(req, res);

      expect(knowledgeService.getFiles).toHaveBeenCalledWith(
        OWNER_TYPES.BOT,
        mockBotId,
        {
          limit: 10,
          skip: 5,
          fileType: 'document',
          processingStatus: 'completed',
          isProcessed: true,
          folderId: 'folder456',
        },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Files retrieved successfully',
        data: {
          files: mockFiles,
          totalCount: mockFiles.length,
          filters: {
            ownerType: OWNER_TYPES.BOT,
            ownerId: mockBotId,
            fileType: 'document',
            processingStatus: 'completed',
            isProcessed: 'true',
          },
        },
      });
    });

    it('should handle isProcessed=false and folderId=null', async () => {
      req.query = {
        ownerType: OWNER_TYPES.USER,
        isProcessed: 'false',
        folderId: 'null',
      };
      const mockFiles = [];
      knowledgeService.getFiles.mockResolvedValue(mockFiles);

      await getFiles(req, res);

      expect(knowledgeService.getFiles).toHaveBeenCalledWith(
        OWNER_TYPES.USER,
        mockUserId,
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

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.query = { ownerType: OWNER_TYPES.USER };

      await getFiles(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.getFiles).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.query = { ownerType: undefined };

      await getFiles(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeService.getFiles).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is invalid', async () => {
      req.query = { ownerType: 'invalidType' };

      await getFiles(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeService.getFiles).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is bot but ownerId is missing', async () => {
      req.query = { ownerType: OWNER_TYPES.BOT, ownerId: undefined };
      req.user = { userId: null, _id: null }; // Ensure no userId is picked up

      await getFiles(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Owner ID is required',
      });
      expect(knowledgeService.getFiles).not.toHaveBeenCalled();
    });

    it('should handle service error during file retrieval', async () => {
      req.query = { ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service get files failed';
      knowledgeService.getFiles.mockRejectedValue(new Error(errorMessage));

      await getFiles(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving files',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get files error:',
        expect.any(Error)
      );
    });
  });

  describe('getFileById', () => {
    it('should retrieve file by ID successfully', async () => {
      req.params = { fileId: 'file123' };
      req.query = { ownerType: OWNER_TYPES.USER };
      const mockFile = { id: 'file123', name: 'test.pdf' };
      knowledgeService.getFileById.mockResolvedValue(mockFile);

      await getFileById(req, res);

      expect(knowledgeService.getFileById).toHaveBeenCalledWith(
        'file123',
        OWNER_TYPES.USER,
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File retrieved successfully',
        data: mockFile,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { fileId: 'file123' };
      req.query = { ownerType: OWNER_TYPES.USER };

      await getFileById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.getFileById).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if fileId is missing', async () => {
      req.params = { fileId: undefined };
      req.query = { ownerType: OWNER_TYPES.USER };

      await getFileById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID and ownerType are required',
      });
      expect(knowledgeService.getFileById).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.params = { fileId: 'file123' };
      req.query = { ownerType: undefined };

      await getFileById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID and ownerType are required',
      });
      expect(knowledgeService.getFileById).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND if file is not found', async () => {
      req.params = { fileId: 'nonexistent' };
      req.query = { ownerType: OWNER_TYPES.USER };
      knowledgeService.getFileById.mockResolvedValue(null);

      await getFileById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
    });

    it('should handle service error during file retrieval', async () => {
      req.params = { fileId: 'file123' };
      req.query = { ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service get file failed';
      knowledgeService.getFileById.mockRejectedValue(new Error(errorMessage));

      await getFileById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving the file',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get file error:',
        expect.any(Error)
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      req.params = { fileId: 'file123' };
      req.body = { ownerType: OWNER_TYPES.USER };
      knowledgeService.deleteFile.mockResolvedValue(true);

      await deleteFile(req, res);

      expect(knowledgeService.deleteFile).toHaveBeenCalledWith(
        'file123',
        OWNER_TYPES.USER,
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'File deleted successfully',
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { fileId: 'file123' };
      req.body = { ownerType: OWNER_TYPES.USER };

      await deleteFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.deleteFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if fileId is missing', async () => {
      req.params = { fileId: undefined };
      req.body = { ownerType: OWNER_TYPES.USER };

      await deleteFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID and ownerType are required',
      });
      expect(knowledgeService.deleteFile).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.params = { fileId: 'file123' };
      req.body = { ownerType: undefined };

      await deleteFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'File ID and ownerType are required',
      });
      expect(knowledgeService.deleteFile).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND if file is not found', async () => {
      req.params = { fileId: 'nonexistent' };
      req.body = { ownerType: OWNER_TYPES.USER };
      knowledgeService.deleteFile.mockResolvedValue(false);

      await deleteFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found',
      });
    });

    it('should handle service error during file deletion', async () => {
      req.params = { fileId: 'file123' };
      req.body = { ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service delete file failed';
      knowledgeService.deleteFile.mockRejectedValue(new Error(errorMessage));

      await deleteFile(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while deleting the file',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Delete file error:',
        expect.any(Error)
      );
    });
  });

  describe('getStorageStats', () => {
    it('should retrieve storage stats successfully', async () => {
      req.query = { ownerType: OWNER_TYPES.USER };
      const mockStats = { totalFiles: 5, totalSize: 1024 };
      knowledgeService.getStorageStats.mockResolvedValue(mockStats);

      await getStorageStats(req, res);

      expect(knowledgeService.getStorageStats).toHaveBeenCalledWith(
        OWNER_TYPES.USER,
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Storage statistics retrieved successfully',
        data: mockStats,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.query = { ownerType: OWNER_TYPES.USER };

      await getStorageStats(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.getStorageStats).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.query = { ownerType: undefined };

      await getStorageStats(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'ownerType is required',
      });
      expect(knowledgeService.getStorageStats).not.toHaveBeenCalled();
    });

    it('should handle service error during stats retrieval', async () => {
      req.query = { ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service get stats failed';
      knowledgeService.getStorageStats.mockRejectedValue(
        new Error(errorMessage)
      );

      await getStorageStats(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving storage statistics',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get storage stats error:',
        expect.any(Error)
      );
    });
  });

  // ==================== FOLDER CONTROLLERS ====================

  describe('createFolder', () => {
    it('should create a folder successfully', async () => {
      req.body = { name: 'New Folder', parentFolderId: 'parent123' };
      const createdFolder = { id: 'folder123', name: 'New Folder' };
      knowledgeService.createFolder.mockResolvedValue(createdFolder);

      await createFolder(req, res);

      expect(knowledgeService.createFolder).toHaveBeenCalledWith(
        mockUserId,
        req.body,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CREATED,
        success: true,
        message: 'Folder created successfully',
        data: createdFolder,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.body = { name: 'New Folder' };

      await createFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.createFolder).not.toHaveBeenCalled();
    });

    it('should handle service error during folder creation', async () => {
      req.body = { name: 'New Folder' };
      const errorMessage = 'Service create folder failed';
      knowledgeService.createFolder.mockRejectedValue(new Error(errorMessage));

      await createFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Create folder error:',
        expect.any(Error)
      );
    });

    it('should handle service error with custom status code', async () => {
      req.body = { name: 'New Folder' };
      const customError = new Error('Folder name already exists');
      customError.statusCode = httpStatus.CONFLICT;
      knowledgeService.createFolder.mockRejectedValue(customError);

      await createFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.CONFLICT,
        success: false,
        message: 'Folder name already exists',
      });
    });
  });

  describe('getFolders', () => {
    it('should retrieve folders successfully for root', async () => {
      req.query = { parentFolderId: 'root' };
      const mockFolders = [{ id: 'folder1' }, { id: 'folder2' }];
      knowledgeService.getFolders.mockResolvedValue(mockFolders);

      await getFolders(req, res);

      expect(knowledgeService.getFolders).toHaveBeenCalledWith(
        mockUserId,
        { parentFolderId: null },
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folders retrieved successfully',
        data: {
          folders: mockFolders,
          totalCount: mockFolders.length,
        },
      });
    });

    it('should retrieve folders successfully for a specific parentFolderId', async () => {
      req.query = { parentFolderId: 'parent123' };
      const mockFolders = [{ id: 'folder3' }];
      knowledgeService.getFolders.mockResolvedValue(mockFolders);

      await getFolders(req, res);

      expect(knowledgeService.getFolders).toHaveBeenCalledWith(
        mockUserId,
        { parentFolderId: 'parent123' },
        req
      );
    });

    it('should retrieve all folders if parentFolderId is not provided', async () => {
      req.query = {};
      const mockFolders = [{ id: 'folder1' }, { id: 'folder2' }];
      knowledgeService.getFolders.mockResolvedValue(mockFolders);

      await getFolders(req, res);

      expect(knowledgeService.getFolders).toHaveBeenCalledWith(
        mockUserId,
        {},
        req
      );
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;

      await getFolders(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.getFolders).not.toHaveBeenCalled();
    });

    it('should handle service error during folder retrieval', async () => {
      req.query = { parentFolderId: 'root' };
      const errorMessage = 'Service get folders failed';
      knowledgeService.getFolders.mockRejectedValue(new Error(errorMessage));

      await getFolders(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving folders',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get folders error:',
        expect.any(Error)
      );
    });
  });

  describe('getFolderById', () => {
    it('should retrieve folder by ID successfully', async () => {
      req.params = { folderId: 'folder123' };
      const mockFolder = { id: 'folder123', name: 'Test Folder' };
      knowledgeService.getFolderById.mockResolvedValue(mockFolder);

      await getFolderById(req, res);

      expect(knowledgeService.getFolderById).toHaveBeenCalledWith(
        'folder123',
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder retrieved successfully',
        data: mockFolder,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { folderId: 'folder123' };

      await getFolderById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.getFolderById).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folderId is missing', async () => {
      req.params = { folderId: undefined };

      await getFolderById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder ID is required',
      });
      expect(knowledgeService.getFolderById).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND if folder is not found', async () => {
      req.params = { folderId: 'nonexistent' };
      knowledgeService.getFolderById.mockResolvedValue(null);

      await getFolderById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found',
      });
    });

    it('should handle service error during folder retrieval', async () => {
      req.params = { folderId: 'folder123' };
      const errorMessage = 'Service get folder failed';
      knowledgeService.getFolderById.mockRejectedValue(
        new Error(errorMessage)
      );

      await getFolderById(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving the folder',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get folder error:',
        expect.any(Error)
      );
    });
  });

  describe('updateFolder', () => {
    it('should update a folder successfully', async () => {
      req.params = { folderId: 'folder123' };
      req.body = { name: 'Updated Folder Name' };
      const updatedFolder = { id: 'folder123', name: 'Updated Folder Name' };
      knowledgeService.updateFolder.mockResolvedValue(updatedFolder);

      await updateFolder(req, res);

      expect(knowledgeService.updateFolder).toHaveBeenCalledWith(
        'folder123',
        mockUserId,
        req.body,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder updated successfully',
        data: updatedFolder,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { folderId: 'folder123' };
      req.body = { name: 'Updated Folder Name' };

      await updateFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.updateFolder).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folderId is missing', async () => {
      req.params = { folderId: undefined };
      req.body = { name: 'Updated Folder Name' };

      await updateFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder ID is required',
      });
      expect(knowledgeService.updateFolder).not.toHaveBeenCalled();
    });

    it('should handle service error during folder update', async () => {
      req.params = { folderId: 'folder123' };
      req.body = { name: 'Updated Folder Name' };
      const errorMessage = 'Service update folder failed';
      knowledgeService.updateFolder.mockRejectedValue(
        new Error(errorMessage)
      );

      await updateFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Update folder error:',
        expect.any(Error)
      );
    });

    it('should handle service error with custom status code', async () => {
      req.params = { folderId: 'folder123' };
      req.body = { name: 'Updated Folder Name' };
      const customError = new Error('Folder not found');
      customError.statusCode = httpStatus.NOT_FOUND;
      knowledgeService.updateFolder.mockRejectedValue(customError);

      await updateFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found',
      });
    });
  });

  describe('deleteFolder', () => {
    it('should delete a folder successfully', async () => {
      req.params = { folderId: 'folder123' };
      req.body = { recursive: false };
      knowledgeService.deleteFolder.mockResolvedValue(true);

      await deleteFolder(req, res);

      expect(knowledgeService.deleteFolder).toHaveBeenCalledWith(
        'folder123',
        mockUserId,
        false,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder deleted successfully',
      });
    });

    it('should delete a folder recursively if recursive is true', async () => {
      req.params = { folderId: 'folder123' };
      req.body = { recursive: 'true' };
      knowledgeService.deleteFolder.mockResolvedValue(true);

      await deleteFolder(req, res);

      expect(knowledgeService.deleteFolder).toHaveBeenCalledWith(
        'folder123',
        mockUserId,
        true,
        req
      );
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { folderId: 'folder123' };

      await deleteFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.deleteFolder).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if folderId is missing', async () => {
      req.params = { folderId: undefined };

      await deleteFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Folder ID is required',
      });
      expect(knowledgeService.deleteFolder).not.toHaveBeenCalled();
    });

    it('should return NOT_FOUND if folder is not found', async () => {
      req.params = { folderId: 'nonexistent' };
      knowledgeService.deleteFolder.mockResolvedValue(false);

      await deleteFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Folder not found',
      });
    });

    it('should handle service error during folder deletion', async () => {
      req.params = { folderId: 'folder123' };
      const errorMessage = 'Service delete folder failed';
      knowledgeService.deleteFolder.mockRejectedValue(
        new Error(errorMessage)
      );

      await deleteFolder(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Delete folder error:',
        expect.any(Error)
      );
    });
  });

  describe('getFolderContents', () => {
    it('should retrieve folder contents successfully for a specific folderId', async () => {
      req.params = { folderId: 'folder123' };
      const mockContents = { files: [{ id: 'file1' }], folders: [] };
      knowledgeService.getFolderContents.mockResolvedValue(mockContents);

      await getFolderContents(req, res);

      expect(knowledgeService.getFolderContents).toHaveBeenCalledWith(
        'folder123',
        mockUserId,
        req
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Folder contents retrieved successfully',
        data: mockContents,
      });
    });

    it('should retrieve folder contents for root if folderId is "root"', async () => {
      req.params = { folderId: 'root' };
      const mockContents = { files: [{ id: 'file1' }], folders: [] };
      knowledgeService.getFolderContents.mockResolvedValue(mockContents);

      await getFolderContents(req, res);

      expect(knowledgeService.getFolderContents).toHaveBeenCalledWith(
        null,
        mockUserId,
        req
      );
    });

    it('should retrieve folder contents for root if folderId is "null"', async () => {
      req.params = { folderId: 'null' };
      const mockContents = { files: [{ id: 'file1' }], folders: [] };
      knowledgeService.getFolderContents.mockResolvedValue(mockContents);

      await getFolderContents(req, res);

      expect(knowledgeService.getFolderContents).toHaveBeenCalledWith(
        null,
        mockUserId,
        req
      );
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { folderId: 'folder123' };

      await getFolderContents(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeService.getFolderContents).not.toHaveBeenCalled();
    });

    it('should handle service error during folder contents retrieval', async () => {
      req.params = { folderId: 'folder123' };
      const errorMessage = 'Service get folder contents failed';
      knowledgeService.getFolderContents.mockRejectedValue(
        new Error(errorMessage)
      );

      await getFolderContents(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving folder contents',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get folder contents error:',
        expect.any(Error)
      );
    });
  });

  // ==================== QUERY & CONVERSATIONAL CONTROLLERS ====================

  describe('conversationalQuery', () => {
    it('should process conversational query successfully', async () => {
      req.body = {
        message: 'Hello',
        conversationId: 'conv123',
        ownerType: OWNER_TYPES.USER,
        topK: 5,
      };
      const queryResult = { response: 'Hi there!' };
      knowledgeQueryService.conversationalQuery.mockResolvedValue(queryResult);

      await conversationalQuery(req, res);

      expect(knowledgeQueryService.conversationalQuery).toHaveBeenCalledWith(
        mockUserId,
        OWNER_TYPES.USER,
        mockUserId,
        'Hello',
        'conv123',
        { topK: 5 }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Query processed successfully',
        data: queryResult,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.body = { message: 'Hello', ownerType: OWNER_TYPES.USER };

      await conversationalQuery(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(
        knowledgeQueryService.conversationalQuery
      ).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if message is missing', async () => {
      req.body = { message: undefined, ownerType: OWNER_TYPES.USER };

      await conversationalQuery(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Message is required',
      });
      expect(
        knowledgeQueryService.conversationalQuery
      ).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.body = { message: 'Hello', ownerType: undefined };

      await conversationalQuery(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(
        knowledgeQueryService.conversationalQuery
      ).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is invalid', async () => {
      req.body = { message: 'Hello', ownerType: 'invalid' };

      await conversationalQuery(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(
        knowledgeQueryService.conversationalQuery
      ).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is bot but ownerId is missing', async () => {
      req.body = { message: 'Hello', ownerType: OWNER_TYPES.BOT };
      req.user = { userId: null, _id: null }; // Ensure no userId is picked up

      await conversationalQuery(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Owner ID is required',
      });
      expect(
        knowledgeQueryService.conversationalQuery
      ).not.toHaveBeenCalled();
    });

    it('should handle service error during conversational query', async () => {
      req.body = { message: 'Hello', ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service query failed';
      knowledgeQueryService.conversationalQuery.mockRejectedValue(
        new Error(errorMessage)
      );

      await conversationalQuery(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Conversational query error:',
        expect.any(Error)
      );
    });
  });

  describe('queryKnowledge', () => {
    it('should process direct query successfully', async () => {
      req.body = {
        query: 'What is the capital of France?',
        ownerType: OWNER_TYPES.USER,
        topK: 3,
      };
      const queryResult = { answer: 'Paris' };
      knowledgeQueryService.queryKnowledge.mockResolvedValue(queryResult);

      await queryKnowledge(req, res);

      expect(knowledgeQueryService.queryKnowledge).toHaveBeenCalledWith(
        'What is the capital of France?',
        OWNER_TYPES.USER,
        mockUserId,
        { topK: 3 }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Query processed successfully',
        data: queryResult,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.body = { query: 'Test', ownerType: OWNER_TYPES.USER };

      await queryKnowledge(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeQueryService.queryKnowledge).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if query is missing', async () => {
      req.body = { query: undefined, ownerType: OWNER_TYPES.USER };

      await queryKnowledge(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Query is required',
      });
      expect(knowledgeQueryService.queryKnowledge).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.body = { query: 'Test', ownerType: undefined };

      await queryKnowledge(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeQueryService.queryKnowledge).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is invalid', async () => {
      req.body = { query: 'Test', ownerType: 'invalid' };

      await queryKnowledge(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeQueryService.queryKnowledge).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is bot but ownerId is missing', async () => {
      req.body = { query: 'Test', ownerType: OWNER_TYPES.BOT };
      req.user = { userId: null, _id: null }; // Ensure no userId is picked up

      await queryKnowledge(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Owner ID is required',
      });
      expect(knowledgeQueryService.queryKnowledge).not.toHaveBeenCalled();
    });

    it('should handle service error during direct query', async () => {
      req.body = { query: 'Test', ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service query failed';
      knowledgeQueryService.queryKnowledge.mockRejectedValue(
        new Error(errorMessage)
      );

      await queryKnowledge(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Query error:',
        expect.any(Error)
      );
    });
  });

  describe('semanticSearch', () => {
    it('should perform semantic search successfully', async () => {
      req.body = {
        query: 'Relevant documents about AI',
        ownerType: OWNER_TYPES.USER,
        limit: 10,
      };
      const searchResult = [{ docId: 'doc1' }, { docId: 'doc2' }];
      knowledgeQueryService.semanticSearch.mockResolvedValue(searchResult);

      await semanticSearch(req, res);

      expect(knowledgeQueryService.semanticSearch).toHaveBeenCalledWith(
        'Relevant documents about AI',
        OWNER_TYPES.USER,
        mockUserId,
        { limit: 10 }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Search completed successfully',
        data: searchResult,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.body = { query: 'Test', ownerType: OWNER_TYPES.USER };

      await semanticSearch(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(knowledgeQueryService.semanticSearch).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if query is missing', async () => {
      req.body = { query: undefined, ownerType: OWNER_TYPES.USER };

      await semanticSearch(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Query is required',
      });
      expect(knowledgeQueryService.semanticSearch).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is missing', async () => {
      req.body = { query: 'Test', ownerType: undefined };

      await semanticSearch(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeQueryService.semanticSearch).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if ownerType is invalid', async () => {
      req.body = { query: 'Test', ownerType: 'invalid' };

      await semanticSearch(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: `Invalid ownerType. Must be 'user' or 'bot'`,
      });
      expect(knowledgeQueryService.semanticSearch).not.toHaveBeenCalled();
    });

    it('should handle service error during semantic search', async () => {
      req.body = { query: 'Test', ownerType: OWNER_TYPES.USER };
      const errorMessage = 'Service search failed';
      knowledgeQueryService.semanticSearch.mockRejectedValue(
        new Error(errorMessage)
      );

      await semanticSearch(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Semantic search error:',
        expect.any(Error)
      );
    });
  });

  describe('getConversationHistory', () => {
    it('should retrieve conversation history successfully', async () => {
      req.params = { conversationId: 'conv123' };
      const history = [{ role: 'user', message: 'Hi' }];
      knowledgeQueryService.getConversationHistory.mockResolvedValue(history);

      await getConversationHistory(req, res);

      expect(knowledgeQueryService.getConversationHistory).toHaveBeenCalledWith(
        'conv123',
        mockUserId
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Conversation history retrieved successfully',
        data: history,
      });
    });

    it('should return UNAUTHORIZED if userId is missing', async () => {
      req.user = null;
      req.params = { conversationId: 'conv123' };

      await getConversationHistory(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
      expect(
        knowledgeQueryService.getConversationHistory
      ).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if conversationId is missing', async () => {
      req.params = { conversationId: undefined };

      await getConversationHistory(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Conversation ID is required',
      });
      expect(
        knowledgeQueryService.getConversationHistory
      ).not.toHaveBeenCalled();
    });

    it('should handle service error during conversation history retrieval', async () => {
      req.params = { conversationId: 'conv123' };
      const errorMessage = 'Service get history failed';
      knowledgeQueryService.getConversationHistory.mockRejectedValue(
        new Error(errorMessage)
      );

      await getConversationHistory(req, res);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'An error occurred while retrieving conversation history',
      });
      expect(logger.error).toHaveBeenCalledWith(
        '[Knowledge] Get conversation history error:',
        expect.any(Error)
      );
    });
  });
});