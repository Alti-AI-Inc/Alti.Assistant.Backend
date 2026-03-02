import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { rewriteService } from './rewrite.service.js';

/**
 * Conversational rewrite assistant endpoint
 * Handles natural language requests for rewriting with file upload or direct text
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? rewriteService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId, textContent } = req.body;
  userId = req.body.userId || userId;

  // Handle file upload if present
  const fileInfo = req.file
    ? {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      location: req.file.location || req.file.path,
    }
    : null;

  logger.info(
    `Rewrite assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`,
    {
      hasFile: !!fileInfo,
      hasText: !!textContent,
      conversationId,
    }
  );

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await rewriteService.processConversationalRequest(
      userId,
      message,
      conversationId,
      fileInfo,
      textContent,
      isGuest,
      req
    );

    logger.info('Rewrite assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsFile: result.needsFile,
      needsMoreInfo: result.needsMoreInfo,
      fileGenerated: !!result.file,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message || 'Request processed successfully',
      data: {
        ...result,
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Direct rewrite endpoint (non-conversational)
 * For programmatic access with all parameters provided
 */
export const rewriteContent = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? rewriteService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  userId = req.body.userId || userId;

  const { textContent } = req.body;

  // Handle file upload if present
  const fileInfo = req.file
    ? {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      location: req.file.location || req.file.path,
    }
    : null;

  // Get content from file or direct text
  let content = textContent;

  if (fileInfo) {
    try {
      const { fileProcessor } = await import('../document_review/services/fileProcessor.js');
      content = await fileProcessor.extractTextFromFile(fileInfo);
    } catch (error) {
      logger.error('Error extracting text from file:', error);
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Unable to extract text from the file',
      });
    }
  }

  if (!content || content.trim().length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Content is required (either as text or file)',
    });
  }

  const rewriteParams = {
    intent: req.body.intent,
    style: req.body.style,
    mode: req.body.mode,
    targetAudience: req.body.targetAudience,
    additionalInstructions: req.body.additionalInstructions,
    outputFormat: req.body.outputFormat,
  };

  logger.info('Direct rewrite request', {
    userId,
    contentLength: content.length,
    intent: rewriteParams.intent,
    style: rewriteParams.style,
    outputFormat: rewriteParams.outputFormat,
  });

  try {
    const result = await rewriteService.rewriteContent(content, rewriteParams, userId, isGuest);

    logger.info('Rewrite completed successfully', {
      fileGenerated: !!result.file,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: result.message,
      data: {
        ...result,
        userId: isGuest ? userId : undefined,
      },
    });
  } catch (error) {
    logger.error('Error in direct rewrite:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to rewrite content',
      data: {
        userId: isGuest ? userId : undefined,
      },
    });
  }
});

/**
 * Get conversation history
 */
export const getConversationHistory = catchAsync(async (req, res) => {
  const { conversationId } = req.params;
  const userId = req.user?.userId || req.user?._id;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation history retrieved successfully',
      data: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        messages: conversation.messages,
        metadata: conversation.metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Error fetching conversation history:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to fetch conversation history',
    });
  }
});

export const rewriteController = {
  conversationalAssistant,
  rewriteContent,
  getConversationHistory,
};
