import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowService } from '../services/workflow.service.js';

/**
 * @swagger
 * /api/v1/workflows:
 *   post:
 *     summary: Create a new workflow
 *     description: Creates a new workflow with a defined execution plan, type, and optional scheduling.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - executionPlan
 *               - workflowType
 *               - requiredApps
 *             properties:
 *               title:
 *                 type: string
 *                 description: The title of the workflow.
 *                 example: "Daily Report Generation"
 *               description:
 *                 type: string
 *                 description: A brief description of what the workflow does.
 *                 example: "Generates a daily sales report and sends it to the team."
 *               executionPlan:
 *                 type: array
 *                 description: An array of steps or actions defining the workflow's execution logic.
 *                 items:
 *                   type: object
 *                   description: A single step in the workflow.
 *                   example: { "action": "sendEmail", "params": { "to": "team@example.com", "subject": "Daily Report" } }
 *               workflowType:
 *                 type: string
 *                 description: The type of workflow (e.g., 'scheduled', 'manual', 'event-driven').
 *                 enum: [scheduled, manual, event-driven]
 *                 example: "scheduled"
 *               requiredApps:
 *                 type: array
 *                 description: A list of application IDs or names required for the workflow to function.
 *                 items:
 *                   type: string
 *                 example: ["app_id_1", "app_id_2"]
 *               triggerType:
 *                 type: string
 *                 description: The type of trigger for the workflow (e.g., 'schedule', 'api_call', 'webhook').
 *                 enum: [schedule, api_call, webhook, user_input]
 *                 example: "schedule"
 *               scheduleConfig:
 *                 type: object
 *                 description: Configuration for scheduled workflows (e.g., cron expression).
 *                 properties:
 *                   cronExpression:
 *                     type: string
 *                     example: "0 0 * * *"
 *                   timezone:
 *                     type: string
 *                     example: "America/New_York"
 *               originalUserInput:
 *                 type: string
 *                 description: The original user input that led to the creation of this workflow, if applicable.
 *                 example: "Create a workflow to send me a daily sales report at 9 AM."
 *               conversationId:
 *                 type: string
 *                 description: The ID of the conversation context from which this workflow was created.
 *                 example: "conv_12345"
 *               conversationContext:
 *                 type: object
 *                 description: Additional context from the conversation.
 *                 example: { "userPreferences": { "reportFormat": "pdf" } }
 *     responses:
 *       201:
 *         description: Workflow created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Workflow created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "wf_12345"
 *                     title:
 *                       type: string
 *                       example: "Daily Report Generation"
 *       400:
 *         description: Bad Request - Missing required fields or invalid data.
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
 *                   example: "Missing required fields: title, executionPlan, workflowType, requiredApps"
 *                 error:
 *                   type: string
 *                   example: "Validation Error"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
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
 * @swagger
 * /api/v1/workflows:
 *   get:
 *     summary: Get user's workflows
 *     description: Retrieves a list of workflows associated with the authenticated user, with optional filtering by status and pagination.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, paused, completed, failed, pending]
 *         description: Filter workflows by their current status.
 *         example: "active"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 50
 *         description: Maximum number of workflows to return.
 *         example: 10
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *           default: 0
 *         description: Number of workflows to skip before starting to collect the result set.
 *         example: 0
 *     responses:
 *       200:
 *         description: Workflows retrieved successfully.
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
 *                   example: "Workflows retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflows:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                             example: "wf_12345"
 *                           title:
 *                             type: string
 *                             example: "Daily Report Generation"
 *                           status:
 *                             type: string
 *                             example: "active"
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T10:00:00Z"
 *                     total:
 *                       type: number
 *                       example: 5
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       500:
 *         description: Internal Server Error - Failed to retrieve workflows.
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
 *                   example: "Failed to retrieve workflows"
 *                 error:
 *                   type: string
 *                   example: "Database error"
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
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   get:
 *     summary: Get workflow by ID
 *     description: Retrieves a single workflow by its ID, ensuring it belongs to the authenticated user.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to retrieve.
 *         example: "wf_12345"
 *     responses:
 *       200:
 *         description: Workflow retrieved successfully.
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
 *                   example: "Workflow retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                       example: "wf_12345"
 *                     title:
 *                       type: string
 *                       example: "Daily Report Generation"
 *                     description:
 *                       type: string
 *                       example: "Generates a daily sales report."
 *                     status:
 *                       type: string
 *                       example: "active"
 *                     executionPlan:
 *                       type: array
 *                       items:
 *                         type: object
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
 *       500:
 *         description: Internal Server Error - Failed to retrieve workflow.
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
 *                   example: "Failed to retrieve workflow"
 *                 error:
 *                   type: string
 *                   example: "Database error"
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
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   patch:
 *     summary: Update workflow
 *     description: Updates an existing workflow's details, allowing partial modifications.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to update.
 *         example: "wf_12345"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: The new title of the workflow.
 *                 example: "Updated Daily Report Generation"
 *               description:
 *                 type: string
 *                 description: The new description of the workflow.
 *                 example: "Updated description for daily sales report."
 *               executionPlan:
 *                 type: array
 *                 description: The new execution plan for the workflow.
 *                 items:
 *                   type: object
 *               workflowType:
 *                 type: string
 *                 description: The new type of workflow.
 *                 enum: [scheduled, manual, event-driven]
 *                 example: "manual"
 *               requiredApps:
 *                 type: array
 *                 description: The updated list of required application IDs.
 *                 items:
 *                   type: string
 *               triggerType:
 *                 type: string
 *                 description: The new trigger type for the workflow.
 *                 enum: [schedule, api_call, webhook, user_input]
 *                 example: "api_call"
 *               scheduleConfig:
 *                 type: object
 *                 description: The new schedule configuration.
 *                 properties:
 *                   cronExpression:
 *                     type: string
 *                     example: "0 9 * * *"
 *                   timezone:
 *                     type: string
 *                     example: "Europe/London"
 *               status:
 *                 type: string
 *                 description: The new status of the workflow.
 *                 enum: [active, paused, completed, failed, pending]
 *                 example: "paused"
 *     responses:
 *       200:
 *         description: Workflow updated successfully.
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
 *                   example: "Workflow updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "wf_12345"
 *                     title:
 *                       type: string
 *                       example: "Updated Daily Report Generation"
 *       400:
 *         description: Bad Request - Invalid update data.
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
 *                   example: "Invalid update data"
 *                 error:
 *                   type: string
 *                   example: "Validation Error"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
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
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   delete:
 *     summary: Delete workflow
 *     description: Deletes a workflow by its ID, ensuring it belongs to the authenticated user.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to delete.
 *         example: "wf_12345"
 *     responses:
 *       200:
 *         description: Workflow deleted successfully.
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
 *                   example: "Workflow deleted successfully"
 *       400:
 *         description: Bad Request - Failed to delete workflow due to an internal error.
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
 *                   example: "Failed to delete workflow"
 *                 error:
 *                   type: string
 *                   example: "Deletion failed"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
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
 * @swagger
 * /api/v1/workflows/{workflowId}/trigger:
 *   post:
 *     summary: Manually trigger workflow execution
 *     description: Initiates a manual execution of a specified workflow.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to trigger.
 *         example: "wf_12345"
 *     responses:
 *       200:
 *         description: Workflow triggered successfully.
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
 *                   example: "Workflow triggered successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     executionId:
 *                       type: string
 *                       example: "exec_67890"
 *                     status:
 *                       type: string
 *                       example: "pending"
 *       400:
 *         description: Bad Request - Failed to trigger workflow.
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
 *                   example: "Failed to trigger workflow"
 *                 error:
 *                   type: string
 *                   example: "Workflow is paused"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
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
 * @swagger
 * /api/v1/workflows/{workflowId}/pause:
 *   patch:
 *     summary: Pause workflow
 *     description: Pauses a currently active workflow, preventing further scheduled or triggered executions.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to pause.
 *         example: "wf_12345"
 *     responses:
 *       200:
 *         description: Workflow paused successfully.
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
 *                   example: "Workflow paused successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "wf_12345"
 *                     status:
 *                       type: string
 *                       example: "paused"
 *       400:
 *         description: Bad Request - Failed to pause workflow (e.g., already paused).
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
 *                   example: "Workflow is already paused"
 *                 error:
 *                   type: string
 *                   example: "Invalid state"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
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
 * @swagger
 * /api/v1/workflows/{workflowId}/resume:
 *   patch:
 *     summary: Resume workflow
 *     description: Resumes a paused workflow, allowing it to execute according to its schedule or triggers.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow to resume.
 *         example: "wf_12345"
 *     responses:
 *       200:
 *         description: Workflow resumed successfully.
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
 *                   example: "Workflow resumed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflowId:
 *                       type: string
 *                       example: "wf_12345"
 *                     status:
 *                       type: string
 *                       example: "active"
 *       400:
 *         description: Bad Request - Failed to resume workflow (e.g., already active).
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
 *                   example: "Workflow is already active"
 *                 error:
 *                   type: string
 *                   example: "Invalid state"
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
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
 * @swagger
 * /api/v1/workflows/{workflowId}/executions:
 *   get:
 *     summary: Get workflow execution history
 *     description: Retrieves a list of past executions for a specific workflow, with optional pagination.
 *     tags:
 *       - Workflows
 *       - Executions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow whose execution history is to be retrieved.
 *         example: "wf_12345"
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 50
 *         description: Maximum number of executions to return.
 *         example: 10
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
 *                   example: "Execution history retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     executions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           executionId:
 *                             type: string
 *                             example: "exec_67890"
 *                           workflowId:
 *                             type: string
 *                             example: "wf_12345"
 *                           status:
 *                             type: string
 *                             example: "completed"
 *                           startTime:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T10:05:00Z"
 *                           endTime:
 *                             type: string
 *                             format: date-time
 *                             example: "2023-10-27T10:05:30Z"
 *                     total:
 *                       type: number
 *                       example: 3
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Workflow not found or not accessible by the user.
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
 *                   example: "Workflow not found"
 *                 error:
 *                   type: string
 *                   example: "Workflow not found"
 *       500:
 *         description: Internal Server Error - Failed to retrieve execution history.
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
 *                   example: "Failed to retrieve execution history"
 *                 error:
 *                   type: string
 *                   example: "Database error"
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
 * @swagger
 * /api/v1/executions/{executionId}:
 *   get:
 *     summary: Get execution details by ID
 *     description: Retrieves detailed information for a specific workflow execution.
 *     tags:
 *       - Executions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: executionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the workflow execution to retrieve.
 *         example: "exec_67890"
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
 *                   example: "Execution details retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     executionId:
 *                       type: string
 *                       example: "exec_67890"
 *                     workflowId:
 *                       type: string
 *                       example: "wf_12345"
 *                     status:
 *                       type: string
 *                       example: "completed"
 *                     startTime:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:05:00Z"
 *                     endTime:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:05:30Z"
 *                     logs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           timestamp:
 *                             type: string
 *                             format: date-time
 *                           message:
 *                             type: string
 *       401:
 *         description: Unauthorized - User authentication required.
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
 *                   example: "User authentication required"
 *       404:
 *         description: Not Found - Execution not found or not accessible by the user.
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
 *                   example: "Execution not found"
 *       500:
 *         description: Internal Server Error - Failed to retrieve execution details.
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
 *                   example: "Failed to retrieve execution details"
 *                 error:
 *                   type: string
 *                   example: "Database error"
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

    // Optimization: Add .lean() for read-only operations to improve performance
    // Recommendation: Consider adding a compound index on { executionId: 1, userId: 1 }
    // or { userId: 1, executionId: 1 } to the WorkflowExecution model for faster lookups.
    const execution = await WorkflowExecution.findOne({
      executionId,
      userId,
    }).lean();

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

/**
 * @typedef {object} WorkflowController
 * @property {function(Express.Request, Express.Response): Promise<void>} createWorkflowController - Controller for creating a new workflow.
 * @property {function(Express.Request, Express.Response): Promise<void>} getUserWorkflowsController - Controller for retrieving a user's workflows.
 * @property {function(Express.Request, Express.Response): Promise<void>} getWorkflowController - Controller for retrieving a single workflow by ID.
 * @property {function(Express.Request, Express.Response): Promise<void>} updateWorkflowController - Controller for updating an existing workflow.
 * @property {function(Express.Request, Express.Response): Promise<void>} deleteWorkflowController - Controller for deleting a workflow.
 * @property {function(Express.Request, Express.Response): Promise<void>} triggerWorkflowController - Controller for manually triggering a workflow.
 * @property {function(Express.Request, Express.Response): Promise<void>} pauseWorkflowController - Controller for pausing a workflow.
 * @property {function(Express.Request, Express.Response): Promise<void>} resumeWorkflowController - Controller for resuming a workflow.
 * @property {function(Express.Request, Express.Response): Promise<void>} getWorkflowExecutionsController - Controller for retrieving a workflow's execution history.
 * @property {function(Express.Request, Express.Response): Promise<void>} getExecutionController - Controller for retrieving details of a specific workflow execution.
 */

/**
 * Workflow controller object containing all workflow-related endpoint handlers.
 * @type {WorkflowController}
 */
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