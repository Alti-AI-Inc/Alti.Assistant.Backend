import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import SubscriptionModel from '../payment/payment.model.js';
import { enhancedImageService } from './enhanced_image.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Generate image directly with prompt
 */
export const generateImageDirect = catchAsync(async (req, res) => {
  console.log("Direct image generation request:", req.user);

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
  const { prompt, conversationId, imageBase64, aspectRatio, negativePrompt } = req.body;
  userId = req.body.userId || userId;

  // Skip subscription check for guest users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const prompotUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId) : 0;

    if (prompotUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your image generation limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A prompt is required for image generation',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id = conversationId || enhancedImageService.generateImageConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await enhancedImageService.handleImageConversation(
      userId,
      conversationId,
      prompt,
      isGuest,
      'image_generation'
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      conversationHistory = conversation.messages
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
    }

    // Add user message to conversation
    await enhancedImageService.addImageRequestMessage(
      actualConversationId,
      userId,
      prompt,
      {
        type: 'image_generation',
        aspectRatio,
        negativePrompt
      },
      isGuest
    );

    // Generate image
    const timestamp = Date.now();
    const filename = `image-direct-${timestamp}.png`;
    const imageResult = await enhancedImageService.generateImage(prompt, filename, { aspectRatio, negativePrompt, referenceImage: imageBase64 });

    // Add assistant response to conversation
    const messageMetadata = {
      imageUrl: imageResult.url,
      filename: imageResult.filename,
      service: imageResult.service,
      reasoning: imageResult.reasoning,
      confidence: imageResult.confidence,
      aspectRatio,
      negativePrompt,
      timestamp: new Date().toISOString()
    };

    await enhancedImageService.addImageResultMessage(
      actualConversationId,
      userId,
      `Image generated successfully using ${imageResult.service}`,
      messageMetadata,
      isGuest
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Image generated successfully',
      data: {
        responseMessage: {
          answer: `Image generated successfully using ${imageResult.service}`,
          image: imageResult,
          prompt,
          metadata: messageMetadata
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });

  } catch (error) {
    logger.error("Image Generation Error:", error);

    const errorConversationId = conversationId || enhancedImageService.generateImageConversationId();
    try {
      if (errorConversationId && userId) {
        await enhancedImageService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while generating the image.',
          error,
          isGuest
        );
      }
    } catch (convError) {
      logger.error("Failed to save error to conversation:", convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while generating the image',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        error: error.message
      },
    });
  }
});

/**
 * Edit image with prompt and base64 image
 */
export const editImage = catchAsync(async (req, res) => {
  console.log("Image editing request:", req.user);

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
  const { prompt, imageBase64, conversationId, aspectRatio } = req.body;
  userId = req.body.userId || userId;

  // Skip subscription check for guest users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const prompotUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId) : 0;

    if (prompotUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your image editing limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A prompt is required for image editing',
    });
  }

  if (!imageBase64) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'An image (base64) is required for editing',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id = conversationId || enhancedImageService.generateImageConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await enhancedImageService.handleImageConversation(
      userId,
      conversationId,
      prompt,
      isGuest,
      'image_editing'
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    await enhancedImageService.addImageRequestMessage(
      actualConversationId,
      userId,
      prompt,
      {
        type: 'image_editing',
        aspectRatio,
        hasSourceImage: true
      },
      isGuest
    );

    // Edit image
    const timestamp = Date.now();
    const filename = `image-edit-${timestamp}.png`;
    const imageResult = await enhancedImageService.editImage(prompt, imageBase64, filename, { aspectRatio });

    // Add assistant response to conversation
    const messageMetadata = {
      imageUrl: imageResult.url,
      filename: imageResult.filename,
      service: 'imagen3',
      aspectRatio,
      timestamp: new Date().toISOString()
    };

    await enhancedImageService.addImageResultMessage(
      actualConversationId,
      userId,
      `Image edited successfully using Imagen3`,
      messageMetadata,
      isGuest
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Image edited successfully',
      data: {
        responseMessage: {
          answer: 'Image edited successfully using Imagen3',
          image: imageResult,
          prompt,
          metadata: messageMetadata
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });

  } catch (error) {
    logger.error("Image Editing Error:", error);

    const errorConversationId = conversationId || enhancedImageService.generateImageConversationId();
    try {
      if (errorConversationId && userId) {
        await enhancedImageService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while editing the image.',
          error,
          isGuest
        );
      }
    } catch (convError) {
      logger.error("Failed to save error to conversation:", convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while editing the image',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        error: error.message
      },
    });
  }
});

/**
 * Analyze image intent
 */
