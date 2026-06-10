import Workflow from '../models/workflow.model.js';
import WorkflowChatHistory from '../models/workflowChatHistory.model.js';
import {
  processWorkflowRequest,
  continueWorkflowConversation,
} from '../langgraph/workflow.js';
import { logger } from '../../../../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';
// HIERARCHY & TENANCY INTEGRATION: Import necessary services for checking user roles, workspace limits, and tenancy.
// This is a placeholder for actual implementation.
// import { workspaceService } from '../../workspace/services/workspace.service.js';
// import { rbacService } from '../../../../shared/services/rbac.service.js';

/**
 * @class WorkflowCreationService
 * @description Service for handling workflow creation from natural language prompts and managing related chat conversations.
 * It orchestrates the interaction with LangGraph for AI processing, saves chat history, and persists workflows to the database.
 */
class WorkflowCreationService {
  /**
   * @async
   * @method createWorkflowFromPrompt
   * @description Processes a user's natural language prompt to either plan a new workflow or request confirmation.
   * It uses LangGraph to interpret the prompt, generates a workflow plan, and saves the interaction to chat history.
   * If the workflow requires confirmation, it returns a plan; otherwise, it attempts to create the workflow directly.
   *
   * @param {string} userId - The ID of the user initiating the workflow creation.
   * @param {string} workspaceId - The ID of the workspace to which the user and workflow belong.
   * @param {string} userRole - The role of the user (e.g., 'user', 'manager', 'admin').
   * @param {string} userPrompt - The natural language prompt provided by the user.
   * @param {string} [conversationId=null] - An optional ID for an existing conversation to continue. If null, a new one is generated.
   * @returns {Promise<object>} An object containing the result of the processing.
   * @returns {boolean} returns.success - Indicates if the operation was successful.
   * @returns {boolean} [returns.needsConfirmation] - True if the workflow plan requires user confirmation before creation.
   * @returns {string} returns.message - A message describing the outcome or the assistant's response.
   * @returns {string} returns.conversationId - The ID of the ongoing conversation.
   * @returns {string} [returns.workflowId] - The ID of the newly created workflow, if applicable.
   * @returns {object} [returns.workflow] - The full workflow object if created, if applicable.
   * @returns {object} [returns.workflowPlan] - The detailed plan of the workflow if confirmation is needed.
   * @throws {Error} If there's an issue processing the workflow request or saving data.
   */
  async createWorkflowFromPrompt(userId, workspaceId, userRole, userPrompt, conversationId = null) {
    try {
      // HIERARCHY & TENANCY INTEGRATION: Check user permissions for creating workflows.
      // Example: rbacService.checkPermission(userRole, 'workflow:create');
      // HIERARCHY & TENANCY INTEGRATION: Check workspace limits before proceeding.
      // Example: const canCreate = await workspaceService.canCreateWorkflow(workspaceId); if (!canCreate) throw new Error('Workflow limit reached for your workspace.');

      logger.info(`Creating workflow from prompt for user ${userId} in workspace ${workspaceId}`);

      // Process the request through LangGraph
      const processingResult = await processWorkflowRequest(
        userPrompt,
        userId,
        conversationId
      );

      if (!processingResult.success) {
        throw new Error(processingResult.error);
      }

      const { result } = processingResult;
      const currentConversationId = processingResult.conversationId;

      // Save chat history
      await this.saveChatMessage(
        currentConversationId,
        userId,
        workspaceId,
        'user',
        userPrompt
      );

      await this.saveChatMessage(
        currentConversationId,
        userId,
        workspaceId,
        'assistant',
        result.response
      );

      // If workflow needs confirmation, return without creating
      if (result.needsConfirmation || result.responseType === 'confirmation') {
        // SECURITY FIX (IDOR): The query now includes `userId` and `workspaceId` to ensure a user can only update their own conversation within their workspace.
        // Index Recommendation: Add a compound index on `{ conversationId: 1, userId: 1, workspaceId: 1 }` in WorkflowChatHistory model for performance and security.
        await WorkflowChatHistory.updateOne(
          { conversationId: currentConversationId, userId, workspaceId },
          {
            $set: {
              'context.workflowPlan': { // Store the plan in context
                userIntent: result.userIntent,
                taskType: result.taskType,
                complexity: result.complexity,
                detectedApps: result.detectedApps,
                workflowSteps: result.workflowSteps,
                scheduleRequired: result.scheduleRequired,
                scheduleConfig: result.scheduleConfig,
                triggerType: result.triggerType,
                extractedParameters: result.extractedParameters,
              },
              status: 'pending_confirmation', // Set status to indicate it's awaiting user confirmation
            },
            $setOnInsert: { // HIERARCHY & TENANCY INTEGRATION: Ensure workspaceId is set on creation.
              workspaceId,
            }
          },
          { upsert: true }
        );

        return {
          success: true,
          needsConfirmation: true,
          message: result.response,
          conversationId: currentConversationId,
          workflowPlan: {
            userIntent: result.userIntent,
            taskType: result.taskType,
            complexity: result.complexity,
            detectedApps: result.detectedApps,
            workflowSteps: result.workflowSteps,
            scheduleRequired: result.scheduleRequired,
            scheduleConfig: result.scheduleConfig,
            triggerType: result.triggerType,
            extractedParameters: result.extractedParameters,
          },
        };
      }

      // Create workflow if validation passed and no confirmation needed
      if (
        result.responseType === 'success' &&
        result.workflowSteps?.length > 0
      ) {
        const workflow = await this.createWorkflow({
          userId,
          workspaceId, // HIERARCHY & TENANCY INTEGRATION: Pass workspaceId to the creation method.
          name: result.userIntent || 'Untitled Workflow',
          description: `Automated workflow created from: "${userPrompt}"`,
          originalPrompt: userPrompt,
          steps: result.workflowSteps,
          trigger: {
            triggerType: result.triggerType || 'manual',
            scheduleConfig: result.scheduleConfig,
          },
          category: this.mapTaskTypeToCategory(result.taskType),
          requiredApps:
            result.detectedApps?.map((app) => ({ app, connected: false })) ||
            [],
          metadata: {
            conversationId: currentConversationId,
            complexity: result.complexity,
            createdViaChat: true,
          },
        });

        return {
          success: true,
          needsConfirmation: false,
          message: result.response,
          workflowId: workflow._id,
          workflow: workflow,
          conversationId: currentConversationId,
        };
      }

      // Return processing result for other cases
      return {
        success: true,
        needsConfirmation: false,
        message: result.response,
        conversationId: currentConversationId,
      };
    } catch (error) {
      logger.error('Error creating workflow from prompt:', error);
      throw new Error(`Failed to create workflow: ${error.message}`);
    }
  }

