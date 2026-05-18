import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowService } from '../services/workflow.service.js';

/**
 * Create a new scheduled workflow
 */
const createWorkflowController = catchAsync(async (req, res) => {
  const {
    title,
    description,
    executionPlan,
    workflowType,
    requiredApps,
    triggerType,
    scheduleConfig,
    originalUserInput,
    conversationId,
    conversationContext,
  } = req.body;

  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!title || !executionPlan || !workflowType || !requiredApps) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message:
        'Missing required fields: title, executionPlan, workflowType, requiredApps',
    });
  }

  const result = await workflowService.createWorkflow({
    userId,
    title,
    description,
    executionPlan,
    workflowType,
    requiredApps,
    triggerType,
    scheduleConfig,
    originalUserInput,
    conversationId,
    conversationContext,
  });

  if (result.success) {
    logger.info(`Workflow created via API: ${result.data.workflowId}`);
    return sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: result.message,
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: result.message || 'Failed to create workflow',
      error: result.error,
    });
  }
});

/**
 * Get user's workflows
 */
const getUserWorkflowsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const { status, limit = 50, offset = 0 } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.getUserWorkflows(
    userId,
    status,
    parseInt(limit),
    parseInt(offset)
  );

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflows retrieved successfully',
      data: result.data,
    });
  } else {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve workflows',
      error: result.error,
    });
  }
});

/**
 * Get workflow by ID
 */
const getWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.getWorkflowById(workflowId, userId);

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow retrieved successfully',
      data: result.data,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.INTERNAL_SERVER_ERROR;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: result.message || 'Failed to retrieve workflow',
      error: result.error,
    });
  }
});

/**
 * Update workflow
 */
const updateWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;
  const updates = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.updateWorkflow(
    workflowId,
    userId,
    updates
  );

  if (result.success) {
    logger.info(`Workflow updated via API: ${workflowId}`);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.data,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.BAD_REQUEST;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: result.message || 'Failed to update workflow',
      error: result.error,
    });
  }
});

/**
 * Delete workflow
 */
const deleteWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.deleteWorkflow(workflowId, userId);

  if (result.success) {
    logger.info(`Workflow deleted via API: ${workflowId}`);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.BAD_REQUEST;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: result.message || 'Failed to delete workflow',
      error: result.error,
    });
  }
});

/**
 * Manually trigger workflow execution
 */
const triggerWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.triggerWorkflow(
    workflowId,
    userId,
    'api_call'
  );

  if (result.success) {
    logger.info(`Workflow triggered via API: ${workflowId}`);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.data,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.BAD_REQUEST;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: result.message || 'Failed to trigger workflow',
      error: result.error,
    });
  }
});

/**
 * Pause workflow
 */
const pauseWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.pauseWorkflow(workflowId, userId);

  if (result.success) {
    logger.info(`Workflow paused via API: ${workflowId}`);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.data,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.BAD_REQUEST;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: result.message || 'Failed to pause workflow',
      error: result.error,
    });
  }
});

/**
 * Resume workflow
 */
const resumeWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.resumeWorkflow(workflowId, userId);

  if (result.success) {
    logger.info(`Workflow resumed via API: ${workflowId}`);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result.data,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.BAD_REQUEST;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: result.message || 'Failed to resume workflow',
      error: result.error,
    });
  }
});

/**
 * Get workflow execution history
 */
const getWorkflowExecutionsController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const { limit = 50 } = req.query;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const result = await workflowService.getWorkflowExecutions(
    workflowId,
    userId,
    parseInt(limit)
  );

  if (result.success) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Execution history retrieved successfully',
      data: result.data,
    });
  } else {
    const statusCode =
      result.error === 'Workflow not found'
        ? httpStatus.NOT_FOUND
        : httpStatus.INTERNAL_SERVER_ERROR;
    return sendResponse(res, {
      statusCode,
      success: false,
      message: 'Failed to retrieve execution history',
      error: result.error,
    });
  }
});

/**
 * Get execution details by ID
 */
const getExecutionController = catchAsync(async (req, res) => {
  const { executionId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const WorkflowExecution = (
      await import('../models/workflowExecution.model.js')
    ).default;

    const execution = await WorkflowExecution.findOne({
      executionId,
      userId,
    });

    if (!execution) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Execution not found',
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Execution details retrieved successfully',
      data: execution,
    });
  } catch (error) {
    logger.error(`Error fetching execution: ${error.message}`);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve execution details',
      error: error.message,
    });
  }
});

export const workflowController = {
  createWorkflowController,
  getUserWorkflowsController,
  getWorkflowController,
  updateWorkflowController,
  deleteWorkflowController,
  triggerWorkflowController,
  pauseWorkflowController,
  resumeWorkflowController,
  getWorkflowExecutionsController,
  getExecutionController,
};
