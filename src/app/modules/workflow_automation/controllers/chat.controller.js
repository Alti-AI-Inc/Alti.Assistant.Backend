import httpStatus from 'http-status';
import catchAsync from '../../../../shared/catchAsync.js';
import sendResponse from '../../../../shared/sendResponse.js';
import { logger } from '../../../../shared/logger.js';
import { workflowCreationService } from '../services/workflowCreation.service.js';
import mongoose from 'mongoose';

/**
 * Create a new workflow from natural language prompt
 */
const createWorkflowFromPromptController = catchAsync(async (req, res) => {
  const { prompt, conversationId } = req.body;
  const userId = req.user?._id || new mongoose.Types.ObjectId().toString();
  console.log(userId);

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required'
    });
  }

  if (!prompt) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Prompt is required'
    });
  }

  try {
    const result = await workflowCreationService.createWorkflowFromPrompt(
      userId,
      prompt,
      conversationId
    );

    logger.info(`Workflow creation initiated for user ${userId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.needsConfirmation ?
        'Workflow plan created, awaiting confirmation' :
        'Workflow created successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in createWorkflowFromPromptController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to create workflow'
    });
  }
});


const generateConversationId = () => {
  return `vid-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};
/**
 * Confirm workflow creation after user approval
 */
const confirmWorkflowCreationController = catchAsync(async (req, res) => {
  const { conversationId, approved, modifications } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required'
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required'
    });
  }

  try {
    const result = await workflowCreationService.confirmWorkflowCreation(
      userId,
      conversationId,
      approved,
      modifications
    );

    logger.info(`Workflow confirmation processed for conversation ${conversationId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: result
    });

  } catch (error) {
    logger.error('Error in confirmWorkflowCreationController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to confirm workflow creation'
    });
  }
});

/**
 * Continue an existing conversation
 */
const continueConversationController = catchAsync(async (req, res) => {
  const { conversationId, message } = req.body;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required'
    });
  }

  if (!conversationId || !message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID and message are required'
    });
  }

  try {
    const result = await workflowCreationService.continueConversation(
      userId,
      conversationId,
      message
    );

    logger.info(`Conversation continued for ${conversationId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation continued successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in continueConversationController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to continue conversation'
    });
  }
});

/**
 * Get user's conversations
 */
const getUserConversationsController = catchAsync(async (req, res) => {
  const userId = req.user?._id || req.userId;
  const { limit = 50, offset = 0 } = req.query;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required'
    });
  }

  try {
    const conversations = await workflowCreationService.getUserConversations(
      userId,
      parseInt(limit),
      parseInt(offset)
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversations retrieved successfully',
      data: {
        conversations,
        total: conversations.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });

  } catch (error) {
    logger.error('Error in getUserConversationsController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get conversations'
    });
  }
});

/**
 * Get specific conversation
 */
const getConversationController = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?._id || req.userId;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required'
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required'
    });
  }

  try {
    const conversation = await workflowCreationService.getConversation(
      conversationId,
      userId
    );

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found'
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation retrieved successfully',
      data: conversation
    });

  } catch (error) {
    logger.error('Error in getConversationController:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to get conversation'
    });
  }
});

export const chatController = {
  createWorkflowFromPromptController,
  confirmWorkflowCreationController,
  continueConversationController,
  getUserConversationsController,
  getConversationController
};