  /**
   * @async
   * @method confirmWorkflowCreation
   * @description Confirms the creation of a workflow based on a previously generated plan stored in a conversation.
   *
   * @param {string} userId - The ID of the user confirming the workflow.
   * @param {string} workspaceId - The ID of the workspace where the workflow will be created.
   * @param {string} userRole - The role of the user.
   * @param {string} conversationId - The ID of the conversation where the workflow plan was generated.
   * @param {boolean} [approved=true] - Whether the user approved the workflow creation.
   * @param {object} [modifications=null] - Optional modifications to the workflow plan.
   * @returns {Promise<object>} An object indicating the outcome of the confirmation.
   * @throws {Error} If the conversation or workflow plan is not found, or if there's an issue creating the workflow.
   */
  async confirmWorkflowCreation(
    userId,
    workspaceId,
    userRole,
    conversationId,
    approved = true,
    modifications = null
  ) {
    try {
      // HIERARCHY & TENANCY INTEGRATION: Check user permissions for creating workflows.
      // Example: rbacService.checkPermission(userRole, 'workflow:create');

      logger.info(
        `Confirming workflow creation for conversation ${conversationId} in workspace ${workspaceId}`
      );

      if (!approved) {
        await this.saveChatMessage(
          conversationId,
          userId,
          workspaceId,
          'user',
          'No, cancel the workflow'
        );
        await this.saveChatMessage(
          conversationId,
          userId,
          workspaceId,
          'assistant',
          "Workflow creation cancelled. Feel free to describe a different automation you'd like to create!"
        );

        // SECURITY FIX (IDOR): Added userId and workspaceId to the query to prevent unauthorized updates.
        await WorkflowChatHistory.updateOne(
          { conversationId, userId, workspaceId },
          { $set: { status: 'cancelled' } }
        );

        return {
          success: true,
          message: 'Workflow creation cancelled.',
          conversationId,
        };
      }

      // HIERARCHY & TENANCY INTEGRATION: Check workspace limits before creating the workflow.
      // Example: const canCreate = await workspaceService.canCreateWorkflow(workspaceId); if (!canCreate) throw new Error('Workflow limit reached for your workspace.');

      // SECURITY FIX (IDOR): Added userId and workspaceId to the query to prevent unauthorized access to other users' conversations.
      // Optimization: Added .lean() for better performance on read-only operations.
      const chatHistory = await WorkflowChatHistory.findOne({ conversationId, userId, workspaceId }).lean();
      if (!chatHistory) {
        // BUG FIX: More specific error message for security.
        throw new Error('Conversation not found or you do not have permission to access it.');
      }

      const workflowPlan = chatHistory.context?.workflowPlan;
      if (!workflowPlan) {
        throw new Error('Workflow plan not found in conversation context. Please try creating the workflow again.');
      }

      let finalPlan = { ...workflowPlan, ...(modifications || {}) };

      const workflow = await this.createWorkflow({
        userId,
        workspaceId, // HIERARCHY & TENANCY INTEGRATION: Pass workspaceId to the creation method.
        name: finalPlan.userIntent || 'Untitled Workflow',
        description: `Automated workflow created from chat conversation`,
        originalPrompt:
          chatHistory.messages.find((m) => m.role === 'user')?.content || '',
        steps: finalPlan.workflowSteps,
        trigger: {
          triggerType: finalPlan.triggerType || 'manual',
          scheduleConfig: finalPlan.scheduleConfig,
        },
        category: this.mapTaskTypeToCategory(finalPlan.taskType),
        requiredApps:
          finalPlan.detectedApps?.map((app) => ({ app, connected: false })) ||
          [],
        metadata: {
            conversationId,
            complexity: finalPlan.complexity,
            createdViaChat: true,
          },
      });

      await this.saveChatMessage(
        conversationId,
        userId,
        workspaceId,
        'user',
        'Yes, create the workflow'
      );
      await this.saveChatMessage(
        conversationId,
        userId,
        workspaceId,
        'assistant',
        `Perfect! I've created your workflow "${workflow.name}". It's now ready to use. Workflow ID: ${workflow._id}`
      );

      // SECURITY FIX (IDOR): Added userId and workspaceId to the query.
      await WorkflowChatHistory.updateOne(
        { conversationId, userId, workspaceId },
        {
          $push: { workflowIds: workflow._id },
          $set: { status: 'completed' },
        }
      );

      return {
        success: true,
        message: `Workflow "${workflow.name}" created successfully!`,
        workflowId: workflow._id,
        workflow: workflow,
        conversationId,
      };
    } catch (error) {
      logger.error('Error confirming workflow creation:', error);
      throw new Error(`Failed to confirm workflow: ${error.message}`);
    }
  }

