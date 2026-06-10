import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express'; // Need to import to mock it
import { executionController } from '../controllers/execution.controller.js'; // Need to import to mock it
import auth from '../../../middlewares/auth/auth.js'; // Need to import to mock it

// Mock external dependencies first
// Mock for auth.js: auth() returns a middleware function.
const mockAuthMiddlewareInstance = vi.fn((req, res, next) => next()); // The actual middleware function
const mockAuthFactory = vi.fn(() => mockAuthMiddlewareInstance); // The function that auth.js exports, which when called, returns the middleware
vi.mock('../../../middlewares/auth/auth.js', () => ({
  default: mockAuthFactory,
}));

// Mock for execution.controller.js
const mockExecutionController = {
  getConnectionHealthController: vi.fn(),
  refreshConnectionController: vi.fn(),
  executeWorkflowController: vi.fn(),
  getExecutionHistoryController: vi.fn(),
  getExecutionDetailsController: vi.fn(),
  cancelExecutionController: vi.fn(),
  replayExecutionController: vi.fn(),
  getPendingApprovalsController: vi.fn(),
  resolveApprovalController: vi.fn(),
  scheduleWorkflowController: vi.fn(),
  unscheduleWorkflowController: vi.fn(),
  handleWebhookTriggerController: vi.fn(),
};
vi.mock('../controllers/execution.controller.js', () => ({
  executionController: mockExecutionController,
}));

// Mock for express.Router
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Import the module under test AFTER mocks are set up
// This will execute the route definitions and register routes on mockRouter
import { executionRoutes } from '../routes/execution.routes.js';

