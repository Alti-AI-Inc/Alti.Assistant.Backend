import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowExecutionIntegrationService } from '../services/workflowExecutionIntegration.service.js';

/**
 * Execute a stored workflow
 */
const executeStoredWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;
  const { triggerSource = 'user_click', executionMetadata = {} } = req.body;

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
    const result =
      await workflowExecutionIntegrationService.executeStoredWorkflow(
        workflowId,
        userId,
        {
          triggerSource,
          executionMetadata,
        }
      );

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: result.error,
        data: result.details,
      });
    }
  } catch (error) {
    logger.error('Error in executeStoredWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to execute stored workflow',
    });
  }
});

/**
 * Execute multiple stored workflows in batch
 */
const executeBatchStoredWorkflowsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const {
    workflowIds,
    concurrent = false,
    maxConcurrency = 3,
    continueOnError = true,
    triggerSource = 'batch_execution',
    executionMetadata = {},
  } = req.body;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!workflowIds || !Array.isArray(workflowIds) || workflowIds.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow IDs array is required',
    });
  }

  try {
    const result =
      await workflowExecutionIntegrationService.executeBatchStoredWorkflows(
        workflowIds,
        userId,
        {
          concurrent,
          maxConcurrency,
          continueOnError,
          triggerSource,
          executionMetadata,
        }
      );

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
        data: result.data,
      });
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in executeBatchStoredWorkflowsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to execute batch workflows',
    });
  }
});

/**
 * Schedule a stored workflow for recurring execution
 */
const scheduleStoredWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;
  const scheduleConfig = req.body;

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

  if (!scheduleConfig || !scheduleConfig.frequency) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Schedule configuration with frequency is required',
    });
  }

  try {
    const result =
      await workflowExecutionIntegrationService.scheduleStoredWorkflow(
        workflowId,
        userId,
        scheduleConfig
      );

    if (result.success) {
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
        message: result.error,
        data: result.details,
      });
    }
  } catch (error) {
    logger.error('Error in scheduleStoredWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to schedule stored workflow',
    });
  }
});

/**
 * Get execution history for a stored workflow
 */
const getStoredWorkflowExecutionHistoryController = catchAsync(
  async (req, res) => {
    const { workflowId } = req.params;
    const userId = req.user?._id || req.userId;
    const { limit = 20, offset = 0 } = req.query;

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
      const result =
        await workflowExecutionIntegrationService.getStoredWorkflowExecutionHistory(
          workflowId,
          userId,
          {
            limit: parseInt(limit),
            offset: parseInt(offset),
          }
        );

      if (result.success) {
        return sendResponse(res, {
          statusCode: httpStatus.OK,
          success: true,
          message: 'Execution history retrieved successfully',
          data: result.data,
        });
      } else {
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: result.error,
        });
      }
    } catch (error) {
      logger.error(
        'Error in getStoredWorkflowExecutionHistoryController:',
        error
      );
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to retrieve execution history',
      });
    }
  }
);

/**
 * Convert stored workflow to template
 */
const convertStoredWorkflowToTemplateController = catchAsync(
  async (req, res) => {
    const { workflowId } = req.params;
    const userId = req.user?._id || req.userId;
    const {
      templateTitle,
      templateDescription,
      isPublic = false,
      category = 'template',
    } = req.body;

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
      const result =
        await workflowExecutionIntegrationService.convertStoredWorkflowToTemplate(
          workflowId,
          userId,
          {
            templateTitle,
            templateDescription,
            isPublic,
            category,
          }
        );

      if (result.success) {
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
          message: result.error,
        });
      }
    } catch (error) {
      logger.error(
        'Error in convertStoredWorkflowToTemplateController:',
        error
      );
      return sendResponse(res, {
        statusCode: httpStatus.INTERNAL_SERVER_ERROR,
        success: false,
        message: 'Failed to convert workflow to template',
      });
    }
  }
);

export {
  executeStoredWorkflowController,
  executeBatchStoredWorkflowsController,
  scheduleStoredWorkflowController,
  getStoredWorkflowExecutionHistoryController,
  convertStoredWorkflowToTemplateController,
};
