import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { RAGSystem } from 'rag-system-pgvector'
import { knowledgebaseService } from './knowledgebase.service.js';
import path from 'path';
import Conversation from '../conversations/conversation.model.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Upload file to knowledge base
 */
const uploadFile = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  // if (isGuest) {
  //   return sendResponse(res, {
  //     statusCode: httpStatus.UNAUTHORIZED,
  //     success: false,
  //     message: 'File upload is only available for authenticated users',
  //   });
  // }

  const userId = req.user?.userId || req.user?._id;
  const knowledgebotId = req.body.knowledgebotId || null;

  // if (!userId) {
  //   return sendResponse(res, {
  //     statusCode: httpStatus.UNAUTHORIZED,
  //     success: false,
  //     message: 'User authentication required',
  //   });
  // }

  if (!req.files || req.files.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'No file provided',
    });
  }

  // Get the first uploaded file
  const uploadedFile = req.files[0];

  // Extract file extension from filename
  const fileExtension = path.extname(uploadedFile.originalname).toLowerCase().substring(1); // Remove the dot and convert to lowercase

  try {
    // For now, just return success message
    // You can add the actual processing logic later
    logger.info(`File upload attempted by user: ${userId}, file: ${uploadedFile.originalname}, type: ${fileExtension}, size: ${uploadedFile.size} bytes`);
    const response = await knowledgebaseService.processUploadedFile(uploadedFile, knowledgebotId, userId);
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Upload successful',
      data: response,
    });
  } catch (error) {
    logger.error("File upload error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while uploading the file',
    });
  }
});

const deleteKnowledgeBase = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Knowledge base deletion is only available for authenticated users',
    });
  }
  const userId = req.user?.userId || req.user?._id;
  const { knowledgebaseId } = req.params;
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }
  if (!knowledgebaseId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Knowledge base ID is required',
    });
  }
  try {
    const result = await knowledgebaseService.deleteKnowledgeBase(knowledgebaseId, userId);
    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Knowledge base not found or could not be deleted',
      });
    }
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Knowledge base deleted successfully',
    });
  } catch (error) {
    logger.error("Delete knowledge base error:", error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while deleting the knowledge base',
    });
  }
});

/**
 * Get user's uploaded files
 */
const getUserFiles = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Access to files is only available for authenticated users',
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

  // Get optional knowledgebotId from query params
  const { knowledgebotId } = req.query;

  try {
    const files = await knowledgebaseService.getUserFiles(userId, knowledgebotId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Files retrieved successfully',
      data: {
        files,
        totalCount: files.length,
        knowledgebotId: knowledgebotId || null,
      },
    });
  } catch (error) {
    logger.error("Get user files error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving files',
    });
  }
});

/**
 * Create a new knowledge base
 */
const createKnowledgeBase = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Creating knowledge base is only available for authenticated users',
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

  const { name } = req.body;

  if (!name || !name.trim()) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Knowledge base name is required',
    });
  }

  try {
    const knowledgeBase = await knowledgebaseService.createKnowledgeBase(req.body, userId);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Knowledge base created successfully',
      data: knowledgeBase,
    });
  } catch (error) {
    logger.error("Create knowledge base error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while creating the knowledge base',
    });
  }
});

/**
 * Get user's knowledge bases
 */
const getUserKnowledgeBases = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Access to knowledge bases is only available for authenticated users',
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

  try {
    const knowledgeBases = await knowledgebaseService.getUserKnowledgeBases(userId);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Knowledge bases retrieved successfully',
      data: {
        knowledgeBases,
        totalCount: knowledgeBases.length,
      },
    });
  } catch (error) {
    logger.error("Get user knowledge bases error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving knowledge bases',
    });
  }
});

const invokeRagSystem = async (req, res) => {
  const response = await knowledgebaseService.invokeRagSystem();
  console.log("RAG Response:", response);
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'RAG system invoked successfully',
    data: response,
  });
}

/**
 * Chat with knowledge base
 */
