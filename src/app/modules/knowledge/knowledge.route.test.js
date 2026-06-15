import { vi, describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock dependencies
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    USER: 'USER',
    ADMIN: 'ADMIN'
  }
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn().mockImplementation(() => (req, res, next) => next())
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: vi.fn().mockImplementation((req, res, next) => next())
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: vi.fn().mockImplementation(() => (req, res, next) => next())
}));

vi.mock('./middlewares/uploadKnowledge.js', () => ({
  uploadKnowledge: {
    single: vi.fn().mockImplementation(() => (req, res, next) => {
      req.file = { filename: 'test.pdf' };
      next();
    })
  }
}));

vi.mock('./knowledge.validation.js', () => ({
  KnowledgeValidation: {
    uploadFileSchema: { type: 'uploadFileSchema' },
    processFileSchema: { type: 'processFileSchema' },
    getFilesSchema: { type: 'getFilesSchema' },
    getFileByIdSchema: { type: 'getFileByIdSchema' },
    deleteFileSchema: { type: 'deleteFileSchema' },
    getStorageStatsSchema: { type: 'getStorageStatsSchema' },
    createFolderSchema: { type: 'createFolderSchema' },
    getFoldersSchema: { type: 'getFoldersSchema' },
    getFolderByIdSchema: { type: 'getFolderByIdSchema' },
    updateFolderSchema: { type: 'updateFolderSchema' },
    deleteFolderSchema: { type: 'deleteFolderSchema' },
    getFolderContentsSchema: { type: 'getFolderContentsSchema' },
    conversationalQuerySchema: { type: 'conversationalQuerySchema' },
    queryKnowledgeSchema: { type: 'queryKnowledgeSchema' },
    semanticSearchSchema: { type: 'semanticSearchSchema' },
    getConversationHistorySchema: { type: 'getConversationHistorySchema' }
  }
}));

vi.mock('./knowledge.controller.js', () => ({
  knowledgeController: {
    uploadFile: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'uploadFile' })),
    processFile: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'processFile' })),
    getFiles: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getFiles' })),
    getFileById: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getFileById' })),
    deleteFile: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'deleteFile' })),
    getStorageStats: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getStorageStats' })),
    createFolder: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'createFolder' })),
    getFolders: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getFolders' })),
    getFolderById: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getFolderById' })),
    updateFolder: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'updateFolder' })),
    deleteFolder: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'deleteFolder' })),
    getFolderContents: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getFolderContents' })),
    conversationalQuery: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'conversationalQuery' })),
    queryKnowledge: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'queryKnowledge' })),
    semanticSearch: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'semanticSearch' })),
    getConversationHistory: vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'getConversationHistory' }))
  }
}));

// Import router and mocked modules
import { knowledgeRoutes } from './knowledge.route.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { validateRequest } from '../../middlewares/validateRequest/validateRequest.js';
import { uploadKnowledge } from './middlewares/uploadKnowledge.js';
import { knowledgeController } from './knowledge.controller.js';
import { KnowledgeValidation } from './knowledge.validation.js';

const app = express();
app.use(express.json());
app.use('/api/v1/knowledge', knowledgeRoutes);

describe('Knowledge Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should call auth middleware with USER and ADMIN roles for all routes', async () => {
    await request(app).get('/api/v1/knowledge/files');
    expect(auth).toHaveBeenCalledWith('USER', 'ADMIN');
  });

  it('should call extractTenantContext middleware', async () => {
    await request(app).get('/api/v1/knowledge/files');
    expect(extractTenantContext).toHaveBeenCalled();
  });

  describe('File Routes', () => {
    it('POST /upload - should upload file and call uploadFile controller', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/upload')
        .send({ file: 'test' });

      expect(uploadKnowledge.single).toHaveBeenCalledWith('file');
      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.uploadFileSchema);
      expect(knowledgeController.uploadFile).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('uploadFile');
    });

    it('POST /process/:fileId - should process file and call processFile controller', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/process/123')
        .send();

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.processFileSchema);
      expect(knowledgeController.processFile).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('processFile');
    });

    it('GET /files - should get files and call getFiles controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/files')
        .query({ ownerType: 'user', ownerId: '123' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getFilesSchema);
      expect(knowledgeController.getFiles).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getFiles');
    });

    it('GET /files/:fileId - should get file by ID and call getFileById controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/files/123')
        .query({ ownerType: 'user', ownerId: '123' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getFileByIdSchema);
      expect(knowledgeController.getFileById).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getFileById');
    });

    it('DELETE /files/:fileId - should delete file and call deleteFile controller', async () => {
      const res = await request(app)
        .delete('/api/v1/knowledge/files/123');

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.deleteFileSchema);
      expect(knowledgeController.deleteFile).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('deleteFile');
    });

    it('GET /stats - should get storage stats and call getStorageStats controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/stats')
        .query({ ownerType: 'user', ownerId: '123' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getStorageStatsSchema);
      expect(knowledgeController.getStorageStats).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getStorageStats');
    });
  });

  describe('Folder Routes', () => {
    it('POST /folders - should create folder and call createFolder controller', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/folders')
        .send({ name: 'New Folder' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.createFolderSchema);
      expect(knowledgeController.createFolder).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('createFolder');
    });

    it('GET /folders - should get folders and call getFolders controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/folders');

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getFoldersSchema);
      expect(knowledgeController.getFolders).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getFolders');
    });

    it('GET /folders/:folderId - should get folder by ID and call getFolderById controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/folders/123');

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getFolderByIdSchema);
      expect(knowledgeController.getFolderById).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getFolderById');
    });

    it('PATCH /folders/:folderId - should update folder and call updateFolder controller', async () => {
      const res = await request(app)
        .patch('/api/v1/knowledge/folders/123')
        .send({ name: 'Updated Folder' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.updateFolderSchema);
      expect(knowledgeController.updateFolder).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('updateFolder');
    });

    it('DELETE /folders/:folderId - should delete folder and call deleteFolder controller', async () => {
      const res = await request(app)
        .delete('/api/v1/knowledge/folders/123');

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.deleteFolderSchema);
      expect(knowledgeController.deleteFolder).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('deleteFolder');
    });

    it('GET /folders/:folderId/contents - should get folder contents and call getFolderContents controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/folders/123/contents');

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getFolderContentsSchema);
      expect(knowledgeController.getFolderContents).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getFolderContents');
    });
  });

  describe('Query & Conversational Routes', () => {
    it('POST /chat - should perform conversational query and call conversationalQuery controller', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/chat')
        .send({ message: 'hello' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.conversationalQuerySchema);
      expect(knowledgeController.conversationalQuery).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('conversationalQuery');
    });

    it('POST /query - should perform direct query and call queryKnowledge controller', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/query')
        .send({ query: 'hello' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.queryKnowledgeSchema);
      expect(knowledgeController.queryKnowledge).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('queryKnowledge');
    });

    it('POST /search - should perform semantic search and call semanticSearch controller', async () => {
      const res = await request(app)
        .post('/api/v1/knowledge/search')
        .send({ query: 'hello' });

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.semanticSearchSchema);
      expect(knowledgeController.semanticSearch).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('semanticSearch');
    });

    it('GET /conversations/:conversationId - should get conversation history and call getConversationHistory controller', async () => {
      const res = await request(app)
        .get('/api/v1/knowledge/conversations/123');

      expect(validateRequest).toHaveBeenCalledWith(KnowledgeValidation.getConversationHistorySchema);
      expect(knowledgeController.getConversationHistory).toHaveBeenCalled();
      expect(res.status).toBe(200);
      expect(res.body.message).toBe('getConversationHistory');
    });
  });
});