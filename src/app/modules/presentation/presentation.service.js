import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { presentonAPIClient } from './services/presentonAPIClient.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import {
  PRESENTATION_INTENTS,
  REQUIRED_PARAMS,
  DEFAULT_PARAMS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  TASK_STATUS,
} from './presentation.constant.js';

/**
 * Generate unique guest user ID
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique conversation ID
 */
const generateConversationId = () => {
  return `pres_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle presentation conversation (create or retrieve)
 */
const handlePresentationConversation = async (userId, conversationId, userMessage, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId
        );
        console.log("Fetched conversation with ID:", conversationId, conversation);
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found, creating new one`);
      }
    }
    console.log("Final conversation object:", conversation);
    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Presentation: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
          },
        },
        newConversationId
      );

      logger.info(`Created new presentation conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling presentation conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}, isGuest = false) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    // Use conversationService for both guest and authenticated users
    return await conversationService.addMessageToConversation(conversationId, userId, message);
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Update conversation metadata (store collected parameters)
 */
const updateConversationMetadata = async (conversationId, userId, params) => {
  try {
    await conversationService.updateConversationMetadata(conversationId, userId, {
      collectedParams: params,
    });
  } catch (error) {
    logger.warn('Error updating conversation metadata:', error);
  }
};

/**
 * Main conversational handler - processes user messages intelligently
 */
const processConversationalRequest = async (userId, userMessage, conversationId, isGuest = false) => {
  try {
    console.log('Processing conversational request for user:', userId);
    console.log('User message:', userMessage);
    console.log('Conversation ID:', conversationId);
    // Handle or create conversation
    const conversation = await handlePresentationConversation(
      userId,
      conversationId,
      userMessage,
      isGuest
    );
    const actualConversationId = conversation.conversationId;

    // Get conversation history for context
    const conversationHistory = conversation.messages || [];
    const recentHistory = conversationHistory.slice(-10).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Get existing parameters from metadata
    const existingParams = conversation.metadata?.collectedParams || {};

    // Add user message
    await addMessage(actualConversationId, userId, 'user', userMessage, {}, isGuest);

    // Analyze intent and extract parameters
    const analysis = await conversationAnalyzer.analyzeIntent(
      userMessage,
      recentHistory,
      existingParams
    );

    logger.info('Intent analysis:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      parameters: analysis.parameters,
      missingRequired: analysis.missingRequired,
    });

    // Merge parameters
    const updatedParams = { ...existingParams, ...analysis.parameters };

    // Update metadata with collected parameters
    await updateConversationMetadata(actualConversationId, userId, updatedParams);

    // Handle different intents
    let response;

    switch (analysis.intent) {
      case PRESENTATION_INTENTS.GENERATE:
      case PRESENTATION_INTENTS.GENERATE_ASYNC:
        response = await handleGenerateIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case PRESENTATION_INTENTS.CHECK_STATUS:
        response = await handleCheckStatusIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case PRESENTATION_INTENTS.EDIT:
        response = await handleEditIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case PRESENTATION_INTENTS.DERIVE:
        response = await handleDeriveIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case PRESENTATION_INTENTS.GET_INFO:
        response = await handleGetInfoIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case PRESENTATION_INTENTS.GENERAL_QUESTION:
      default:
        response = await handleGeneralQuestion(
          userMessage,
          recentHistory,
          actualConversationId,
          userId,
          isGuest
        );
        break;
    }

    return {
      conversationId: actualConversationId,
      ...response,
      userId: userId,
    };
  } catch (error) {
    logger.error('Error processing conversational request:', error);
    throw error;
  }
};

/**
 * Handle generate presentation intent
 */
const handleGenerateIntent = async (analysis, params, conversationId, userId, isGuest) => {
  const requiredParams = REQUIRED_PARAMS[PRESENTATION_INTENTS.GENERATE];
  const missingParams = requiredParams.filter((param) => !params[param]);

  // Check if we need more information:
  // 1. Missing required parameters
  // 2. AI identified missing fields
  // 3. AI generated a follow-up question (for optional but recommended params)
  const needsMoreInfo =
    missingParams.length > 0 ||
    analysis.missingRequired.length > 0 ||
    (analysis.followUpQuestion && analysis.confidence < 1.0);

  if (needsMoreInfo) {
    const followUpQuestion =
      analysis.followUpQuestion ||
      `I need a bit more information. What topic would you like your presentation to be about?`;

    await addMessage(conversationId, userId, 'assistant', followUpQuestion, {}, isGuest);

    return {
      needsMoreInfo: true,
      message: followUpQuestion,
      missingParameters: missingParams.length > 0 ? missingParams : analysis.missingRequired,
      collectedParameters: params,
    };
  }

  // All parameters collected - generate presentation
  const generationParams = {
    ...DEFAULT_PARAMS,
    ...params,
  };

  try {
    let result;
    const isAsync = analysis.intent === PRESENTATION_INTENTS.GENERATE_ASYNC;

    if (isAsync) {
      result = await presentonAPIClient.generatePresentationAsync(generationParams);
      const responseMessage = `Great! I've started generating your presentation. Your task ID is: ${result.id}\n\nStatus: ${result.status}\nCreated at: ${result.created_at}\n\nI'll keep track of this for you. You can ask me to check the status anytime!`;

      await addMessage(conversationId, userId, 'assistant', responseMessage, { taskId: result.id, generationParams }, isGuest);

      return {
        success: true,
        message: responseMessage,
        taskId: result.id,
        status: result.status,
        async: true,
      };
    } else {
      result = await presentonAPIClient.generatePresentation(generationParams);
      const responseMessage = `🎉 Your presentation is ready!\n\n` +
        `📊 Presentation ID: ${result.presentation_id}\n` +
        `📥 Download: ${result.path}\n` +
        `✏️ Edit online: ${result.edit_path}\n` +
        `💳 Credits used: ${result.credits_consumed}`;

      await addMessage(
        conversationId,
        userId,
        'assistant',
        responseMessage,
        { presentationId: result.presentation_id, result, generationParams },
        isGuest
      );

      return {
        success: true,
        message: responseMessage,
        presentationId: result.presentation_id,
        downloadUrl: result.path,
        editUrl: result.edit_path,
        creditsConsumed: result.credits_consumed,
      };
    }
  } catch (error) {
    const errorMessage = `I encountered an error while generating your presentation: ${error.message || 'Unknown error'}`;
    await addMessage(conversationId, userId, 'assistant', errorMessage, { error: error.message }, isGuest);

    throw new ApiError(error.status || httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
  }
};

/**
 * Handle check status intent
 */
const handleCheckStatusIntent = async (analysis, params, conversationId, userId, isGuest) => {
  if (!params.taskId) {
    const followUpQuestion = analysis.followUpQuestion || "I need the task ID to check the status. What's your task ID?";

    await addMessage(conversationId, userId, 'assistant', followUpQuestion, {}, isGuest);

    return {
      needsMoreInfo: true,
      message: followUpQuestion,
      missingParameters: ['taskId'],
    };
  }

  try {
    const result = await presentonAPIClient.checkTaskStatus(params.taskId);

    let responseMessage = `Task Status: ${result.status}\n\n`;

    if (result.status === TASK_STATUS.COMPLETED) {
      responseMessage += `🎉 Your presentation is ready!\n\n` +
        `📊 Presentation ID: ${result.data.presentation_id}\n` +
        `📥 Download: ${result.data.path}\n` +
        `✏️ Edit online: ${result.data.edit_path}\n` +
        `💳 Credits used: ${result.data.credits_consumed}`;
    } else if (result.status === TASK_STATUS.FAILED) {
      responseMessage += `❌ Unfortunately, the generation failed. ${result.message}`;
    } else if (result.status === TASK_STATUS.PROCESSING) {
      responseMessage += `⏳ Your presentation is still being generated. Please check back in a moment.`;
    } else {
      responseMessage += `📋 ${result.message}`;
    }

    await addMessage(conversationId, userId, 'assistant', responseMessage, { taskStatus: result }, isGuest);

    return {
      success: true,
      message: responseMessage,
      taskId: params.taskId,
      status: result.status,
      data: result.data || {},
    };
  } catch (error) {
    const errorMessage = `I couldn't check the status: ${error.message || 'Unknown error'}`;
    await addMessage(conversationId, userId, 'assistant', errorMessage, { error: error.message }, isGuest);

    throw new ApiError(error.status || httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
  }
};

