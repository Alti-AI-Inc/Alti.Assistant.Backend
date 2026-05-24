import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import Workflow from '../models/workflow.model.js';
import WorkflowTemplate from '../models/workflowTemplate.model.js';
import { workflowLayoutService } from '../services/workflowLayout.service.js';

/**
 * Get user's workflows
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
 * Get specific workflow
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
 * Update workflow
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
 * Toggle workflow status (activate/deactivate)
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
 * Get workflow templates
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
 * Create workflow from template
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
 * Validate workflow layout (React Flow nodes and edges)
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
 * Compile workflow layout (React Flow nodes and edges) to execution steps
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
