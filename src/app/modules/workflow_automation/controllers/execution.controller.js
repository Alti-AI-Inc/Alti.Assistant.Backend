import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowExecutionService } from '../services/workflowExecution.service.js';
import { connectionHealthService } from '../services/connectionHealth.service.js';
import Workflow from '../models/workflow.model.js';
import WorkflowApproval from '../models/workflowApproval.model.js';

/**
 * @swagger
 * /api/v1/workflow-automation/executions/{workflowId}/execute:
 *   post:
 *     summary: Manually execute a workflow
 *     description: Triggers the execution of a specified workflow manually.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to execute.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               context:
 *                 type: object
 *                 description: Optional initial context data for the workflow execution.
 *                 example:
 *                   inputData: "some value"
 *             example:
 *               context:
 *                 trigger: "manual"
 *                 source: "API"
 *     responses:
 *       200:
 *         description: Workflow executed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow executed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     executionId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     message:
 *                       type: string
 *                       example: Workflow execution started.
 *       400:
 *         description: Bad request, e.g., Workflow ID is missing or execution failed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to execute workflow
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
 * @swagger
 * /api/v1/workflow-automation/executions/{workflowId}/history:
 *   get:
 *     summary: Get workflow execution history
 *     description: Retrieves a paginated list of execution history for a specific workflow.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to retrieve history for.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of executions to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of executions to skip before starting to return results.
 *     responses:
 *       200:
 *         description: Execution history retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Execution history retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     executions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           workflowId:
 *                             type: string
 *                           status:
 *                             type: string
 *                           startTime:
 *                             type: string
 *                             format: date-time
 *                           endTime:
 *                             type: string
 *                             format: date-time
 *                           duration:
 *                             type: number
 *                           trigger:
 *                             type: object
 *                           context:
 *                             type: object
 *                       example:
 *                         - _id: "654321098765432109876543"
 *                           workflowId: "654321098765432109876542"
 *                           status: "completed"
 *                           startTime: "2023-10-27T10:00:00Z"
 *                           endTime: "2023-10-27T10:00:15Z"
 *                           duration: 15000
 *                           trigger: { type: "manual" }
 *                           context: { initial: "data" }
 *                     total:
 *                       type: number
 *                       example: 10
 *                     limit:
 *                       type: number
 *                       example: 50
 *                     offset:
 *                       type: number
 *                       example: 0
 *       400:
 *         description: Bad request, e.g., Workflow ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to get execution history
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
 * @swagger
 * /api/v1/workflow-automation/executions/{executionId}:
 *   get:
 *     summary: Get workflow execution details
 *     description: Retrieves the detailed information for a specific workflow execution.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow execution to retrieve details for.
 *     responses:
 *       200:
 *         description: Execution details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Execution details retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "654321098765432109876543"
 *                     workflowId:
 *                       type: string
 *                       example: "654321098765432109876542"
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     startTime:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *                     endTime:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:15Z"
 *                     duration:
 *                       type: number
 *                       example: 15000
 *                     trigger:
 *                       type: object
 *                       example: { type: "manual" }
 *                     context:
 *                       type: object
 *                       example: { initial: "data", step1Output: "result" }
 *                     steps:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stepId:
 *                             type: string
 *                           status:
 *                             type: string
 *                           startTime:
 *                             type: string
 *                             format: date-time
 *                           endTime:
 *                             type: string
 *                             format: date-time
 *                           output:
 *                             type: object
 *       400:
 *         description: Bad request, e.g., Execution ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Execution ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       404:
 *         description: Execution not found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Execution not found
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to get execution details
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
 * @swagger
 * /api/v1/workflow-automation/executions/{executionId}/cancel:
 *   post:
 *     summary: Cancel a running workflow execution
 *     description: Attempts to cancel a currently running workflow execution.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the execution to cancel.
 *     responses:
 *       200:
 *         description: Execution cancellation request accepted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Execution cancellation initiated.
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: Execution cancellation initiated.
 *       400:
 *         description: Bad request, e.g., Execution ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Execution ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to cancel execution
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
 * @swagger
 * /api/v1/workflow-automation/workflows/{workflowId}/schedule:
 *   post:
 *     summary: Schedule a workflow for future execution
 *     description: Schedules a workflow to run at its configured interval (e.g., cron job).
 *     tags:
 *       - Workflow Scheduling
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to schedule.
 *     responses:
 *       200:
 *         description: Workflow scheduled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow scheduled successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "654321098765432109876542"
 *                     nextExecution:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T11:00:00Z"
 *       400:
 *         description: Bad request, e.g., Workflow ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       404:
 *         description: Workflow not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow not found
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to schedule workflow
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
 * @swagger
 * /api/v1/workflow-automation/workflows/{workflowId}/unschedule:
 *   post:
 *     summary: Unschedule a workflow
 *     description: Removes a workflow from its scheduled execution cycle.
 *     tags:
 *       - Workflow Scheduling
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to unschedule.
 *     responses:
 *       200:
 *         description: Workflow unscheduled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow unscheduled successfully
 *       400:
 *         description: Bad request, e.g., Workflow ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       404:
 *         description: Workflow not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow not found
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to unschedule workflow
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
 * @swagger
 * /api/v1/workflow-automation/connections/health:
 *   get:
 *     summary: Get connection health for all user's connected apps
 *     description: Checks the health status of all third-party application connections associated with the authenticated user.
 *     tags:
 *       - Connections
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Connection health retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: All connections are healthy.
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     summary:
 *                       type: string
 *                       example: All connections are healthy.
 *                     details:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           appName:
 *                             type: string
 *                             example: "Google Drive"
 *                           status:
 *                             type: string
 *                             example: "healthy"
 *                           message:
 *                             type: string
 *                             example: "Connection is active."
 *                           lastChecked:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to check connection health
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
 * @swagger
 * /api/v1/workflow-automation/connections/refresh:
 *   post:
 *     summary: Refresh a stale app connection
 *     description: Attempts to refresh an OAuth token or re-authenticate a connection for a specified application.
 *     tags:
 *       - Connections
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appName
 *             properties:
 *               appName:
 *                 type: string
 *                 description: The name of the application whose connection needs to be refreshed (e.g., "Google Drive", "Slack").
 *                 example: "Google Drive"
 *     responses:
 *       200:
 *         description: Connection refreshed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Connection refreshed successfully.
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: Connection refreshed successfully.
 *       400:
 *         description: Bad request, e.g., appName is missing or refresh failed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: appName is required in body
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to refresh connection
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
 * @swagger
 * /api/v1/workflow-automation/approvals/pending:
 *   get:
 *     summary: Get all pending approvals for a user
 *     description: Retrieves a list of all workflow approval requests that are currently pending for the authenticated user.
 *     tags:
 *       - Workflow Approvals
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending approvals retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Pending approvals retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                         example: "654321098765432109876544"
 *                       workflowId:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "654321098765432109876542"
 *                           name:
 *                             type: string
 *                             example: "Document Approval Workflow"
 *                           description:
 *                             type: string
 *                             example: "Workflow for approving new documents."
 *                       executionId:
 *                         type: string
 *                         example: "654321098765432109876543"
 *                       userId:
 *                         type: string
 *                         example: "user123"
 *                       status:
 *                         type: string
 *                         example: "pending"
 *                       stepId:
 *                         type: string
 *                         example: "approvalStep"
 *                       requestTime:
 *                         type: string
 *                         format: date-time
 *                         example: "2023-10-27T10:30:00Z"
 *                       approvalForm:
 *                         type: object
 *                         example: { type: "text", label: "Comments" }
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to retrieve pending approvals
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
 * @swagger
 * /api/v1/workflow-automation/approvals/{approvalId}/resolve:
 *   post:
 *     summary: Resolve a pending approval request
 *     description: Approves or rejects a specific pending workflow approval request, resuming or cancelling the workflow execution accordingly.
 *     tags:
 *       - Workflow Approvals
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: approvalId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the approval request to resolve.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               approved:
 *                 type: boolean
 *                 description: Set to `true` to approve, `false` to reject.
 *                 default: true
 *               formResponse:
 *                 type: object
 *                 description: Optional data submitted from an approval form, to be injected into the workflow context.
 *                 example:
 *                   comments: "Approved after review."
 *             example:
 *               approved: true
 *               formResponse:
 *                 reviewerComments: "Looks good, proceed."
 *     responses:
 *       200:
 *         description: Approval request resolved and workflow execution resumed/cancelled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Approval request approved and workflow execution resumed
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     message:
 *                       type: string
 *                       example: Workflow execution resumed.
 *                     executionId:
 *                       type: string
 *                       example: "654321098765432109876543"
 *       400:
 *         description: Bad request, e.g., Approval ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Approval ID is required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to resolve approval request
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
 * @swagger
 * /api/v1/workflow-automation/webhooks/{webhookId}:
 *   post:
 *     summary: Handle incoming dynamic third-party webhooks to trigger workflow execution
 *     description: This endpoint receives webhook payloads from external services and triggers a corresponding workflow.
 *                  It supports optional secret-based authentication via `x-webhook-secret` header or `secret` query parameter.
 *                  The workflow execution is triggered asynchronously.
 *     tags:
 *       - Webhooks
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow configured to listen for this webhook.
 *       - in: header
 *         name: x-webhook-secret
 *         schema:
 *           type: string
 *         description: Optional secret key for webhook authentication.
 *       - in: query
 *         name: secret
 *         schema:
 *           type: string
 *         description: Optional secret key for webhook authentication (alternative to header).
 *       - in: query
 *         name: any_query_param
 *         schema:
 *           type: string
 *         description: Any additional query parameters provided by the webhook sender.
 *         style: deepObject
 *         explode: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The dynamic payload sent by the third-party webhook.
 *             example:
 *               event: "new_item"
 *               data:
 *                 id: "item123"
 *                 name: "New Product Launch"
 *                 status: "pending"
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             description: The dynamic payload sent by the third-party webhook.
 *             example:
 *               event: "new_item"
 *               data: "item123"
 *     responses:
 *       200:
 *         description: Workflow trigger request accepted successfully. Execution will proceed asynchronously.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow trigger request accepted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "654321098765432109876542"
 *                     triggerType:
 *                       type: string
 *                       example: "webhook"
 *                     status:
 *                       type: string
 *                       example: "accepted"
 *       400:
 *         description: Bad request, e.g., Webhook ID is missing, workflow not active, or not configured for webhooks.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Webhook ID/Workflow ID is required
 *       401:
 *         description: Unauthorized, invalid webhook secret key.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Invalid webhook secret key
 *       404:
 *         description: Workflow not found for the given webhook ID.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 404
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Workflow not found
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to process webhook trigger
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
 * @swagger
 * /api/v1/workflow-automation/executions/{executionId}/replay:
 *   post:
 *     summary: Time-Travel Replay an execution
 *     description: Replays a past workflow execution starting from a specific step, with the option to mutate the context.
 *                  This is useful for debugging or re-running parts of a workflow with different inputs.
 *     tags:
 *       - Workflow Execution
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the original execution to replay.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startStepId
 *             properties:
 *               startStepId:
 *                 type: string
 *                 description: The ID of the step from which to start the replay.
 *                 example: "step_2_process_data"
 *               mutatedContext:
 *                 type: object
 *                 description: Optional context data to override or merge with the original execution context at the start step.
 *                 example:
 *                   overrideValue: "new_data"
 *                   originalKey: "updated_value"
 *     responses:
 *       200:
 *         description: Time-travel replay successfully initiated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Time-travel replay successfully initiated
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     newExecutionId:
 *                       type: string
 *                       example: "654321098765432109876545"
 *                     message:
 *                       type: string
 *                       example: Replay execution started.
 *       400:
 *         description: Bad request, e.g., Execution ID or Start Step ID is missing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 400
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Execution ID and Start Step ID are required
 *       401:
 *         description: Unauthorized, user authentication required.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 401
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: User authentication required
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 500
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Failed to initiate execution replay
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

/**
 * @typedef {object} ExecutionController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} executeWorkflowController - Controller for manually executing a workflow.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getExecutionHistoryController - Controller for retrieving workflow execution history.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getExecutionDetailsController - Controller for retrieving details of a specific workflow execution.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} cancelExecutionController - Controller for canceling a running workflow execution.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} scheduleWorkflowController - Controller for scheduling a workflow.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} unscheduleWorkflowController - Controller for unscheduling a workflow.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getConnectionHealthController - Controller for getting connection health.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} refreshConnectionController - Controller for refreshing a stale app connection.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getPendingApprovalsController - Controller for getting all pending approvals for a user.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} resolveApprovalController - Controller for resolving a pending approval request.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} handleWebhookTriggerController - Controller for handling incoming dynamic third-party webhooks.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} replayExecutionController - Controller for time-travel replaying an execution.
 */

/**
 * Exports all workflow execution related controller functions.
 * @type {ExecutionController}
 */
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