export const analyzeIntent = catchAsync(async (req, res) => {
  const { prompt } = req.body;
  let { conversationId } = req.body;

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A prompt is required for intent analysis',
    });
  }

  try {
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    userId = req.body.userId || userId;
    let conversation = null;
    // Create conversation if not exists
    if (!conversationId) {
      conversationId = enhancedImageService.generateImageConversationId();
      conversation = await enhancedImageService.handleImageConversation(
        userId,
        conversationId,
        prompt,
        isGuest,
        'intent_analysis'
      );
    } else {
      conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);
    }

    const result = await enhancedImageService.analyzeImageIntent(prompt);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Intent analyzed successfully',
      data: {
        ...result,
        conversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });

  } catch (error) {
    logger.error("Intent Analysis Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while analyzing intent',
      data: {
        error: error.message
      },
    });
  }
});

/**
 * Get image generation statistics for the user (authenticated users only)
 */
const getImageStats = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Statistics are only available for authenticated users',
    });
  }

  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  const stats = await enhancedImageService.getImageStats(userId);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Image statistics retrieved successfully',
    data: stats,
  });
});

/**
 * Analyze image intent (supports session context)
 */
export const analyzeImageIntent = catchAsync(async (req, res) => {
  console.log("Analyze Image Intent Request:", req.body);
  const { request, userMessage, sessionId } = req.body;
  let { conversationId } = req.body;

  // Explicitly handle hasImage - default to false if not provided or not true
  const hasImage = req.body.hasImage === true;

  const userRequest = request || userMessage;
  console.log("Analyze Image Intent Request:", { userRequest, hasImage, sessionId, conversationId });
  if (!userRequest) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Request or userMessage is required',
    });
  }

  try {
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    userId = req.body.userId || userId;

    // Get conversation context if conversationId provided, otherwise create new conversation
    let context = "No previous context.";
    let conversation = null;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);
        if (conversation && conversation.messages && conversation.messages.length > 0) {
          context = conversation.messages
            .slice(-5)
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
        }
      } catch (error) {
        logger.warn(`Could not load conversation context: ${error.message}`);
      }
    }

    // Create conversation if not exists
    if (!conversationId) {
      conversationId = enhancedImageService.generateImageConversationId();
      conversation = await enhancedImageService.handleImageConversation(
        userId,
        conversationId,
        userRequest,
        isGuest,
        'image_intent_analysis'
      );
    }

    // Analyze intent with explicit hasImage value and retrieved context
    const result = await enhancedImageService.analyzeImageIntentWithContext(userRequest, hasImage, context);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Intent analyzed successfully',
      data: {
        ...result,
        conversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });

  } catch (error) {
    logger.error("Image Intent Analysis Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while analyzing intent',
      data: {
        error: error.message
      },
    });
  }
});

/**
 * Evaluate prompt quality
 */
export const evaluatePrompt = catchAsync(async (req, res) => {
  const { prompt } = req.body;
  let { conversationId } = req.body;

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required',
    });
  }

  try {
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    userId = req.body.userId || userId;

    // Get conversation history if conversationId provided, otherwise create new conversation
    let history = "No previous conversation.";
    let conversation = null;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);
        if (conversation && conversation.messages && conversation.messages.length > 0) {
          history = conversation.messages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
        }
      } catch (error) {
        logger.warn(`Could not load conversation history: ${error.message}`);
      }
    }

    // Create conversation if not exists
    if (!conversationId) {
      conversationId = enhancedImageService.generateImageConversationId();
      conversation = await enhancedImageService.handleImageConversation(
        userId,
        conversationId,
        prompt,
        isGuest,
        'prompt_evaluation'
      );
      await enhancedImageService.addImageRequestMessage(
        conversationId,
        userId,
        prompt,
        { type: 'initial_message' },
        isGuest
      );
    }

    const evaluation = await enhancedImageService.evaluatePromptQuality(prompt, history);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Prompt evaluated successfully',
      data: {
        evaluation: {
          isComplete: evaluation.isComplete,
          score: evaluation.score,
          missingElements: evaluation.missingElements,
          suggestions: evaluation.suggestions,
        },
        conversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });

  } catch (error) {
    logger.error("Prompt Evaluation Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while evaluating prompt',
      data: {
        error: error.message
      },
    });
  }
});

/**
 * Add detail to conversation and re-evaluate
 */
