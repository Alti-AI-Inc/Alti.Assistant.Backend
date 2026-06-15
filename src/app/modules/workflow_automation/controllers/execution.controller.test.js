import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { executionController } from './execution.controller.js';

// Mock external dependencies
const sendResponse = vi.fn();
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
const workflowExecutionService = {
  executeWorkflow: vi.fn(),
  getExecutionHistory: vi.fn(),
  getExecutionDetails: vi.fn(),
  cancelExecution: vi.fn(),
  scheduleWorkflow: vi.fn(),
  unscheduleWorkflow: vi.fn(),
  resumeExecution: vi.fn(),
  replayExecution: vi.fn(),
};
const connectionHealthService = {
  checkConnectionHealth: vi.fn(),
  refreshStaleConnection: vi.fn(),
};

// Mock Mongoose models
const Workflow = {
  findOne: vi.fn(),
  findById: vi.fn(),
  updateOne: vi.fn(),
};
const WorkflowApproval = {
  find: vi.fn().mockImplementation(() => ({
    populate: vi.fn().mockReturnThis(),
  })),
};

// Mock catchAsync to simply return the async function for direct testing
const catchAsync = (fn) => fn;

// Re-import the module after mocking to ensure mocks are applied
// This requires a bit of a trick with Vitest if the imports are at the top level
// For simplicity, we'll assume the mocks are hoisted or the module is imported dynamically
// In a real setup, you might use `vi.doMock` and then `await import(...)`
// For this exercise, we'll just ensure the mocked functions are used by the controller.

// Manually inject mocks into the module scope for testing
// This is a common pattern when you can't easily re-import a module
// In a real Vitest setup, you'd typically use `vi.mock` at the top level
// and Vitest handles the module resolution.
// Since the prompt asks for a standalone .test.js file, we'll simulate this.
// We'll assume the original file's imports are resolved to these mocks.
// If this were a real file, the `import` statements would need to be mocked
// before the file is loaded.
// For this exercise, we'll assume the controller functions are effectively
// using these mocked variables.

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  // Reset catchAsync to its mock behavior
  vi.mock('../../../../shared/catchAsync.js', () => ({
    default: (fn) => fn,
  }));
  vi.mock('../../../../shared/sendResponse.js', () => ({
    default: sendResponse,
  }));
  vi.mock('../../../../shared/logger.js', () => ({
    logger,
  }));
  vi.mock('../services/workflowExecution.service.js', () => ({
    workflowExecutionService,
  }));
  vi.mock('../services/connectionHealth.service.js', () => ({
    connectionHealthService,
  }));
  vi.mock('../models/workflow.model.js', () => ({
    default: Workflow,
  }));
  vi.mock('../models/workflowApproval.model.js', () => ({
    default: WorkflowApproval,
  }));
});

