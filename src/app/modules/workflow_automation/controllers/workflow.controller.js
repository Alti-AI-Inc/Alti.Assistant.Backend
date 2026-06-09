import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import Workflow from '../models/workflow.model.js';
import WorkflowTemplate from '../models/workflowTemplate.model.js';
import { workflowLayoutService } from '../services/workflowLayout.service.js';

/**
 * @typedef {object} WorkflowResponse
 * @property {number} statusCode - The HTTP status code.
 * @property {boolean} success - Indicates if the request was successful.
 * @property {string} message - A descriptive message.
 * @property {object} [data] - The response data, if any.
 * @property {Array<object>} [data.workflows] - List of workflows.
 * @property {number} [data.total] - Total count of workflows.
 * @property {number} [data.limit] - Limit applied to the query.
 * @property {number} [data.offset] - Offset applied to the query.
 * @property {object} [data.workflow] - A single workflow object.
 * @property {Array<object>} [data.templates] - List of workflow templates.
 * @property {object} [data.report] - Layout validation report.
 * @property {Array<object>} [data.steps] - Compiled workflow execution steps.
 */

/**
 * @swagger
 * /api/v1/workflows:
 *   get:
 *     summary: Get a list of workflows for the authenticated user.
 *     description: Retrieves all workflows associated with the authenticated user, with optional filtering and pagination.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [active, inactive, paused, draft]
 *         description: Filter workflows by their current status.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter workflows by category.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of workflows to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of workflows to skip before starting to return results.
 *     responses:
 *       200:
 *         description: Workflows retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflows retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     workflows:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Workflow'
 *                     total:
 *                       type: integer
 *                       example: 10
 *                     limit:
 *                       type: integer
 *                       example: 50
 *                     offset:
 *                       type: integer
 *                       example: 0
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to get all workflows for the authenticated user.
 * Supports filtering by status and category, and pagination.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getUserWorkflowsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const { status, category, limit = 50, offset = 0 } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const filter = { userId };
    if (status) filter.status = status;
    if (category) filter.category = category;

    const workflows = await Workflow.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .exec();

    const total = await Workflow.countDocuments(filter);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflows retrieved successfully',
      data: {
        workflows,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('Error in getUserWorkflowsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get workflows',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   get:
 *     summary: Get a specific workflow by ID.
 *     description: Retrieves a single workflow belonging to the authenticated user by its ID.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workflow to retrieve.
 *     responses:
 *       200:
 *         description: Workflow retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to get a specific workflow by its ID for the authenticated user.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
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

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    const workflow = await Workflow.findOne({ _id: workflowId, userId });

    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow retrieved successfully',
      data: workflow,
    });
  } catch (error) {
    logger.error('Error in getWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get workflow',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   patch:
 *     summary: Update an existing workflow.
 *     description: Updates specific fields of a workflow identified by its ID, belonging to the authenticated user.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workflow to update.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the workflow.
 *               description:
 *                 type: string
 *                 description: The new description for the workflow.
 *               status:
 *                 type: string
 *                 enum: [active, inactive, paused, draft]
 *                 description: The new status for the workflow.
 *               category:
 *                 type: string
 *                 description: The new category for the workflow.
 *               steps:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: An array of workflow steps.
 *               trigger:
 *                 type: object
 *                 description: The new trigger configuration for the workflow.
 *               requiredApps:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     app:
 *                       type: string
 *                     connected:
 *                       type: boolean
 *                 description: List of required applications and their connection status.
 *               metadata:
 *                 type: object
 *                 description: Additional metadata for the workflow.
 *             example:
 *               name: My Updated Workflow
 *               description: This workflow has been updated.
 *               status: active
 *     responses:
 *       200:
 *         description: Workflow updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to update an existing workflow for the authenticated user.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const updateWorkflowController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const userId = req.user?._id || req.userId;
  const updateData = req.body;

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
    // Remove fields that shouldn't be updated directly
    const {
      _id,
      userId: userIdField,
      createdAt,
      updatedAt,
      ...allowedUpdates
    } = updateData;

    const workflow = await Workflow.findOneAndUpdate(
      { _id: workflowId, userId },
      {
        $set: {
          ...allowedUpdates,
          updatedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    logger.info(`Workflow updated: ${workflowId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow updated successfully',
      data: workflow,
    });
  } catch (error) {
    logger.error('Error in updateWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to update workflow',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/{workflowId}:
 *   delete:
 *     summary: Delete a workflow.
 *     description: Deletes a workflow identified by its ID, belonging to the authenticated user.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workflow to delete.
 *     responses:
 *       200:
 *         description: Workflow deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow deleted successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to delete a workflow for the authenticated user.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
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

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    const workflow = await Workflow.findOneAndDelete({
      _id: workflowId,
      userId,
    });

    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    logger.info(`Workflow deleted: ${workflowId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow deleted successfully',
    });
  } catch (error) {
    logger.error('Error in deleteWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to delete workflow',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/{workflowId}/status:
 *   patch:
 *     summary: Toggle workflow status.
 *     description: Updates the status of a workflow (e.g., activate, deactivate, pause).
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workflowId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workflow to update its status.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive, paused]
 *                 description: The new status for the workflow.
 *             example:
 *               status: active
 *     responses:
 *       200:
 *         description: Workflow status updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow activated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to toggle the status of a workflow (activate/deactivate/pause).
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const toggleWorkflowStatusController = catchAsync(async (req, res) => {
  const { workflowId } = req.params;
  const { status } = req.body;
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

  if (!status || !['active', 'inactive', 'paused'].includes(status)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Valid status is required (active, inactive, paused)',
    });
  }

  try {
    const workflow = await Workflow.findOneAndUpdate(
      { _id: workflowId, userId },
      {
        $set: {
          status,
          updatedAt: new Date(),
        },
      },
      { new: true }
    );

    if (!workflow) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Workflow not found',
      });
    }

    logger.info(`Workflow status changed to ${status}: ${workflowId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `Workflow ${status === 'active' ? 'activated' : status === 'inactive' ? 'deactivated' : 'paused'} successfully`,
      data: workflow,
    });
  } catch (error) {
    logger.error('Error in toggleWorkflowStatusController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to update workflow status',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/templates:
 *   get:
 *     summary: Get a list of public workflow templates.
 *     description: Retrieves a list of publicly available workflow templates, with optional filtering and pagination.
 *     tags:
 *       - Workflows
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter templates by category.
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags to filter templates. Templates matching any of the tags will be returned.
 *       - in: query
 *         name: difficulty
 *         schema:
 *           type: string
 *           enum: [easy, medium, hard]
 *         description: Filter templates by difficulty level.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of templates to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of templates to skip before starting to return results.
 *     responses:
 *       200:
 *         description: Workflow templates retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow templates retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     templates:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/WorkflowTemplate'
 *                     total:
 *                       type: integer
 *                       example: 5
 *                     limit:
 *                       type: integer
 *                       example: 50
 *                     offset:
 *                       type: integer
 *                       example: 0
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to get a list of public workflow templates.
 * Supports filtering by category, tags, and difficulty, and pagination.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getWorkflowTemplatesController = catchAsync(async (req, res) => {
  const { category, tags, difficulty, limit = 50, offset = 0 } = req.query;

  try {
    const filter = { isPublic: true };
    if (category) filter.category = category;
    if (difficulty) filter.difficulty = difficulty;
    if (tags) {
      const tagArray = tags.split(',');
      filter.tags = { $in: tagArray };
    }

    const templates = await WorkflowTemplate.find(filter)
      .sort({ 'rating.average': -1, usageCount: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .populate('createdBy', 'name email')
      .exec();

    const total = await WorkflowTemplate.countDocuments(filter);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Workflow templates retrieved successfully',
      data: {
        templates,
        total,
        limit: parseInt(limit),
        offset: parseInt(offset),
      },
    });
  } catch (error) {
    logger.error('Error in getWorkflowTemplatesController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get workflow templates',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/from-template/{templateId}:
 *   post:
 *     summary: Create a new workflow from a template.
 *     description: Creates a new workflow for the authenticated user based on an existing template, allowing for optional customizations.
 *     tags:
 *       - Workflows
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: templateId
 *         required: true
 *         schema:
 *           type: string
 *           format: mongoId
 *         description: The ID of the workflow template to use.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Optional. A custom name for the new workflow. If not provided, the template's name will be used.
 *               customizations:
 *                 type: object
 *                 description: Optional. Customizations to apply to the workflow created from the template.
 *                 properties:
 *                   trigger:
 *                     type: object
 *                     description: Custom trigger configuration for the new workflow.
 *                     properties:
 *                       triggerType:
 *                         type: string
 *                         enum: [manual, schedule, webhook]
 *                         example: schedule
 *                       schedule:
 *                         type: string
 *                         example: "0 0 * * *"
 *                   metadata:
 *                     type: object
 *                     description: Additional metadata to merge with the template's metadata.
 *             example:
 *               name: My Custom Workflow from Template
 *               customizations:
 *                 trigger:
 *                   triggerType: schedule
 *                   schedule: "0 9 * * 1-5" # Every weekday at 9 AM
 *     responses:
 *       201:
 *         description: Workflow created from template successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 201
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Workflow created from template successfully
 *                 data:
 *                   $ref: '#/components/schemas/Workflow'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to create a new workflow for the authenticated user based on a template.
 * Allows for optional customization of the new workflow's name and trigger.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const createFromTemplateController = catchAsync(async (req, res) => {
  const { templateId } = req.params;
  const { name, customizations = {} } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!templateId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Template ID is required',
    });
  }

  try {
    const template = await WorkflowTemplate.findById(templateId);

    if (!template) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Template not found',
      });
    }

    // Create workflow from template
    const workflowData = {
      userId,
      name: name || template.name,
      description: template.description,
      originalPrompt: `Created from template: ${template.name}`,
      steps: template.steps,
      trigger: customizations.trigger || { triggerType: 'manual' },
      category: template.category,
      requiredApps: template.requiredApps.map((app) => ({
        app,
        connected: false,
      })),
      metadata: {
        templateId: template._id,
        createdFromTemplate: true,
        ...customizations.metadata,
      },
    };

    const workflow = new Workflow(workflowData);
    await workflow.save();

    // Increment template usage count
    await WorkflowTemplate.updateOne(
      { _id: templateId },
      { $inc: { usageCount: 1 } }
    );

    logger.info(
      `Workflow created from template ${templateId}: ${workflow._id}`
    );

    return sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Workflow created from template successfully',
      data: workflow,
    });
  } catch (error) {
    logger.error('Error in createFromTemplateController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to create workflow from template',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/layout/validate:
 *   post:
 *     summary: Validate a workflow layout.
 *     description: Validates the structure and integrity of a workflow layout (React Flow nodes and edges).
 *     tags:
 *       - Workflows
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nodes
 *             properties:
 *               nodes:
 *                 type: array
 *                 description: An array of React Flow node objects representing the workflow steps.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     type: { type: string }
 *                     data: { type: object }
 *                     position: { type: object }
 *               edges:
 *                 type: array
 *                 description: An array of React Flow edge objects representing connections between nodes.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     source: { type: string }
 *                     target: { type: string }
 *             example:
 *               nodes:
 *                 - id: "1"
 *                   type: "input"
 *                   data: { label: "Start" }
 *                   position: { x: 0, y: 0 }
 *                 - id: "2"
 *                   type: "default"
 *                   data: { label: "Action" }
 *                   position: { x: 200, y: 0 }
 *               edges:
 *                 - id: "e1-2"
 *                   source: "1"
 *                   target: "2"
 *     responses:
 *       200:
 *         description: Layout validation completed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Layout validation completed
 *                 data:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                       example: true
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: []
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to validate a workflow layout (React Flow nodes and edges).
 * Checks the structural integrity and correctness of the provided layout.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const validateWorkflowLayoutController = catchAsync(async (req, res) => {
  const { nodes, edges } = req.body;

  if (!nodes || !Array.isArray(nodes)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Nodes must be a valid array',
    });
  }

  try {
    const report = workflowLayoutService.validateLayoutSchema(nodes, edges || []);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Layout validation completed',
      data: report,
    });
  } catch (error) {
    logger.error('Error in validateWorkflowLayoutController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Layout validation failed',
    });
  }
});

/**
 * @swagger
 * /api/v1/workflows/layout/compile:
 *   post:
 *     summary: Compile a workflow layout into execution steps.
 *     description: Converts a React Flow-based workflow layout (nodes and edges) into a sequential or structured list of executable steps.
 *     tags:
 *       - Workflows
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nodes
 *             properties:
 *               nodes:
 *                 type: array
 *                 description: An array of React Flow node objects representing the workflow steps.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     type: { type: string }
 *                     data: { type: object }
 *                     position: { type: object }
 *               edges:
 *                 type: array
 *                 description: An array of React Flow edge objects representing connections between nodes.
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     source: { type: string }
 *                     target: { type: string }
 *             example:
 *               nodes:
 *                 - id: "startNode"
 *                   type: "trigger"
 *                   data: { triggerType: "manual", label: "Manual Trigger" }
 *                   position: { x: 0, y: 0 }
 *                 - id: "actionNode1"
 *                   type: "action"
 *                   data: { actionType: "sendEmail", recipient: "test@example.com", subject: "Hello" }
 *                   position: { x: 200, y: 0 }
 *                 - id: "actionNode2"
 *                   type: "action"
 *                   data: { actionType: "logMessage", message: "Email sent!" }
 *                   position: { x: 400, y: 0 }
 *               edges:
 *                 - id: "e-startNode-actionNode1"
 *                   source: "startNode"
 *                   target: "actionNode1"
 *                 - id: "e-actionNode1-actionNode2"
 *                   source: "actionNode1"
 *                   target: "actionNode2"
 *     responses:
 *       200:
 *         description: Layout compiled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Layout compiled successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     steps:
 *                       type: array
 *                       description: The compiled list of executable workflow steps.
 *                       items:
 *                         type: object
 *                         properties:
 *                           stepId: { type: string, example: "actionNode1" }
 *                           type: { type: string, example: "action" }
 *                           actionType: { type: string, example: "sendEmail" }
 *                           config: { type: object, example: { recipient: "test@example.com" } }
 *                           dependencies:
 *                             type: array
 *                             items: { type: string }
 *                             example: ["startNode"]
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Controller to compile a workflow layout (React Flow nodes and edges) into execution steps.
 * This process transforms the visual representation into a structured format suitable for execution.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const compileWorkflowLayoutController = catchAsync(async (req, res) => {
  const { nodes, edges } = req.body;

  if (!nodes || !Array.isArray(nodes)) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Nodes must be a valid array',
    });
  }

  try {
    const steps = workflowLayoutService.compileLayoutToSteps(nodes, edges || []);
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Layout compiled successfully',
      data: { steps },
    });
  } catch (error) {
    logger.error('Error in compileWorkflowLayoutController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: error.message || 'Layout compilation failed',
    });
  }
});

/**
 * @namespace workflowController
 * @description Group of controller functions for managing workflows and workflow templates.
 * These functions handle API requests related to creating, retrieving, updating, and deleting workflows,
 * as well as managing workflow templates and layout operations.
 */
export const workflowController = {
  getUserWorkflowsController,
  getWorkflowController,
  updateWorkflowController,
  deleteWorkflowController,
  toggleWorkflowStatusController,
  getWorkflowTemplatesController,
  createFromTemplateController,
  validateWorkflowLayoutController,
  compileWorkflowLayoutController,
};