import httpStatus from 'http-status';
import mongoose from 'mongoose';
import path from 'path';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { presentonAPIClient } from './services/presentonAPIClient.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { uploadPresentationToGCS } from './services/gcsUploadService.js';
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
const handlePresentationConversation = async (userId, conversationId, userMessage, isGuest = false, req = null) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
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
        newConversationId,
        req
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
const addMessage = async (conversationId, userId, role, content, metadata = {}, isGuest = false, req = null) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    // Use conversationService for both guest and authenticated users
    return await conversationService.addMessageToConversation(conversationId, userId, message, req);
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Update conversation metadata (store collected parameters)
 */
const updateConversationMetadata = async (conversationId, userId, params, req = null) => {
  try {
    await conversationService.updateConversationMetadata(conversationId, userId, {
      collectedParams: params,
    }, req);
  } catch (error) {
    logger.warn('Error updating conversation metadata:', error);
  }
};

/**
 * Save conversation summary to metadata
 */
const saveConversationSummary = async (conversationId, userId, summary, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

    if (conversation) {
      conversation.metadata = {
        ...conversation.metadata,
        conversationSummary: summary,
        summarizedAt: new Date().toISOString(),
        summarizedMessageCount: conversation.messages.length,
      };

      await conversation.save();
      logger.info(`Saved conversation summary for ${conversationId}`, {
        summaryLength: summary.length,
        messageCount: conversation.messages.length,
      });
    }
  } catch (error) {
    logger.error('Error saving conversation summary:', error);
  }
};

/**
 * Main conversational handler - processes user messages intelligently
 */
