import StoredWorkflow from '../models/storedWorkflow.model.js';
import { planWorkflowNode } from '../../composio_v2/ai_classification/nodes.js';
import ComposioAuth from '../../composio_v2/composio.model.js';
import { logger } from '../../../../shared/logger.js';
import { withTenantPipeline } from '../../../helpers/tenantQuery.js';

/**
 * Workflow Storage Service - Analyzes user input and stores workflows without execution
 */
class WorkflowStorageService {
  /**
   * Analyze user input and create a stored workflow
   * @param {Object} inputs - Analysis inputs
   * @returns {Object} Analysis and storage result
   */
  async analyzeAndStoreWorkflow(inputs) {
    try {
      const {
        userInput,
        userId,
        title,
        description,
        conversationId,
        conversationContext = {},
        tags = [],
        category = 'other',
      } = inputs;

      if (!userInput || !userId) {
        return {
          success: false,
          error: 'User input and user ID are required',
        };
      }
      console.log('User input:', userInput);
      console.log('User ID:', userId);

      // Get user's connected accounts
      // Optimization: `getUserConnectedAccounts` has been updated to use `.lean()` for read-only data.
      const connectedAccounts = await this.getUserConnectedAccounts(userId);

      // Prepare state for planning
      const planningState = {
        userInput,
        history: conversationContext.history || [],
        conversationContext,
        connectedAccounts,
        userId,
      };

      console.log('Starting workflow analysis for user:', userId);
      console.log('User input:', userInput);

      // Use planWorkflowNode from composio_v2 to analyze the input
      const planResult = await planWorkflowNode(planningState);

      if (planResult.error) {
        return {
          success: false,
          error: planResult.error.message,
          details: planResult.error,
        };
      }

      // Generate workflow title if not provided
      const workflowTitle =
        title || (await this.generateWorkflowTitle(userInput, planResult));

      // Generate workflow ID
      const workflowId = StoredWorkflow.generateWorkflowId();

      // Determine missing connections
      const connectedAppSlugs =
        connectedAccounts?.map((acc) => acc.toolkit?.slug || acc.app) || [];
      console.log('Connected app slugs:', connectedAppSlugs, connectedAccounts);

      const missingConnections =
        planResult.requiredApps?.filter(
          (app) => !connectedAppSlugs.includes(app)
        ) || [];

      // Determine initial status
      const status = missingConnections.length === 0 ? 'ready' : 'draft';

      // Create stored workflow document
      const workflowData = {
        workflowId,
        userId,
        title: workflowTitle,
        description: description || `Workflow created from: "${userInput}"`,
        workflowType: planResult.workflowType,
        status,
        requiredApps: planResult.requiredApps || [],
        executionPlan: planResult.executionPlan || [],
        totalSteps:
          planResult.totalSteps || planResult.executionPlan?.length || 1,
        crossStepParameters: planResult.crossStepParameters || {},
        originalUserInput: userInput,
        planningMetadata: planResult.planningMetadata || {},
        conversationId,
        conversationContext,
        connectedAccounts,
        missingConnections,
        tags: Array.isArray(tags) ? tags : [tags].filter(Boolean),
        category,
      };

      // Save to database
      const storedWorkflow = new StoredWorkflow(workflowData);
      await storedWorkflow.save();

      console.log(`Workflow stored successfully: ${workflowId}`);

      return {
        success: true,
        data: {
          workflowId,
          title: workflowTitle,
          workflowType: planResult.workflowType,
          status,
          requiredApps: planResult.requiredApps || [],
          totalSteps: planResult.totalSteps || 1,
          missingConnections,
          isExecutable: missingConnections.length === 0,
          planningMetadata: planResult.planningMetadata,
          createdAt: storedWorkflow.createdAt,
        },
        message: 'Workflow analyzed and stored successfully',
      };
    } catch (error) {
      logger.error('Error in analyzeAndStoreWorkflow:', error);
      return {
        success: false,
        error: error.message,
        details: {
          stack: error.stack,
          name: error.name,
        },
      };
    }
  }

