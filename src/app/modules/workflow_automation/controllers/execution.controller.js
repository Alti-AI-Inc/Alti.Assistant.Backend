import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowExecutionService } from '../services/workflowExecution.service.js';
import { connectionHealthService } from '../services/connectionHealth.service.js';
import Workflow from '../models/workflow.model.js';
import WorkflowApproval from '../models/workflowApproval.model.js';

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

/**
 * Get all pending approvals for a user
 */
const getPendingApprovalsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const pendingApprovals = await WorkflowApproval.find({
      userId,
      status: 'pending',
    }).populate('workflowId', 'name description');

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Pending approvals retrieved successfully',
      data: pendingApprovals,
    });
  } catch (error) {
    logger.error('Error in getPendingApprovalsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to retrieve pending approvals',
    });
  }
});

/**
 * Resolve (approve or reject) a pending approval request
 */
const resolveApprovalController = catchAsync(async (req, res) => {
  const { approvalId } = req.params;
  const { approved = true, formResponse = null } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!approvalId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Approval ID is required',
    });
  }

  try {
    const result = await workflowExecutionService.resumeExecution(
      approvalId,
      userId,
      approved,
      formResponse
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: approved ? 'Approval request approved and workflow execution resumed' : 'Approval request rejected and workflow execution cancelled',
      data: result,
    });
  } catch (error) {
    logger.error('Error in resolveApprovalController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to resolve approval request',
    });
  }
});

/**
 * Handle incoming dynamic third-party webhooks to trigger workflow execution
 */
const handleWebhookTriggerController = catchAsync(async (req, res) => {
  const { webhookId } = req.params;
  const secretHeader = req.headers['x-webhook-secret'];
  const secretQuery = req.query.secret;

  if (!webhookId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Webhook ID/Workflow ID is required',
    });
  }

  try {
    // 1. Resolve workflow and check trigger type matches webhook
    const workflow = await Workflow.findById(webhookId);
    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    if (workflow.status !== 'active') {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow is not active',
      });
    }

    if (workflow.trigger?.triggerType !== 'webhook') {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Workflow is not configured for webhook triggers',
      });
    }

    // 2. Secret authentication check
    const expectedSecret = workflow.trigger.webhookConfig?.secret;
    if (expectedSecret) {
      const providedSecret = secretHeader || secretQuery;
      if (providedSecret !== expectedSecret) {
        return sendResponse(res, {
          statusCode: httpStatus.UNAUTHORIZED,
          success: false,
          message: 'Invalid webhook secret key',
        });
      }
    }

    // 3. Assemble execution context from request body, headers, and query parameters
    const executionContext = {
      triggeredBy: 'webhook',
      webhookId,
      headers: req.headers,
      body: req.body || {},
      query: req.query || {},
      // Shallow merge request body for direct variable accessibility
      ...(req.body || {}),
    };

    logger.info(`[Webhook Trigger] Received dynamic request for workflow: ${webhookId}`);

    // 4. Trigger execution asynchronously so we don't hold the third-party HTTP request hanging
    workflowExecutionService.executeWorkflow(workflow._id, workflow.userId, executionContext)
      .then(result => {
        logger.info(`[Webhook Trigger] Background execution completed. Success: ${result.success}`);
      })
      .catch(err => {
        logger.error(`[Webhook Trigger] Background execution failed for ${workflow._id}:`, err);
      });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow trigger request accepted successfully',
      data: {
        workflowId: workflow._id,
        triggerType: 'webhook',
        status: 'accepted'
      },
    });
  } catch (error) {
    logger.error('Error in handleWebhookTriggerController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to process webhook trigger',
    });
  }
});

/**
 * Time-Travel Replay an execution starting from any specific step with optional context mutations
 */
const replayExecutionController = catchAsync(async (req, res) => {
  const { executionId } = req.params;
  const { startStepId, mutatedContext = {} } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!executionId || !startStepId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Execution ID and Start Step ID are required',
    });
  }

  try {
    const result = await workflowExecutionService.replayExecution(
      executionId,
      userId,
      startStepId,
      mutatedContext
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Time-travel replay successfully initiated',
      data: result,
    });
  } catch (error) {
    logger.error('Error in replayExecutionController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to initiate execution replay',
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
  getPendingApprovalsController,
  resolveApprovalController,
  handleWebhookTriggerController,
  replayExecutionController,
};

