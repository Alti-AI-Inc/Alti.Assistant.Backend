import sanitizeHtml from 'sanitize-html';
import { runAIClassificationAgent } from './ai_classification/workflow.js';
import { composioConversationService } from './composio.conversation.service.js';
import { logger } from '../../../shared/logger.js';
import ComposioAuth from './composio.model.js';
// Removed unused import: import mongoose from 'mongoose';

/**
 * Main service for AI-powered user input classification and tool execution
 */

/**
 * Process user input through AI classification and execute the identified action
 */
export const processUserInputService = async (
  userInput,
  options = {}
  // Removed unused 'req' parameter
) => {
  // Security: Sanitize user input to prevent Stored XSS attacks.
  // This strips all HTML tags from the input before it's processed or stored in the database.
  const sanitizedUserInput = sanitizeHtml(userInput, {
    allowedTags: [],
    allowedAttributes: {},
  });

  const {
    userId = null,
    conversationId = null, // This is the conversationId from options
    history = [],
    isGuest = false,
  } = options;

  // Declare conversation and actualConversationId outside try block
  // so they are accessible in the catch block for robust error handling.
  let conversation = null;
  let actualConversationId = null;

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
    // Replaced console.log with logger.info for consistent logging
    logger.info(
      `Processing user input: "${sanitizedUserInput}" for user: ${effectiveUserId} (guest: ${isGuest})`
    );

    // Handle conversation creation/retrieval
    // Optimization Note: Ensure that `composioConversationService.handleComposioConversation`
    // uses `.lean()` for read operations if it's primarily retrieving data,
    // to avoid Mongoose document overhead.
    conversation = // Assign to the outer-scoped variable
      await composioConversationService.handleComposioConversation(
        effectiveUserId,
        conversationId, // Pass the conversationId from options
        sanitizedUserInput,
        isGuest
      );

    // Bug Fix: Ensure conversation object and its ID are valid.
    // If handleComposioConversation fails to return a valid conversationId,
    // it indicates a critical issue in conversation management.
    // Throwing an error here prevents fragmented conversations or silent failures.
    if (!conversation || !conversation.conversationId) {
      logger.error(
        `handleComposioConversation failed to return a valid conversation object or conversationId for user: ${effectiveUserId}, input conversationId: ${conversationId}`
      );
      throw new Error('Failed to establish or retrieve conversation.');
    }

    actualConversationId = conversation.conversationId; // Assign to the outer-scoped variable

    // Bug Fix: Populate conversation history based on the 'conversation' object's messages,
    // regardless of whether an initial conversationId was provided in options.
    // This ensures new conversations also get their initial messages considered for history.
    let conversationHistory = [];
    if (conversation.messages && conversation.messages.length > 0) {
      // Get last 10 messages for context (excluding the current message)
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Add user message to conversation
    // Optimization Note: Ensure `composioConversationService.addComposioQueryMessage`
    // performs efficient database writes.
    await composioConversationService.addComposioQueryMessage(
      actualConversationId,
      effectiveUserId,
      sanitizedUserInput,
      isGuest
    );

    // Run AI classification with conversation context
    const result = await runAIClassificationAgent(sanitizedUserInput, {
      userId: effectiveUserId,
      conversationId: actualConversationId,
      history: conversationHistory.length > 0 ? conversationHistory : history,
    });

    if (result.success) {
      // Replaced console.log with logger.info
      logger.info(
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

      // Optimization Note: Ensure `composioConversationService.addComposioResultMessage`
      // performs efficient database writes.
      await composioConversationService.addComposioResultMessage(
        actualConversationId,
        effectiveUserId,
        responseText,
        messageMetadata,
        isGuest
      );

      // Update conversation title based on results
      if (metadata.identifiedApp || metadata.workflowType) {
        // Optimization Note: Ensure `composioConversationService.updateComposioConversationTitle`
        // performs efficient database updates.
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
          // Assuming conversation.messageCount is the count before current interaction
          messageCount: (conversation?.messageCount || 0) + 2, // User message + assistant response
          userType: isGuest ? 'guest' : 'authenticated',
          userId: isGuest ? effectiveUserId : undefined, // Include userId for guest users for frontend tracking
        },
      };
    } else {
      // Replaced console.error with logger.error
      logger.error(`Failed to process input: ${result.error}`);

      // Add error message to conversation
      const errorMessage =
        result.data?.responseMessage?.text ||
        `Sorry, I encountered an error while processing your request: ${result.error}`;
      // Optimization Note: Ensure `composioConversationService.addComposioErrorMessage`
      // performs efficient database writes.
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
          // Assuming conversation.messageCount is the count before current interaction
          messageCount: (conversation?.messageCount || 0) + 2, // User message + assistant response
          userType: isGuest ? 'guest' : 'authenticated',
          userId: isGuest ? effectiveUserId : undefined,
        },
      };
    }
  } catch (error) {
    // Replaced console.error with logger.error
    logger.error('Error in processUserInputService:', error);

    // Bug Fix: Robust error handling for conversation ID in catch block.
    // Prioritize actualConversationId if it was successfully determined.
    // Fallback to options.conversationId if actualConversationId was not set.
    // If still no ID, attempt to create a new conversation to log the error.
    let conversationIdForError = actualConversationId;
    if (!conversationIdForError && conversationId) {
      conversationIdForError = conversationId;
    }

    // If no conversationId is available, try to establish one to log the error
    if (!conversationIdForError && effectiveUserId) {
      try {
        // Optimization Note: Ensure `composioConversationService.handleComposioConversation`
        // uses `.lean()` for read operations if it's primarily retrieving data,
        // to avoid Mongoose document overhead.
        const newConversationForError =
          await composioConversationService.handleComposioConversation(
            effectiveUserId,
            null, // Pass null to create a new conversation for error logging
            sanitizedUserInput,
            isGuest
          );
        conversationIdForError = newConversationForError.conversationId;
      } catch (convError) {
        logger.error('Failed to establish new conversation for error logging:', convError);
        // If we can't even establish a conversation for error logging, proceed without it.
      }
    }

    // Try to add error to conversation if we have the details
    if (conversationIdForError && effectiveUserId) {
      try {
        // Optimization Note: Ensure `composioConversationService.addComposioErrorMessage`
        // performs efficient database writes.
        await composioConversationService.addComposioErrorMessage(
          conversationIdForError,
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
        conversationId: conversationIdForError,
        // Bug Fix: Safely access conversation.messageCount.
        // If conversation was successfully retrieved/created, use its messageCount + 1 (for error message).
        // Otherwise, default to 1 (representing just the error message itself).
        messageCount: (conversation && conversation.messageCount !== undefined) ? conversation.messageCount + 1 : 1,
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
  status
  // Removed unused 'req' parameter
) => {
  try {
    // Security: Validate the 'status' parameter against an allowlist to prevent unexpected query behavior and ensure only valid statuses are used.
    const allowedStatuses = ['ACTIVE', 'INACTIVE', 'PENDING']; // Define expected statuses.
    const validatedStatus = status && allowedStatuses.includes(status) ? status : 'ACTIVE';

    const query = {
      userId: userId,
      status: validatedStatus,
    };
    // Optimization: Add .lean() for read-only queries to return plain JavaScript objects
    // instead of Mongoose documents, improving performance by skipping Mongoose overhead.
    // Indexing Recommendation: Consider adding a compound index on `{ userId: 1, status: 1, updatedAt: -1 }`
    // to optimize queries filtering by userId and status, and sorting by updatedAt.
    const accounts = await ComposioAuth.find(query).sort({ updatedAt: -1 }).lean();

    // Replaced console.log with logger.info
    logger.info(`User connected accounts for ${userId}: ${accounts.length} found (status: ${validatedStatus})`);

    return {
      success: true,
      data: accounts,
    };
  } catch (error) {
    // Replaced console.error with logger.error
    logger.error('Error in getUserConnectedAccountsService:', error);
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
  appName
  // Removed unused 'req' parameter
) => {
  try {
    // Security: Sanitize appName input to prevent potential injection or manipulation before it's used in a database query.
    const sanitizedAppName = sanitizeHtml(appName, {
      allowedTags: [],
      allowedAttributes: {},
    });
    const normalizedAppName = sanitizedAppName.toLowerCase();

    // Optimization: Add .lean() for read-only queries to return plain JavaScript objects
    // instead of Mongoose documents, improving performance by skipping Mongoose overhead.
    // Indexing Recommendation: Consider adding indexes on `{ userId: 1, status: 1 }`,
    // `{ 'toolkit.slug': 1 }`, and `{ authConfigId: 1 }` to optimize this query.
    // A compound index like `{ userId: 1, status: 1, 'toolkit.slug': 1 }` and
    // `{ userId: 1, status: 1, authConfigId: 1 }` might be beneficial depending on query patterns.
    const connectedAccounts = await ComposioAuth.find({
      userId: userId,
      status: 'ACTIVE',
      $or: [
        { 'toolkit.slug': normalizedAppName },
        { authConfigId: normalizedAppName },
        { authConfigId: `ac_${normalizedAppName}` },
      ],
    }).lean();

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
    // Replaced console.error with logger.error
    logger.error('Error in checkUserConnectionsService:', error);
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
  req = null // 'req' is used when calling composioConversationService methods
) => {
  try {
    const { conversationId = null } = options;

    // Security: Sanitize and validate the 'limit' parameter to prevent potential abuse (e.g., requesting huge datasets).
    // We parse it as an integer, provide a default, and clamp it to a safe range (1-100).
    const parsedLimit = parseInt(options.limit, 10);
    const validatedLimit = isNaN(parsedLimit) ? 20 : Math.max(1, Math.min(100, parsedLimit));

    if (conversationId) {
      // Get specific conversation history
      // Optimization Note: The actual database query is within composioConversationService.getComposioHistory.
      // Ensure that method uses .lean() if it's a read-only operation to avoid Mongoose document overhead.
      const history = await composioConversationService.getComposioHistory(
        conversationId,
        userId,
        validatedLimit,
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
      // Optimization Note: The actual database query is within composioConversationService.getComposioStats.
      // Ensure that method uses .lean() if it's a read-only operation to avoid Mongoose document overhead.
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
    // Replaced console.error with logger.error
    logger.error('Error in getComposioConversationHistoryService:', error);
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