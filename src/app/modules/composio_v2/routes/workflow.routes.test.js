import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express'; // Import express to mock it correctly

const {
  mockRouter,
  mockWorkflowController
} = vi.hoisted(() => {
  // Mock express and its Router method
  const mockRouter = {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };

  // Mock the workflowController module
  const mockWorkflowController = {
    createWorkflowController: vi.fn(),
    getUserWorkflowsController: vi.fn(),
    getWorkflowController: vi.fn(),
    updateWorkflowController: vi.fn(),
    deleteWorkflowController: vi.fn(),
    triggerWorkflowController: vi.fn(),
    pauseWorkflowController: vi.fn(),
    resumeWorkflowController: vi.fn(),
    getWorkflowExecutionsController: vi.fn(),
    getExecutionController: vi.fn(),
  };

  return {
    mockRouter,
    mockWorkflowController
  };
});

// Mock the default export of 'express' to return our mockRouter when Router() is called
vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
}));

// Mock the specific named export 'workflowController' from its path
vi.mock('../controllers/workflow.controller.js', () => ({
  workflowController: mockWorkflowController,
}));

// Import the module under test AFTER all mocks are defined.
// This ensures that when workflow.routes.js is executed, it uses the mocked dependencies.
import { workflowRoutes } from '../routes/workflow.routes.js';

describe('Workflow Routes', () => {
  beforeEach(() => {
    // Clear all mock calls before each test to ensure test isolation
    vi.clearAllMocks();
  });

  it('should export an Express router instance', () => {
    // Verify that the exported workflowRoutes is indeed our mocked router
    expect(workflowRoutes).toBe(mockRouter);
    // Also verify that express.Router was called to create the router
    expect(express.Router).toHaveBeenCalledOnce();
  });

  it('should define a POST / route for creating a workflow', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/',
      mockWorkflowController.createWorkflowController
    );
  });

  it('should define a GET / route for retrieving user workflows', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/',
      mockWorkflowController.getUserWorkflowsController
    );
  });

  it('should define a GET /:workflowId route for retrieving a single workflow', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:workflowId',
      mockWorkflowController.getWorkflowController
    );
  });

  it('should define a PUT /:workflowId route for updating a workflow', () => {
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/:workflowId',
      mockWorkflowController.updateWorkflowController
    );
  });

  it('should define a DELETE /:workflowId route for deleting a workflow', () => {
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/:workflowId',
      mockWorkflowController.deleteWorkflowController
    );
  });

  it('should define a POST /:workflowId/trigger route for manually triggering a workflow', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:workflowId/trigger',
      mockWorkflowController.triggerWorkflowController
    );
  });

  it('should define a POST /:workflowId/pause route for pausing a workflow', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:workflowId/pause',
      mockWorkflowController.pauseWorkflowController
    );
  });

  it('should define a POST /:workflowId/resume route for resuming a workflow', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/:workflowId/resume',
      mockWorkflowController.resumeWorkflowController
    );
  });

  it('should define a GET /:workflowId/executions route for getting workflow execution history', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/:workflowId/executions',
      mockWorkflowController.getWorkflowExecutionsController
    );
  });

  it('should define a GET /executions/:executionId route for getting single execution details', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/executions/:executionId',
      mockWorkflowController.getExecutionController
    );
  });
});