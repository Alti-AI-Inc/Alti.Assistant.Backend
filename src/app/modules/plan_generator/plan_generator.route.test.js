import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

const {
  mockRouter,
  mockAuth,
  mockOptionalAuth,
  mockCheckDailyRequestLimit,
  mockCheckStorageLimit,
  mockUploadPlanFiles,
  mockCheckRAGFeature,
  mockValidateRequest,
  mockExtractTenantContext,
  mockConversationalAssistant,
  mockConversationalAssistantAsync,
  mockGetTaskStatus,
  mockGeneratePlan,
  mockBrainstormIdea,
  mockExportPlan,
  mockGetConversationHistory
} = vi.hoisted(() => {
  // Mock express and its Router
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
  };

  // Mock all middleware functions
  const mockAuth = vi.fn().mockImplementation(() => (req, res, next) => next());
  const mockOptionalAuth = vi.fn().mockImplementation(() => (req, res, next) => next());
  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());
  const mockCheckStorageLimit = vi.fn().mockImplementation((req, res, next) => next());
  const mockUploadPlanFiles = { single: vi.fn().mockImplementation(() => (req, res, next) => next()) };
  const mockCheckRAGFeature = vi.fn().mockImplementation((req, res, next) => next());
  const mockValidateRequest = vi.fn().mockImplementation(() => (req, res, next) => next());
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => next());

  // Mock the controller methods
  const mockConversationalAssistant = vi.fn().mockImplementation((req, res, next) => res.status(200).json({ success: true }));
  const mockConversationalAssistantAsync = vi.fn().mockImplementation(
    (req, res, next) => res.status(202).json({ success: true, taskId: 'mockTaskId' })
  );
  const mockGetTaskStatus = vi.fn().mockImplementation(
    (req, res, next) => res.status(200).json({ success: true, status: 'completed' })
  );
  const mockGeneratePlan = vi.fn().mockImplementation((req, res, next) => res.status(200).json({ success: true, plan: {} }));
  const mockBrainstormIdea = vi.fn().mockImplementation((req, res, next) => res.status(200).json({ success: true, ideas: [] }));
  const mockExportPlan = vi.fn().mockImplementation((req, res, next) => res.status(200).send('file content'));
  const mockGetConversationHistory = vi.fn().mockImplementation(
    (req, res, next) => res.status(200).json({ success: true, conversation: [] })
  );

  return {
    mockRouter,
    mockAuth,
    mockOptionalAuth,
    mockCheckDailyRequestLimit,
    mockCheckStorageLimit,
    mockUploadPlanFiles,
    mockCheckRAGFeature,
    mockValidateRequest,
    mockExtractTenantContext,
    mockConversationalAssistant,
    mockConversationalAssistantAsync,
    mockGetTaskStatus,
    mockGeneratePlan,
    mockBrainstormIdea,
    mockExportPlan,
    mockGetConversationHistory
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({ default: mockAuth }));
vi.mock('../../middlewares/auth/optionalAuth.js', () => ({ default: mockOptionalAuth }));
vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({ default: mockCheckDailyRequestLimit }));
vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({ default: mockCheckStorageLimit }));
vi.mock('./middlewares/uploadPlanFiles.js', () => ({ uploadPlanFiles: mockUploadPlanFiles }));
vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({ default: mockCheckRAGFeature }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: mockValidateRequest }));
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({ extractTenantContext: mockExtractTenantContext }));

vi.mock('./plan_generator.controller.js', () => ({
  planGeneratorController: {
    conversationalAssistant: mockConversationalAssistant,
    conversationalAssistantAsync: mockConversationalAssistantAsync,
    getTaskStatus: mockGetTaskStatus,
    generatePlan: mockGeneratePlan,
    brainstormIdea: mockBrainstormIdea,
    exportPlan: mockExportPlan,
    getConversationHistory: mockGetConversationHistory,
  },
}));

// Mock validation schemas (they are just objects for validateRequest)
vi.mock('./plan_generator.validation.js', () => ({
  PlanGeneratorValidation: {
    conversationalRequestSchema: { type: 'object' },
    generatePlanSchema: { type: 'object' },
    brainstormSchema: { type: 'object' },
    exportPlanSchema: { type: 'object' },
    getConversationHistorySchema: { type: 'object' },
  },
}));

// Import ENUM_USER_ROLE directly as it's a constant
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// Import the file *after* all mocks are set up
import { planGeneratorRoutes } from './plan_generator.route.js';