/**
 * Handle edit presentation intent
 */
const handleEditIntent = async (analysis, params, conversationId, userId, isGuest) => {
  const requiredParams = REQUIRED_PARAMS[PRESENTATION_INTENTS.EDIT];
  const missingParams = requiredParams.filter((param) => !params[param]);

  if (missingParams.length > 0) {
    const followUpQuestion =
      analysis.followUpQuestion ||
      "To edit a presentation, I need the presentation ID and the changes you'd like to make. What would you like to edit?";

    await addMessage(conversationId, userId, 'assistant', followUpQuestion, {}, isGuest);

    return {
      needsMoreInfo: true,
      message: followUpQuestion,
      missingParameters: missingParams,
    };
  }

  try {
    const result = await presentonAPIClient.editPresentation(params);
    const responseMessage = `✅ Presentation updated!\n\n` +
      `📊 New Presentation ID: ${result.presentation_id}\n` +
      `📥 Download: ${result.path}\n` +
      `✏️ Edit online: ${result.edit_path}`;

    await addMessage(conversationId, userId, 'assistant', responseMessage, { result }, isGuest);

    return {
      success: true,
      message: responseMessage,
      presentationId: result.presentation_id,
      downloadUrl: result.path,
      editUrl: result.edit_path,
    };
  } catch (error) {
    const errorMessage = `I couldn't edit the presentation: ${error.message || 'Unknown error'}`;
    await addMessage(conversationId, userId, 'assistant', errorMessage, { error: error.message }, isGuest);

    throw new ApiError(error.status || httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
  }
};

/**
 * Handle derive presentation intent
 */
const handleDeriveIntent = async (analysis, params, conversationId, userId, isGuest) => {
  const requiredParams = REQUIRED_PARAMS[PRESENTATION_INTENTS.DERIVE];
  const missingParams = requiredParams.filter((param) => !params[param]);

  if (missingParams.length > 0) {
    const followUpQuestion =
      analysis.followUpQuestion ||
      "To create a new presentation from an existing one, I need the presentation ID and the changes. What's the presentation ID?";

    await addMessage(conversationId, userId, 'assistant', followUpQuestion, {}, isGuest);

    return {
      needsMoreInfo: true,
      message: followUpQuestion,
      missingParameters: missingParams,
    };
  }

  try {
    const result = await presentonAPIClient.derivePresentation(params);
    const responseMessage = `🎉 New presentation created!\n\n` +
      `📊 Presentation ID: ${result.presentation_id}\n` +
      `📥 Download: ${result.path}\n` +
      `✏️ Edit online: ${result.edit_path}`;

    await addMessage(conversationId, userId, 'assistant', responseMessage, { result }, isGuest);

    return {
      success: true,
      message: responseMessage,
      presentationId: result.presentation_id,
      downloadUrl: result.path,
      editUrl: result.edit_path,
    };
  } catch (error) {
    const errorMessage = `I couldn't create the new presentation: ${error.message || 'Unknown error'}`;
    await addMessage(conversationId, userId, 'assistant', errorMessage, { error: error.message }, isGuest);

    throw new ApiError(error.status || httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
  }
};

/**
 * Handle get info intent
 */
const handleGetInfoIntent = async (analysis, params, conversationId, userId, isGuest) => {
  if (!params.presentationId) {
    const followUpQuestion = analysis.followUpQuestion || "Which presentation would you like information about? Please provide the presentation ID.";

    await addMessage(conversationId, userId, 'assistant', followUpQuestion, {}, isGuest);

    return {
      needsMoreInfo: true,
      message: followUpQuestion,
      missingParameters: ['presentationId'],
    };
  }

  try {
    const result = await presentonAPIClient.getPresentation(params.presentationId);
    const responseMessage = `📊 Presentation Information:\n\n` +
      JSON.stringify(result, null, 2);

    await addMessage(conversationId, userId, 'assistant', responseMessage, { result }, isGuest);

    return {
      success: true,
      message: responseMessage,
      presentationInfo: result,
    };
  } catch (error) {
    const errorMessage = `I couldn't retrieve the presentation information: ${error.message || 'Unknown error'}`;
    await addMessage(conversationId, userId, 'assistant', errorMessage, { error: error.message }, isGuest);

    throw new ApiError(error.status || httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
  }
};

/**
 * Handle general questions
 */
const handleGeneralQuestion = async (userMessage, conversationHistory, conversationId, userId, isGuest) => {
  try {
    const answer = await conversationAnalyzer.answerGeneralQuestion(userMessage, conversationHistory);

    await addMessage(conversationId, userId, 'assistant', answer, {}, isGuest);

    return {
      success: true,
      message: answer,
      isGeneralQuestion: true,
    };
  } catch (error) {
    const errorMessage = "I'm here to help you create presentations! What would you like to know?";
    await addMessage(conversationId, userId, 'assistant', errorMessage, {}, isGuest);

    return {
      success: true,
      message: errorMessage,
      isGeneralQuestion: true,
    };
  }
};

export const presentationService = {
  generateGuestUserId,
  generateConversationId,
  handlePresentationConversation,
  addMessage,
  processConversationalRequest,
};
