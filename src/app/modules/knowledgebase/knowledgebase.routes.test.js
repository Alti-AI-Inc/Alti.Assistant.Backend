import { vi, describe, it, expect, beforeEach } from 'vitest';
import { knowledgebaseController } from './knowledgebase.controller.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';
import multer from 'multer';

// Mock dependencies
vi.mock('./knowledgebase.controller.js', () => ({
  knowledgebaseController: {
    createKnowledgeBase: vi.fn(),
    getUserKnowledgeBases: vi.fn(),
    uploadFile: vi.fn(),
    getUserFiles: vi.fn(),
    deleteFile: vi.fn(),
    deleteKnowledgeBase: vi.fn(),
    invokeRagSystem: vi.fn(),
    chatWithKnowledgeBase: vi.fn(),
    getKnowledgeBaseConversations: vi.fn(),
    getConversationMessages: vi.fn(),
  },
}));

const authMiddleware = vi.fn();
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => authMiddleware),
}));

const optionalAuthMiddleware = vi.fn();
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => optionalAuthMiddleware),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: vi.fn(),
}));

vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: vi.fn(),
}));

vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: vi.fn(),
}));

const multerAnyMiddleware = vi.fn();
const mockUpload = {
  any: vi.fn(() => multerAnyMiddleware),
};
vi.mock('multer', () => ({
  default: vi.fn(() => mockUpload),
  diskStorage: vi.fn(),
}));

vi.mock('os', () => ({
  default: {
    tmpdir: vi.fn(() => '/tmp'),
  },
}));

vi.mock('path', () => ({
  default: {
    extname: vi.fn(name => `.${name.split('.').pop()}`),
  },
}));

// Dynamically import the router after all mocks are set up
const { default: router } = await import('./knowledgebase.routes.js');

describe('KnowledgeBase Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const findRoute = (path, method) => {
    return router.stack.find(
      layer => layer.route && layer.route.path === path && layer.route.methods[method]
    );
  };

  const getHandlers = route => {
    if (!route) return [];
    return route.route.stack.map(layer => layer.handle);
  };

  it('should configure POST /create route correctly', () => {
    const route = findRoute('/create', 'post');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      checkRAGFeature,
      knowledgebaseController.createKnowledgeBase,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure GET /list route correctly', () => {
    const route = findRoute('/list', 'get');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      knowledgebaseController.getUserKnowledgeBases,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure POST /upload route correctly', () => {
    const route = findRoute('/upload', 'post');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      optionalAuthMiddleware,
      extractTenantContext,
      checkStorageLimit,
      multerAnyMiddleware,
      checkRAGFeature,
      knowledgebaseController.uploadFile,
    ]);
    expect(optionalAuth).toHaveBeenCalledWith();
    expect(multer).toHaveBeenCalled();
    expect(mockUpload.any).toHaveBeenCalled();
  });

  it('should configure GET /files route correctly', () => {
    const route = findRoute('/files', 'get');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      knowledgebaseController.getUserFiles,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure DELETE /files/:fileId route correctly', () => {
    const route = findRoute('/files/:fileId', 'delete');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      knowledgebaseController.deleteFile,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure DELETE /:knowledgebaseId route correctly', () => {
    const route = findRoute('/:knowledgebaseId', 'delete');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      knowledgebaseController.deleteKnowledgeBase,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure POST /invoke-rag route correctly', () => {
    const route = findRoute('/invoke-rag', 'post');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      optionalAuthMiddleware,
      extractTenantContext,
      checkRAGFeature,
      knowledgebaseController.invokeRagSystem,
    ]);
    expect(optionalAuth).toHaveBeenCalledWith();
  });

  it('should configure POST /chat route correctly', () => {
    const route = findRoute('/chat', 'post');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      checkRAGFeature,
      knowledgebaseController.chatWithKnowledgeBase,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure GET /:knowledgebaseId/conversations route correctly', () => {
    const route = findRoute('/:knowledgebaseId/conversations', 'get');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      knowledgebaseController.getKnowledgeBaseConversations,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });

  it('should configure GET /conversations/:conversationId/messages route correctly', () => {
    const route = findRoute('/conversations/:conversationId/messages', 'get');
    expect(route).toBeDefined();
    const handlers = getHandlers(route);
    expect(handlers).toEqual([
      authMiddleware,
      extractTenantContext,
      knowledgebaseController.getConversationMessages,
    ]);
    expect(auth).toHaveBeenCalledWith();
  });
});