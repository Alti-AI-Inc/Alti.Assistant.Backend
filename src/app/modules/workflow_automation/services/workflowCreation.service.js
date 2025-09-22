import Workflow from "../models/workflow.model.js";
import WorkflowExecution from "../models/workflowExecution.model.js";
import WorkflowChatHistory from "../models/workflowChatHistory.model.js";
import { processWorkflowRequest, continueWorkflowConversation } from "../langgraph/workflow.js";
import { logger } from "../../../../shared/logger.js";
import { v4 as uuidv4 } from "uuid";
import { composioIntegrationService } from "./composioIntegration.service.js";

/**
 * Service for handling workflow creation from natural language prompts
 */
class WorkflowCreationService {

  /**
   * Create a new workflow from user prompt
   */
  async createWorkflowFromPrompt(userId, userPrompt, conversationId = null) {
    try {
      logger.info(`Creating workflow from prompt for user ${userId}`);

      // Process the request through LangGraph
      const processingResult = await processWorkflowRequest(userPrompt, userId, conversationId);

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
            extractedParameters: result.extractedParameters
          }
        };
      }

      // Create workflow if validation passed and no confirmation needed
      if (result.responseType === 'success' && result.workflowSteps?.length > 0) {
        const workflow = await this.createWorkflow({
          userId,
          name: result.userIntent || 'Untitled Workflow',
          description: `Automated workflow created from: "${userPrompt}"`,
          originalPrompt: userPrompt,
          steps: result.workflowSteps,
          trigger: {
            triggerType: result.triggerType || 'manual',
            scheduleConfig: result.scheduleConfig
          },
          category: this.mapTaskTypeToCategory(result.taskType),
          requiredApps: result.detectedApps?.map(app => ({ app, connected: false })) || [],
          metadata: {
            conversationId: processingResult.conversationId,
            complexity: result.complexity,
            createdViaChat: true
          }
        });

        return {
          success: true,
          needsConfirmation: false,
          message: result.response,
          workflowId: workflow._id,
          workflow: workflow,
          conversationId: processingResult.conversationId
        };
      }

      // Return processing result for other cases
      return {
        success: true,
        needsConfirmation: false,
        message: result.response,
        conversationId: processingResult.conversationId
      };

    } catch (error) {
      logger.error("Error creating workflow from prompt:", error);
      throw new Error(`Failed to create workflow: ${error.message}`);
    }
  }

  /**
   * Confirm and create workflow after user approval
   */
  async confirmWorkflowCreation(userId, conversationId, approved = true, modifications = null) {
    try {
      logger.info(`Confirming workflow creation for conversation ${conversationId}`);

      if (!approved) {
        await this.saveChatMessage(conversationId, userId, 'user', 'No, cancel the workflow');
        await this.saveChatMessage(
          conversationId,
          userId,
          'assistant',
          'Workflow creation cancelled. Feel free to describe a different automation you\'d like to create!'
        );

        return {
          success: true,
          message: 'Workflow creation cancelled.',
          conversationId
        };
      }

      // Get conversation history to understand the workflow context
      const chatHistory = await WorkflowChatHistory.findOne({ conversationId });
      if (!chatHistory) {
        throw new Error('Conversation not found');
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
        originalPrompt: chatHistory.messages.find(m => m.role === 'user')?.content || '',
        steps: finalPlan.workflowSteps,
        trigger: {
          triggerType: finalPlan.triggerType || 'manual',
          scheduleConfig: finalPlan.scheduleConfig
        },
        category: this.mapTaskTypeToCategory(finalPlan.taskType),
        requiredApps: finalPlan.detectedApps?.map(app => ({ app, connected: false })) || [],
        metadata: {
          conversationId,
          complexity: finalPlan.complexity,
          createdViaChat: true
        }
      });

      // Update chat history
      await this.saveChatMessage(conversationId, userId, 'user', 'Yes, create the workflow');
      await this.saveChatMessage(
        conversationId,
        userId,
        'assistant',
        `Perfect! I've created your workflow "${workflow.name}". It's now ready to use. Workflow ID: ${workflow._id}`
      );

      // Update conversation with workflow ID
      await WorkflowChatHistory.updateOne(
        { conversationId },
        {
          $push: { workflowIds: workflow._id },
          $set: { status: 'completed' }
        }
      );

      return {
        success: true,
        message: `Workflow "${workflow.name}" created successfully!`,
        workflowId: workflow._id,
        workflow: workflow,
        conversationId
      };

    } catch (error) {
      logger.error("Error confirming workflow creation:", error);
      throw new Error(`Failed to confirm workflow: ${error.message}`);
    }
  }

  /**
   * Continue an existing conversation
   */
  async continueConversation(userId, conversationId, userInput) {
    try {
      logger.info(`Continuing conversation ${conversationId} for user ${userId}`);

      // Continue the LangGraph conversation
      const result = await continueWorkflowConversation(userInput, conversationId, userId);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Save chat messages
      await this.saveChatMessage(conversationId, userId, 'user', userInput);
      await this.saveChatMessage(conversationId, userId, 'assistant', result.result.response);

      return {
        success: true,
        message: result.result.response,
        responseType: result.result.responseType,
        conversationId,
        state: result.result
      };

    } catch (error) {
      logger.error("Error continuing conversation:", error);
      throw new Error(`Failed to continue conversation: ${error.message}`);
    }
  }

  /**
   * Create workflow in database
   */
  async createWorkflow(workflowData) {
    try {
      const workflow = new Workflow(workflowData);
      await workflow.save();

      logger.info(`Workflow created: ${workflow._id}`);
      return workflow;

    } catch (error) {
      logger.error("Error creating workflow in database:", error);
      throw new Error(`Failed to save workflow: ${error.message}`);
    }
  }

  /**
   * Save chat message to history
   */
  async saveChatMessage(conversationId, userId, role, content, metadata = {}) {
    try {
      const message = {
        role,
        content,
        timestamp: new Date(),
        metadata
      };

      await WorkflowChatHistory.updateOne(
        { conversationId },
        {
          $push: { messages: message },
          $set: {
            userId,
            lastActivity: new Date(),
            title: role === 'user' && !metadata.title ?
              content.substring(0, 50) + (content.length > 50 ? '...' : '') :
              undefined
          }
        },
        { upsert: true }
      );

    } catch (error) {
      logger.error("Error saving chat message:", error);
      throw new Error(`Failed to save chat message: ${error.message}`);
    }
  }

  /**
   * Get user's chat conversations
   */
  async getUserConversations(userId, limit = 50, offset = 0) {
    try {
      const conversations = await WorkflowChatHistory
        .find({ userId })
        .sort({ lastActivity: -1 })
        .limit(limit)
        .skip(offset)
        .populate('workflowIds', 'name status')
        .exec();

      return conversations;

    } catch (error) {
      logger.error("Error getting user conversations:", error);
      throw new Error(`Failed to get conversations: ${error.message}`);
    }
  }

  /**
   * Get specific conversation
   */
  async getConversation(conversationId, userId) {
    try {
      const conversation = await WorkflowChatHistory
        .findOne({ conversationId, userId })
        .populate('workflowIds')
        .exec();

      return conversation;

    } catch (error) {
      logger.error("Error getting conversation:", error);
      throw new Error(`Failed to get conversation: ${error.message}`);
    }
  }

  /**
   * Map task type to workflow category
   */
  mapTaskTypeToCategory(taskType) {
    const mapping = {
      'email': 'email',
      'social': 'social',
      'productivity': 'productivity',
      'finance': 'finance',
      'communication': 'communication',
      'notification': 'communication',
      'scheduling': 'productivity',
      'data_processing': 'productivity'
    };

    return mapping[taskType] || 'other';
  }

  /**
   * Generate unique conversation ID
   */
  generateConversationId() {
    return `conv_${uuidv4()}`;
  }
}

export const workflowCreationService = new WorkflowCreationService();