import StoredWorkflow from '../models/storedWorkflow.model.js';
import { planWorkflowNode } from './aiPlanner.js';
import { logger } from '../../../../shared/logger.js';
import { withTenantPipeline } from '../../../helpers/tenantQuery.js';

/**
 * @file Workflow Storage Service
 * @module app/modules/workflow_storage/services/workflowStorage.service
 * @description This service handles the analysis, storage, retrieval, and management of user-defined workflows.
 * It integrates with AI planning nodes to interpret user input and store workflows without immediate execution.
 */

/**
 * @class WorkflowStorageService
 * @description Manages the lifecycle of stored workflows, from initial analysis and storage to retrieval,
 * updates, and deletion. It interacts with `StoredWorkflow` and `ComposioAuth` models, and leverages
 * AI planning capabilities from `composio_v2`.
 */
class WorkflowStorageService {
  /**
   * Analyzes user input using an AI planning node and stores the resulting workflow.
   * This process involves identifying required applications, generating an execution plan,
   * and determining the workflow's initial status based on connected accounts.
   *
   * @async
   * @param {object} inputs - The input parameters for workflow analysis and storage.
   * @param {string} inputs.userInput - The natural language input from the user describing the desired workflow.
   * @param {string} inputs.userId - The ID of the user initiating the workflow.
   * @param {string} [inputs.title] - An optional title for the workflow. If not provided, one will be generated.
   * @param {string} [inputs.description] - An optional description for the workflow. If not provided, one will be generated from user input.
   * @param {string} [inputs.conversationId] - The ID of the conversation context from which the workflow originated.
   * @param {object} [inputs.conversationContext={}] - Additional context from the conversation, e.g., history.
   * @param {Array<string>} [inputs.tags=[]] - An array of tags to categorize the workflow.
   * @param {string} [inputs.category='other'] - A category for the workflow (e.g., 'productivity', 'finance').
   * @returns {Promise<object>} An object indicating the success or failure of the operation.
   * @returns {boolean} returns.success - True if the workflow was successfully analyzed and stored, false otherwise.
   * @returns {object} [returns.data] - Contains details of the stored workflow if successful.
   * @returns {string} returns.data.workflowId - The unique ID of the newly stored workflow.
   * @returns {string} returns.data.title - The title of the stored workflow.
   * @returns {string} returns.data.workflowType - The type of workflow (e.g., 'single_step', 'multi_step').
   * @returns {string} returns.data.status - The current status of the workflow ('ready' or 'draft').
   * @returns {Array<string>} returns.data.requiredApps - A list of applications required by the workflow.
   * @returns {number} returns.data.totalSteps - The total number of steps in the workflow's execution plan.
   * @returns {Array<string>} returns.data.missingConnections - A list of required applications for which the user lacks active connections.
   * @returns {boolean} returns.data.isExecutable - True if all required connections are present, false otherwise.
   * @returns {object} returns.data.planningMetadata - Metadata from the AI planning process.
   * @returns {Date} returns.data.createdAt - The timestamp when the workflow was created.
   * @returns {string} returns.data.message - A success message.
   * @returns {string} [returns.error] - An error message if the operation failed.
   * @returns {object} [returns.details] - Additional error details, such as stack trace.
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
   * Retrieves a list of stored workflows for a specific user, with optional filtering and pagination.
   *
   * @async
   * @param {string} userId - The ID of the user whose workflows are to be retrieved.
   * @param {object} [options={}] - Query options for filtering, sorting, and pagination.
   * @param {string} [options.status=null] - Filter workflows by their status (e.g., 'ready', 'draft').
   * @param {string} [options.workflowType=null] - Filter workflows by their type (e.g., 'single_step', 'multi_step').
   * @param {string} [options.category=null] - Filter workflows by their category.
   * @param {string|Array<string>} [options.tags=null] - Filter workflows by one or more tags.
   * @param {number} [options.limit=50] - The maximum number of workflows to return.
   * @param {number} [options.offset=0] - The number of workflows to skip before starting to return results.
   * @param {string} [options.sortBy='createdAt'] - The field to sort the workflows by.
   * @param {number} [options.sortOrder=-1] - The sort order (1 for ascending, -1 for descending).
   * @returns {Promise<object>} An object containing the list of workflows and pagination information.
   * @returns {boolean} returns.success - True if the workflows were successfully retrieved, false otherwise.
   * @returns {object} [returns.data] - Contains the retrieved workflows and metadata if successful.
   * @returns {Array<object>} returns.data.workflows - An array of workflow documents.
   * @returns {number} returns.data.totalCount - The total number of workflows matching the query, ignoring limit/offset.
   * @returns {number} returns.data.offset - The offset used in the query.
   * @returns {number} returns.data.limit - The limit used in the query.
   * @returns {boolean} returns.data.hasMore - True if there are more workflows beyond the current limit/offset.
   * @returns {string} [returns.error] - An error message if the operation failed.
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
   * Retrieves a single stored workflow by its ID for a specific user.
   *
   * @async
   * @param {string} workflowId - The unique ID of the workflow to retrieve.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<object>} An object containing the workflow details or an error.
   * @returns {boolean} returns.success - True if the workflow was found, false otherwise.
   * @returns {object} [returns.data] - The workflow document if successful.
   * @returns {string} [returns.error] - An error message if the workflow was not found or an error occurred.
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
   * Updates an existing stored workflow with new data. Only a predefined set of fields can be updated.
   *
   * @async
   * @param {string} workflowId - The unique ID of the workflow to update.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @param {object} updates - An object containing the fields to update.
   * @param {string} [updates.title] - The new title for the workflow.
   * @param {string} [updates.description] - The new description for the workflow.
   * @param {Array<string>} [updates.tags] - The new array of tags for the workflow.
   * @param {string} [updates.category] - The new category for the workflow.
   * @param {string} [updates.status] - The new status for the workflow (e.g., 'ready', 'draft').
   * @returns {Promise<object>} An object indicating the success or failure of the update.
   * @returns {boolean} returns.success - True if the workflow was successfully updated, false otherwise.
   * @returns {object} [returns.data] - The updated workflow document if successful.
   * @returns {string} returns.message - A success message.
   * @returns {string} [returns.error] - An error message if the workflow was not found or an error occurred.
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
   * Deletes a specific stored workflow for a user.
   *
   * @async
   * @param {string} workflowId - The unique ID of the workflow to delete.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<object>} An object indicating the success or failure of the deletion.
   * @returns {boolean} returns.success - True if the workflow was successfully deleted, false otherwise.
   * @returns {string} returns.message - A success message.
   * @returns {string} [returns.error] - An error message if the workflow was not found or an error occurred.
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
   * Searches for stored workflows based on a search term for a specific user.
   * This method relies on a custom `searchWorkflows` static method on the `StoredWorkflow` model,
   * which should ideally leverage text indexes for efficient searching.
   *
   * @async
   * @param {string} userId - The ID of the user whose workflows are to be searched.
   * @param {string} searchTerm - The term to search for within workflow titles, descriptions, or user input.
   * @param {object} [options={}] - Additional search options (e.g., pagination, specific fields).
   * @returns {Promise<object>} An object containing the search results.
   * @returns {boolean} returns.success - True if the search was successful, false otherwise.
   * @returns {object} [returns.data] - Contains the search results if successful.
   * @returns {Array<object>} returns.data.workflows - An array of workflow documents matching the search term.
   * @returns {string} returns.data.searchTerm - The search term used.
   * @returns {number} returns.data.resultCount - The number of workflows found.
   * @returns {string} [returns.error] - An error message if the operation failed.
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
   * Retrieves all workflows for a user that are currently marked as 'executable'.
   * Executable workflows are those that have all their required application connections active.
   *
   * @async
   * @param {string} userId - The ID of the user.
   * @returns {Promise<object>} An object containing the list of executable workflows.
   * @returns {boolean} returns.success - True if the retrieval was successful, false otherwise.
   * @returns {object} [returns.data] - Contains the executable workflows if successful.
   * @returns {Array<object>} returns.data.workflows - An array of executable workflow documents.
   * @returns {number} returns.data.count - The number of executable workflows found.
   * @returns {string} [returns.error] - An error message if the operation failed.
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
   * Refreshes the connection status for a specific workflow.
   * This method re-checks the user's connected accounts against the workflow's required applications
   * and updates the workflow's `status` and `missingConnections` fields accordingly.
   *
   * @async
   * @param {string} workflowId - The unique ID of the workflow to refresh.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<object>} An object indicating the success or failure of the refresh.
   * @returns {boolean} returns.success - True if the workflow connections were successfully updated, false otherwise.
   * @returns {object} [returns.data] - Contains updated workflow status information if successful.
   * @returns {string} returns.data.workflowId - The ID of the refreshed workflow.
   * @returns {string} returns.data.status - The new status of the workflow ('ready' or 'draft').
   * @returns {Array<string>} returns.data.missingConnections - The updated list of missing application connections.
   * @returns {boolean} returns.data.isExecutable - The updated executable status of the workflow.
   * @returns {string} returns.message - A success message.
   * @returns {string} [returns.error] - An error message if the workflow was not found or an error occurred.
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
   * Prepares a stored workflow for execution by converting it into a format compatible with the `composio_v2` execution engine.
   * This method ensures the workflow is executable (all connections are present) before formatting the data.
   *
   * @async
   * @param {string} workflowId - The unique ID of the workflow to prepare.
   * @param {string} userId - The ID of the user who owns the workflow.
   * @returns {Promise<object>} An object containing the execution-ready workflow data or an error.
   * @returns {boolean} returns.success - True if the workflow was successfully prepared, false otherwise.
   * @returns {object} [returns.data] - The workflow data formatted for execution if successful.
   * @returns {string} returns.data.userId - The ID of the user.
   * @returns {string} returns.data.title - The title of the workflow.
   * @returns {string} returns.data.description - The description of the workflow.
   * @returns {Array<object>} returns.data.executionPlan - The detailed execution plan (steps) for the workflow.
   * @returns {string} returns.data.workflowType - The type of workflow.
   * @returns {Array<string>} returns.data.requiredApps - A list of applications required by the workflow.
   * @returns {string} returns.data.triggerType - The trigger type for execution (always 'manual' for stored workflows).
   * @returns {string} returns.data.originalUserInput - The original user input that created the workflow.
   * @returns {string} [returns.data.conversationId] - The ID of the conversation context.
   * @returns {object} [returns.data.conversationContext] - Additional conversation context.
   * @returns {string} returns.message - A success message.
   * @returns {string} [returns.error] - An error message if the workflow was not found, not executable, or an error occurred.
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
   * Generates a concise title for a workflow based on the user's input and the AI planning result.
   * It truncates long inputs and appends workflow type information.
   *
   * @async
   * @param {string} userInput - The original natural language input provided by the user.
   * @param {object} planResult - The result object from the AI planning node, containing `workflowType` and `totalSteps`.
   * @param {string} planResult.workflowType - The type of workflow (e.g., 'single_step', 'multi_step').
   * @param {number} [planResult.totalSteps] - The total number of steps identified in the plan.
   * @param {Array<object>} [planResult.executionPlan] - The execution plan, used to derive total steps if `totalSteps` is missing.
   * @returns {Promise<string>} A promise that resolves to the generated workflow title.
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
   * Retrieves a list of active connected accounts for a given user.
   * This is used to determine which applications a user can interact with and to check workflow executability.
   *
   * @async
   * @param {string} userId - The ID of the user.
   * @returns {Promise<Array<object>>} A promise that resolves to an array of connected account documents.
   * Each object typically contains `userId`, `app`, `status`, and `toolkit` information.
   */
  async getUserConnectedAccounts(userId) {
    try {
      // Composio is removed, return empty array for connected accounts
      return [];
    } catch (error) {
      console.error('Error getting user connected accounts:', error);
      return [];
    }
  }

