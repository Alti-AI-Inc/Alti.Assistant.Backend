import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { workflowController } from '../controllers/workflow.controller.js';
import auth from '../../../middlewares/auth/auth.js';
import optionalAuth from '../../../middlewares/auth/optionalAuth.js';

// Mock express and its Router method
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  patch: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock workflowController functions
vi.mock('../controllers/workflow.controller.js', () => ({
  workflowController: {
    getUserWorkflowsController: vi.fn(),
    validateWorkflowLayoutController: vi.fn(),
    compileWorkflowLayoutController: vi.fn(),
    getWorkflowController: vi.fn(),
    updateWorkflowController: vi.fn(),
    deleteWorkflowController: vi.fn(),
    toggleWorkflowStatusController: vi.fn(),
    getWorkflowTemplatesController: vi.fn(),
    createFromTemplateController: vi.fn(),
  },
}));

// Mock auth middleware
const mockAuthMiddleware = vi.fn((req, res, next) => next());
vi.mock('../../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => mockAuthMiddleware), // auth() returns a middleware function
}));

// Mock optionalAuth middleware
const mockOptionalAuthMiddleware = vi.fn((req, res, next) => next());
vi.mock('../../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => mockOptionalAuthMiddleware), // optionalAuth() returns a middleware function
}));

// Import the router after all mocks are set up
// This will trigger the route definitions using the mocked express.Router()
import { workflowRoutes } from '../routes/workflow.routes.js';

describe('workflow.routes.js', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Ensure express.Router() is mocked to return our mockRouter
    express.Router.mockImplementation(() => mockRouter);
    // Re-import to ensure routes are re-defined with fresh mocks if needed,
    // though in this setup, the initial import already defined them.
    // We mainly clear mockRouter's call history.
  });

  it('should initialize an express router', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(workflowRoutes).toBe(mockRouter);
  });

  // Workflow management routes
  it('should define GET / route with auth and getUserWorkflowsController', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/',
      mockAuthMiddleware,
      workflowController.getUserWorkflowsController
    );
    expect(auth).toHaveBeenCalledWith(); // Ensure auth() was called
  });

  // Visual Layout Compilation & Validation routes
  it('should define POST /layout/validate route with auth and validateWorkflowLayoutController', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/layout/validate',
      mockAuthMiddleware,
      workflowController.validateWorkflowLayoutController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  it('should define POST /layout/compile route with auth and compileWorkflowLayoutController', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/layout/compile',
      mockAuthMiddleware,
      workflowController.compileWorkflowLayoutController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  it('should define GET /:workflowId route with auth and getWorkflowController', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:workflowId',
      mockAuthMiddleware,
      workflowController.getWorkflowController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  it('should define PUT /:workflowId route with auth and updateWorkflowController', () => {
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/:workflowId',
      mockAuthMiddleware,
      workflowController.updateWorkflowController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  it('should define DELETE /:workflowId route with auth and deleteWorkflowController', () => {
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/:workflowId',
      mockAuthMiddleware,
      workflowController.deleteWorkflowController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  it('should define PATCH /:workflowId/status route with auth and toggleWorkflowStatusController', () => {
    expect(mockRouter.patch).toHaveBeenCalledWith(
      '/:workflowId/status',
      mockAuthMiddleware,
      workflowController.toggleWorkflowStatusController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  // Template routes
  it('should define GET /templates/list route with optionalAuth and getWorkflowTemplatesController', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/templates/list',
      mockOptionalAuthMiddleware,
      workflowController.getWorkflowTemplatesController
    );
    expect(optionalAuth).toHaveBeenCalledWith(); // Ensure optionalAuth() was called
  });

  it('should define POST /templates/:templateId/create route with auth and createFromTemplateController', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/templates/:templateId/create',
      mockAuthMiddleware,
      workflowController.createFromTemplateController
    );
    expect(auth).toHaveBeenCalledWith();
  });

  it('should ensure all router methods were called the expected number of times', () => {
    // 2 GETs, 3 POSTs, 1 PUT, 1 DELETE, 1 PATCH
    expect(mockRouter.get).toHaveBeenCalledTimes(2);
    expect(mockRouter.post).toHaveBeenCalledTimes(3);
    expect(mockRouter.put).toHaveBeenCalledTimes(1);
    expect(mockRouter.delete).toHaveBeenCalledTimes(1);
    expect(mockRouter.patch).toHaveBeenCalledTimes(1);
  });

  it('should ensure auth middleware factory was called for all protected routes', () => {
    // 7 routes use auth()
    expect(auth).toHaveBeenCalledTimes(7);
  });

  it('should ensure optionalAuth middleware factory was called for its specific route', () => {
    // 1 route uses optionalAuth()
    expect(optionalAuth).toHaveBeenCalledTimes(1);
  });
});