import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import {
  executeStoredWorkflowController,
  executeBatchStoredWorkflowsController,
  scheduleStoredWorkflowController,
  getStoredWorkflowExecutionHistoryController,
  convertStoredWorkflowToTemplateController,
} from './workflowExecution.controller.js';
import { workflowExecutionIntegrationService } from '../services/workflowExecutionIntegration.service.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';

// Mock dependencies
vi.mock('../services/workflowExecutionIntegration.service.js');
vi.mock('../../../../shared/sendResponse.js');
vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
  },
}));

describe('Workflow Execution Controllers', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      params: {},
      body: {},
      query: {},
      user: { _id: 'user123' },
    };
    res = {}; // sendResponse is mocked, so we don't need a full res object
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('executeStoredWorkflowController', () => {
    it('should execute a workflow successfully', async () => {
      req.params.workflowId = 'wf-abc';
      req.body = { triggerSource: 'test_click', executionMetadata: { key: 'value' } };
      const serviceResult = { success: true, message: 'Executed', data: { executionId: 'exec-1' } };
      workflowExecutionIntegrationService.executeStoredWorkflow.mockResolvedValue(serviceResult);

      await executeStoredWorkflowController(req, res, next);

      expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledWith(
        'wf-abc',
        'user123',
        { triggerSource: 'test_click', executionMetadata: { key: 'value' } }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: serviceResult.message,
        data: serviceResult.data,
      });
    });

    it('should use req.userId as a fallback for user identification', async () => {
        req.params.workflowId = 'wf-abc';
        req.body = {};
        req.user = null;
        req.userId = 'fallbackUser456';
        const serviceResult = { success: true, message: 'Executed', data: { executionId: 'exec-1' } };
        workflowExecutionIntegrationService.executeStoredWorkflow.mockResolvedValue(serviceResult);
  
        await executeStoredWorkflowController(req, res, next);
  
        expect(workflowExecutionIntegrationService.executeStoredWorkflow).toHaveBeenCalledWith(
          'wf-abc',
          'fallbackUser456',
          expect.any(Object)
        );
        expect(sendResponse).toHaveBeenCalledWith(res, expect.objectContaining({ statusCode: httpStatus.OK }));
      });

    it('should handle service failure during execution', async () => {
      req.params.workflowId = 'wf-abc';
      const serviceResult = { success: false, error: 'Service Error', details: { code: 500 } };
      workflowExecutionIntegrationService.executeStoredWorkflow.mockResolvedValue(serviceResult);

      await executeStoredWorkflowController(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: serviceResult.error,
        data: serviceResult.details,
      });
    });

    it('should return 401 if user is not authenticated', async () => {
      req.user = null;
      req.userId = null;
      req.params.workflowId = 'wf-abc';

      await executeStoredWorkflowController(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'User authentication required',
      });
    });

    it('should return 400 if workflowId is missing', async () => {
      await executeStoredWorkflowController(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow ID is required',
      });
    });

    it('should handle unexpected errors and log them', async () => {
      req.params.workflowId = 'wf-abc';
      const error = new Error('Something went wrong');
      workflowExecutionIntegrationService.executeStoredWorkflow.mockRejectedValue(error);

      await executeStoredWorkflowController(req, res, next);

      expect(logger.error).toHaveBeenCalledWith('Error in executeStoredWorkflowController:', error);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to execute stored workflow',
      });
    });
  });

  describe('executeBatchStoredWorkflowsController', () => {
    it('should execute batch workflows successfully', async () => {
        req.body = { workflowIds: ['wf-1', 'wf-2'] };
        const serviceResult = { success: true, message: 'Batch executed', data: [] };
        workflowExecutionIntegrationService.executeBatchStoredWorkflows.mockResolvedValue(serviceResult);

        await executeBatchStoredWorkflowsController(req, res, next);

        expect(workflowExecutionIntegrationService.executeBatchStoredWorkflows).toHaveBeenCalledWith(
            ['wf-1', 'wf-2'],
            'user123',
            {
                concurrent: false,
                maxConcurrency: 3,
                continueOnError: true,
                triggerSource: 'batch_execution',
                executionMetadata: {}
            }
        );
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: serviceResult.message,
            data: serviceResult.data
        });
    });

    it('should handle service failure during batch execution', async () => {
        req.body = { workflowIds: ['wf-1', 'wf-2'] };
        const serviceResult = { success: false, error: 'Batch failed' };
        workflowExecutionIntegrationService.executeBatchStoredWorkflows.mockResolvedValue(serviceResult);

        await executeBatchStoredWorkflowsController(req, res, next);

        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: serviceResult.error
        });
    });

    it('should return 401 if user is not authenticated', async () => {
        req.user = null;
        req.userId = null;
        req.body = { workflowIds: ['wf-1'] };

        await executeBatchStoredWorkflowsController(req, res, next);

        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: 'User authentication required'
        });
    });

    it('should return 400 if workflowIds is missing or not an array', async () => {
        req.body = { workflowIds: null };
        await executeBatchStoredWorkflowsController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'Workflow IDs array is required'
        });

        req.body = { workflowIds: [] };
        await executeBatchStoredWorkflowsController(req, res, next);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'Workflow IDs array is required'
        });
    });

    it('should handle unexpected errors during batch execution', async () => {
        req.body = { workflowIds: ['wf-1'] };
        const error = new Error('Batch crash');
        workflowExecutionIntegrationService.executeBatchStoredWorkflows.mockRejectedValue(error);

        await executeBatchStoredWorkflowsController(req, res, next);

        expect(logger.error).toHaveBeenCalledWith('Error in executeBatchStoredWorkflowsController:', error);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to execute batch workflows'
        });
    });
  });

  describe('scheduleStoredWorkflowController', () => {
    it('should schedule a workflow successfully', async () => {
        req.params.workflowId = 'wf-schedule';
        req.body = { frequency: 'daily' };
        const serviceResult = { success: true, message: 'Scheduled', data: { scheduleId: 'sched-1' } };
        workflowExecutionIntegrationService.scheduleStoredWorkflow.mockResolvedValue(serviceResult);

        await scheduleStoredWorkflowController(req, res, next);

        expect(workflowExecutionIntegrationService.scheduleStoredWorkflow).toHaveBeenCalledWith('wf-schedule', 'user123', { frequency: 'daily' });
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: serviceResult.message,
            data: serviceResult.data
        });
    });

    it('should return 400 if schedule config is missing', async () => {
        req.params.workflowId = 'wf-schedule';
        req.body = {};

        await scheduleStoredWorkflowController(req, res, next);

        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'Schedule configuration with frequency is required'
        });
    });

    it('should handle unexpected errors during scheduling', async () => {
        req.params.workflowId = 'wf-schedule';
        req.body = { frequency: 'daily' };
        const error = new Error('Scheduler failed');
        workflowExecutionIntegrationService.scheduleStoredWorkflow.mockRejectedValue(error);

        await scheduleStoredWorkflowController(req, res, next);

        expect(logger.error).toHaveBeenCalledWith('Error in scheduleStoredWorkflowController:', error);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to schedule stored workflow'
        });
    });
  });

  describe('getStoredWorkflowExecutionHistoryController', () => {
    it('should retrieve execution history successfully', async () => {
        req.params.workflowId = 'wf-history';
        req.query = { limit: 10, offset: 5 };
        const serviceResult = { success: true, data: [{ id: 1 }] };
        workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory.mockResolvedValue(serviceResult);

        await getStoredWorkflowExecutionHistoryController(req, res, next);

        expect(workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory).toHaveBeenCalledWith('wf-history', 'user123', { limit: 10, offset: 5 });
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Execution history retrieved successfully',
            data: serviceResult.data
        });
    });

    it('should use default limit and offset if not provided', async () => {
        req.params.workflowId = 'wf-history';
        req.query = {};
        const serviceResult = { success: true, data: [] };
        workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory.mockResolvedValue(serviceResult);

        await getStoredWorkflowExecutionHistoryController(req, res, next);

        expect(workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory).toHaveBeenCalledWith('wf-history', 'user123', { limit: 20, offset: 0 });
    });

    it('should handle unexpected errors during history retrieval', async () => {
        req.params.workflowId = 'wf-history';
        const error = new Error('History DB failed');
        workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory.mockRejectedValue(error);

        await getStoredWorkflowExecutionHistoryController(req, res, next);

        expect(logger.error).toHaveBeenCalledWith('Error in getStoredWorkflowExecutionHistoryController:', error);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to retrieve execution history'
        });
    });
  });

  describe('convertStoredWorkflowToTemplateController', () => {
    it('should convert workflow to template successfully', async () => {
        req.params.workflowId = 'wf-convert';
        req.body = { templateTitle: 'My Template' };
        const serviceResult = { success: true, message: 'Converted', data: { templateId: 'tpl-1' } };
        workflowExecutionIntegrationService.convertStoredWorkflowToTemplate.mockResolvedValue(serviceResult);

        await convertStoredWorkflowToTemplateController(req, res, next);

        expect(workflowExecutionIntegrationService.convertStoredWorkflowToTemplate).toHaveBeenCalledWith(
            'wf-convert',
            'user123',
            {
                templateTitle: 'My Template',
                templateDescription: undefined,
                isPublic: false,
                category: 'template'
            }
        );
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.CREATED,
            success: true,
            message: serviceResult.message,
            data: serviceResult.data
        });
    });

    it('should handle service failure during conversion', async () => {
        req.params.workflowId = 'wf-convert';
        req.body = { templateTitle: 'My Template' };
        const serviceResult = { success: false, error: 'Conversion failed' };
        workflowExecutionIntegrationService.convertStoredWorkflowToTemplate.mockResolvedValue(serviceResult);

        await convertStoredWorkflowToTemplateController(req, res, next);

        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: serviceResult.error
        });
    });

    it('should handle unexpected errors during conversion', async () => {
        req.params.workflowId = 'wf-convert';
        req.body = { templateTitle: 'My Template' };
        const error = new Error('Conversion crash');
        workflowExecutionIntegrationService.convertStoredWorkflowToTemplate.mockRejectedValue(error);

        await convertStoredWorkflowToTemplateController(req, res, next);

        expect(logger.error).toHaveBeenCalledWith('Error in convertStoredWorkflowToTemplateController:', error);
        expect(sendResponse).toHaveBeenCalledWith(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to convert workflow to template'
        });
    });
  });
});