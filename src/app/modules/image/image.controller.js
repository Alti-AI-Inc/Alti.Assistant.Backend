import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { imageService } from './image.service.js';
import { app as imageAssistantApp } from './imageAssistant/workflow.js';
import { imageHelpers } from './image.helper.js';

/**
 * Generate image based on user prompt
 */
export const generateImage = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  let userId;
  if (isGuest) {
    // For guest users, the userId should be generated or retrieved securely (e.g., from session/cookie).
    // Allowing req.body.userId to override here is an IDOR vulnerability.
    // The imageService.generateGuestUserId() should handle guest ID generation/retrieval securely.
    userId = imageService.generateGuestUserId();
  } else {
    // For authenticated users, userId MUST come from req.user.
    userId = req.user?.userId || req.user?._id;
  }
  const { message, conversationId, imageSize, imageStyle, imageModel } =
    req.body;
  // Removed: userId = req.body?.userId || userId;
  // This line was a security vulnerability (IDOR/impersonation risk) as it allowed
  // req.body.userId to override the securely determined user ID.
  // The userId should always be derived from the authentication context or securely generated for guests.

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'An image prompt is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id =
    conversationId || imageService.generateImageConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await imageService.handleImageConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    await imageService.addImageQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    // Determine if this is the first message or a subsequent message
    const isFirstMessage = conversation.messageCount === 0 || !conversationId;

    logger.info(
      `Image generation for conversation ${actualConversationId}: isFirstMessage=${isFirstMessage}, messageCount=${conversation.messageCount}`
    );

    let inputs;
    if (isFirstMessage) {
      // For first message, use initialPrompt
      inputs = {
        initialPrompt: message,
        preferences: {
          size: imageSize || 'standard',
          style: imageStyle || 'realistic',
          model: imageModel || 'default',
        },
      };
    } else {
      // For subsequent messages, use userResponse
      inputs = {
        userResponse: message,
        preferences: {
          size: imageSize || 'standard',
          style: imageStyle || 'realistic',
          model: imageModel || 'default',
        },
      };
    }

    const result = await imageAssistantApp.invoke(inputs, {
      configurable: { thread_id: actualConversationId },
    });
    logger.info(
      `Image Assistant Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    let fullResponse = '';
    let imageData = null;
    // console.log(`Image Assistant Result: ${JSON.stringify(result)}`);

    // Handle different response types from the image assistant
    if (result.imageUrl) {
      // If images were generated
      fullResponse = result.response || 'Image generated successfully';
      imageData = result.imageUrl;
    } else if (result.responseMessage) {
      // If it's a clarification or question
      fullResponse = result.responseMessage;
    } else {
      // Fallback
      fullResponse =
        "I'm processing your image request. Could you provide more details?";
    }

    // Add assistant response to conversation
    await imageService.addImageResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      {
        images: imageData,
        preferences: inputs.preferences,
      },
      isGuest,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Image generation completed successfully',
      data: {
        ...imageHelpers.formatImageResponse(
          fullResponse,
          imageData,
          actualConversationId,
          conversation.messageCount + 2
        ),
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
      },
    });
  } catch (error) {
    logger.error('Image Assistant Error:', error);

    // Try to save error message to conversation if possible
    const errorConversationId =
      conversationId || imageService.generateImageConversationId();
    try {
      if (errorConversationId && userId) {
        await imageService.addErrorMessage(
          errorConversationId,
          userId,
          imageHelpers.formatErrorMessage(error, message),
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while processing your image request',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

/**
 * Analyze an existing image
 */
export const analyzeImage = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest
    ? imageService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const { message, imageData, conversationId } = req.body;

  if (!imageData) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Image data is required for analysis',
    });
  }

  // Validate image data
  const validation = imageService.validateImageData(imageData);
  if (!validation.isValid) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: validation.error,
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id =
    conversationId || imageService.generateImageConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await imageService.handleImageConversation(
      userId,
      conversationId,
      message || 'Image analysis request',
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    await imageService.addImageQueryMessage(
      actualConversationId,
      userId,
      `${message || 'Analyze this image'} [Image attached]`,
      isGuest,
      req
    );

    // Determine if this is the first message or a subsequent message
    const isFirstMessage = conversation.messageCount === 0 || !conversationId;

    let inputs;
    if (isFirstMessage) {
      // For first message, use initialPrompt
      inputs = {
        initialPrompt: message || 'Analyze this image',
        imageData: imageData,
        analysisType: 'analyze',
      };
    } else {
      // For subsequent messages, use userResponse
      inputs = {
        userResponse: message || 'Analyze this image',
        imageData: imageData,
        analysisType: 'analyze',
      };
    }

    const result = await imageAssistantApp.invoke(inputs, {
      configurable: { thread_id: actualConversationId },
    });
    logger.info(
      `Image Analysis Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const fullResponse = result.response || 'Image analysis completed';

    // Add assistant response to conversation
    await imageService.addImageResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      {
        analysisType: 'image_analysis',
        originalImage:
          validation.type === 'url' ? imageData : '[Base64 Image Data]',
      },
      isGuest,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Image analysis completed successfully',
      data: {
        ...imageHelpers.formatAnalysisResponse(
          fullResponse,
          actualConversationId,
          conversation.messageCount + 2
        ),
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Image Analysis Error:', error);

    // Try to save error message to conversation if possible
    const errorConversationId =
      conversationId || imageService.generateImageConversationId();
    try {
      if (errorConversationId && userId) {
        await imageService.addErrorMessage(
          errorConversationId,
          userId,
          imageHelpers.formatErrorMessage(error, message || 'Image analysis'),
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while analyzing your image',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

/**
 * Get image statistics for the user (authenticated users only)
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

  const stats = await imageService.getImageStats(userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Image statistics retrieved successfully',
    data: stats,
  });
});

/**
 * Get image conversation by ID (supports both guest and authenticated users)
 */
const getImageConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const isGuest = req.isGuest || !req.user;
  const authenticatedUserId = isGuest ? null : req.user?.userId || req.user?._id; // Renamed for clarity

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  let currentSessionGuestId = null;
  if (isGuest) {
    // For guest users, we need to verify the guestUserId.
    // Assuming imageService.generateGuestUserId() retrieves the guest ID for the current session.
    currentSessionGuestId = imageService.generateGuestUserId();
    if (!currentSessionGuestId) {
      return sendResponse(res, {
        statusCode: httpStatus.UNAUTHORIZED,
        success: false,
        message: 'Guest user ID not established for this session.',
      });
    }
  }

  try {
    let conversation;

    if (isGuest) {
      // For guest users, get the conversation with guest user verification.
      // The imageService.getGuestConversation function must implement the verification
      // that the conversationId belongs to the currentSessionGuestId.
      conversation = await imageService.getGuestConversation(
        conversationId,
        currentSessionGuestId, // Pass the current session's guest ID for verification
        req
      );
    } else {
      // For authenticated users, verify ownership
      conversation = await conversationHelpers.getConversationById(
        conversationId,
        authenticatedUserId,
        req
      );
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: {
        conversation,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  } catch (error) {
    logger.error('Error retrieving image conversation:', error);

    // Changed message to reflect potential access denial rather than just not found.
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND, // Or httpStatus.FORBIDDEN if the error explicitly indicates access denied
      success: false,
      message: 'Conversation not found or access denied',
    });
  }
});

/**
 * Get guest conversations for a specific guest user
 */
const getGuestConversations = catchAsync(async (req, res) => {
  const { guestUserId: requestedGuestUserId } = req.params; // The ID from the URL parameter

  if (!requestedGuestUserId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Guest user ID is required',
    });
  }

  const isGuest = req.isGuest || !req.user;
  let currentSessionGuestId = null;

  if (isGuest) {
    // Assuming imageService.generateGuestUserId() retrieves the guest ID for the current session.
    currentSessionGuestId = imageService.generateGuestUserId();
  }

  // If not a guest, or if the requestedGuestUserId does not match the current session's guest ID, deny access.
  // This prevents IDOR (Insecure Direct Object Reference) where one guest can fetch another guest's conversations
  // by simply changing the guestUserId in the URL parameter.
  if (!isGuest || !currentSessionGuestId || requestedGuestUserId !== currentSessionGuestId) {
    return sendResponse(res, {
      statusCode: httpStatus.FORBIDDEN,
      success: false,
      message: 'Access denied to guest conversations.',
    });
  }

  try {
    const conversations = await imageService.getGuestConversations(
      requestedGuestUserId, // Use the validated guest ID
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Guest conversations retrieved successfully',
      data: {
        conversations,
        totalCount: conversations.length,
        userType: 'guest',
        userId: requestedGuestUserId,
      },
    });
  } catch (error) {
    logger.error('Error retrieving guest conversations:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve guest conversations',
    });
  }
});

export const imageController = {
  generateImage,
  analyzeImage,
  getImageStats,
  getImageConversation,
  getGuestConversations,
};