  /**
   * @async
   * @method continueConversation
   * @description Continues an existing chat conversation, ensuring it's within the user's and workspace's context.
   *
   * @param {string} userId - The ID of the user.
   * @param {string} workspaceId - The ID of the workspace.
   * @param {string} userRole - The role of the user.
   * @param {string} conversationId - The ID of the conversation to continue.
   * @param {string} userInput - The user's new message.
   * @returns {Promise<object>} An object containing the conversation's updated state.
   * @throws {Error} If there's an issue continuing the conversation.
   */
  async continueConversation(userId, workspaceId, userRole, conversationId, userInput) {
    try {
      // HIERARCHY & TENANCY INTEGRATION: Check user permissions for interacting with workflows.
      // Example: rbacService.checkPermission(userRole, 'workflow:interact');

      logger.info(
        `Continuing conversation ${conversationId} for user ${userId} in workspace ${workspaceId}`
      );

      // SECURITY & TENANCY CHECK: First, verify the conversation belongs to the user and workspace before proceeding.
      const conversationExists = await WorkflowChatHistory.exists({ conversationId, userId, workspaceId });
      if (!conversationExists) {
          throw new Error('Conversation not found or you do not have permission to access it.');
      }

      const result = await continueWorkflowConversation(
        userInput,
        conversationId,
        userId
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      await this.saveChatMessage(conversationId, userId, workspaceId, 'user', userInput);
      await this.saveChatMessage(
        conversationId,
        userId,
        workspaceId,
        'assistant',
        result.result.response
      );

      return {
        success: true,
        message: result.result.response,
        responseType: result.result.responseType,
        conversationId,
        state: result.result,
      };
    } catch (error) {
      logger.error('Error continuing conversation:', error);
      throw new Error(`Failed to continue conversation: ${error.message}`);
    }
  }

  /**
   * @async
   * @method createWorkflow
   * @description Saves a new workflow document to the database, associated with a user and workspace.
   *
   * @param {object} workflowData - The data for the new workflow.
   * @param {string} workflowData.userId - The ID of the user who owns the workflow.
   * @param {string} workflowData.workspaceId - The ID of the workspace for the workflow.
   * @returns {Promise<Workflow>} The newly created workflow document.
   * @throws {Error} If there's an issue saving the workflow.
   */
  async createWorkflow(workflowData) {
    try {
      // HIERARCHY & TENANCY INTEGRATION: This is the final checkpoint before creation.
      // A more robust implementation would re-verify limits here in a transaction.
      // Example: await workspaceService.incrementWorkflowCount(workflowData.workspaceId);
      // This action should also trigger notifications to managers/admins if usage thresholds are met.
      // Example: notificationService.notifyAdminsOfNewWorkflow(workflowData.workspaceId, workflowData);

      const workflow = new Workflow(workflowData);
      // Index Recommendation: Add a compound index on `{ workspaceId: 1, userId: 1 }` in the Workflow model for efficient retrieval.
      await workflow.save();

      logger.info(`Workflow created: ${workflow._id} in workspace ${workflowData.workspaceId}`);
      return workflow;
    } catch (error) {
      logger.error('Error creating workflow in database:', error);
      // HIERARCHY & TENANCY INTEGRATION: If saving fails, the usage count should be decremented if it was pre-incremented.
      // Example: await workspaceService.decrementWorkflowCount(workflowData.workspaceId);
      throw new Error(`Failed to save workflow: ${error.message}`);
    }
  }

  /**
   * @async
   * @method saveChatMessage
   * @description Saves a chat message to a conversation, ensuring it's scoped to the correct user and workspace.
   *
   * @param {string} conversationId - The ID of the conversation.
   * @param {string} userId - The ID of the user.
   * @param {string} workspaceId - The ID of the workspace.
   * @param {'user'|'assistant'} role - The role of the sender.
   * @param {string} content - The message content.
   * @param {object} [metadata={}] - Optional metadata.
   * @returns {Promise<void>}
   * @throws {Error} If saving fails.
   */
  async saveChatMessage(conversationId, userId, workspaceId, role, content, metadata = {}) {
    try {
      const message = {
        role,
        content,
        timestamp: new Date(),
        metadata,
      };

      const updateOperation = {
        $push: { messages: message },
        $set: {
          userId,
          lastActivity: new Date(),
        },
        $setOnInsert: {
          workspaceId, // HIERARCHY & TENANCY INTEGRATION: Ensure workspaceId is set on creation.
        }
      };

      // BUG FIX: Robustly handle conversation title on creation without overwriting existing titles.
      if (metadata.title) {
        updateOperation.$set.title = metadata.title;
      } else if (role === 'user') {
        // Only set the title from the first user message if the conversation is being newly created.
        updateOperation.$setOnInsert.title = content.substring(0, 50) + (content.length > 50 ? '...' : '');
      }

      // SECURITY FIX (IDOR): The query now includes `userId` and `workspaceId` to ensure a user can only update their own conversation within their workspace.
      // This prevents users from writing to other users' or other workspaces' conversations.
      await WorkflowChatHistory.updateOne(
        { conversationId, userId, workspaceId },
        updateOperation,
        { upsert: true }
      );
    } catch (error) {
      logger.error('Error saving chat message:', error);
      throw new Error(`Failed to save chat message: ${error.message}`);
    }
  }

  /**
   * @async
   * @method getUserConversations
   * @description Retrieves a list of chat conversations for a specific user within their workspace.
   *
   * @param {string} userId - The ID of the user.
   * @param {string} workspaceId - The ID of the workspace.
   * @param {number} [limit=50] - The maximum number of conversations to return.
   * @param {number} [offset=0] - The number of conversations to skip.
   * @returns {Promise<Array<WorkflowChatHistory>>} An array of conversation documents.
   * @throws {Error} If retrieval fails.
   */
  async getUserConversations(userId, workspaceId, limit = 50, offset = 0) {
    try {
      // HIERARCHY & TENANCY INTEGRATION: Query is scoped by both userId and workspaceId.
      // Index Recommendation: Add a compound index on `{ workspaceId: 1, userId: 1, lastActivity: -1 }` for efficient, secure queries.
      const conversations = await WorkflowChatHistory.find({ userId, workspaceId })
        .sort({ lastActivity: -1 })
        .limit(limit)
        .skip(offset)
        .populate('workflowIds', 'name status')
        .lean()
        .exec();

      return conversations;
    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw new Error(`Failed to get conversations: ${error.message}`);
    }
  }

  /**
   * @async
   * @method getConversation
   * @description Retrieves a specific chat conversation, ensuring it belongs to the requesting user and workspace.
   *
   * @param {string} conversationId - The ID of the conversation.
   * @param {string} userId - The ID of the user.
   * @param {string} workspaceId - The ID of the workspace.
   * @returns {Promise<WorkflowChatHistory|null>} The conversation document or null if not found.
   * @throws {Error} If retrieval fails.
   */
  async getConversation(conversationId, userId, workspaceId) {
    try {
      // HIERARCHY & TENANCY INTEGRATION: Query is scoped by conversationId, userId, and workspaceId.
      // Index Recommendation: Add a compound index on `{ conversationId: 1, userId: 1, workspaceId: 1 }`.
      const conversation = await WorkflowChatHistory.findOne({
        conversationId,
        userId,
        workspaceId,
      })
        .populate('workflowIds')
        .lean()
        .exec();

      return conversation;
    } catch (error) {
      logger.error('Error getting conversation:', error);
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }

  /**
   * @method mapTaskTypeToCategory
   * @description Maps a given task type to a predefined workflow category.
   *
   * @param {string} taskType - The task type string.
   * @returns {string} The corresponding workflow category.
   */
  mapTaskTypeToCategory(taskType) {
    const mapping = {
      email: 'email',
      social: 'social',
      productivity: 'productivity',
      finance: 'finance',
      communication: 'communication',
      notification: 'communication',
      scheduling: 'productivity',
      data_processing: 'productivity',
    };

    return mapping[taskType] || 'other';
  }

  /**
   * @method generateConversationId
   * @description Generates a unique ID for a new conversation.
   *
   * @returns {string} A unique conversation ID.
   */
  generateConversationId() {
    return `conv_${uuidv4()}`;
  }
}

export const workflowCreationService = new WorkflowCreationService();