const chatWithKnowledgeBase = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Chat with knowledge base is only available for authenticated users',
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

  const { message, knowledgebaseId, conversationId } = req.body;

  if (!message || !message.trim()) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!knowledgebaseId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Knowledge base ID is required',
    });
  }

  try {
    // Verify knowledge base exists and belongs to user
    const knowledgeBase = await knowledgebaseService.getKnowledgeBaseById(knowledgebaseId, userId);
    if (!knowledgeBase) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Handle conversation
    let conversation;
    let newConversationId = conversationId;

    if (conversationId) {
      // Find existing conversation
      conversation = await Conversation.findByConversationId(conversationId, userId);
      if (!conversation || conversation.knowledgebaseId?.toString() !== knowledgebaseId) {
        return sendResponse(res, {
          statusCode: httpStatus.NOT_FOUND,
          success: false,
          message: 'Conversation not found or does not belong to this knowledge base',
        });
      }
    } else {
      // Create new conversation
      newConversationId = `kb_${knowledgebaseId}_${uuidv4()}`;
      conversation = new Conversation({
        conversationId: newConversationId,
        userId: userId,
        knowledgebaseId: knowledgebaseId,
        title: `Chat with ${knowledgeBase.name}`,
        status: 'active',
        metadata: {
          category: 'knowledgebase',
          knowledgebaseName: knowledgeBase.name,
        },
      });
    }

    // Add user message to conversation
    conversation.addMessage('user', message.trim());

    // Get RAG response
    const ragResponse = await knowledgebaseService.chatWithKnowledgeBase(
      message.trim(),
      knowledgebaseId,
      conversationId,
      conversation.getRecentMessages(5) // Get last 5 messages for context
    );

    // Add assistant message to conversation
    conversation.addMessage('assistant', ragResponse.answer, {
      sources: ragResponse.sources,
      model: ragResponse.model,
      confidence: ragResponse.confidence,
    });

    // Save conversation
    await conversation.save();

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Chat response generated successfully',
      data: {
        conversationId: newConversationId,
        message: ragResponse.answer,
        sources: ragResponse.sources,
        confidence: ragResponse.confidence,
        knowledgebaseId: knowledgebaseId,
        knowledgebaseName: knowledgeBase.name,
      },
    });
  } catch (error) {
    logger.error("Chat with knowledge base error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'An error occurred while processing your message',
    });
  }
});

/**
 * Get knowledge base conversations
 */
const getKnowledgeBaseConversations = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Access to conversations is only available for authenticated users',
    });
  }

  const userId = req.user?.userId || req.user?._id;
  const { knowledgebaseId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!knowledgebaseId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Knowledge base ID is required',
    });
  }

  try {
    // Verify knowledge base exists and belongs to user
    const knowledgeBase = await knowledgebaseService.getKnowledgeBaseById(knowledgebaseId, userId);
    if (!knowledgeBase) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Get conversations for this knowledge base
    const conversations = await Conversation.find({
      userId: userId,
      knowledgebaseId: knowledgebaseId,
      status: 'active'
    })
      .select('conversationId title lastActivity messageCount createdAt updatedAt metadata')
      .sort({ lastActivity: -1 })
      .limit(50);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversations retrieved successfully',
      data: {
        conversations,
        totalCount: conversations.length,
        knowledgebaseId: knowledgebaseId,
        knowledgebaseName: knowledgeBase.name,
      },
    });
  } catch (error) {
    logger.error("Get knowledge base conversations error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving conversations',
    });
  }
});

const deleteFile = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'File deletion is only available for authenticated users',
    });
  }
  const userId = req.user?.userId || req.user?._id;
  const { fileId } = req.params;
  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }
  if (!fileId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'File ID is required',
    });
  }
  try {
    const result = await knowledgebaseService.deleteUserFile(fileId, userId);
    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found or could not be deleted',
      });
    }
    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File deleted successfully',
    });
  }
  catch (error) {
    logger.error("Delete user file error:", error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while deleting the file',
    });
  }
});

/**
 * Get conversation messages
 */
const getConversationMessages = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'Access to conversation messages is only available for authenticated users',
    });
  }

  const userId = req.user?.userId || req.user?._id;
  const { conversationId } = req.params;

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message: 'User authentication required',
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required',
    });
  }

  try {
    // Find conversation
    const conversation = await Conversation.findByConversationId(conversationId, userId)
      .populate('knowledgebaseId', 'name description');

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation messages retrieved successfully',
      data: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        knowledgebaseId: conversation.knowledgebaseId?._id,
        knowledgebaseName: conversation.knowledgebaseId?.name,
        messages: conversation.messages,
        messageCount: conversation.messageCount,
        lastActivity: conversation.lastActivity,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    });
  } catch (error) {
    logger.error("Get conversation messages error:", error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving conversation messages',
    });
  }
});

export const knowledgebaseController = {
  uploadFile,
  getUserFiles,
  deleteFile,
  deleteKnowledgeBase,
  createKnowledgeBase,
  getUserKnowledgeBases,
  invokeRagSystem,
  chatWithKnowledgeBase,
  getKnowledgeBaseConversations,
  getConversationMessages,
};