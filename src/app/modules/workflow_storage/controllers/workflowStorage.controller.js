import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowStorageService } from '../services/workflowStorage.service.js';

/**
 * @openapi
 * /workflows/analyze:
 *   post:
 *     summary: Analyze user input and store a new workflow
 *     description: Takes user input and other metadata, analyzes it to generate a workflow structure, and stores it in the database. This endpoint is user-specific and requires authentication.
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
 *               - userInput
 *             properties:
 *               userInput:
 *                 type: string
 *                 description: The natural language input from the user describing the workflow.
 *                 example: "When I receive an email in Gmail with 'invoice' in the subject, save the attachment to my 'Invoices' folder in Google Drive."
 *               title:
 *                 type: string
 *                 description: An optional title for the workflow.
 *                 example: "Save Invoice Attachments"
 *               description:
 *                 type: string
 *                 description: An optional description for the workflow.
 *                 example: "Automatically saves invoice attachments from Gmail to a specific Google Drive folder."
 *               conversationId:
 *                 type: string
 *                 description: An optional ID to link this workflow to a specific conversation.
 *                 example: "conv_12345"
 *               conversationContext:
 *                 type: object
 *                 description: Optional context from the conversation.
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional tags for categorizing the workflow.
 *                 example: ["invoices", "automation", "gmail"]
 *               category:
 *                 type: string
 *                 description: An optional category for the workflow.
 *                 example: "Finance"
 *     responses:
 *       '201':
 *         description: Workflow analyzed and created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '400':
 *         description: Bad Request - User input is missing or analysis failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.analyzeAndStoreWorkflow:
    // 1. If this service method performs read operations before writing (e.g., checking for existing data),
    //    ensure those read operations use .lean() if Mongoose document methods are not needed.
    // 2. Consider adding indexes on fields used for lookup or uniqueness checks within the service
    //    (e.g., { userId: 1, conversationId: 1 } if conversationId needs to be unique per user).
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
 * @openapi
 * /workflows:
 *   get:
 *     summary: Get a list of stored workflows for the user
 *     description: Retrieves a paginated and filterable list of workflows belonging to the authenticated user.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, INACTIVE, ERROR]
 *         description: Filter workflows by status.
 *       - in: query
 *         name: workflowType
 *         schema:
 *           type: string
 *         description: Filter workflows by type.
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter workflows by category.
 *       - in: query
 *         name: tags
 *         schema:
 *           type: string
 *         description: Comma-separated list of tags to filter by.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: The number of items to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: The number of items to skip for pagination.
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: The field to sort by.
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: integer
 *           enum: [1, -1]
 *           default: -1
 *         description: The sort order (1 for ascending, -1 for descending).
 *     responses:
 *       '200':
 *         description: A list of workflows retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.getUserStoredWorkflows:
    // 1. Ensure .lean() is used for all read operations to return plain JavaScript objects,
    //    improving performance by skipping Mongoose document instantiation.
    // 2. Implement the following indexes on the Workflow model for efficient filtering, pagination, and sorting:
    //    - { userId: 1 }
    //    - { userId: 1, status: 1 }
    //    - { userId: 1, workflowType: 1 }
    //    - { userId: 1, category: 1 }
    //    - { userId: 1, tags: 1 } (for array fields, a multi-key index is automatically created)
    //    - { userId: 1, createdAt: -1 } (for sorting by creation date)
    //    - Consider compound indexes like { userId: 1, category: 1, createdAt: -1 } or
    //      { userId: 1, status: 1, createdAt: -1 } based on common query patterns to cover filtering and sorting.
    // 3. Address potential N+1 query problems if populating related documents within the service.
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
 * @openapi
 * /workflows/{workflowId}:
 *   get:
 *     summary: Get a specific stored workflow
 *     description: Retrieves the details of a single workflow by its ID. The user must be the owner of the workflow.
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
 *         description: The unique identifier of the workflow.
 *     responses:
 *       '200':
 *         description: Workflow details retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '404':
 *         description: Not Found - The workflow with the specified ID was not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.getStoredWorkflow:
    // 1. Ensure .lean() is used for this read operation to return a plain JavaScript object.
    // 2. Implement an index on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (assuming workflowId maps to _id)
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
 * @openapi
 * /workflows/{workflowId}:
 *   patch:
 *     summary: Update a stored workflow
 *     description: Updates one or more properties of an existing workflow. The user must be the owner of the workflow.
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
 *         description: The unique identifier of the workflow.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               category:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [DRAFT, ACTIVE, INACTIVE, ERROR]
 *               workflowDefinition:
 *                 type: object
 *                 description: The updated workflow definition object.
 *     responses:
 *       '200':
 *         description: Workflow updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '400':
 *         description: Bad Request - Invalid update data provided.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '404':
 *         description: Not Found - The workflow with the specified ID was not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.updateStoredWorkflow:
    // 1. If the service method returns the updated document, use { new: true, lean: true }
    //    in the Mongoose update query (e.g., findByIdAndUpdate) to return a plain JavaScript object directly.
    // 2. Implement an index on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (assuming workflowId maps to _id)
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
 * @openapi
 * /workflows/{workflowId}:
 *   delete:
 *     summary: Delete a stored workflow
 *     description: Permanently deletes a workflow by its ID. The user must be the owner of the workflow.
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
 *         description: The unique identifier of the workflow.
 *     responses:
 *       '200':
 *         description: Workflow deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '404':
 *         description: Not Found - The workflow with the specified ID was not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.deleteStoredWorkflow:
    // Implement an index on the Workflow model for efficient lookup:
    // - { _id: 1, userId: 1 } (assuming workflowId maps to _id)
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
 * @openapi
 * /workflows/search:
 *   get:
 *     summary: Search stored workflows
 *     description: Searches through the title, description, and tags of the authenticated user's workflows.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: searchTerm
 *         required: true
 *         schema:
 *           type: string
 *         description: The term to search for.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: The number of items to return.
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: The number of items to skip for pagination.
 *     responses:
 *       '200':
 *         description: Search completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '400':
 *         description: Bad Request - Search term is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.searchStoredWorkflows:
    // 1. Ensure .lean() is used for read operations to return plain JavaScript objects.
    // 2. Implement the following indexes on the Workflow model for efficient search:
    //    - { userId: 1 }
    //    - For 'searchTerm', consider a text index on relevant fields (e.g., title, description, tags)
    //      using `schema.index({ title: 'text', description: 'text', tags: 'text' })`.
    //      Alternatively, specific indexes like { userId: 1, title: 1 } or { userId: 1, description: 1 }
    //      can be beneficial for prefix/substring searches if using regex (though regex can be less performant).
    //    - A compound index like { userId: 1, title: 1 } can improve performance if searches are often combined with user.
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
 * @openapi
 * /workflows/executable:
 *   get:
 *     summary: Get executable workflows
 *     description: Retrieves a list of all workflows for the authenticated user that are in a state ready for execution (e.g., 'ACTIVE' status with valid connections).
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Executable workflows retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.getExecutableWorkflows:
    // 1. Ensure .lean() is used for read operations to return plain JavaScript objects.
    // 2. Implement indexes on the Workflow model for efficient lookup:
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
 * @openapi
 * /workflows/{workflowId}/refresh-connections:
 *   post:
 *     summary: Refresh workflow connections
 *     description: Triggers a process to refresh and validate the API connections and authentications used within a specific workflow. The user must be the owner of the workflow.
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
 *         description: The unique identifier of the workflow.
 *     responses:
 *       '200':
 *         description: Workflow connections refreshed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '404':
 *         description: Not Found - The workflow with the specified ID was not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.refreshWorkflowConnections:
    // 1. If this operation involves reading a document before updating, ensure the initial read uses .lean().
    // 2. If the service method returns the updated document, use { new: true, lean: true }
    //    in the Mongoose update query.
    // 3. Implement an index on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (assuming workflowId maps to _id)
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
 * @openapi
 * /workflows/{workflowId}/prepare-execution:
 *   post:
 *     summary: Prepare workflow for execution
 *     description: Prepares a specific workflow for execution. This might involve compiling, validating, or generating an executable plan. The user must be the owner of the workflow.
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
 *         description: The unique identifier of the workflow.
 *     responses:
 *       '200':
 *         description: Workflow prepared for execution successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '400':
 *         description: Bad Request - The workflow could not be prepared for execution.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '404':
 *         description: Not Found - The workflow with the specified ID was not found or does not belong to the user.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.prepareWorkflowForExecution:
    // 1. If this operation involves reading a document before updating, ensure the initial read uses .lean().
    // 2. If the service method returns the updated document, use { new: true, lean: true }
    //    in the Mongoose update query.
    // 3. Implement an index on the Workflow model for efficient lookup:
    //    - { _id: 1, userId: 1 } (assuming workflowId maps to _id)
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
 * @openapi
 * /workflows/statistics:
 *   get:
 *     summary: Get workflow statistics
 *     description: Retrieves aggregate statistics for the authenticated user's workflows, such as counts by status, category, or type.
 *     tags:
 *       - Workflows
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '401':
 *         description: Unauthorized - User authentication is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 *       '500':
 *         description: Internal Server Error.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
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
    // Optimization Recommendations for workflowStorageService.getWorkflowStatistics:
    // 1. If this operation involves aggregation or multiple read queries, ensure .lean() is used
    //    for any intermediate find operations that return Mongoose documents.
    // 2. Implement indexes on the Workflow model for efficient aggregation:
    //    - { userId: 1 } (crucial for filtering statistics by user)
    //    - Additional indexes on fields used in aggregation groups or sorts (e.g., { userId: 1, category: 1 })
    //      can significantly improve performance.
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