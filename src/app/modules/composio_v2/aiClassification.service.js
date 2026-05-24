import { runAIClassificationAgent } from './ai_classification/workflow.js';
import { composioConversationService } from './composio.conversation.service.js';
import { logger } from '../../../shared/logger.js';
import ComposioAuth from './composio.model.js';
import mongoose from 'mongoose';

/**
 * Main service for AI-powered user input classification and tool execution
 */

/**
 * Process user input through AI classification and execute the identified action
 */
export const processUserInputService = async (
  userInput,
  options = {},
  req = null
) => {
  const {
    userId = null,
    conversationId = null,
    history = [],
    isGuest = false,
  } = options;

  // Generate userId for guest users if not provided
  const effectiveUserId =
    userId ||
    (isGuest ? composioConversationService.generateGuestUserId() : null);

  if (!effectiveUserId) {
    return {
      success: false,
      message: 'User ID is required for tool execution',
      error: 'Missing user identifier',
    };
  }

  try {
    console.log(
      `Processing user input: "${userInput}" for user: ${effectiveUserId} (guest: ${isGuest})`
    );

    // Handle conversation creation/retrieval
    const conversation =
      await composioConversationService.handleComposioConversation(
        effectiveUserId,
        conversationId,
        userInput,
        isGuest
      );
    const actualConversationId =
      conversation.conversationId ||
      composioConversationService.generateComposioConversationId();

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // Get last 10 messages for context (excluding the current message)
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Add user message to conversation
    await composioConversationService.addComposioQueryMessage(
      actualConversationId,
      effectiveUserId,
      userInput,
      isGuest
    );

    // Run AI classification with conversation context
    const result = await runAIClassificationAgent(userInput, {
      userId: effectiveUserId,
      conversationId: actualConversationId,
      history: conversationHistory.length > 0 ? conversationHistory : history,
    });

    if (result.success) {
      console.log(
        `Successfully processed input. Workflow: ${result.data?.responseMessage?.metadata?.workflowType}`
      );

      // Extract the response text from the new format
      const responseText =
        result.data?.responseMessage?.message ||
        'Action completed successfully';
      const metadata = result.data?.responseMessage?.metadata || {};

      // Add assistant response to conversation with enhanced metadata
      const messageMetadata = {
        identifiedApp: metadata.identifiedApp,
        identifiedAction: metadata.identifiedAction,
        confidence: metadata.confidence,
        workflowType: metadata.workflowType,
        totalSteps: metadata.totalSteps,
        executionResult: result.data?.responseMessage?.executionResult,
        toolResults: result.data?.responseMessage?.toolResults,
        timestamp: new Date().toISOString(),
      };

      await composioConversationService.addComposioResultMessage(
        actualConversationId,
        effectiveUserId,
        responseText,
        messageMetadata,
        isGuest
      );

      // Update conversation title based on results
      if (metadata.identifiedApp || metadata.workflowType) {
        await composioConversationService.updateComposioConversationTitle(
          actualConversationId,
          effectiveUserId,
          metadata
        );
      }

      // Update the response to include conversation info
      return {
        ...result,
        data: {
          ...result.data,
          conversationId: actualConversationId,
          messageCount: conversation.messageCount + 2, // User message + assistant response
          userType: isGuest ? 'guest' : 'authenticated',
          userId: isGuest ? effectiveUserId : undefined, // Include userId for guest users for frontend tracking
        },
      };
    } else {
      console.error(`Failed to process input: ${result.error}`);

      // Add error message to conversation
      const errorMessage =
        result.data?.responseMessage?.text ||
        `Sorry, I encountered an error while processing your request: ${result.error}`;
      await composioConversationService.addComposioErrorMessage(
        actualConversationId,
        effectiveUserId,
        errorMessage,
        new Error(result.error),
        isGuest
      );

      return {
        ...result,
        data: {
          ...result.data,
          conversationId: actualConversationId,
          messageCount: conversation.messageCount + 2,
          userType: isGuest ? 'guest' : 'authenticated',
          userId: isGuest ? effectiveUserId : undefined,
        },
      };
    }
  } catch (error) {
    console.error('Error in processUserInputService:', error);

    // Try to add error to conversation if we have the details
    let finalConversationId = conversationId;
    if (effectiveUserId) {
      try {
        if (!finalConversationId) {
          const conversation =
            await composioConversationService.handleComposioConversation(
              effectiveUserId,
              null,
              userInput,
              isGuest
            );
          finalConversationId = conversation.conversationId;
        }

        await composioConversationService.addComposioErrorMessage(
          finalConversationId,
          effectiveUserId,
          `Sorry, I encountered an unexpected error: ${error.message}`,
          error,
          isGuest
        );
      } catch (convError) {
        logger.error('Failed to add error to conversation:', convError);
      }
    }

    return {
      success: false,
      message: 'Tool execution failed',
      error: error.message,
      data: {
        responseMessage: {
          text: `Sorry, I encountered an unexpected error while processing your request: ${error.message}`,
          type: 'error',
        },
        conversationId: finalConversationId,
        messageCount: 1,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? effectiveUserId : undefined,
      },
    };
  }
};

/**
 * Get user's connected accounts for apps
 */
export const getUserConnectedAccountsService = async (
  userId,
  status,
  req = null
) => {
  try {
    const query = {
      userId: userId,
      status: status || 'ACTIVE',
    };
    const accounts = await ComposioAuth.find(query).sort({ updatedAt: -1 });

    console.log(`User connected accounts for ${userId}: ${accounts.length} found (status: ${status || 'ACTIVE'})`);

    return {
      success: true,
      data: accounts,
    };
  } catch (error) {
    console.error('Error in getUserConnectedAccountsService:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Check if user has required connections for an app
 */
export const checkUserConnectionsService = async (
  userId,
  appName,
  req = null
) => {
  try {
    const normalizedAppName = appName.toLowerCase();

    const connectedAccounts = await ComposioAuth.find({
      userId: userId,
      status: 'ACTIVE',
      $or: [
        { 'toolkit.slug': normalizedAppName },
        { authConfigId: normalizedAppName },
        { authConfigId: `ac_${normalizedAppName}` },
      ],
    });

    const hasConnection = connectedAccounts.length > 0;

    return {
      success: true,
      data: {
        hasConnection,
        appName,
        connectedAccounts,
      },
    };
  } catch (error) {
    console.error('Error in checkUserConnectionsService:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

/**
 * Get composio conversation history for a user
 */
export const getComposioConversationHistoryService = async (
  userId,
  options = {},
  req = null
) => {
  try {
    const { limit = 20, conversationId = null } = options;

    if (conversationId) {
      // Get specific conversation history
      const history = await composioConversationService.getComposioHistory(
        conversationId,
        userId,
        limit,
        req
      );
      return {
        success: true,
        data: {
          conversationId,
          messages: history,
          messageCount: history.length,
        },
      };
    } else {
      // Get conversation stats
      const stats = await composioConversationService.getComposioStats(
        userId,
        req
      );
      return {
        success: true,
        data: stats,
      };
    }
  } catch (error) {
    console.error('Error in getComposioConversationHistoryService:', error);
    return {
      success: false,
      error: error.message,
    };
  }
};

export const aiClassificationService = {
  processUserInputService,
  getUserConnectedAccountsService,
  checkUserConnectionsService,
  getComposioConversationHistoryService,
};