describe('execution.routes', () => {
  beforeEach(() => {
    vi.clearAllMocks(); // Clears all mock call histories
    // Re-setup the mockAuthFactory to return the mockAuthMiddlewareInstance
    mockAuthFactory.mockImplementation(() => mockAuthMiddlewareInstance);
  });

  it('should export an express router instance', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(executionRoutes).toBe(mockRouter);
  });

  // Helper function to test individual routes
  const testRoute = async (method, path, controllerMethod, isAuthenticated = true) => {
    const routerMethod = mockRouter[method];
    expect(routerMethod).toHaveBeenCalledWith(
      path,
      ...(isAuthenticated ? [mockAuthMiddlewareInstance] : []), // auth() middleware instance
      expect.any(Function) // catchAsync wrapped controller
    );

    const call = routerMethod.mock.calls.find(c => c[0] === path);
    expect(call).toBeDefined();

    const handlerIndex = isAuthenticated ? 2 : 1; // Index of the catchAsync wrapped handler
    const wrappedHandler = call[handlerIndex];

    expect(typeof wrappedHandler).toBe('function');

    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    // Call the wrapped handler to ensure it calls the controller
    await wrappedHandler(mockReq, mockRes, mockNext);

    expect(controllerMethod).toHaveBeenCalledTimes(1);
    expect(controllerMethod).toHaveBeenCalledWith(mockReq, mockRes, mockNext);

    // Ensure the auth middleware itself was not called during route definition,
    // but only the factory function `auth()` was called if authenticated.
    expect(mockAuthMiddlewareInstance).not.toHaveBeenCalled();
  };

  // Connection health monitoring routes
  it('should define GET /connections/health route with auth and correct controller', async () => {
    await testRoute('get', '/connections/health', mockExecutionController.getConnectionHealthController);
  });

  it('should define POST /connections/refresh route with auth and correct controller', async () => {
    await testRoute('post', '/connections/refresh', mockExecutionController.refreshConnectionController);
  });

  // Workflow execution routes
  it('should define POST /:workflowId/execute route with auth and correct controller', async () => {
    await testRoute('post', '/:workflowId/execute', mockExecutionController.executeWorkflowController);
  });

  it('should define GET /:workflowId/executions route with auth and correct controller', async () => {
    await testRoute('get', '/:workflowId/executions', mockExecutionController.getExecutionHistoryController);
  });

  it('should define GET /executions/:executionId route with auth and correct controller', async () => {
    await testRoute('get', '/executions/:executionId', mockExecutionController.getExecutionDetailsController);
  });

  it('should define POST /executions/:executionId/cancel route with auth and correct controller', async () => {
    await testRoute('post', '/executions/:executionId/cancel', mockExecutionController.cancelExecutionController);
  });

  it('should define POST /executions/:executionId/replay route with auth and correct controller', async () => {
    await testRoute('post', '/executions/:executionId/replay', mockExecutionController.replayExecutionController);
  });

  // Human-in-the-loop approvals routes
  it('should define GET /approvals/pending route with auth and correct controller', async () => {
    await testRoute('get', '/approvals/pending', mockExecutionController.getPendingApprovalsController);
  });

  it('should define POST /approvals/:approvalId/resolve route with auth and correct controller', async () => {
    await testRoute('post', '/approvals/:approvalId/resolve', mockExecutionController.resolveApprovalController);
  });

  // Workflow scheduling routes
  it('should define POST /:workflowId/schedule route with auth and correct controller', async () => {
    await testRoute('post', '/:workflowId/schedule', mockExecutionController.scheduleWorkflowController);
  });

  it('should define POST /:workflowId/unschedule route with auth and correct controller', async () => {
    await testRoute('post', '/:workflowId/unschedule', mockExecutionController.unscheduleWorkflowController);
  });

  // Public dynamic webhook trigger route
  it('should define POST /webhooks/:webhookId route without auth and correct controller', async () => {
    await testRoute('post', '/webhooks/:webhookId', mockExecutionController.handleWebhookTriggerController, false);
    // Ensure auth() factory was NOT called for this specific route
    const call = mockRouter.post.mock.calls.find(c => c[0] === '/webhooks/:webhookId');
    expect(call.length).toBe(2); // Path and handler, no auth middleware
  });

  it('should call auth() factory for all authenticated routes', () => {
    // Count how many routes are authenticated (all except /webhooks/:webhookId)
    const authenticatedRoutesCount = 11;
    expect(mockAuthFactory).toHaveBeenCalledTimes(authenticatedRoutesCount);
  });

  it('should handle errors from async controllers using catchAsync and pass them to next', async () => {
    const errorMessage = 'Controller failed due to an internal error';
    mockExecutionController.getConnectionHealthController.mockImplementationOnce(() => {
      throw new Error(errorMessage);
    });

    const call = mockRouter.get.mock.calls.find(c => c[0] === '/connections/health');
    expect(call).toBeDefined();

    const wrappedHandler = call[2]; // Assuming it's the third argument after path and auth middleware

    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    // Call the wrapped handler
    await wrappedHandler(mockReq, mockRes, mockNext);

    // Expect the controller to have been called
    expect(mockExecutionController.getConnectionHealthController).toHaveBeenCalledTimes(1);
    expect(mockExecutionController.getConnectionHealthController).toHaveBeenCalledWith(mockReq, mockRes, mockNext);

    // Expect next() to have been called with the error
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(mockNext.mock.calls[0][0].message).toBe(errorMessage);
  });

  it('should handle rejected promises from async controllers using catchAsync and pass them to next', async () => {
    const errorMessage = 'Promise rejected in controller';
    mockExecutionController.refreshConnectionController.mockImplementationOnce(() => {
      return Promise.reject(new Error(errorMessage));
    });

    const call = mockRouter.post.mock.calls.find(c => c[0] === '/connections/refresh');
    expect(call).toBeDefined();

    const wrappedHandler = call[2]; // Assuming it's the third argument after path and auth middleware

    const mockReq = {};
    const mockRes = {};
    const mockNext = vi.fn();

    // Call the wrapped handler
    await wrappedHandler(mockReq, mockRes, mockNext);

    // Expect the controller to have been called
    expect(mockExecutionController.refreshConnectionController).toHaveBeenCalledTimes(1);
    expect(mockExecutionController.refreshConnectionController).toHaveBeenCalledWith(mockReq, mockRes, mockNext);

    // Expect next() to have been called with the error
    expect(mockNext).toHaveBeenCalledTimes(1);
    expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    expect(mockNext.mock.calls[0][0].message).toBe(errorMessage);
  });
});