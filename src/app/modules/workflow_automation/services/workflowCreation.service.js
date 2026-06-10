import Workflow from '../models/workflow.model.js';
import WorkflowChatHistory from '../models/workflowChatHistory.model.js';
import {
  processWorkflowRequest,
  continueWorkflowConversation,
} from '../langgraph/workflow.js';
import { logger } from '../../../../shared/logger.js';
import { v4 as uuidv4 } from 'uuid';

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
   * @returns {string} returns.workflowPlan.userIntent - The detected user's intent.
   * @returns {string} returns.workflowPlan.taskType - The type of task identified.
   * @returns {string} returns.workflowPlan.complexity - The estimated complexity of the workflow.
   * @returns {string[]} returns.workflowPlan.detectedApps - A list of applications detected as relevant.
   * @returns {object[]} returns.workflowPlan.workflowSteps - An array of planned workflow steps.
   * @returns {boolean} returns.workflowPlan.scheduleRequired - Indicates if scheduling is required.
   * @returns {object} returns.workflowPlan.scheduleConfig - Configuration for scheduling, if applicable.
   * @returns {string} returns.workflowPlan.triggerType - The type of trigger for the workflow (e.g., 'manual', 'scheduled').
   * @returns {object} returns.workflowPlan.extractedParameters - Any parameters extracted from the prompt.
   * @throws {Error} If there's an issue processing the workflow request or saving data.
   */
  async createWorkflowFromPrompt(userId, userPrompt, conversationId = null) {
    try {
      logger.info(`Creating workflow from prompt for user ${userId}`);

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

      // Save chat history
      await this.saveChatMessage(
        processingResult.conversationId,
        userId,
        'user',
        userPrompt
      );

      await this.saveChatMessage(
        processingResult.conversationId,
        userId,
        'assistant',
        result.response
      );

      // If workflow needs confirmation, return without creating
      if (result.needsConfirmation || result.responseType === 'confirmation') {
        // BUG FIX: Persist the workflow plan in the conversation context for later confirmation.
        // The confirmWorkflowCreation method relies on this plan being stored.
        // BUG FIX: Added userId to the query to prevent Insecure Direct Object Reference (IDOR).
        // Index Recommendation: Consider adding a compound index on `{ conversationId: 1, userId: 1 }` in WorkflowChatHistory model for faster lookups and upserts.
        await WorkflowChatHistory.updateOne(
          { conversationId: processingResult.conversationId, userId },
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
          },
          { upsert: true } // Use upsert: true in case the conversation document was just created by saveChatMessage
        );

        return {
          success: true,
          needsConfirmation: true,
          message: result.response,
          conversationId: processingResult.conversationId,
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
            conversationId: processingResult.conversationId,
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
          conversationId: processingResult.conversationId,
        };
      }

      // Return processing result for other cases
      return {
        success: true,
        needsConfirmation: false,
        message: result.response,
        conversationId: processingResult.conversationId,
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
   * If approved, it creates the workflow in the database. If not approved, it cancels the creation.
   * Allows for optional modifications to the workflow plan before creation.
   *
   * @param {string} userId - The ID of the user confirming the workflow.
   * @param {string} conversationId - The ID of the conversation where the workflow plan was generated.
   * @param {boolean} [approved=true] - Whether the user approved the workflow creation. Defaults to true.
   * @param {object} [modifications=null] - Optional modifications to the workflow plan (e.g., updated steps, name).
   * @returns {Promise<object>} An object indicating the outcome of the confirmation.
   * @returns {boolean} returns.success - Indicates if the operation was successful.
   * @returns {string} returns.message - A message describing the outcome.
   * @returns {string} returns.conversationId - The ID of the conversation.
   * @returns {string} [returns.workflowId] - The ID of the newly created workflow, if applicable.
   * @returns {object} [returns.workflow] - The full workflow object if created, if applicable.
   * @throws {Error} If the conversation or workflow plan is not found, or if there's an issue creating the workflow.
   */
  async confirmWorkflowCreation(
    userId,
    conversationId,
    approved = true,
    modifications = null
  ) {
    try {
      logger.info(
        `Confirming workflow creation for conversation ${conversationId}`
      );

      if (!approved) {
        await this.saveChatMessage(
          conversationId,
          userId,
          'user',
          'No, cancel the workflow'
        );
        await this.saveChatMessage(
          conversationId,
          userId,
          'assistant',
          "Workflow creation cancelled. Feel free to describe a different automation you'd like to create!"
        );

        // Update conversation status to cancelled
        // Index Recommendation: Consider adding a compound index on `{ conversationId: 1, userId: 1 }` in WorkflowChatHistory model for faster lookups.
        await WorkflowChatHistory.updateOne(
          { conversationId, userId }, // BUG FIX: Added userId for IDOR prevention
          { $set: { status: 'cancelled' } }
        );

        return {
          success: true,
          message: 'Workflow creation cancelled.',
          conversationId,
        };
      }

      // Get conversation history to understand the workflow context
      // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
      // Index Recommendation: Consider adding a compound index on `{ conversationId: 1, userId: 1 }` in WorkflowChatHistory model for faster lookups.
      // BUG FIX: Added userId to the query to prevent Insecure Direct Object Reference (IDOR).
      const chatHistory = await WorkflowChatHistory.findOne({ conversationId, userId }).lean();
      if (!chatHistory) {
        // BUG FIX: More specific error message for IDOR prevention.
        throw new Error('Conversation not found or not owned by user');
      }

      // Get the workflow plan from conversation context
      const workflowPlan = chatHistory.context?.workflowPlan;
      if (!workflowPlan) {
        throw new Error('Workflow plan not found in conversation');
      }

      // Apply modifications if provided
      let finalPlan = workflowPlan;
      if (modifications) {
        finalPlan = { ...workflowPlan, ...modifications };
      }

      // Create the workflow
      const workflow = await this.createWorkflow({
        userId,
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

      // Update chat history
      await this.saveChatMessage(
        conversationId,
        userId,
        'user',
        'Yes, create the workflow'
      );
      await this.saveChatMessage(
        conversationId,
        userId,
        'assistant',
        `Perfect! I've created your workflow "${workflow.name}". It's now ready to use. Workflow ID: ${workflow._id}`
      );

      // Update conversation with workflow ID
      // Index Recommendation: Consider adding a compound index on `{ conversationId: 1, userId: 1 }` in WorkflowChatHistory model for faster lookups.
      await WorkflowChatHistory.updateOne(
        { conversationId, userId }, // BUG FIX: Added userId for IDOR prevention
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
   * @description Continues an existing chat conversation with the LangGraph agent.
   * It processes the user's input, gets a response from the AI, and saves both messages to the chat history.
   *
   * @param {string} userId - The ID of the user participating in the conversation.
   * @param {string} conversationId - The ID of the conversation to continue.
   * @param {string} userInput - The user's new message.
   * @returns {Promise<object>} An object containing the conversation's updated state.
   * @returns {boolean} returns.success - Indicates if the operation was successful.
   * @returns {string} returns.message - The assistant's response.
   * @returns {string} returns.responseType - The type of response from the assistant (e.g., 'confirmation', 'success', 'info').
   * @returns {string} returns.conversationId - The ID of the ongoing conversation.
   * @returns {object} returns.state - The full state object returned by the LangGraph conversation.
   * @throws {Error} If there's an issue continuing the conversation or saving messages.
   */
  async continueConversation(userId, conversationId, userInput) {
    try {
      logger.info(
        `Continuing conversation ${conversationId} for user ${userId}`
      );

      // Continue the LangGraph conversation
      const result = await continueWorkflowConversation(
        userInput,
        conversationId,
        userId
      );

      if (!result.success) {
        throw new Error(result.error);
      }

      // Save chat messages
      await this.saveChatMessage(conversationId, userId, 'user', userInput);
      await this.saveChatMessage(
        conversationId,
        userId,
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
   * @description Saves a new workflow document to the database.
   *
   * @param {object} workflowData - The data for the new workflow.
   * @param {string} workflowData.userId - The ID of the user who owns the workflow.
   * @param {string} workflowData.name - The name of the workflow.
   * @param {string} workflowData.description - A description of the workflow.
   * @param {string} workflowData.originalPrompt - The original prompt used to create the workflow.
   * @param {Array<object>} workflowData.steps - An array of workflow steps.
   * @param {object} workflowData.trigger - The trigger configuration for the workflow.
   * @param {string} workflowData.trigger.triggerType - The type of trigger (e.g., 'manual', 'scheduled').
   * @param {object} [workflowData.trigger.scheduleConfig] - Configuration for scheduled triggers.
   * @param {string} workflowData.category - The category of the workflow.
   * @param {Array<object>} workflowData.requiredApps - An array of required applications for the workflow.
   * @param {object} workflowData.metadata - Additional metadata for the workflow.
   * @returns {Promise<Workflow>} The newly created workflow document.
   * @throws {Error} If there's an issue saving the workflow to the database.
   */
  async createWorkflow(workflowData) {
    try {
      const workflow = new Workflow(workflowData);
      // Index Recommendation: Consider adding an index on `userId` in the Workflow model for efficient retrieval of workflows by user.
      await workflow.save();

      logger.info(`Workflow created: ${workflow._id}`);
      return workflow;
    } catch (error) {
      logger.error('Error creating workflow in database:', error);
      throw new Error(`Failed to save workflow: ${error.message}`);
    }
  }

  /**
   * @async
   * @method saveChatMessage
   * @description Saves a single chat message to the specified conversation's history in the database.
   * If the conversation does not exist, it creates a new one.
   *
   * @param {string} conversationId - The ID of the conversation to which the message belongs.
   * @param {string} userId - The ID of the user associated with the conversation.
   * @param {'user'|'assistant'} role - The role of the sender ('user' or 'assistant').
   * @param {string} content - The content of the chat message.
   * @param {object} [metadata={}] - Optional metadata for the message.
   * @returns {Promise<void>}
   * @throws {Error} If there's an issue saving the chat message.
   */
  async saveChatMessage(conversationId, userId, role, content, metadata = {}) {
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
      };

      // BUG FIX: Handle conversation title more robustly.
      // The previous logic could overwrite an existing title with 'undefined'.
      // If metadata.title is provided, it explicitly overrides the title.
      if (metadata.title) {
        updateOperation.$set.title = metadata.title;
      } else if (role === 'user') {
        // If it's a user message and no explicit title from metadata,
        // set the title only if the document is being inserted (i.e., it's a new conversation).
        // This prevents overwriting an existing title with a snippet from subsequent user messages.
        updateOperation.$setOnInsert = {
          title: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        };
      }
      // If role is 'assistant' and no metadata.title, we do not touch the title field,
      // preserving any existing title.

      // Index Recommendation: Consider adding a compound index on `{ conversationId: 1, userId: 1 }` in WorkflowChatHistory model for faster upserts and IDOR prevention.
      // BUG FIX: Added userId to the query to prevent Insecure Direct Object Reference (IDOR).
      // This ensures that a user can only update/create chat history for conversations they own.
      await WorkflowChatHistory.updateOne(
        { conversationId, userId },
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
   * @description Retrieves a list of chat conversations for a specific user, sorted by last activity.
   *
   * @param {string} userId - The ID of the user whose conversations are to be retrieved.
   * @param {number} [limit=50] - The maximum number of conversations to return.
   * @param {number} [offset=0] - The number of conversations to skip for pagination.
   * @returns {Promise<Array<WorkflowChatHistory>>} An array of WorkflowChatHistory documents, populated with associated workflow names and statuses.
   * @throws {Error} If there's an issue retrieving the conversations.
   */
  async getUserConversations(userId, limit = 50, offset = 0) {
    try {
      // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
      // Index Recommendation: Consider adding a compound index on `{ userId: 1, lastActivity: -1 }` in WorkflowChatHistory model for faster queries and sorting.
      const conversations = await WorkflowChatHistory.find({ userId })
        .sort({ lastActivity: -1 })
        .limit(limit)
        .skip(offset)
        .populate('workflowIds', 'name status')
        .lean() // Apply .lean() here
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
   * @description Retrieves a specific chat conversation by its ID for a given user.
   *
   * @param {string} conversationId - The ID of the conversation to retrieve.
   * @param {string} userId - The ID of the user who owns the conversation.
   * @returns {Promise<WorkflowChatHistory|null>} The WorkflowChatHistory document, populated with associated workflows, or null if not found.
   * @throws {Error} If there's an issue retrieving the conversation.
   */
  async getConversation(conversationId, userId) {
    try {
      // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
      // Index Recommendation: Consider adding a compound index on `{ conversationId: 1, userId: 1 }` in WorkflowChatHistory model for faster lookups.
      const conversation = await WorkflowChatHistory.findOne({
        conversationId,
        userId,
      })
        .populate('workflowIds')
        .lean() // Apply .lean() here
        .exec();

      return conversation;
    } catch (error) {
      logger.error('Error getting conversation:', error);
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }

  /**
   * @method mapTaskTypeToCategory
   * @description Maps a given task type (identified by the AI) to a predefined workflow category.
   *
   * @param {string} taskType - The task type string (e.g., 'email', 'social', 'productivity').
   * @returns {string} The corresponding workflow category (e.g., 'email', 'social', 'productivity', 'other').
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
   * @description Generates a unique ID for a new conversation using UUID v4.
   *
   * @returns {string} A unique conversation ID prefixed with 'conv_'.
   */
  generateConversationId() {
    return `conv_${uuidv4()}`;
  }
}

/**
 * @constant {WorkflowCreationService} workflowCreationService
 * @description An instance of the WorkflowCreationService, providing methods for workflow creation and chat management.
 */
export const workflowCreationService = new WorkflowCreationService();