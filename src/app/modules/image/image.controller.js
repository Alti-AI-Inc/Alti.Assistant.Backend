import httpStatus from 'http-status';
import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';
import config from '../../../../config/index.js';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { imageService } from './image.service.js';
import { app as imageAssistantApp } from './imageAssistant/workflow.js';
import { imageHelpers } from './image.helper.js';

// Initialize GCS storage client
const storage = new Storage();
const uploadBucketName = config.gcs?.uploads_bucket || 'alti_assistant_uploads';

/**
 * @typedef {object} ImageGenerationRequest
 * @property {string} message - The user's prompt for image generation.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [imageSize='standard'] - Desired size of the generated image (e.g., 'standard', 'large').
 * @property {string} [imageStyle='realistic'] - Desired style of the generated image (e.g., 'realistic', 'cartoon').
 * @property {string} [imageModel='default'] - Specific image generation model to use.
 */

/**
 * @typedef {object} ImageGenerationResponseData
 * @property {string} response - The assistant's textual response.
 * @property {string | null} imageUrl - URL of the generated image, if any.
 * @property {string} conversationId - The ID of the conversation.
 * @property {number} messageCount - The total number of messages in the conversation after this interaction.
 * @property {'guest' | 'authenticated'} userType - Type of user who made the request.
 * @property {string} [userId] - The user ID, included for guest users for frontend tracking.
 */

/**
 * @typedef {object} ErrorResponseData
 * @property {string} conversationId - The ID of the conversation where the error occurred.
 * @property {'guest' | 'authenticated'} userType - Type of user who made the request.
 */

/**
 * Generate image based on user prompt.
 *
 * @description
 * Allows both authenticated and guest users to generate images based on a provided prompt.
 * The user ID is securely determined from the request context (authenticated user from `req.user`,
 * guest user from `imageService.generateGuestUserId()`).
 * It manages conversation state, adds user queries and assistant responses, and handles errors.
 *
 * @summary Generate an image from a prompt
 * @tags Image Generation
 * @param {import('express').Request} req - The Express request object.
 * @param {ImageGenerationRequest} req.body - The request body containing the image prompt and optional preferences.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api
 * @method POST
 * @path /api/v1/image/generate
 * @security BearerAuth
 * @body {object} body
 * @body {string} body.message - The user's prompt for image generation.
 * @body {string} [body.conversationId] - Optional ID of an existing conversation to continue.
 * @body {string} [body.imageSize='standard'] - Desired size of the generated image (e.g., 'standard', 'large').
 * @body {string} [body.imageStyle='realistic'] - Desired style of the generated image (e.g., 'realistic', 'cartoon').
 * @body {string} [body.imageModel='default'] - Specific image generation model to use.
 * @response 200 - Success: Image generation completed successfully.
 * @response {object} 200.body
 * @response {number} 200.body.statusCode - HTTP status code.
 * @response {boolean} 200.body.success - Indicates if the request was successful.
 * @response {string} 200.body.message - A success message.
 * @response {ImageGenerationResponseData} 200.body.data - The generated image data and conversation details.
 * @response 400 - Bad Request: An image prompt is required or invalid input.
 * @response {object} 400.body
 * @response {number} 400.body.statusCode - HTTP status code.
 * @response {boolean} 400.body.success - Indicates if the request was successful.
 * @response {string} 400.body.message - An error message.
 * @response 500 - Internal Server Error: An error occurred during image processing.
 * @response {object} 500.body
 * @response {number} 500.body.statusCode - HTTP status code.
 * @response {boolean} 500.body.success - Indicates if the request was successful.
 * @response {string} 500.body.message - An error message.
 * @response {ErrorResponseData} 500.body.data - Additional error details including conversation ID and user type.
 */
