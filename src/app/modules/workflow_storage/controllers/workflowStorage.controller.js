import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowStorageService } from '../services/workflowStorage.service.js';

/**
 * Analyze user input and store workflow
 */
const analyzeAndStoreWorkflowController = catchAsync(async (req, res) => {
  const {
    userInput,
    title,
    description,
    conversationId,
    conversationContext,
    tags,
    category,
  } = req.body;

  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!userInput) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User input is required',
    });
  }

  try {
    const result = await workflowStorageService.analyzeAndStoreWorkflow({
      userInput,
      userId,
      title,
      description,
      conversationId,
      conversationContext,
      tags,
      category,
    });

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
    logger.error('Error in analyzeAndStoreWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to analyze and store workflow',
    });
  }
});

/**
 * Get user's stored workflows
 */
const getUserStoredWorkflowsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const {
    status,
    workflowType,
    category,
    tags,
    limit = 50,
    offset = 0,
    sortBy = 'createdAt',
    sortOrder = -1,
  } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const result = await workflowStorageService.getUserStoredWorkflows(userId, {
      status,
      workflowType,
      category,
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',')) : null,
      limit: parseInt(limit),
      offset: parseInt(offset),
      sortBy,
      sortOrder: parseInt(sortOrder),
    });

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflows retrieved successfully',
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
    logger.error('Error in getUserStoredWorkflowsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve workflows',
    });
  }
});

/**
 * Get specific stored workflow
 */
const getStoredWorkflowController = catchAsync(async (req, res) => {
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
    const result = await workflowStorageService.getStoredWorkflow(
      workflowId,
      userId
    );

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Workflow retrieved successfully',
        data: result.data,
      });
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in getStoredWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve workflow',
    });
  }
});

/**
 * Update stored workflow
 */
const updateStoredWorkflowController = catchAsync(async (req, res) => {
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

  if (!workflowId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Workflow ID is required',
    });
  }

  try {
    const result = await workflowStorageService.updateStoredWorkflow(
      workflowId,
      userId,
      updates
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
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in updateStoredWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to update workflow',
    });
  }
});

/**
 * Delete stored workflow
 */
const deleteStoredWorkflowController = catchAsync(async (req, res) => {
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
    const result = await workflowStorageService.deleteStoredWorkflow(
      workflowId,
      userId
    );

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: result.message,
      });
    } else {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in deleteStoredWorkflowController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to delete workflow',
    });
  }
});

/**
 * Search stored workflows
 */
const searchStoredWorkflowsController = catchAsync(async (req, res) => {
  const { searchTerm } = req.query;
  const userId = req.user?._id || req.userId;
  const { limit = 20, offset = 0 } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!searchTerm) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Search term is required',
    });
  }

  try {
    const result = await workflowStorageService.searchStoredWorkflows(
      userId,
      searchTerm,
      {
        limit: parseInt(limit),
        offset: parseInt(offset),
      }
    );

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Search completed successfully',
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
    logger.error('Error in searchStoredWorkflowsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to search workflows',
    });
  }
});

/**
 * Get executable workflows
 */
const getExecutableWorkflowsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const result = await workflowStorageService.getExecutableWorkflows(userId);

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Executable workflows retrieved successfully',
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
    logger.error('Error in getExecutableWorkflowsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve executable workflows',
    });
  }
});

/**
 * Refresh workflow connections
 */
const refreshWorkflowConnectionsController = catchAsync(async (req, res) => {
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
    const result = await workflowStorageService.refreshWorkflowConnections(
      workflowId,
      userId
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
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Error in refreshWorkflowConnectionsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to refresh workflow connections',
    });
  }
});

/**
 * Prepare workflow for execution
 */
const prepareWorkflowForExecutionController = catchAsync(async (req, res) => {
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
    const result = await workflowStorageService.prepareWorkflowForExecution(
      workflowId,
      userId
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
    logger.error('Error in prepareWorkflowForExecutionController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to prepare workflow for execution',
    });
  }
});

/**
 * Get workflow statistics
 */
const getWorkflowStatisticsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const result = await workflowStorageService.getWorkflowStatistics(userId);

    if (result.success) {
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Statistics retrieved successfully',
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
    logger.error('Error in getWorkflowStatisticsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve statistics',
    });
  }
});

export {
  analyzeAndStoreWorkflowController,
  getUserStoredWorkflowsController,
  getStoredWorkflowController,
  updateStoredWorkflowController,
  deleteStoredWorkflowController,
  searchStoredWorkflowsController,
  getExecutableWorkflowsController,
  refreshWorkflowConnectionsController,
  prepareWorkflowForExecutionController,
  getWorkflowStatisticsController,
};
