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
    // Optimization Suggestion for workflowStorageService.analyzeAndStoreWorkflow:
    // If this service method performs read operations before writing (e.g., checking for existing data),
    // ensure those read operations use .lean() if Mongoose document methods are not needed.
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
    // Optimization Suggestion for workflowStorageService.getUserStoredWorkflows:
    // 1. Ensure .lean() is used for read operations to return plain JavaScript objects,
    //    improving performance by skipping Mongoose document instantiation.
    // 2. Recommend indexes on the Workflow model for fields used in filtering and sorting:
    //    - { userId: 1 }
    //    - { userId: 1, status: 1 }
    //    - { userId: 1, workflowType: 1 }
    //    - { userId: 1, category: 1 }
    //    - { userId: 1, tags: 1 } (for array fields, consider multi-key index)
    //    - { userId: 1, createdAt: -1 } (for sorting)
    //    - Compound indexes like { userId: 1, category: 1, createdAt: -1 } might be beneficial
    //      depending on common query patterns.
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
    // Optimization Suggestion for workflowStorageService.getStoredWorkflow:
    // 1. Ensure .lean() is used for this read operation to return a plain JavaScript object.
    // 2. Recommend indexes on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (if workflowId maps to _id) or { workflowId: 1, userId: 1 }
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
    // Optimization Suggestion for workflowStorageService.updateStoredWorkflow:
    // 1. If the service method returns the updated document, consider using { new: true, lean: true }
    //    in the Mongoose update query (e.g., findByIdAndUpdate) to return a plain JavaScript object directly.
    // 2. Recommend indexes on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (if workflowId maps to _id) or { workflowId: 1, userId: 1 }
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
    // Optimization Suggestion for workflowStorageService.deleteStoredWorkflow:
    // Recommend indexes on the Workflow model for efficient lookup:
    // - { _id: 1, userId: 1 } (if workflowId maps to _id) or { workflowId: 1, userId: 1 }
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
    // Optimization Suggestion for workflowStorageService.searchStoredWorkflows:
    // 1. Ensure .lean() is used for read operations to return plain JavaScript objects.
    // 2. Recommend indexes on the Workflow model for efficient search:
    //    - { userId: 1 }
    //    - For 'searchTerm', consider a text index on relevant fields (e.g., title, description, tags)
    //      or specific indexes for prefix/substring searches if applicable.
    //    - Compound index like { userId: 1, title: 1 } or { userId: 1, description: 1 } if search is often combined with user.
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
    // Optimization Suggestion for workflowStorageService.getExecutableWorkflows:
    // 1. Ensure .lean() is used for read operations to return plain JavaScript objects.
    // 2. Recommend indexes on the Workflow model for efficient lookup:
    //    - { userId: 1, status: 1 } (assuming 'status' indicates executability)
    //    - { userId: 1, workflowType: 1 } (if 'workflowType' indicates executability)
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
    // Optimization Suggestion for workflowStorageService.refreshWorkflowConnections:
    // 1. If this operation involves reading a document before updating, ensure the initial read uses .lean().
    // 2. If the service method returns the updated document, consider using { new: true, lean: true }
    //    in the Mongoose update query.
    // 3. Recommend indexes on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (if workflowId maps to _id) or { workflowId: 1, userId: 1 }
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
    // Optimization Suggestion for workflowStorageService.prepareWorkflowForExecution:
    // 1. If this operation involves reading a document before updating, ensure the initial read uses .lean().
    // 2. If the service method returns the updated document, consider using { new: true, lean: true }
    //    in the Mongoose update query.
    // 3. Recommend indexes on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (if workflowId maps to _id) or { workflowId: 1, userId: 1 }
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
    // Optimization Suggestion for workflowStorageService.getWorkflowStatistics:
    // 1. If this operation involves aggregation or multiple read queries, ensure .lean() is used
    //    for any intermediate find operations that return Mongoose documents.
    // 2. Recommend indexes on the Workflow model for efficient aggregation:
    //    - { userId: 1 } (crucial for filtering statistics by user)
    //    - Additional indexes on fields used in aggregation groups or sorts (e.g., { userId: 1, category: 1 })
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