export const generateImage = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  let userId;
  if (isGuest) {
    // For guest users, the userId should be generated or retrieved securely (e.g., from session/cookie).
    // Allowing req.body.userId to override here is an IDOR vulnerability.
    // The imageService.generateGuestUserId() should handle guest ID generation/retrieval securely.
    // Optimization Note: If 'imageService.generateGuestUserId()' involves a database lookup,
    // ensure it's efficient and uses appropriate indexing if querying by session/cookie ID.
    // If it fetches a guest user document, consider using .lean() if only the ID is needed.
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

  // Optimization Note: 'imageService.generateImageConversationId()' likely generates an ID,
  // no direct DB interaction for optimization here unless it involves a DB sequence/lookup.
  const thread_id =
    conversationId || imageService.generateImageConversationId();

  try {
    // Handle conversation creation/retrieval
    // Optimization Note: The 'imageService.handleImageConversation' method should use .lean()
    // if it primarily fetches conversation data for read-only purposes (e.g., to get conversationId or messageCount).
    // Ensure 'userId' and 'conversationId' fields are indexed in the Conversation schema for efficient lookups.
    const conversation = await imageService.handleImageConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    // Optimization Note: 'imageService.addImageQueryMessage' is a write operation (insert/update).
    // Ensure any related indexes (e.g., on actualConversationId, userId) are in place for efficient writes/lookups.
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

      // Increment monthly usage for image overages
      if (!isGuest) {
        const tenantId = req.user?.tenantId || req.tenantId || null;
        const subscriptionService = (await import('../subscription/subscription.service.js')).default;
        subscriptionService.trackAndIncrementMonthlyUsage(userId, tenantId, 'image').catch((err) => {
          logger.error('Error incrementing image monthly usage:', err);
        });
      }
    } else if (result.responseMessage) {
      // If it's a clarification or question
      fullResponse = result.responseMessage;
    } else {
      // Fallback
      fullResponse =
        "I'm processing your image request. Could you provide more details?";
    }

    // Add assistant response to conversation
    // Optimization Note: 'imageService.addImageResultMessage' is a write operation (insert/update).
    // Ensure any related indexes (e.g., on actualConversationId, userId) are in place for efficient writes/lookups.
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
        // Optimization Note: 'imageService.addErrorMessage' is a write operation (insert/update).
        // Ensure any related indexes (e.g., on errorConversationId, userId) are in place for efficient writes/lookups.
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
 * Generate GCS signed upload URL.
 */
export const generateUploadUrl = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId;
  if (isGuest) {
    userId = imageService.generateGuestUserId();
  } else {
    userId = req.user?.userId || req.user?._id;
  }

  const { contentType } = req.body;

  if (!uploadBucketName) {
    logger.error('GCS uploads bucket is not configured.');
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Server configuration error: GCS uploads bucket is not configured.',
    });
  }

  // Generate a unique filename / path
  const fileExtension = contentType.split('/')[1] || 'png';
  const fileName = `${crypto.randomUUID()}.${fileExtension}`;
  const gcsObjectName = `uploads/${userId}/${Date.now()}-${fileName}`;
  const publicUrl = `https://storage.googleapis.com/${uploadBucketName}/${gcsObjectName}`;

  const options = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000, // 15 minutes
    contentType: contentType,
  };

  try {
    const [uploadUrl] = await storage
      .bucket(uploadBucketName)
      .file(gcsObjectName)
      .getSignedUrl(options);

    logger.info(`Generated signed upload URL for ${gcsObjectName} in bucket ${uploadBucketName}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Signed URL for upload generated successfully',
      data: {
        uploadUrl,
        publicUrl,
      },
    });
  } catch (error) {
    logger.error('Failed to generate signed upload URL:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate signed upload URL due to an internal error',
    });
  }
});

/**
 * @typedef {object} ImageAnalysisRequest
 * @property {string} imageData - Base64 encoded image data or a publicly accessible image URL.
 * @property {string} [message] - Optional additional context or specific questions about the image.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 */

/**
 * @typedef {object} ImageAnalysisResponseData
 * @property {string} response - The assistant's textual analysis response.
 * @property {string} conversationId - The ID of the conversation.
 * @property {number} messageCount - The total number of messages in the conversation after this interaction.
 * @property {'guest' | 'authenticated'} userType - Type of user who made the request.
 * @property {string} [userId] - The user ID, included for guest users for frontend tracking.
 */

/**
 * Analyze an existing image.
 *
 * @description
 * Allows both authenticated and guest users to submit an image for analysis.
 * The image data can be provided as a base64 string or a URL.
 * The user ID is securely determined from the request context.
 * It validates the image data, manages conversation state, adds user queries and assistant responses, and handles errors.
 *
 * @summary Analyze an existing image
 * @tags Image Analysis
 * @param {import('express').Request} req - The Express request object.
 * @param {ImageAnalysisRequest} req.body - The request body containing the image data and optional message.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api
 * @method POST
 * @path /api/v1/image/analyze
 * @security BearerAuth
 * @body {object} body
 * @body {string} body.imageData - Base64 encoded image data or a publicly accessible image URL.
 * @body {string} [body.message] - Optional additional context or specific questions about the image.
 * @body {string} [body.conversationId] - Optional ID of an existing conversation to continue.
 * @response 200 - Success: Image analysis completed successfully.
 * @response {object} 200.body
 * @response {number} 200.body.statusCode - HTTP status code.
 * @response {boolean} 200.body.success - Indicates if the request was successful.
 * @response {string} 200.body.message - A success message.
 * @response {ImageAnalysisResponseData} 200.body.data - The image analysis data and conversation details.
 * @response 400 - Bad Request: Image data is required or invalid.
 * @response {object} 400.body
 * @response {number} 400.body.statusCode - HTTP status code.
 * @response {boolean} 400.body.success - Indicates if the request was successful.
 * @response {string} 400.body.message - An error message.
 * @response 500 - Internal Server Error: An error occurred during image analysis.
 * @response {object} 500.body
 * @response {number} 500.body.statusCode - HTTP status code.
 * @response {boolean} 500.body.success - Indicates if the request was successful.
 * @response {string} 500.body.message - An error message.
 * @response {ErrorResponseData} 500.body.data - Additional error details including conversation ID and user type.
 */
export const analyzeImage = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  // Optimization Note: If 'imageService.generateGuestUserId()' involves a database lookup,
  // ensure it's efficient and uses appropriate indexing if querying by session/cookie ID.
  // If it fetches a guest user document, consider using .lean() if only the ID is needed.
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
  // Optimization Note: 'imageService.validateImageData' is a synchronous operation.
  // Ensure its implementation is not CPU-intensive if handling large imageData strings (e.g., base64).
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

  // Optimization Note: 'imageService.generateImageConversationId()' likely generates an ID,
  // no direct DB interaction for optimization here unless it involves a DB sequence/lookup.
  const thread_id =
    conversationId || imageService.generateImageConversationId();

  try {
    // Handle conversation creation/retrieval
    // Optimization Note: The 'imageService.handleImageConversation' method should use .lean()
    // if it primarily fetches conversation data for read-only purposes (e.g., to get conversationId or messageCount).
    // Ensure 'userId' and 'conversationId' fields are indexed in the Conversation schema for efficient lookups.
    const conversation = await imageService.handleImageConversation(
      userId,
      conversationId,
      message || 'Image analysis request',
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Add user message to conversation
    // Optimization Note: 'imageService.addImageQueryMessage' is a write operation (insert/update).
    // Ensure any related indexes (e.g., on actualConversationId, userId) are in place for efficient writes/lookups.
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
    // Optimization Note: 'imageService.addImageResultMessage' is a write operation (insert/update).
    // Ensure any related indexes (e.g., on actualConversationId, userId) are in place for efficient writes/lookups.
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
        // Optimization Note: 'imageService.addErrorMessage' is a write operation (insert/update).
        // Ensure any related indexes (e.g., on errorConversationId, userId) are in place for efficient writes/lookups.
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
 * @typedef {object} ImageStatsResponseData
 * @property {number} totalImagesGenerated - Total count of images generated by the user.
 * @property {number} totalImagesAnalyzed - Total count of images analyzed by the user.
 * @property {object} generationTrends - Data on image generation trends (e.g., by size, style).
 * @property {object} analysisTrends - Data on image analysis trends.
 */

/**
 * Get image statistics for the user (authenticated users only).
 *
 * @description
 * Retrieves various statistics related to image generation and analysis for the currently authenticated user.
 * This endpoint is not accessible to guest users.
 *
 * @summary Get user image statistics
 * @tags Image Statistics
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api
 * @method GET
 * @path /api/v1/image/stats
 * @security BearerAuth
 * @response 200 - Success: Image statistics retrieved successfully.
 * @response {object} 200.body
 * @response {number} 200.body.statusCode - HTTP status code.
 * @response {boolean} 200.body.success - Indicates if the request was successful.
 * @response {string} 200.body.message - A success message.
 * @response {ImageStatsResponseData} 200.body.data - The image statistics.
 * @response 401 - Unauthorized: Statistics are only available for authenticated users or user authentication required.
 * @response {object} 401.body
 * @response {number} 401.body.statusCode - HTTP status code.
 * @response {boolean} 401.body.success - Indicates if the request was successful.
 * @response {string} 401.body.message - An error message.
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

  // Optimization Note: The 'imageService.getImageStats' method should use .lean()
  // if it fetches data for read-only purposes.
  // Ensure 'userId' and any fields used for aggregation/filtering (e.g., timestamps, status)
  // are indexed in the relevant schemas for efficient statistics generation.
  const stats = await imageService.getImageStats(userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Image statistics retrieved successfully',
    data: stats,
  });
});

/**
 * @typedef {object} ConversationMessage
 * @property {string} role - Role of the message sender (e.g., 'user', 'assistant').
 * @property {string} content - The message content.
 * @property {string} timestamp - ISO date string of when the message was created.
 * @property {object} [metadata] - Additional metadata related to the message (e.g., image URLs, preferences).
 */

/**
 * @typedef {object} ImageConversationResponseData
 * @property {string} conversationId - The ID of the conversation.
 * @property {string} userId - The ID of the user (guest or authenticated).
 * @property {string} title - A title for the conversation.
 * @property {ConversationMessage[]} messages - Array of messages in the conversation.
 * @property {number} messageCount - Total number of messages.
 * @property {string} createdAt - ISO date string of conversation creation.
 * @property {string} updatedAt - ISO date string of last update.
 * @property {'guest' | 'authenticated'} userType - Type of user who owns the conversation.
 */

/**
 * Get image conversation by ID (supports both guest and authenticated users).
 *
 * @description
 * Retrieves a specific image conversation by its unique ID.
 * For authenticated users, it verifies ownership. For guest users, it verifies that the
 * conversation belongs to the current session's guest ID, preventing Insecure Direct Object Reference (IDOR).
 *
 * @summary Get a specific image conversation
 * @tags Image Conversations
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.params - The request path parameters.
 * @param {string} req.params.conversationId - The ID of the conversation to retrieve.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api
 * @method GET
 * @path /api/v1/image/conversations/{conversationId}
 * @security BearerAuth
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @response 200 - Success: Conversation retrieved successfully.
 * @response {object} 200.body
 * @response {number} 200.body.statusCode - HTTP status code.
 * @response {boolean} 200.body.success - Indicates if the request was successful.
 * @response {string} 200.body.message - A success message.
 * @response {object} 200.body.data
 * @response {ImageConversationResponseData} 200.body.data.conversation - The retrieved conversation object.
 * @response {'guest' | 'authenticated'} 200.body.data.userType - Type of user who owns the conversation.
 * @response 400 - Bad Request: Conversation ID is required.
 * @response {object} 400.body
 * @response {number} 400.body.statusCode - HTTP status code.
 * @response {boolean} 400.body.success - Indicates if the request was successful.
 * @response {string} 400.body.message - An error message.
 * @response 401 - Unauthorized: Guest user ID not established for this session.
 * @response {object} 401.body
 * @response {number} 401.body.statusCode - HTTP status code.
 * @response {boolean} 401.body.success - Indicates if the request was successful.
 * @response {string} 401.body.message - An error message.
 * @response 404 - Not Found: Conversation not found or access denied.
 * @response {object} 404.body
 * @response {number} 404.body.statusCode - HTTP status code.
 * @response {boolean} 404.body.success - Indicates if the request was successful.
 * @response {string} 404.body.message - An error message.
 * @response 500 - Internal Server Error: An error occurred while retrieving the conversation.
 * @response {object} 500.body
 * @response {number} 500.body.statusCode - HTTP status code.
 * @response {boolean} 500.body.success - Indicates if the request was successful.
 * @response {string} 500.body.message - An error message.
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
    // Optimization Note: If 'imageService.generateGuestUserId()' involves a database lookup,
    // ensure it's efficient and uses appropriate indexing if querying by session/cookie ID.
    // If it fetches a guest user document, consider using .lean() if only the ID is needed.
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
      // Optimization Note: The 'imageService.getGuestConversation' method should use .lean()
      // if it fetches conversation data for read-only purposes.
      // Ensure 'conversationId' and the field storing 'guestUserId' are indexed in the Conversation schema.
      conversation = await imageService.getGuestConversation(
        conversationId,
        currentSessionGuestId, // Pass the current session's guest ID for verification
        req
      );
    } else {
      // For authenticated users, verify ownership
      // Optimization Note: The 'conversationHelpers.getConversationById' method should use .lean()
      // if it fetches conversation data for read-only purposes.
      // Ensure 'conversationId' and 'authenticatedUserId' fields are indexed in the Conversation schema.
      // @todo: 'conversationHelpers' is not imported in this file. This line will cause a ReferenceError.
      // It should likely be `imageService.getConversationById` or similar, or `conversationHelpers` needs to be imported.
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
 * @typedef {object} GuestConversationsResponseData
 * @property {ImageConversationResponseData[]} conversations - Array of conversation objects for the guest user.
 * @property {number} totalCount - Total number of conversations retrieved.
 * @property {'guest'} userType - Type of user (always 'guest' for this endpoint).
 * @property {string} userId - The ID of the guest user.
 */

/**
 * Get guest conversations for a specific guest user.
 *
 * @description
 * Retrieves all image conversations associated with a given guest user ID.
 * This endpoint includes robust IDOR (Insecure Direct Object Reference) protection,
 * ensuring that a guest user can only access conversations linked to their current session's guest ID.
 * Access is denied if the request is not from a guest user or if the `guestUserId` in the URL
 * does not match the `guestUserId` established for the current session.
 *
 * @summary Get all guest image conversations
 * @tags Image Conversations
 * @param {import('express').Request} req - The Express request object.
 * @param {object} req.params - The request path parameters.
 * @param {string} req.params.guestUserId - The ID of the guest user whose conversations are to be retrieved.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 *
 * @api
 * @method GET
 * @path /api/v1/image/guest-conversations/{guestUserId}
 * @security GuestAuth
 * @param {string} guestUserId - The ID of the guest user whose conversations are to be retrieved. This must match the guest ID from the current session.
 * @response 200 - Success: Guest conversations retrieved successfully.
 * @response {object} 200.body
 * @response {number} 200.body.statusCode - HTTP status code.
 * @response {boolean} 200.body.success - Indicates if the request was successful.
 * @response {string} 200.body.message - A success message.
 * @response {GuestConversationsResponseData} 200.body.data - The list of guest conversations and metadata.
 * @response 400 - Bad Request: Guest user ID is required.
 * @response {object} 400.body
 * @response {number} 400.body.statusCode - HTTP status code.
 * @response {boolean} 400.body.success - Indicates if the request was successful.
 * @response {string} 400.body.message - An error message.
 * @response 403 - Forbidden: Access denied to guest conversations (e.g., IDOR attempt or not a guest user).
 * @response {object} 403.body
 * @response {number} 403.body.statusCode - HTTP status code.
 * @response {boolean} 403.body.success - Indicates if the request was successful.
 * @response {string} 403.body.message - An error message.
 * @response 500 - Internal Server Error: Failed to retrieve guest conversations.
 * @response {object} 500.body
 * @response {number} 500.body.statusCode - HTTP status code.
 * @response {boolean} 500.body.success - Indicates if the request was successful.
 * @response {string} 500.body.message - An error message.
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
    // Optimization Note: If 'imageService.generateGuestUserId()' involves a database lookup,
    // ensure it's efficient and uses appropriate indexing if querying by session/cookie ID.
    // If it fetches a guest user document, consider using .lean() if only the ID is needed.
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
    // Optimization Note: The 'imageService.getGuestConversations' method should use .lean()
    // as it fetches multiple conversation documents for read-only purposes.
    // Ensure the field storing 'guestUserId' is indexed in the Conversation schema for efficient querying.
    // Consider adding pagination (limit/skip or cursor-based) within the service method if the number
    // of guest conversations can become very large to prevent large data transfers and memory usage.
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

/**
 * @typedef {object} ImageController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} generateImage - Controller for generating images.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} analyzeImage - Controller for analyzing images.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getImageStats - Controller for retrieving image statistics for authenticated users.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getImageConversation - Controller for retrieving a single image conversation by ID.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getGuestConversations - Controller for retrieving all image conversations for a specific guest user.
 */

/**
 * Exports an object containing all image-related controller functions.
 * @type {ImageController}
 */
export const imageController = {
  generateImage,
  generateUploadUrl,
  analyzeImage,
  getImageStats,
  getImageConversation,
  getGuestConversations,
};