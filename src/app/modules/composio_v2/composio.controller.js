import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { composioService } from "./composio.service.js";
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import SubscriptionModel from '../payment/payment.model.js';

const composioInitiateController = async (req, res) => {
  console.log('Initiating Composio Auth...', req.body);

  const { app_name, user_id } = req.body;

  try {
    const connectionUrl = await composioService.initiateComposioAuth({
      app_name,
      user_id
    });
    res.status(200).json({ authConfig: connectionUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to initiate authentication' });
  }
};

const composioWaitForConnectionController = async (req, res) => {
  const { connected_account_id } = req.body;

  try {
    const connection = await composioService.waitForConnection(connected_account_id);
    res.status(200).json({ connection });
  } catch (error) {
    res.status(500).json({ error: 'Failed to establish connection' });
  }
};

/**
 * Conversational Composio Chat Controller
 * Handles conversational interactions with Composio tools
 */
const composioConversationController = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest ? composioService.generateGuestUserId() : (req.user?.userId || req.user?._id);
  const { message, conversationId } = req.body;
  userId = req.body.userId || userId; // Allow overriding userId from request body

  // Skip subscription check for guest users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const prompotUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId) : 0;

    if (prompotUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You have reached your automation limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'A message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  const thread_id = conversationId || composioService.generateComposioConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation = await composioService.handleComposioConversation(userId, conversationId, message, isGuest);
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // Get last 10 messages for context (excluding the current message)
      conversationHistory = conversation.messages
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));
    }

    // Add user message to conversation
    await composioService.addComposioQueryMessage(actualConversationId, userId, message, isGuest);

    const inputs = {
      query: message,
      conversationContext: conversationHistory,
      history: [...conversationHistory, { role: 'user', content: message }],
      userId: userId,
      conversationId: actualConversationId
    };

    const result = await composioService.processComposioConversation(inputs);
    logger.info(`Composio Automation Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`);

    const response = result.response;
    const metadata = result.metadata || {};

    // Add assistant response to conversation
    await composioService.addComposioResponseMessage(actualConversationId, userId, response, metadata, isGuest);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Composio automation processed successfully',
      data: {
        conversationId: actualConversationId,
        response: response,
        metadata: metadata,
        isGuest: isGuest,
        executionResult: result.executionResult
      },
    });

  } catch (error) {
    logger.error(`Error in composio conversation: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to process automation request',
      data: {
        conversationId: thread_id,
        error: error.message
      }
    });
  }
});

/**
 * Get Composio conversation history
 */
const getComposioConversationController = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest ? req.query.userId : (req.user?.userId || req.user?._id);

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: conversation,
    });
  } catch (error) {
    logger.error(`Error retrieving composio conversation: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve conversation',
    });
  }
});

/**
 * Get user's Composio conversations
 */
const getUserComposioConversationsController = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest ? req.query.userId : (req.user?.userId || req.user?._id);

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'User ID is required',
    });
  }

  try {
    const options = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      category: 'composio',
      sortBy: req.query.sortBy || 'lastActivity',
      sortOrder: parseInt(req.query.sortOrder) || -1,
      search: req.query.search || '',
    };

    const conversations = await conversationHelpers.getUserConversations(userId, options);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversations retrieved successfully',
      data: conversations,
    });
  } catch (error) {
    logger.error(`Error retrieving user composio conversations: ${error.message}`);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve conversations',
    });
  }
});

export const composioController = {
  composioInitiateController,
  composioWaitForConnectionController,
  composioConversationController,
  getComposioConversationController,
  getUserComposioConversationsController
};