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
  mockAnalyzeRequestSchema,
  mockGetConversationHistorySchema,
  mockUploadDocumentAnalysis
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

  // Validation schemas
  const mockAnalyzeRequestSchema = { type: 'object', properties: { /* ... */ }, _isJoi: true }; // Add _isJoi for potential Joi validation checks
  const mockGetConversationHistorySchema = { type: 'object', properties: { /* ... */ }, _isJoi: true };

  // Upload middleware object
  const mockUploadDocumentAnalysis = {
    single: vi.fn().mockImplementation((fieldName) => (req, res, next) => next()),
  };

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
    mockAnalyzeRequestSchema,
    mockGetConversationHistorySchema,
    mockUploadDocumentAnalysis
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
  },
}));

vi.mock('./document_analysis.validation.js', () => ({
  DocumentAnalysisValidation: {
    analyzeRequestSchema: mockAnalyzeRequestSchema,
    getConversationHistorySchema: mockGetConversationHistorySchema,
  },
}));

vi.mock('./middlewares/uploadDocumentAnalysis.js', () => ({
  uploadDocumentAnalysis: mockUploadDocumentAnalysis,
}));

let documentAnalysisRoutes;

describe('documentAnalysisRoutes', () => {
  beforeEach(async () => {
    // Clear all mocks for functions/objects that are not part of the router itself
    vi.clearAllMocks();

    // Reset modules to ensure express.Router() is called again, creating a new currentMockRouter
    // This is crucial for router files where the router instance is created at module load time.
    await vi.importActual('express'); // Ensure 'express' itself is not fully mocked away from resetModules
    vi.resetModules();

    // Now, import the module under test. This will trigger express.Router() and populate currentMockRouter.
    const module = await import('./document_analysis.route.js');
    documentAnalysisRoutes = module.documentAnalysisRoutes;
  });

  it('should export an express router', () => {
    expect(documentAnalysisRoutes).toBe(currentMockRouter);
  });

  describe('POST /analyze', () => {
    it('should define the POST /analyze route with correct middleware in order', () => {
      expect(currentMockRouter.post).toHaveBeenCalledTimes(1);
      const [path, ...middlewares] = currentMockRouter.post.mock.calls[0];

      expect(path).toBe('/analyze');
      expect(middlewares).toHaveLength(8); // Total number of middleware functions

      // Verify specific middleware calls and arguments
      // 1. optionalAuth()
      expect(mockOptionalAuth).toHaveBeenCalledTimes(1);
      expect(middlewares[0]).toBeInstanceOf(Function); // The actual middleware returned by optionalAuth()

      // 2. extractTenantContext
      expect(middlewares[1]).toBe(mockExtractTenantContext);

      // 3. checkDailyRequestLimit
      expect(middlewares[2]).toBe(mockCheckDailyRequestLimit);

      // 4. checkStorageLimit
      expect(middlewares[3]).toBe(mockCheckStorageLimit);

      // 5. uploadDocumentAnalysis.single('file')
      expect(mockUploadDocumentAnalysis.single).toHaveBeenCalledTimes(1);
      expect(mockUploadDocumentAnalysis.single).toHaveBeenCalledWith('file');
      expect(middlewares[4]).toBeInstanceOf(Function); // The actual middleware returned by uploadDocumentAnalysis.single()

      // 6. checkRAGFeature
      expect(middlewares[5]).toBe(mockCheckRAGFeature);

      // 7. validateRequest(DocumentAnalysisValidation.analyzeRequestSchema)
      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockAnalyzeRequestSchema);
      expect(middlewares[6]).toBeInstanceOf(Function); // The actual middleware returned by validateRequest()

      // 8. documentAnalysisController.analyzeDocument
      expect(middlewares[7]).toBe(mockAnalyzeDocument);
    });
  });

  describe('GET /conversation/:conversationId', () => {
    it('should define the GET /conversation/:conversationId route with correct middleware in order', () => {
      expect(currentMockRouter.get).toHaveBeenCalledTimes(1);
      const [path, ...middlewares] = currentMockRouter.get.mock.calls[0];

      expect(path).toBe('/conversation/:conversationId');
      expect(middlewares).toHaveLength(4); // Total number of middleware functions

      // Verify specific middleware calls and arguments
      // 1. auth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN)
      expect(mockAuth).toHaveBeenCalledTimes(1);
      expect(mockAuth).toHaveBeenCalledWith('user', 'admin'); // Using mocked ENUM_USER_ROLE
      expect(middlewares[0]).toBeInstanceOf(Function); // The actual middleware returned by auth()

      // 2. extractTenantContext
      expect(middlewares[1]).toBe(mockExtractTenantContext);

      // 3. validateRequest(DocumentAnalysisValidation.getConversationHistorySchema)
      // Note: mockValidateRequest will have been called once for POST /analyze and once for this GET route.
      expect(mockValidateRequest).toHaveBeenCalledTimes(2); // Total calls across all routes in this test run
      expect(mockValidateRequest).toHaveBeenCalledWith(mockGetConversationHistorySchema);
      expect(middlewares[2]).toBeInstanceOf(Function); // The actual middleware returned by validateRequest()

      // 4. documentAnalysisController.getConversationHistory
      expect(middlewares[3]).toBe(mockGetConversationHistory);
    });
  });
});