describe('executionController', () => {
  const mockUserId = 'user123';
  const mockWorkflowId = 'workflow456';
  const mockExecutionId = 'exec789';
  const mockApprovalId = 'approval012';

  // Helper function to create mock req and res objects
  const createMockReqRes = (params = {}, body = {}, query = {}, user = { _id: mockUserId }, headers = {}) => {
    const req = {
      params,
      body,
      query,
      user,
      userId: user ? undefined : mockUserId, // Simulate req.userId if req.user is not present
      headers,
    };
    const res = {}; // sendResponse is mocked, so res object itself doesn't need methods
    return { req, res };
  };

  describe('executeWorkflowController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId }, {}, {}, null);
      await executionController.executeWorkflowController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: undefined });
      await executionController.executeWorkflowController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should execute workflow and send success response', async () => {
      workflowExecutionService.executeWorkflow.mockResolvedValue({ success: true, data: { id: mockExecutionId } });
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId }, { context: { key: 'value' } });
      await executionController.executeWorkflowController(req, res);
      expect(workflowExecutionService.executeWorkflow).toHaveBeenCalledWith(
        mockWorkflowId,
        mockUserId,
        { key: 'value' }
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Workflow execution completed'));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow executed successfully',
        data: { success: true, data: { id: mockExecutionId } },
      });
    });

    it('should execute workflow and send failure response if service returns success: false', async () => {
      workflowExecutionService.executeWorkflow.mockResolvedValue({ success: false, error: 'Workflow failed' });
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.executeWorkflowController(req, res);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Workflow execution failed'));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow execution failed: Workflow failed',
        data: { success: false, error: 'Workflow failed' },
      });
    });

    it('should handle errors during workflow execution', async () => {
      const errorMessage = 'Service error';
      workflowExecutionService.executeWorkflow.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.executeWorkflowController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in executeWorkflowController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('getExecutionHistoryController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId }, {}, {}, null);
      await executionController.getExecutionHistoryController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: undefined });
      await executionController.getExecutionHistoryController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should retrieve execution history successfully', async () => {
      const mockExecutions = [{ id: 'exec1' }, { id: 'exec2' }];
      workflowExecutionService.getExecutionHistory.mockResolvedValue(mockExecutions);
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId }, {}, { limit: '10', offset: '0' });
      await executionController.getExecutionHistoryController(req, res);
      expect(workflowExecutionService.getExecutionHistory).toHaveBeenCalledWith(
        mockWorkflowId,
        mockUserId,
        10,
        0
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Execution history retrieved successfully',
        data: {
          executions: mockExecutions,
          total: 2,
          limit: 10,
          offset: 0,
        },
      });
    });

    it('should handle errors during history retrieval', async () => {
      const errorMessage = 'History service error';
      workflowExecutionService.getExecutionHistory.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.getExecutionHistoryController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in getExecutionHistoryController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('getExecutionDetailsController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ executionId: mockExecutionId }, {}, {}, null);
      await executionController.getExecutionDetailsController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if executionId is missing', async () => {
      const { req, res } = createMockReqRes({ executionId: undefined });
      await executionController.getExecutionDetailsController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Execution ID is required',
      });
    });

    it('should retrieve execution details successfully', async () => {
      const mockExecution = { id: mockExecutionId, status: 'completed' };
      workflowExecutionService.getExecutionDetails.mockResolvedValue(mockExecution);
      const { req, res } = createMockReqRes({ executionId: mockExecutionId });
      await executionController.getExecutionDetailsController(req, res);
      expect(workflowExecutionService.getExecutionDetails).toHaveBeenCalledWith(
        mockExecutionId,
        mockUserId
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Execution details retrieved successfully',
        data: mockExecution,
      });
    });

    it('should return NOT_FOUND if execution is not found', async () => {
      workflowExecutionService.getExecutionDetails.mockResolvedValue(null);
      const { req, res } = createMockReqRes({ executionId: mockExecutionId });
      await executionController.getExecutionDetailsController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Execution not found',
      });
    });

    it('should handle errors during details retrieval', async () => {
      const errorMessage = 'Details service error';
      workflowExecutionService.getExecutionDetails.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ executionId: mockExecutionId });
      await executionController.getExecutionDetailsController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in getExecutionDetailsController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('cancelExecutionController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ executionId: mockExecutionId }, {}, {}, null);
      await executionController.cancelExecutionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if executionId is missing', async () => {
      const { req, res } = createMockReqRes({ executionId: undefined });
      await executionController.cancelExecutionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Execution ID is required',
      });
    });

    it('should cancel execution successfully', async () => {
      const mockResult = { message: 'Execution cancelled', status: 'cancelled' };
      workflowExecutionService.cancelExecution.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({ executionId: mockExecutionId });
      await executionController.cancelExecutionController(req, res);
      expect(workflowExecutionService.cancelExecution).toHaveBeenCalledWith(
        mockExecutionId,
        mockUserId
      );
      expect(logger.info).toHaveBeenCalledWith(`Execution cancelled: ${mockExecutionId}`);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: mockResult.message,
        data: mockResult,
      });
    });

    it('should handle errors during cancellation', async () => {
      const errorMessage = 'Cancellation service error';
      workflowExecutionService.cancelExecution.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ executionId: mockExecutionId });
      await executionController.cancelExecutionController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in cancelExecutionController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('scheduleWorkflowController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId }, {}, {}, null);
      await executionController.scheduleWorkflowController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: undefined });
      await executionController.scheduleWorkflowController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should return NOT_FOUND if workflow is not found for the user', async () => {
      Workflow.findOne.mockResolvedValue(null);
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.scheduleWorkflowController(req, res);
      expect(Workflow.findOne).toHaveBeenCalledWith({ _id: mockWorkflowId, userId: mockUserId });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should schedule workflow successfully', async () => {
      const mockWorkflow = { _id: mockWorkflowId, userId: mockUserId };
      Workflow.findOne.mockResolvedValue(mockWorkflow);
      const mockResult = { nextExecution: new Date() };
      workflowExecutionService.scheduleWorkflow.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.scheduleWorkflowController(req, res);
      expect(Workflow.findOne).toHaveBeenCalledWith({ _id: mockWorkflowId, userId: mockUserId });
      expect(workflowExecutionService.scheduleWorkflow).toHaveBeenCalledWith(mockWorkflowId);
      expect(logger.info).toHaveBeenCalledWith(`Workflow scheduled: ${mockWorkflowId}`);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow scheduled successfully',
        data: mockResult,
      });
    });

    it('should handle errors during scheduling', async () => {
      const mockWorkflow = { _id: mockWorkflowId, userId: mockUserId };
      Workflow.findOne.mockResolvedValue(mockWorkflow);
      const errorMessage = 'Schedule service error';
      workflowExecutionService.scheduleWorkflow.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.scheduleWorkflowController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in scheduleWorkflowController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('unscheduleWorkflowController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId }, {}, {}, null);
      await executionController.unscheduleWorkflowController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if workflowId is missing', async () => {
      const { req, res } = createMockReqRes({ workflowId: undefined });
      await executionController.unscheduleWorkflowController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should return NOT_FOUND if workflow is not found for the user', async () => {
      Workflow.findOne.mockResolvedValue(null);
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.unscheduleWorkflowController(req, res);
      expect(Workflow.findOne).toHaveBeenCalledWith({ _id: mockWorkflowId, userId: mockUserId });
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should unschedule workflow successfully', async () => {
      const mockWorkflow = { _id: mockWorkflowId, userId: mockUserId };
      Workflow.findOne.mockResolvedValue(mockWorkflow);
      Workflow.updateOne.mockResolvedValue({ nModified: 1 });
      workflowExecutionService.unscheduleWorkflow.mockReturnValue(undefined); // unscheduleWorkflow doesn't return a promise
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.unscheduleWorkflowController(req, res);
      expect(Workflow.findOne).toHaveBeenCalledWith({ _id: mockWorkflowId, userId: mockUserId });
      expect(workflowExecutionService.unscheduleWorkflow).toHaveBeenCalledWith(mockWorkflowId);
      expect(Workflow.updateOne).toHaveBeenCalledWith({ _id: mockWorkflowId }, { nextExecution: null });
      expect(logger.info).toHaveBeenCalledWith(`Workflow unscheduled: ${mockWorkflowId}`);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow unscheduled successfully',
      });
    });

    it('should handle errors during unscheduling', async () => {
      const mockWorkflow = { _id: mockWorkflowId, userId: mockUserId };
      Workflow.findOne.mockResolvedValue(mockWorkflow);
      const errorMessage = 'Unschedule service error';
      workflowExecutionService.unscheduleWorkflow.mockImplementation(() => { throw new Error(errorMessage); });
      const { req, res } = createMockReqRes({ workflowId: mockWorkflowId });
      await executionController.unscheduleWorkflowController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in unscheduleWorkflowController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('getConnectionHealthController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({}, {}, {}, null);
      await executionController.getConnectionHealthController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should retrieve connection health successfully', async () => {
      const mockHealth = { success: true, summary: 'All good', data: [] };
      connectionHealthService.checkConnectionHealth.mockResolvedValue(mockHealth);
      const { req, res } = createMockReqRes();
      await executionController.getConnectionHealthController(req, res);
      expect(connectionHealthService.checkConnectionHealth).toHaveBeenCalledWith(mockUserId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: mockHealth.success,
        message: mockHealth.summary,
        data: mockHealth,
      });
    });

    it('should handle errors during connection health check', async () => {
      const errorMessage = 'Health check error';
      connectionHealthService.checkConnectionHealth.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes();
      await executionController.getConnectionHealthController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in getConnectionHealthController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('refreshConnectionController', () => {
    const mockAppName = 'GoogleSheets';

    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({}, { appName: mockAppName }, {}, null);
      await executionController.refreshConnectionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if appName is missing', async () => {
      const { req, res } = createMockReqRes({}, { appName: undefined });
      await executionController.refreshConnectionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'appName is required in body',
      });
    });

    it('should refresh connection successfully', async () => {
      const mockResult = { success: true, message: 'Connection refreshed' };
      connectionHealthService.refreshStaleConnection.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({}, { appName: mockAppName });
      await executionController.refreshConnectionController(req, res);
      expect(connectionHealthService.refreshStaleConnection).toHaveBeenCalledWith(
        mockUserId,
        mockAppName
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: mockResult.message,
        data: mockResult,
      });
    });

    it('should return BAD_REQUEST if refresh fails', async () => {
      const mockResult = { success: false, error: 'Refresh failed' };
      connectionHealthService.refreshStaleConnection.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({}, { appName: mockAppName });
      await executionController.refreshConnectionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: mockResult.error,
        data: mockResult,
      });
    });

    it('should handle errors during connection refresh', async () => {
      const errorMessage = 'Refresh service error';
      connectionHealthService.refreshStaleConnection.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({}, { appName: mockAppName });
      await executionController.refreshConnectionController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in refreshConnectionController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('getPendingApprovalsController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({}, {}, {}, null);
      await executionController.getPendingApprovalsController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should retrieve pending approvals successfully', async () => {
      const mockApprovals = [{ _id: mockApprovalId, status: 'pending', workflowId: { name: 'Test Workflow' } }];
      WorkflowApproval.find.mockReturnValue({
        populate: vi.fn().mockResolvedValue(mockApprovals),
      });
      const { req, res } = createMockReqRes();
      await executionController.getPendingApprovalsController(req, res);
      expect(WorkflowApproval.find).toHaveBeenCalledWith({
        userId: mockUserId,
        status: 'pending',
      });
      expect(WorkflowApproval.find().populate).toHaveBeenCalledWith('workflowId', 'name description');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Pending approvals retrieved successfully',
        data: mockApprovals,
      });
    });

    it('should handle errors during pending approvals retrieval', async () => {
      const errorMessage = 'Approval retrieval error';
      WorkflowApproval.find.mockReturnValue({
        populate: vi.fn().mockRejectedValue(new Error(errorMessage)),
      });
      const { req, res } = createMockReqRes();
      await executionController.getPendingApprovalsController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in getPendingApprovalsController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('resolveApprovalController', () => {
    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ approvalId: mockApprovalId }, {}, {}, null);
      await executionController.resolveApprovalController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if approvalId is missing', async () => {
      const { req, res } = createMockReqRes({ approvalId: undefined });
      await executionController.resolveApprovalController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Approval ID is required',
      });
    });

    it('should resolve approval as approved and resume execution', async () => {
      const mockResult = { status: 'approved' };
      workflowExecutionService.resumeExecution.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({ approvalId: mockApprovalId }, { approved: true, formResponse: { data: 'ok' } });
      await executionController.resolveApprovalController(req, res);
      expect(workflowExecutionService.resumeExecution).toHaveBeenCalledWith(
        mockApprovalId,
        mockUserId,
        true,
        { data: 'ok' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Approval request approved and workflow execution resumed',
        data: mockResult,
      });
    });

    it('should resolve approval as rejected and cancel execution', async () => {
      const mockResult = { status: 'rejected' };
      workflowExecutionService.resumeExecution.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({ approvalId: mockApprovalId }, { approved: false });
      await executionController.resolveApprovalController(req, res);
      expect(workflowExecutionService.resumeExecution).toHaveBeenCalledWith(
        mockApprovalId,
        mockUserId,
        false,
        null
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Approval request rejected and workflow execution cancelled',
        data: mockResult,
      });
    });

    it('should handle errors during approval resolution', async () => {
      const errorMessage = 'Approval resolution error';
      workflowExecutionService.resumeExecution.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ approvalId: mockApprovalId }, { approved: true });
      await executionController.resolveApprovalController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in resolveApprovalController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('handleWebhookTriggerController', () => {
    const mockWebhookId = 'webhook123';
    const mockWebhookSecret = 'supersecret';

    it('should return BAD_REQUEST if webhookId is missing', async () => {
      const { req, res } = createMockReqRes({ webhookId: undefined });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Webhook ID/Workflow ID is required',
      });
    });

    it('should return NOT_FOUND if workflow is not found', async () => {
      Workflow.findById.mockResolvedValue(null);
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId });
      await executionController.handleWebhookTriggerController(req, res);
      expect(Workflow.findById).toHaveBeenCalledWith(mockWebhookId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    });

    it('should return BAD_REQUEST if workflow is not active', async () => {
      Workflow.findById.mockResolvedValue({ _id: mockWebhookId, status: 'inactive' });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow is not active',
      });
    });

    it('should return BAD_REQUEST if workflow trigger type is not webhook', async () => {
      Workflow.findById.mockResolvedValue({ _id: mockWebhookId, status: 'active', trigger: { triggerType: 'schedule' } });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow is not configured for webhook triggers',
      });
    });

    it('should return UNAUTHORIZED if secret is required but not provided', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook', webhookConfig: { secret: mockWebhookSecret } },
      });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Invalid webhook secret key',
      });
    });

    it('should return UNAUTHORIZED if provided secret is invalid (header)', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook', webhookConfig: { secret: mockWebhookSecret } },
      });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId }, {}, {}, null, { 'x-webhook-secret': 'wrongsecret' });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Invalid webhook secret key',
      });
    });

    it('should return UNAUTHORIZED if provided secret is invalid (query)', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook', webhookConfig: { secret: mockWebhookSecret } },
      });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId }, {}, { secret: 'wrongsecret' });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Invalid webhook secret key',
      });
    });

    it('should accept webhook trigger and execute workflow asynchronously (no secret)', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook' },
      });
      workflowExecutionService.executeWorkflow.mockResolvedValue({ success: true }); // Mock async execution
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId }, { payload: 'data' }, { queryParam: 'value' });
      await executionController.handleWebhookTriggerController(req, res);
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Received dynamic request for workflow: ${mockWebhookId}`));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow trigger request accepted successfully',
        data: {
          workflowId: mockWebhookId,
          triggerType: 'webhook',
          status: 'accepted',
        },
      });
      // Expect async call to service
      expect(workflowExecutionService.executeWorkflow).toHaveBeenCalledWith(
        mockWebhookId,
        mockUserId,
        expect.objectContaining({
          triggeredBy: 'webhook',
          webhookId: mockWebhookId,
          headers: req.headers,
          body: { payload: 'data' },
          query: { queryParam: 'value' },
          payload: 'data', // Shallow merge
        })
      );
      // Ensure logger.info for background execution is called
      await vi.runAllTimersAsync(); // Resolve the promise
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Background execution completed. Success: true'));
    });

    it('should accept webhook trigger and execute workflow asynchronously (secret in header)', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook', webhookConfig: { secret: mockWebhookSecret } },
      });
      workflowExecutionService.executeWorkflow.mockResolvedValue({ success: true });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId }, {}, {}, null, { 'x-webhook-secret': mockWebhookSecret });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow trigger request accepted successfully',
        data: {
          workflowId: mockWebhookId,
          triggerType: 'webhook',
          status: 'accepted',
        },
      });
      expect(workflowExecutionService.executeWorkflow).toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Background execution completed. Success: true'));
    });

    it('should accept webhook trigger and execute workflow asynchronously (secret in query)', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook', webhookConfig: { secret: mockWebhookSecret } },
      });
      workflowExecutionService.executeWorkflow.mockResolvedValue({ success: true });
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId }, {}, { secret: mockWebhookSecret });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow trigger request accepted successfully',
        data: {
          workflowId: mockWebhookId,
          triggerType: 'webhook',
          status: 'accepted',
        },
      });
      expect(workflowExecutionService.executeWorkflow).toHaveBeenCalled();
      await vi.runAllTimersAsync();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Background execution completed. Success: true'));
    });

    it('should log error if background execution fails', async () => {
      Workflow.findById.mockResolvedValue({
        _id: mockWebhookId,
        userId: mockUserId,
        status: 'active',
        trigger: { triggerType: 'webhook' },
      });
      const backgroundError = new Error('Background execution failed');
      workflowExecutionService.executeWorkflow.mockRejectedValue(backgroundError);
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId });
      await executionController.handleWebhookTriggerController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow trigger request accepted successfully',
        data: {
          workflowId: mockWebhookId,
          triggerType: 'webhook',
          status: 'accepted',
        },
      });
      await vi.runAllTimersAsync();
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`Background execution failed for ${mockWebhookId}:`), backgroundError);
    });

    it('should handle errors during initial webhook processing', async () => {
      const errorMessage = 'Webhook processing error';
      Workflow.findById.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ webhookId: mockWebhookId });
      await executionController.handleWebhookTriggerController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in handleWebhookTriggerController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });

  describe('replayExecutionController', () => {
    const mockStartStepId = 'step123';
    const mockMutatedContext = { newKey: 'newValue' };

    it('should return UNAUTHORIZED if userId is missing', async () => {
      const { req, res } = createMockReqRes({ executionId: mockExecutionId }, { startStepId: mockStartStepId }, {}, null);
      await executionController.replayExecutionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return BAD_REQUEST if executionId or startStepId is missing', async () => {
      let { req, res } = createMockReqRes({ executionId: undefined }, { startStepId: mockStartStepId });
      await executionController.replayExecutionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Execution ID and Start Step ID are required',
      });

      sendResponse.mockClear();
      ({ req, res } = createMockReqRes({ executionId: mockExecutionId }, { startStepId: undefined }));
      await executionController.replayExecutionController(req, res);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Execution ID and Start Step ID are required',
      });
    });

    it('should replay execution successfully', async () => {
      const mockResult = { newExecutionId: 'replay456', status: 'initiated' };
      workflowExecutionService.replayExecution.mockResolvedValue(mockResult);
      const { req, res } = createMockReqRes({ executionId: mockExecutionId }, { startStepId: mockStartStepId, mutatedContext: mockMutatedContext });
      await executionController.replayExecutionController(req, res);
      expect(workflowExecutionService.replayExecution).toHaveBeenCalledWith(
        mockExecutionId,
        mockUserId,
        mockStartStepId,
        mockMutatedContext
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Time-travel replay successfully initiated',
        data: mockResult,
      });
    });

    it('should handle errors during replay execution', async () => {
      const errorMessage = 'Replay service error';
      workflowExecutionService.replayExecution.mockRejectedValue(new Error(errorMessage));
      const { req, res } = createMockReqRes({ executionId: mockExecutionId }, { startStepId: mockStartStepId });
      await executionController.replayExecutionController(req, res);
      expect(logger.error).toHaveBeenCalledWith('Error in replayExecutionController:', expect.any(Error));
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: errorMessage,
      });
    });
  });
});