  /**
   * Retrieves various statistics about a user's stored workflows.
   * This includes counts for total, ready, draft, single-step, multi-step workflows,
   * total executions (if `executionCount` field exists), and average steps.
   *
   * @async
   * @param {string} userId - The ID of the user for whom to retrieve statistics.
   * @param {object} [req=null] - The Express request object, used for tenant context if `withTenantPipeline` is active.
   * @returns {Promise<object>} An object containing the workflow statistics.
   * @returns {boolean} returns.success - True if statistics were successfully retrieved, false otherwise.
   * @returns {object} [returns.data] - Contains the statistics if successful.
   * @returns {number} returns.data.totalWorkflows - The total number of workflows owned by the user.
   * @returns {number} returns.data.readyWorkflows - The number of workflows with 'ready' status.
   * @returns {number} returns.data.draftWorkflows - The number of workflows with 'draft' status.
   * @returns {number} returns.data.singleStepWorkflows - The number of single-step workflows.
   * @returns {number} returns.data.multiStepWorkflows - The number of multi-step workflows.
   * @returns {number} returns.data.totalExecutions - The sum of `executionCount` across all workflows.
   * @returns {number} returns.data.averageSteps - The average number of steps across all workflows.
   * @returns {string} [returns.error] - An error message if the operation failed.
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

/**
 * @constant {WorkflowStorageService} workflowStorageService
 * @description A singleton instance of the WorkflowStorageService, providing centralized access
 * to workflow management functionalities throughout the application.
 */
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