const processConversationalRequest = async (userId, userMessage, conversationId, isGuest = false, req = null) => {
  try {
    console.log('Processing conversational request for user:', userId);
    console.log('User message:', userMessage);
    console.log('Conversation ID:', conversationId);
    // Handle or create conversation
    const conversation = await handlePresentationConversation(
      userId,
      conversationId,
      userMessage,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId;

    // Get conversation history for context
    const conversationHistory = conversation.messages || [];
    const recentHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    console.log(`Conversation history has ${conversation?.presentation_metadata} messages`);
    // Get existing parameters from metadata
    const existingParams = {
      ...conversation?.presentation_metadata,
      ...conversation.metadata?.collectedParams
    } || {};
    let conversationSummary = conversation.metadata?.conversationSummary || null;

    // Add user message
    await addMessage(actualConversationId, userId, 'user', userMessage, {}, isGuest, req);

    // Log what we're sending to the analyzer
    logger.info('Conversation context for analysis', {
      messageCount: recentHistory.length,
      firstMessage: recentHistory[0]?.content,
      lastMessage: recentHistory[recentHistory.length - 1]?.content,
      currentMessage: userMessage,
      existingParams,
      hasSummary: !!conversationSummary,
    });

    // Check if we need to summarize the conversation
    const estimatedTokens = conversationAnalyzer._calculateConversationTokens(
      recentHistory,
      existingParams
    );

    logger.info('Token check before analysis', {
      estimatedTokens,
      messageCount: conversationHistory.length,
      hasSummary: !!conversationSummary,
    });

    // If tokens exceed threshold and we don't have a recent summary, create one
    if (estimatedTokens > 5000 && (!conversationSummary ||
      conversation.metadata?.summarizedMessageCount < conversationHistory.length - 5)) {
      logger.info('Token limit approaching, summarizing conversation...');

      conversationSummary = await conversationAnalyzer.summarizeConversation(
        recentHistory,
        existingParams
      );

      await saveConversationSummary(actualConversationId, userId, conversationSummary, req);
    }

    // Analyze intent and extract parameters
    const analysis = await conversationAnalyzer.analyzeIntent(
      userMessage,
      recentHistory,
      existingParams,
      conversationSummary
    );

    logger.info('Intent analysis:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      parameters: analysis.parameters,
      missingRequired: analysis.missingRequired,
    });

    // Merge parameters
    const updatedParams = { ...existingParams, ...analysis.parameters };
    console.log('Updated parameters after analysis:', updatedParams);
    // Update metadata with collected parameters
    await updateConversationMetadata(actualConversationId, userId, updatedParams, req);

    // Handle different intents
    let response;
    console.log('Handling intent :', analysis.intent);
    switch (analysis.intent) {
      case PRESENTATION_INTENTS.GENERATE:
        console.log('Handling GENERATE intent');
        response = await handleGenerateIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest,
          req
        );
        break;
      case PRESENTATION_INTENTS.GENERATE_ASYNC:
        response = await handleGenerateIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest,
          req
        );
        break;

      case PRESENTATION_INTENTS.CHECK_STATUS:
        response = await handleCheckStatusIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest,
          req
        );
        break;

      case PRESENTATION_INTENTS.EDIT:
        response = await handleEditIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest,
          req
        );
        break;

      case PRESENTATION_INTENTS.DERIVE:
        response = await handleGenerateIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest,
          req
        );
        break;

      case PRESENTATION_INTENTS.GET_INFO:
        response = await handleGetInfoIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest,
          req
        );
        break;

      case PRESENTATION_INTENTS.GENERAL_QUESTION:
      default:
        response = await handleGeneralQuestion(
          userMessage,
          recentHistory,
          actualConversationId,
          userId,
          isGuest,
          req
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
const handleGenerateIntent = async (analysis, params, conversationId, userId, isGuest, req = null) => {
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
    const isAsync = true;
    console.log('Generating presentation with params:', analysis.intent, 'Async:', isAsync);
    if (isAsync) {
      result = await presentonAPIClient.generatePresentationAsync(generationParams);
      const responseMessage = `Great! I've started generating your presentation. Your task ID is: ${result.id}\n\nStatus: ${result.status}\nCreated at: ${result.created_at}\n\nI'll keep track of this for you. You can ask me to check the status anytime!`;

      await addMessage(conversationId, userId, 'assistant', responseMessage, { taskId: result.id, generationParams }, isGuest, req);

      // Save taskId in conversation metadata for later retrieval
      await conversationService.updateConversationMetadata(conversationId, userId, {
        presentation_metadata: {
          taskId: result.id,
          status: result.status,
          created_at: result.created_at,
          generationParams,
        },
      }, req);

      return {
        success: true,
        message: responseMessage,
        taskId: result.id,
        status: result.status,
        async: true,
      };
    } else {
      result = await presentonAPIClient.generatePresentation(generationParams);
      console.log('Presentation generated:', result);
      // Upload presentation to GCS
      let publicUrl = null;
      let uploadResult = null;
      try {
        // Extract filename from path or create one
        const fileName = path.basename(result.path) || `presentation_${result.presentation_id}.pptx`;

        // Upload to GCS
        uploadResult = await uploadPresentationToGCS(
          result.path,
          fileName,
          userId,
          conversationId
        );

        publicUrl = uploadResult.publicUrl;

        // Update conversation metadata with the public URL
        await updateConversationMetadata(conversationId, userId, {
          presentationUrl: publicUrl,
          gcsPath: uploadResult.gcsPath,
          uploadedAt: new Date().toISOString(),
        }, req);

        logger.info(`Presentation uploaded to GCS: ${publicUrl}`);
      } catch (uploadError) {
        logger.error('Error uploading presentation to GCS:', uploadError);
        // Continue even if upload fails - user still gets the Presenton download link
      }

      const responseMessage = publicUrl
        ? `🎉 Your presentation is ready!\n\n` +
        `📊 Presentation ID: ${result.presentation_id}\n` +
        `🔗 Public URL: ${publicUrl}\n` +
        `📥 Download: ${result.path}\n` +
        `✏️ Edit online: ${result.edit_path}\n` +
        `💳 Credits used: ${result.credits_consumed}`
        : `🎉 Your presentation is ready!\n\n` +
        `📊 Presentation ID: ${result.presentation_id}\n` +
        `📥 Download: ${result.path}\n` +
        `✏️ Edit online: ${result.edit_path}\n` +
        `💳 Credits used: ${result.credits_consumed}`;

      await addMessage(
        conversationId,
        userId,
        'assistant',
        responseMessage,
        {
          presentationId: result.presentation_id,
          result,
          generationParams,
          publicUrl,
          uploadResult
        },
        isGuest,
        req
      );

      return {
        success: true,
        message: responseMessage,
        presentationId: result.presentation_id,
        downloadUrl: result.path,
        editUrl: result.edit_path,
        publicUrl: publicUrl,
        creditsConsumed: result.credits_consumed,
      };
    }
  } catch (error) {
    const errorMessage = `I encountered an error while generating your presentation: ${error.message || 'Unknown error'}`;
    await addMessage(conversationId, userId, 'assistant', errorMessage, { error: error.message }, isGuest, req);

    throw new ApiError(error.status || httpStatus.INTERNAL_SERVER_ERROR, errorMessage);
  }
};

