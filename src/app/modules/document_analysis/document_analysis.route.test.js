import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExtractTenantContext,
  mockCheckDailyRequestLimit,
  mockCheckStorageLimit,
  mockCheckRAGFeature,
  mockAuth,
  mockOptionalAuth,
  mockValidateRequest,
  mockAnalyzeDocument,
  mockGetConversationHistory,
  mockGenerateUploadUrl,
  mockAnalyzeRequestSchema,
  mockGetConversationHistorySchema,
  mockGenerateUploadUrlSchema,
} = vi.hoisted(() => {
  // Mock all dependencies
  // Middleware functions that are directly imported and used
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());
  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());
  const mockCheckStorageLimit = vi.fn().mockImplementation((req, res, next) => next());
  const mockCheckRAGFeature = vi.fn().mockImplementation((req, res, next) => next());

  // Middleware functions that are factories (return a middleware)
  const mockAuth = vi.fn().mockImplementation((...roles) => (req, res, next) => next());
  const mockOptionalAuth = vi.fn().mockImplementation(() => (req, res, next) => next());
  const mockValidateRequest = vi.fn().mockImplementation((schema) => (req, res, next) => next());

  // Controller methods
  const mockAnalyzeDocument = vi.fn();
  const mockGetConversationHistory = vi.fn();
  const mockGenerateUploadUrl = vi.fn();

  // Validation schemas
  const mockAnalyzeRequestSchema = { type: 'object', properties: {}, _isJoi: true };
  const mockGetConversationHistorySchema = { type: 'object', properties: {}, _isJoi: true };
  const mockGenerateUploadUrlSchema = { type: 'object', properties: {}, _isJoi: true };

  return {
    mockExtractTenantContext,
    mockCheckDailyRequestLimit,
    mockCheckStorageLimit,
    mockCheckRAGFeature,
    mockAuth,
    mockOptionalAuth,
    mockValidateRequest,
    mockAnalyzeDocument,
    mockGetConversationHistory,
    mockGenerateUploadUrl,
    mockAnalyzeRequestSchema,
    mockGetConversationHistorySchema,
    mockGenerateUploadUrlSchema,
  };
});

// Mock express router factory
const createMockRouter = () => ({
  post: vi.fn(),
  get: vi.fn(),
});

let currentMockRouter; // To hold the router instance for the current test

// Mock express to return a new router for each test
vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => {
      currentMockRouter = createMockRouter();
      return currentMockRouter;
    }),
  },
}));

// Mock shared enum
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    USER: 'user',
    ADMIN: 'admin',
  },
}));

// Mock middleware imports
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuth,
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: mockOptionalAuth,
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: mockCheckStorageLimit,
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: mockValidateRequest,
}));

vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: mockCheckRAGFeature,
}));

// Mock controller and validation imports
vi.mock('./document_analysis.controller.js', () => ({
  documentAnalysisController: {
    analyzeDocument: mockAnalyzeDocument,
    getConversationHistory: mockGetConversationHistory,
    generateUploadUrl: mockGenerateUploadUrl,
  },
}));

vi.mock('./document_analysis.validation.js', () => ({
  DocumentAnalysisValidation: {
    analyzeRequestSchema: mockAnalyzeRequestSchema,
    getConversationHistorySchema: mockGetConversationHistorySchema,
    generateUploadUrlSchema: mockGenerateUploadUrlSchema,
  },
}));

let documentAnalysisRoutes;

