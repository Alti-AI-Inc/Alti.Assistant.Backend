import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowExecutionService } from '../services/workflowExecution.service.js';
import { connectionHealthService } from '../services/connectionHealth.service.js';
import Workflow from '../models/workflow.model.js';

/**
 * Execute a workflow manually
 */
const executeWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const { context = {} } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    const result = await workflowExecutionService.executeWorkflow(
      workflowId,
      userId,
      context
    );

    logger.info(
      `Workflow execution ${result.success ? 'completed' : 'failed'} for ${workflowId}`
    );

    return sendResponse(res, {
      statusCode: result.success ? httpStatus.OK : httpStatus.BAD_REQUEST,
      success: result.success,
      message: result.success
        ? 'Workflow executed successfully'
        : `Workflow execution failed: ${result.error}`,
      data: result,
    });
  } catch (error) {
    logger.error('Error in executeWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to execute workflow',
    });
  }
});

/**
 * Get workflow execution history
 */
const getExecutionHistoryController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const { limit = 50, offset = 0 } = req.query;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    const executions = await workflowExecutionService.getExecutionHistory(
      workflowId,
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Execution history retrieved successfully',
      data: {
        executions,
        total: executions.length,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('Error in getExecutionHistoryController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get execution history',
    });
  }
});

/**
 * Get execution details
 */
const getExecutionDetailsController = catchAsync(async (req, res) => {
  const { executionId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!executionId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Execution ID is required',
    });
  }

  try {
    const execution = await workflowExecutionService.getExecutionDetails(
      executionId,
      userId
    );

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
    logger.error('Error in getExecutionDetailsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get execution details',
    });
  }
});

/**
 * Cancel a running execution
 */
const cancelExecutionController = catchAsync(async (req, res) => {
  const { executionId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!executionId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Execution ID is required',
    });
  }

  try {
    const result = await workflowExecutionService.cancelExecution(
      executionId,
      userId
    );

    logger.info(`Execution cancelled: ${executionId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result,
    });
  } catch (error) {
    logger.error('Error in cancelExecutionController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to cancel execution',
    });
  }
});

/**
 * Schedule a workflow
 */
const scheduleWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    // Verify workflow belongs to user
    const workflow = await Workflow.findOne({ _id: workflowId, userId });
    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    const result = await workflowExecutionService.scheduleWorkflow(workflowId);

    logger.info(`Workflow scheduled: ${workflowId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow scheduled successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in scheduleWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to schedule workflow',
    });
  }
});

/**
 * Unschedule a workflow
 */
const unscheduleWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    // Verify workflow belongs to user
    const workflow = await Workflow.findOne({ _id: workflowId, userId });
    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    workflowExecutionService.unscheduleWorkflow(workflowId);

    // Update workflow status
    await Workflow.updateOne({ _id: workflowId }, { nextExecution: null });

    logger.info(`Workflow unscheduled: ${workflowId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow unscheduled successfully',
    });
  } catch (error) {
    logger.error('Error in unscheduleWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to unschedule workflow',
    });
  }
});

/**
 * Get connection health for all user's connected apps
 */
const getConnectionHealthController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const health = await connectionHealthService.checkConnectionHealth(userId);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: health.success,
      message: health.summary,
      data: health,
    });
  } catch (error) {
    logger.error('Error in getConnectionHealthController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to check connection health',
    });
  }
});

/**
 * Refresh a stale app connection
 */
const refreshConnectionController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const { appName } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!appName) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'appName is required in body',
    });
  }

  try {
    const result = await connectionHealthService.refreshStaleConnection(
      userId,
      appName
    );

    return sendResponse(res, {
      statusCode: result.success ? httpStatus.OK : httpStatus.BAD_REQUEST,
      success: result.success,
      message: result.message || result.error,
      data: result,
    });
  } catch (error) {
    logger.error('Error in refreshConnectionController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to refresh connection',
    });
  }
});

export const executionController = {
  executeWorkflowController,
  getExecutionHistoryController,
  getExecutionDetailsController,
  cancelExecutionController,
  scheduleWorkflowController,
  unscheduleWorkflowController,
  getConnectionHealthController,
  refreshConnectionController,
};