/**
 * Handle check status intent
 */
const handleCheckStatusIntent = async (analysis, params, conversationId, userId, isGuest, req = null) => {
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
const handleEditIntent = async (analysis, params, conversationId, userId, isGuest, req = null) => {
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

    // Upload edited presentation to GCS
    let publicUrl = null;
    let uploadResult = null;
    try {
      const fileName = path.basename(result.path) || `presentation_${result.presentation_id}_edited.pptx`;
      console.log('Uploading edited presentation with fileName:', fileName);
      uploadResult = await uploadPresentationToGCS(
        result.path,
        fileName,
        userId,
        conversationId
      );

      publicUrl = uploadResult.publicUrl;

      await updateConversationMetadata(conversationId, userId, {
        editedPresentationUrl: publicUrl,
        editedGcsPath: uploadResult.gcsPath,
        editedAt: new Date().toISOString(),
      });

      logger.info(`Edited presentation uploaded to GCS: ${publicUrl}`);
    } catch (uploadError) {
      logger.error('Error uploading edited presentation to GCS:', uploadError);
    }

    const responseMessage = publicUrl
      ? `✅ Presentation updated!\n\n` +
      `📊 New Presentation ID: ${result.presentation_id}\n` +
      `🔗 Public URL: ${publicUrl}\n` +
      `📥 Download: ${result.path}\n` +
      `✏️ Edit online: ${result.edit_path}`
      : `✅ Presentation updated!\n\n` +
      `📊 New Presentation ID: ${result.presentation_id}\n` +
      `📥 Download: ${result.path}\n` +
      `✏️ Edit online: ${result.edit_path}`;

    await addMessage(conversationId, userId, 'assistant', responseMessage, { result, publicUrl, uploadResult }, isGuest);

    return {
      success: true,
      message: responseMessage,
      presentationId: result.presentation_id,
      downloadUrl: result.path,
      editUrl: result.edit_path,
      publicUrl: publicUrl,
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
const handleDeriveIntent = async (analysis, params, conversationId, userId, isGuest, req = null) => {
  const requiredParams = REQUIRED_PARAMS[PRESENTATION_INTENTS.DERIVE];
  //If params has n_slides, rename to slides
  if (params.n_slides && !params.slides) {
    params.slides = params.n_slides;
    delete params.n_slides;
  }
  const missingParams = requiredParams.filter((param) => !params[param]);
  console.log('Derive intent missing parameters:', missingParams);
  console.log('Derive intent analysis:', analysis);
  console.log('Derive intent params:', params);
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

    // Upload derived presentation to GCS
    let publicUrl = null;
    let uploadResult = null;
    try {
      const fileName = path.basename(result.path) || `presentation_${result.presentation_id}_derived.pptx`;

      uploadResult = await uploadPresentationToGCS(
        result.path,
        fileName,
        userId,
        conversationId
      );

      publicUrl = uploadResult.publicUrl;

      await updateConversationMetadata(conversationId, userId, {
        derivedPresentationUrl: publicUrl,
        derivedGcsPath: uploadResult.gcsPath,
        derivedAt: new Date().toISOString(),
      });

      logger.info(`Derived presentation uploaded to GCS: ${publicUrl}`);
    } catch (uploadError) {
      logger.error('Error uploading derived presentation to GCS:', uploadError);
    }

    const responseMessage = publicUrl
      ? `🎉 New presentation created!\n\n` +
      `📊 Presentation ID: ${result.presentation_id}\n` +
      `🔗 Public URL: ${publicUrl}\n` +
      `📥 Download: ${result.path}\n` +
      `✏️ Edit online: ${result.edit_path}`
      : `🎉 New presentation created!\n\n` +
      `📊 Presentation ID: ${result.presentation_id}\n` +
      `📥 Download: ${result.path}\n` +
      `✏️ Edit online: ${result.edit_path}`;

    await addMessage(conversationId, userId, 'assistant', responseMessage, { result, publicUrl, uploadResult }, isGuest);

    return {
      success: true,
      message: responseMessage,
      presentationId: result.presentation_id,
      downloadUrl: result.path,
      editUrl: result.edit_path,
      publicUrl: publicUrl,
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
const handleGetInfoIntent = async (analysis, params, conversationId, userId, isGuest, req = null) => {
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
const handleGeneralQuestion = async (userMessage, conversationHistory, conversationId, userId, isGuest, req = null) => {
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