export const addDetail = catchAsync(async (req, res) => {
  let { conversationId, detail } = req.body;

  if (!conversationId || !detail) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'ConversationId and detail are required',
    });
  }

  try {
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    userId = req.body.userId || userId;

    const conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);

    console.log("Add Detail to Conversation:", conversationId, "User:", userId, "Conversation Found:", conversation);
    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    console.log("Adding detail to conversation:", conversationId, "User:", userId, "Detail:", detail);

    // Add detail as user message
    await enhancedImageService.addImageRequestMessage(
      conversationId,
      userId,
      detail,
      { type: 'detail_addition' },
      isGuest
    );

    // Get all user messages
    const conversationHistory = conversation.messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content);
    conversationHistory.push(detail);

    // Get full history for context
    const history = conversation.messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n') + `\nuser: ${detail}`;

    // Re-evaluate quality with new detail
    const evaluation = await enhancedImageService.evaluatePromptQuality(
      conversationHistory.join('. '),
      history
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Detail added and prompt re-evaluated successfully',
      data: {
        evaluation: {
          isComplete: evaluation.isComplete,
          score: evaluation.score,
          missingElements: evaluation.missingElements,
          suggestions: evaluation.suggestions,
        },
        conversationHistory,
        messageCount: conversation.messageCount + 1,
        conversationId: conversationId
      },

    });

  } catch (error) {
    logger.error("Add Detail Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while adding detail',
      data: {
        error: error.message
      },
    });
  }
});

/**
 * Finalize prompt - alias for buildEnhancedPrompt for backward compatibility
 */
export const finalizePrompt = catchAsync(async (req, res) => {
  const { conversationId } = req.body;

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'ConversationId is required',
    });
  }

  try {
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    userId = req.body.userId || userId;
    const conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);

    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found or has no messages',
      });
    }

    // Extract user messages to build enhanced prompt
    const conversationHistory = conversation.messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content);

    const enhancedPrompt = await enhancedImageService.buildEnhancedPromptFromHistory(conversationHistory);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Prompt finalized successfully',
      data: {
        enhancedPrompt,
        conversationHistory,
        conversationId: conversationId
      },

    });

  } catch (error) {
    logger.error("Finalize Prompt Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while finalizing prompt',
      data: {
        error: error.message
      },
    });
  }
});

/**
 * Build enhanced prompt from conversation history
 */
export const buildEnhancedPrompt = catchAsync(async (req, res) => {
  const { conversationId } = req.body;

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'ConversationId is required',
    });
  }

  try {
    const isGuest = req.isGuest || !req.user;
    const userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);

    const conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);

    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found or has no messages',
      });
    }

    // Extract user messages to build enhanced prompt
    const conversationHistory = conversation.messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content);

    const enhancedPrompt = await enhancedImageService.buildEnhancedPromptFromHistory(conversationHistory);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Enhanced prompt built successfully',
      data: {
        enhancedPrompt,
        conversationHistory,
      },
    });

  } catch (error) {
    logger.error("Build Enhanced Prompt Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while building enhanced prompt',
      data: {
        error: error.message
      },
    });
  }
});

/**
 * Generate image with enhanced prompt from conversation
 */
export const generateFromConversation = catchAsync(async (req, res) => {
  const { conversationId, aspectRatio, negativePrompt } = req.body;

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'ConversationId is required',
    });
  }

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? enhancedImageService.generateGuestUserId() : (req.user?.userId || req.user?._id);
  userId = req.body.userId || userId;

  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, isGuest ? null : userId);

    if (!conversation || !conversation.messages || conversation.messages.length === 0) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found or has no messages',
      });
    }

    // Extract user messages to build enhanced prompt
    const conversationHistory = conversation.messages
      .filter(msg => msg.role === 'user')
      .map(msg => msg.content);

    const enhancedPrompt = await enhancedImageService.buildEnhancedPromptFromHistory(conversationHistory);

    // Generate image with enhanced prompt
    const timestamp = Date.now();
    const filename = `image-conversation-${timestamp}.png`;
    const imageResult = await enhancedImageService.generateImage(enhancedPrompt, filename, { aspectRatio, negativePrompt });

    // Add message to conversation
    const messageMetadata = {
      imageUrl: imageResult.url,
      filename: imageResult.filename,
      service: imageResult.service,
      reasoning: imageResult.reasoning,
      confidence: imageResult.confidence,
      enhancedPrompt,
      aspectRatio,
      negativePrompt,
      timestamp: new Date().toISOString()
    };

    await enhancedImageService.addImageResultMessage(
      conversationId,
      userId,
      `Image generated from conversation using ${imageResult.service}`,
      messageMetadata,
      isGuest
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Image generated from conversation successfully',
      data: {
        responseMessage: {
          answer: `Image generated from conversation using ${imageResult.service}`,
          image: imageResult,
          enhancedPrompt,
          metadata: messageMetadata
        },
        conversationId,
        messageCount: conversation.messageCount + 1,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });

  } catch (error) {
    logger.error("Generate From Conversation Error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while generating image from conversation',
      data: {
        conversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        error: error.message
      },
    });
  }
});

export const enhancedImageController = {
  generateImageDirect,
  editImage,
  analyzeIntent,
  getImageStats,
  analyzeImageIntent,
  evaluatePrompt,
  addDetail,
  finalizePrompt,
  buildEnhancedPrompt,
  generateFromConversation,
};