describe('documentAnalysisRoutes', () => {
  beforeEach(async () => {
    // Clear all mocks for functions/objects that are not part of the router itself
    vi.clearAllMocks();

    // Reset modules to ensure express.Router() is called again, creating a new currentMockRouter
    await vi.importActual('express'); // Ensure 'express' itself is not fully mocked away from resetModules
    vi.resetModules();

    // Now, import the module under test. This will trigger express.Router() and populate currentMockRouter.
    const module = await import('./document_analysis.route.js');
    documentAnalysisRoutes = module.documentAnalysisRoutes;
  });

  it('should export an express router', () => {
    expect(documentAnalysisRoutes).toBe(currentMockRouter);
  });

  describe('POST /generate-upload-url', () => {
    it('should define the POST /generate-upload-url route with correct middleware in order', () => {
      expect(currentMockRouter.post).toHaveBeenCalledTimes(2); // generate-upload-url and analyze
      const uploadUrlCall = currentMockRouter.post.mock.calls.find(call => call[0] === '/generate-upload-url');
      expect(uploadUrlCall).toBeDefined();

      const [path, ...middlewares] = uploadUrlCall;
      expect(path).toBe('/generate-upload-url');
      expect(middlewares).toHaveLength(5); // auth, extractTenantContext, checkStorageLimit, validateRequest, generateUploadUrl

      // 1. auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN)
      expect(mockAuth).toHaveBeenCalledWith('user', 'admin');
      expect(middlewares[0]).toBeInstanceOf(Function);

      // 2. extractTenantContext
      expect(middlewares[1]).toBe(mockExtractTenantContext);

      // 3. checkStorageLimit
      expect(middlewares[2]).toBe(mockCheckStorageLimit);

      // 4. validateRequest(DocumentAnalysisValidation.generateUploadUrlSchema)
      expect(mockValidateRequest).toHaveBeenCalledWith(mockGenerateUploadUrlSchema);
      expect(middlewares[3]).toBeInstanceOf(Function);

      // 5. generateUploadUrl
      expect(middlewares[4]).toBe(mockGenerateUploadUrl);
    });
  });

  describe('POST /analyze', () => {
    it('should define the POST /analyze route with correct middleware in order', () => {
      expect(currentMockRouter.post).toHaveBeenCalledTimes(2);
      const analyzeCall = currentMockRouter.post.mock.calls.find(call => call[0] === '/analyze');
      expect(analyzeCall).toBeDefined();

      const [path, ...middlewares] = analyzeCall;
      expect(path).toBe('/analyze');
      expect(middlewares).toHaveLength(7); // optionalAuth, conditionalAnalyzeLimiter, extractTenantContext, checkDailyRequestLimit, checkRAGFeature, validateRequest, analyzeDocument

      // 1. optionalAuth()
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
      expect(middlewares[0]).toBeInstanceOf(Function);

      // 2. conditionalAnalyzeLimiter
      expect(middlewares[1]).toBeInstanceOf(Function);

      // 3. extractTenantContext
      expect(middlewares[2]).toBe(mockExtractTenantContext);

      // 4. checkDailyRequestLimit
      expect(middlewares[3]).toBe(mockCheckDailyRequestLimit);

      // 5. checkRAGFeature
      expect(middlewares[4]).toBe(mockCheckRAGFeature);

      // 6. validateRequest(DocumentAnalysisValidation.analyzeRequestSchema)
      expect(mockValidateRequest).toHaveBeenCalledWith(mockAnalyzeRequestSchema);
      expect(middlewares[5]).toBeInstanceOf(Function);

      // 7. documentAnalysisController.analyzeDocument
      expect(middlewares[6]).toBe(mockAnalyzeDocument);
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should define the GET /conversation/:conversationId route with correct middleware in order', () => {
      expect(currentMockRouter.get).toHaveBeenCalledTimes(1);
      const [path, ...middlewares] = currentMockRouter.get.mock.calls[0];

      expect(path).toBe('/conversation/:conversationId');
      expect(middlewares).toHaveLength(5); // auth, getConversationLimiter, extractTenantContext, validateRequest, getConversationHistory

      // 1. auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN)
      expect(mockAuth).toHaveBeenCalledWith('user', 'admin');
      expect(middlewares[0]).toBeInstanceOf(Function);

      // 2. getConversationLimiter
      expect(middlewares[1]).toBeInstanceOf(Function);

      // 3. extractTenantContext
      expect(middlewares[2]).toBe(mockExtractTenantContext);

      // 4. validateRequest(DocumentAnalysisValidation.getConversationHistorySchema)
      expect(mockValidateRequest).toHaveBeenCalledWith(mockGetConversationHistorySchema);
      expect(middlewares[3]).toBeInstanceOf(Function);

      // 5. documentAnalysisController.getConversationHistory
      expect(middlewares[4]).toBe(mockGetConversationHistory);
    });
  });
});