  /**
   * Get stored workflows for a user
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Object} List of workflows
   */
  async getUserStoredWorkflows(userId, options = {}) {
    try {
      const {
        status = null,
        workflowType = null,
        category = null,
        tags = null,
        limit = 50,
        offset = 0,
        sortBy = 'createdAt',
        sortOrder = -1,
      } = options;

      // Optimization: Build query dynamically and push tag filtering to the database.
      // Also, use .lean() for read-only operations to improve performance.
      const query = { userId };
      if (status) query.status = status;
      if (workflowType) query.workflowType = workflowType;
      if (category) query.category = category;
      if (tags && tags.length > 0) {
        // Ensure tags is an array for $in operator
        const searchTags = Array.isArray(tags) ? tags : [tags];
        query.tags = { $in: searchTags };
      }

      const sortOptions = {};
      sortOptions[sortBy] = sortOrder;

      const workflows = await StoredWorkflow.find(query)
        .sort(sortOptions)
        .skip(offset)
        .limit(limit)
        .lean(); // Optimization: Use .lean() for read-only queries

      // Optimization: The in-memory filtering by tags is removed as it's now part of the Mongoose query.
      // This avoids fetching potentially large datasets only to filter them in application memory (N+1-like problem).

      // Optimization: Ensure countDocuments uses the same query for consistency and accuracy.
      const totalCount = await StoredWorkflow.countDocuments(query);

      return {
        success: true,
        data: {
          workflows: workflows, // Use the directly fetched workflows
          totalCount,
          offset,
          limit,
          hasMore: offset + workflows.length < totalCount,
        },
      };
    } catch (error) {
      logger.error('Error getting user stored workflows:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get a specific stored workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Object} Workflow details
   */
  async getStoredWorkflow(workflowId, userId) {
    try {
      // Optimization: Use .lean() for read-only queries to improve performance
      const workflow = await StoredWorkflow.findOne({ workflowId, userId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      return {
        success: true,
        data: workflow,
      };
    } catch (error) {
      logger.error('Error getting stored workflow:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update a stored workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @param {Object} updates - Updates to apply
   * @returns {Object} Update result
   */
  async updateStoredWorkflow(workflowId, userId, updates) {
    try {
      // No .lean() here as we intend to modify and save the document
      const workflow = await StoredWorkflow.findOne({ workflowId, userId });

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      // Apply allowed updates
      const allowedUpdates = [
        'title',
        'description',
        'tags',
        'category',
        'status',
      ];

      Object.keys(updates).forEach((key) => {
        if (allowedUpdates.includes(key)) {
          workflow[key] = updates[key];
        }
      });

      await workflow.save();

      return {
        success: true,
        data: workflow,
        message: 'Workflow updated successfully',
      };
    } catch (error) {
      logger.error('Error updating stored workflow:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Delete a stored workflow
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Object} Deletion result
   */
  async deleteStoredWorkflow(workflowId, userId) {
    try {
      const result = await StoredWorkflow.deleteOne({ workflowId, userId });

      if (result.deletedCount === 0) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      return {
        success: true,
        message: 'Workflow deleted successfully',
      };
    } catch (error) {
      logger.error('Error deleting stored workflow:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Search stored workflows
   * @param {string} userId - User ID
   * @param {string} searchTerm - Search term
   * @param {Object} options - Search options
   * @returns {Object} Search results
   */
  async searchStoredWorkflows(userId, searchTerm, options = {}) {
    try {
      // Optimization: Ensure `StoredWorkflow.searchWorkflows` (a custom static method)
      // uses `.lean()` internally for read-only operations and leverages text indexes
      // if applicable for the `searchTerm`.
      const workflows = await StoredWorkflow.searchWorkflows(
        userId,
        searchTerm,
        options
      );

      return {
        success: true,
        data: {
          workflows,
          searchTerm,
          resultCount: workflows.length,
        },
      };
    } catch (error) {
      logger.error('Error searching stored workflows:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get executable workflows for a user
   * @param {string} userId - User ID
   * @returns {Object} Executable workflows
   */
  async getExecutableWorkflows(userId) {
    try {
      // Optimization: Ensure `StoredWorkflow.findExecutableWorkflows` (a custom static method)
      // uses `.lean()` internally for read-only operations.
      const workflows = await StoredWorkflow.findExecutableWorkflows(userId);

      return {
        success: true,
        data: {
          workflows,
          count: workflows.length,
        },
      };
    } catch (error) {
      logger.error('Error getting executable workflows:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Update workflow connections status
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Object} Update result
   */
  async refreshWorkflowConnections(workflowId, userId) {
    try {
      // No .lean() here as we intend to modify and save the document
      const workflow = await StoredWorkflow.findOne({ workflowId, userId });

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      // Get latest connected accounts
      // Optimization: `getUserConnectedAccounts` has been updated to use `.lean()` for read-only data.
      const connectedAccounts = await this.getUserConnectedAccounts(userId);

      // Update workflow with latest connections
      await workflow.updateConnections(connectedAccounts);

      return {
        success: true,
        data: {
          workflowId,
          status: workflow.status,
          missingConnections: workflow.missingConnections,
          isExecutable: workflow.isExecutable,
        },
        message: 'Workflow connections updated',
      };
    } catch (error) {
      logger.error('Error refreshing workflow connections:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Convert stored workflow to execution format (for composio_v2)
   * @param {string} workflowId - Workflow ID
   * @param {string} userId - User ID
   * @returns {Object} Execution-ready workflow data
   */
  async prepareWorkflowForExecution(workflowId, userId) {
    try {
      // Optimization: Use .lean() for read-only queries to improve performance
      const workflow = await StoredWorkflow.findOne({ workflowId, userId }).lean();

      if (!workflow) {
        return {
          success: false,
          error: 'Workflow not found',
        };
      }

      if (!workflow.isExecutable) {
        return {
          success: false,
          error:
            'Workflow is not executable. Missing connections: ' +
            workflow.missingConnections.join(', '),
        };
      }

      // Convert to composio_v2 workflow format
      const executionData = {
        userId,
        title: workflow.title,
        description: workflow.description,
        executionPlan: workflow.executionPlan,
        workflowType: workflow.workflowType,
        requiredApps: workflow.requiredApps,
        triggerType: 'manual', // Always manual for stored workflows
        originalUserInput: workflow.originalUserInput,
        conversationId: workflow.conversationId,
        conversationContext: workflow.conversationContext,
      };

      return {
        success: true,
        data: executionData,
        message: 'Workflow prepared for execution',
      };
    } catch (error) {
      logger.error('Error preparing workflow for execution:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Generate workflow title from user input
   * @param {string} userInput - Original user input
   * @param {Object} planResult - Planning result
   * @returns {string} Generated title
   */
  async generateWorkflowTitle(userInput, planResult) {
    try {
      // Simple title generation logic
      let title = userInput;

      if (title.length > 50) {
        title = title.substring(0, 47) + '...';
      }

      // Add workflow type suffix
      if (planResult.workflowType === 'multi_step') {
        title += ` (${planResult.totalSteps || planResult.executionPlan?.length || 'Multi'} steps)`;
      }

      return title;
    } catch (error) {
      console.error('Error generating workflow title:', error);
      return userInput.length > 50
        ? userInput.substring(0, 47) + '...'
        : userInput;
    }
  }

  /**
   * Get user's connected accounts
   * @param {string} userId - User ID
   * @returns {Array} Connected accounts
   */
  async getUserConnectedAccounts(userId) {
    try {
      // Optimization: Use .lean() for read-only queries to improve performance
      const connectedAccounts = await ComposioAuth.find({
        userId,
        status: 'ACTIVE',
      }).lean();

      return connectedAccounts || [];
    } catch (error) {
      console.error('Error getting user connected accounts:', error);
      return [];
    }
  }

  /**
   * Get workflow statistics for a user
   * @param {string} userId - User ID
   * @param {Object} req - Request object for tenant context
   * @returns {Object} Statistics
   */
  async getWorkflowStatistics(userId, req = null) {
    try {
      const pipeline = [
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalWorkflows: { $sum: 1 },
            readyWorkflows: {
              $sum: {
                $cond: [{ $eq: ['$status', 'ready'] }, 1, 0],
              },
            },
            draftWorkflows: {
              $sum: {
                $cond: [{ $eq: ['$status', 'draft'] }, 1, 0],
              },
            },
            singleStepWorkflows: {
              $sum: {
                $cond: [{ $eq: ['$workflowType', 'single_step'] }, 1, 0],
              },
            },
            multiStepWorkflows: {
              $sum: {
                $cond: [{ $eq: ['$workflowType', 'multi_step'] }, 1, 0],
              },
            },
            // Assuming 'executionCount' field exists and is a number
            totalExecutions: { $sum: '$executionCount' },
            averageSteps: { $avg: '$totalSteps' },
          },
        },
      ];

      const tenantPipeline = req ? withTenantPipeline(req, pipeline) : pipeline;
      const stats = await StoredWorkflow.aggregate(tenantPipeline);

      const result = stats[0] || {
        totalWorkflows: 0,
        readyWorkflows: 0,
        draftWorkflows: 0,
        singleStepWorkflows: 0,
        multiStepWorkflows: 0,
        totalExecutions: 0,
        averageSteps: 0,
      };

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error('Error getting workflow statistics:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }
}

// Export singleton instance
export const workflowStorageService = new WorkflowStorageService();
export default workflowStorageService;

/*
 * Optimization Recommendations for Mongoose Models (add these to your model definitions):
 *
 * For StoredWorkflow Model:
 * 1. Index for efficient lookups by user and workflow ID:
 *    `StoredWorkflowSchema.index({ userId: 1 });`
 *    `StoredWorkflowSchema.index({ workflowId: 1, userId: 1 }, { unique: true });`
 * 2. Indexes for filtering and sorting in getUserStoredWorkflows:
 *    `StoredWorkflowSchema.index({ userId: 1, status: 1 });`
 *    `StoredWorkflowSchema.index({ userId: 1, workflowType: 1 });`
 *    `StoredWorkflowSchema.index({ userId: 1, category: 1 });`
 *    `StoredWorkflowSchema.index({ userId: 1, tags: 1 });` // For array fields, creates a multikey index
 *    `StoredWorkflowSchema.index({ userId: 1, createdAt: -1 });` // For sorting
 *    A compound index covering multiple fields for `getUserStoredWorkflows` could be highly beneficial
 *    if these filters are frequently used together:
 *    `StoredWorkflowSchema.index({ userId: 1, status: 1, workflowType: 1, category: 1, tags: 1, createdAt: -1 });`
 *    (Note: MongoDB can only use one compound index per query, so choose the most frequently used combination
 *    or multiple single-field/smaller compound indexes if query patterns vary widely.)
 * 3. Text index for searchStoredWorkflows (if it uses text search functionality):
 *    `StoredWorkflowSchema.index({ title: 'text', description: 'text', originalUserInput: 'text' });`
 *    (Ensure the `searchWorkflows` method uses the `$text` operator for this index to be effective.)
 * 4. If `withTenantPipeline` adds a `tenantId` field to the match stage in `getWorkflowStatistics`,
 *    consider a compound index: `StoredWorkflowSchema.index({ tenantId: 1, userId: 1 });`
 *
 * For ComposioAuth Model:
 * 1. Index for efficient lookups by user and status:
 *    `ComposioAuthSchema.index({ userId: 1, status: 1 });`
 */