describe('planGeneratorRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-mock express.Router to ensure mockRouter is fresh for each test
    vi.mock('express', () => ({
      default: {
        Router: vi.fn().mockImplementation(() => mockRouter),
      },
    }));
    // Re-import the routes to ensure the router is re-initialized with fresh mocks
    // This is important because the router is created at module load time
    // If not re-imported, the mockRouter from the first import would persist
    // For this specific case, since `planGeneratorRoutes` is a named export of `router`,
    // and `router` is created once, we need to ensure `mockRouter` is cleared.
    // The `vi.mock('express', ...)` above already ensures `mockRouter` is reset.
    // So, we just need to ensure the `mockRouter` methods are cleared.
  });

  it('should initialize express router', () => {
    expect(express.Router).toHaveBeenCalledOnce();
  });

  it('should define the /assistant POST route with correct middleware', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/assistant',
      mockOptionalAuth(),
      mockExtractTenantContext,
      mockCheckDailyRequestLimit,
      mockCheckStorageLimit,
      mockUploadPlanFiles.single('file'),
      mockCheckRAGFeature,
      mockValidateRequest(expect.any(Object)), // Schema object
      expect.any(Function) // asyncHandler(planGeneratorController.conversationalAssistant)
    );

    // Verify validateRequest was called with the correct schema
    expect(mockValidateRequest).toHaveBeenCalledWith(PlanGeneratorValidation.conversationalRequestSchema);

    // Verify uploadPlanFiles.single was called with 'file'
    expect(mockUploadPlanFiles.single).toHaveBeenCalledWith('file');

    // Verify optionalAuth was called
    expect(mockOptionalAuth).toHaveBeenCalledOnce();

    // Verify the last argument is a function (the wrapped controller)
    const lastArg = mockRouter.post.mock.calls[0][mockRouter.post.mock.calls[0].length - 1];
    expect(typeof lastArg).toBe('function');
  });

  it('should define the /assistant/async POST route with correct middleware', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/assistant/async',
      mockOptionalAuth(),
      mockExtractTenantContext,
      mockCheckDailyRequestLimit,
      mockCheckStorageLimit,
      mockUploadPlanFiles.single('file'),
      mockValidateRequest(expect.any(Object)), // Schema object
      expect.any(Function) // asyncHandler(planGeneratorController.conversationalAssistantAsync)
    );

    expect(mockValidateRequest).toHaveBeenCalledWith(PlanGeneratorValidation.conversationalRequestSchema);
    expect(mockUploadPlanFiles.single).toHaveBeenCalledWith('file');
    expect(mockOptionalAuth).toHaveBeenCalledTimes(2); // Called for /assistant and /assistant/async
  });

  it('should define the /task/:taskId GET route with correct middleware', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/task/:taskId',
      mockOptionalAuth(),
      expect.any(Function) // asyncHandler(planGeneratorController.getTaskStatus)
    );
    expect(mockOptionalAuth).toHaveBeenCalledTimes(3); // Called for /assistant, /assistant/async, and /task/:taskId
  });

  it('should define the /generate POST route with correct middleware', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/generate',
      mockOptionalAuth(),
      mockExtractTenantContext,
      mockCheckDailyRequestLimit,
      mockValidateRequest(expect.any(Object)), // Schema object
      expect.any(Function) // asyncHandler(planGeneratorController.generatePlan)
    );
    expect(mockValidateRequest).toHaveBeenCalledWith(PlanGeneratorValidation.generatePlanSchema);
    expect(mockOptionalAuth).toHaveBeenCalledTimes(4); // Called for previous routes + /generate
  });

  it('should define the /brainstorm POST route with correct middleware', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/brainstorm',
      mockOptionalAuth(),
      mockExtractTenantContext,
      mockCheckDailyRequestLimit,
      mockValidateRequest(expect.any(Object)), // Schema object
      expect.any(Function) // asyncHandler(planGeneratorController.brainstormIdea)
    );
    expect(mockValidateRequest).toHaveBeenCalledWith(PlanGeneratorValidation.brainstormSchema);
    expect(mockOptionalAuth).toHaveBeenCalledTimes(5); // Called for previous routes + /brainstorm
  });

  it('should define the /export POST route with correct middleware', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/export',
      mockOptionalAuth(),
      mockExtractTenantContext,
      mockCheckDailyRequestLimit,
      mockValidateRequest(expect.any(Object)), // Schema object
      expect.any(Function) // asyncHandler(planGeneratorController.exportPlan)
    );
    expect(mockValidateRequest).toHaveBeenCalledWith(PlanGeneratorValidation.exportPlanSchema);
    expect(mockOptionalAuth).toHaveBeenCalledTimes(6); // Called for previous routes + /export
  });

  it('should define the /conversation/:conversationId GET route with correct middleware', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/conversation/:conversationId',
      mockAuth(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN),
      mockValidateRequest(expect.any(Object)), // Schema object
      expect.any(Function) // asyncHandler(planGeneratorController.getConversationHistory)
    );
    expect(mockValidateRequest).toHaveBeenCalledWith(PlanGeneratorValidation.getConversationHistorySchema);
    expect(mockAuth).toHaveBeenCalledWith(ENUM_USER_ROLE.USER, ENUM_USER_ROLE.ADMIN);
  });
});