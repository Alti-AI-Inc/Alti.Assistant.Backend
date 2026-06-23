/**
 * @file This file contains the controller functions for the video generation module.
 * It handles HTTP requests related to video creation, conversation management, and status polling.
 * @module video/controller
 */
import httpStatus from 'http-status';
import express from 'express'; // Added for server and probes
import http from 'http'; // Added for graceful shutdown
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { videoService } from './video.service.js';
import { videoHelpers } from './video.helper.js';
import { proxyToAgent } from '../gateway/agentProxy.js';
// BUG FIX: Missing import for conversationHelpers.
// Assuming conversationHelpers is a shared utility, adjust path if necessary.
import { conversationHelpers } from '../conversations/conversation.helpers.js';
// PLACEHOLDER: Import your database connection management module.
// This is needed for graceful shutdown to close the connection properly.
// The `db` object should expose methods like `isConnected()` and `disconnect()`.
import { db } from '../../../config/db.js'; // Adjust path as needed

/**
 * @openapi
 * /video/generate:
 *   post:
 *     summary: Generate a video based on a user prompt
 *     description: |
 *       Initiates a video generation process using a conversational AI assistant.
 *       This endpoint handles both new conversations and follow-up messages within an existing conversation.
 *       It supports both authenticated users and guest users. For guests, a temporary user ID is generated and returned.
 *       Multi-tenant context is derived from the request and passed to the service layer.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's prompt or message for video generation.
 *                 example: "Create a short video of a cat playing with a laser pointer."
 *               conversationId:
 *                 type: string
 *                 description: The ID of an existing conversation to continue. If omitted, a new conversation is started.
 *                 example: "vid_conv_12345"
 *     responses:
 *       '200':
 *         description: Video generation process completed successfully. The response may contain a direct video URL or a follow-up message from the assistant.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     response:
 *                       type: string
 *                     videoUrl:
 *                       type: string
 *                       nullable: true
 *                     conversationId:
 *                       type: string
 *                     messageCount:
 *                       type: number
 *                     userType:
 *                       type: string
 *                       enum: [guest, authenticated]
 *                     userId:
 *                       type: string
 *                       description: The guest user ID, only present for guest users.
 *       '400':
 *         description: Bad Request - The 'message' field is missing from the request body.
 *       '500':
 *         description: Internal Server Error - An unexpected error occurred during video processing.
 *
 * @function generateVideo
 * @description Controller to handle video generation requests. It orchestrates the conversation management,
 * invokes the video assistant workflow, and formats the final response.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
// Generate video similar to image module flow
export const generateVideo = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? videoService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  // BUG FIX: Security Vulnerability (IDOR) - Do not allow client to override userId.
  // The userId should be authoritative, derived from authentication or guest generation.
  // Removing this line prevents a malicious user from impersonating another user
  // by providing a userId in the request body.
  // userId = req.body?.userId || userId;

  const { message, conversationId } = req.body;

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A video prompt is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  // BUG FIX: Declare actualConversationId outside try block to make it accessible in catch.
  // This ensures that if an error occurs, the correct conversation ID can be used for logging.
  let actualConversationId;
  const thread_id =
    conversationId || videoService.generateVideoConversationId();

  try {
    const conversation = await videoService.handleVideoConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    actualConversationId = conversation.conversationId || thread_id; // Assign here

    // Add user message to conversation
    await videoService.addVideoQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    // Determine if this is the first message or a subsequent message
    const isFirstMessage = conversation.messageCount === 0 || !conversationId;

    logger.info(
      `Video generation for conversation ${actualConversationId}: isFirstMessage=${isFirstMessage}, messageCount=${conversation.messageCount}`
    );

    let inputs;
    if (isFirstMessage) {
      // For first message, use initialPrompt
      inputs = {
        initialPrompt: message,
      };
    } else {
      // For subsequent messages, use userResponse
      inputs = {
        userResponse: message,
      };
    }

    // Fetch recent history for intent classification
    let history = [];
    try {
      const convData = await conversationHelpers.getConversationById(actualConversationId, userId, req);
      history = convData?.messages || [];
    } catch (err) {
      logger.warn(`Could not fetch history for conversation ${actualConversationId}`);
    }

    // Call our native video service which handles intent classification
    const result = await videoService.processVideoRequest(message, userId, history);

    logger.info(
      `Video Processing Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    let fullResponse = '';
    let videoData = null;

    // Handle different response types from the video assistant
    if (result.videoUrl) {
      // If video was generated
      fullResponse = result.response || result.prompt || 'Video generated successfully';
      videoData = result.videoUrl;

      // Increment monthly usage for video overages
      if (!isGuest) {
        const tenantId = req.user?.tenantId || req.tenantId || null;
        const subscriptionService = (await import('../subscription/subscription.service.js')).default;
        subscriptionService.trackAndIncrementMonthlyUsage(userId, tenantId, 'video').catch((err) => {
          logger.error('Error incrementing video monthly usage:', err);
        });
      }
    } else if (result.content || result.responseMessage) {
      // If it's an analysis, storyboard, or clarification
      fullResponse = result.content || result.responseMessage;
      videoData = null; // No new video URL
    } else {
      // Fallback
      fullResponse =
        "I'm processing your video request. Could you provide more details?";
    }

    // Add assistant response to conversation
    await videoService.addVideoResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      {
        video: videoData,
        // BUG FIX: inputs.preferences is always undefined as the 'inputs' object
        // (initialPrompt or userResponse) does not contain a 'preferences' property.
        // Removed this property to avoid passing an undefined value.
        // If preferences are intended to be passed, they should be explicitly extracted from req.body.
        // preferences: inputs.preferences,
      },
      isGuest,
      req
    );



    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,

      message: 'Video generation completed successfully',
      data: {
        ...videoHelpers.formatVideoResponse(
          fullResponse,
          videoData,
          actualConversationId,
          conversation.messageCount + 2
        ),
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Video Assistant Error:', error);

    // Try to save error message to conversation if possible
    // BUG FIX: Use actualConversationId if available, otherwise fall back to thread_id.
    // This ensures consistency with the conversation ID established for the request
    // and prevents generating a new, unrelated ID for the error log.
    const errorConversationId = actualConversationId || thread_id;
    try {
      if (errorConversationId && userId) {
        await videoService.addErrorMessage(
          errorConversationId,
          userId,
          videoHelpers.formatErrorMessage(error, message),
          error,
          isGuest,
          req
        );
      }
    } catch {
      // Ignore errors from logging the error message to prevent cascading failures.
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while processing your video request',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

/**
 * @openapi
 * /video/stats:
 *   get:
 *     summary: Get video generation statistics for the authenticated user
 *     description: |
 *       Retrieves statistics such as total videos generated, usage, etc.
 *       This endpoint is only available to authenticated users.
 *       Multi-tenant context is derived from the request and used for data scoping.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Successfully retrieved video statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: An object containing user-specific video statistics.
 *                   example:
 *                     totalVideos: 15
 *                     totalProcessingTime: 3600
 *       '401':
 *         description: Unauthorized - The request was made by a guest user or without authentication.
 *
 * @function getVideoStats
 * @description Controller to fetch video-related statistics for the authenticated user.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getVideoStats = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Statistics are only available for authenticated users',
    });
  }
  const userId = req.user?.userId || req.user?._id;
  const stats = await videoService.getVideoStats(userId, req);
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Video statistics retrieved successfully',
    data: stats,
  });
});

/**
 * @openapi
 * /video/conversations/{conversationId}:
 *   get:
 *     summary: Retrieve a specific video conversation
 *     description: |
 *       Fetches the message history of a single video conversation.
 *       - Authenticated users can only retrieve their own conversations.
 *       - Guest users can retrieve conversations created during their session.
 *       Multi-tenant context is respected for authenticated users.
 *     tags:
 *       - Video
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier of the video conversation.
 *     responses:
 *       '200':
 *         description: Conversation retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversation:
 *                       type: object
 *                       description: The full conversation object, including messages.
 *                     userType:
 *                       type: string
 *                       enum: [guest, authenticated]
 *       '400':
 *         description: Bad Request - Conversation ID is missing.
 *       '404':
 *         description: Not Found - The conversation does not exist or the user does not have permission to access it.
 *
 * @function getVideoConversation
 * @description Controller to retrieve a specific video conversation by its ID.
 * It handles access control for both authenticated and guest users.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getVideoConversation = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest ? null : req.user?.userId || req.user?._id;

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    let conversation;
    if (isGuest) {
      conversation = await videoService.getGuestConversation(
        conversationId,
        req
      );
    } else {
      // BUG FIX: conversationHelpers was not imported, causing a ReferenceError.
      // Now using the imported conversationHelpers to retrieve the conversation.
      conversation = await conversationHelpers.getConversationById(
        conversationId,
        userId,
        req
      );
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: { conversation, userType: isGuest ? 'guest' : 'authenticated' },
    });
  } catch (error) {
    // Improve error logging for debugging purposes
    logger.error('Error retrieving video conversation:', error);
    return sendResponse(res, {
      statusCode: httpStatus.NOT_FOUND,
      success: false,
      message: 'Conversation not found',
    });
  }
});

/**
 * @openapi
 * /video/conversations/guest/{guestUserId}:
 *   get:
 *     summary: Retrieve all conversations for a specific guest user
 *     description: |
 *       Fetches a list of all video conversations associated with a given guest user ID.
 *       This is a public endpoint intended to allow guests to retrieve their history.
 *       Multi-tenant context is derived from the request and used for data scoping.
 *     tags:
 *       - Video
 *     parameters:
 *       - in: path
 *         name: guestUserId
 *         required: true
 *         schema:
 *           type: string
 *         description: The unique identifier for the guest user.
 *     responses:
 *       '200':
 *         description: Guest conversations retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversations:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalCount:
 *                       type: integer
 *                     userType:
 *                       type: string
 *                       example: "guest"
 *                     userId:
 *                       type: string
 *       '400':
 *         description: Bad Request - Guest user ID is missing.
 *
 * @function getGuestConversations
 * @description Controller to retrieve all conversations for a specific guest user ID.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getGuestConversations = catchAsync(async (req, res) => {
  const { guestUserId } = req.params;
  if (!guestUserId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Guest user ID is required',
    });
  }
  const conversations = await videoService.getGuestConversations(
    guestUserId,
    req
  );
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Guest conversations retrieved successfully',
    data: {
      conversations,
      totalCount: conversations.length,
      userType: 'guest',
      userId: guestUserId,
    },
  });
});

/**
 * @openapi
 * /video/operation-status:
 *   post:
 *     summary: Get the status of a long-running video generation operation
 *     description: |
 *       Poll this endpoint with the operation ID to check the status of an asynchronous video generation task.
 *       This is a public endpoint; access is controlled by the uniqueness of the operation ID.
 *     tags:
 *       - Video
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - operationId
 *             properties:
 *               operationId:
 *                 type: string
 *                 description: The unique identifier of the operation to check.
 *     responses:
 *       '200':
 *         description: Operation status retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   description: The current status of the operation (e.g., { status: 'completed', result: '...' }).
 *       '400':
 *         description: Bad Request - Operation ID is missing.
 *       '404':
 *         description: Not Found - The operation ID is invalid or has expired.
 *       '500':
 *         description: Internal Server Error - Failed to retrieve operation status.
 *
 * @function getOperationStatus
 * @description Controller to check the status of a long-running, asynchronous operation by its ID.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>}
 */
const getOperationStatus = catchAsync(async (req, res) => {
  const { operationId } = req.body;
  if (!operationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Operation ID is required',
    });
  }

  try {
    const status = await videoService.getOperationStatus(operationId);
    if (!status) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Operation not found',
      });
    }
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Operation status retrieved successfully',
      data: status,
    });
  } catch (error) {
    logger.error('Error fetching operation status:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve operation status',
    });
  }
});

/**
 * @namespace videoController
 * @description A collection of controller methods for handling video-related operations.
 * This includes generating videos, retrieving conversation history, and checking statistics.
 * @property {function} generateVideo - Handles video generation requests.
 * @property {function} getVideoStats - Retrieves statistics for authenticated users.
 * @property {function} getVideoConversation - Fetches a specific conversation.
 * @property {function} getOperationStatus - Checks the status of an async operation.
 * @property {function} getGuestConversations - Retrieves all conversations for a guest user.
 */
export const videoController = {
  generateVideo,
  getVideoStats,
  getVideoConversation,
  getOperationStatus,
  getGuestConversations,
};

// --- GCP Cloud Run Lifecycle & Health Check Implementation ---