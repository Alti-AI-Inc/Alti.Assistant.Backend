import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { RAGSystem } from 'rag-system-pgvector';
import { knowledgebaseService } from './knowledgebase.service.js';
import UserUsageModel from '../usage/userUsage.model.js';
import path from 'path';
import Conversation from '../conversations/conversation.model.js';
import { decryptConversation } from '../conversations/conversation.helpers.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * @openapi
 * /knowledgebase/upload:
 *   post:
 *     summary: Upload files to the knowledge base
 *     description: Uploads one or multiple files, processes them for the RAG system, and updates the user's storage usage.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               knowledgebotId:
 *                 type: string
 *                 description: Optional ID of the knowledge bot to associate the files with
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: Files uploaded and processed successfully
 *       207:
 *         description: Multi-status, some files succeeded and some failed
 *       400:
 *         description: No files provided or bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * Uploads files to the knowledge base, processes them, and tracks storage usage.
 * Supports multi-tenant context via `req.currentTenantId`.
 * 
 * @function uploadFile
 * @param {import('express').Request} req - Express request object containing files, body, user, and tenant context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
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

  try {
    const tenantId = req.currentTenantId ?? null;
    const results = await Promise.allSettled(
      req.files.map(async (uploadedFile) => {
        const fileExtension = path
          .extname(uploadedFile.originalname)
          .toLowerCase()
          .substring(1);
          
        logger.info(
          `File upload attempted by user: ${userId}, file: ${uploadedFile.originalname}, type: ${fileExtension}, size: ${uploadedFile.size} bytes`
        );
        
        const response = await knowledgebaseService.processUploadedFile(
          uploadedFile,
          knowledgebotId,
          userId,
          req
        );

        // Track storage usage
        await UserUsageModel.updateStorage(
          userId,
          tenantId,
          uploadedFile.size
        ).catch((err) =>
          logger.error('[Knowledgebase] Storage increment error:', err)
        );

        // Increment metered knowledge storage usage
        if (!isGuest) {
          try {
            const subscriptionService = (await import('../subscription/subscription.service.js')).default;
            subscriptionService.trackAndIncrementMonthlyUsage(userId, tenantId, 'knowledge', uploadedFile.size).catch((err) => {
              logger.error('[Knowledgebase] Failed to increment monthly usage for knowledge:', err);
            });
          } catch (err) {
            logger.error('Failed to increment knowledge usage:', err);
          }
        }

        return response;
      })
    );

    const successfulUploads = results
      .filter((r) => r.status === 'fulfilled')
      .map((r) => r.value);
    
    const failedUploads = results
      .filter((r) => r.status === 'rejected')
      .map((r) => r.reason.message);

    sendResponse(res, {
      statusCode: failedUploads.length === 0 ? httpStatus.OK : httpStatus.MULTI_STATUS,
      success: successfulUploads.length > 0,
      message: `Successfully uploaded ${successfulUploads.length} files. ${failedUploads.length > 0 ? failedUploads.length + ' failed.' : ''}`,
      data: successfulUploads,
    });
  } catch (error) {
    logger.error('File upload error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while uploading the files',
    });
  }
});

/**
 * @openapi
 * /knowledgebase/{knowledgebaseId}:
 *   delete:
 *     summary: Delete a knowledge base
 *     description: Deletes a specific knowledge base belonging to the authenticated user.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgebaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the knowledge base to delete
 *     responses:
 *       200:
 *         description: Knowledge base deleted successfully
 *       400:
 *         description: Knowledge base ID is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Knowledge base not found or could not be deleted
 *       500:
 *         description: Internal server error
 */

/**
 * Deletes a specific knowledge base.
 * Requires user authentication.
 * 
 * @function deleteKnowledgeBase
 * @param {import('express').Request} req - Express request object containing params and user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const deleteKnowledgeBase = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        'Knowledge base deletion is only available for authenticated users',
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
    const result = await knowledgebaseService.deleteKnowledgeBase(
      knowledgebaseId,
      userId,
      req
    );
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
    logger.error('Delete knowledge base error:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while deleting the knowledge base',
    });
  }
});

/**
 * @openapi
 * /knowledgebase/files:
 *   get:
 *     summary: Get user's uploaded files
 *     description: Retrieves a list of files uploaded by the authenticated user, optionally filtered by knowledgebotId.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: knowledgebotId
 *         schema:
 *           type: string
 *         description: Optional ID of the knowledge bot to filter files
 *     responses:
 *       200:
 *         description: Files retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * Retrieves files uploaded by the authenticated user.
 * 
 * @function getUserFiles
 * @param {import('express').Request} req - Express request object containing query parameters and user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
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
    // Optimization: If knowledgebaseService.getUserFiles fetches documents for read-only,
    // consider adding .lean() inside the service method for better performance.
    const files = await knowledgebaseService.getUserFiles(
      userId,
      knowledgebotId,
      req
    );

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
    logger.error('Get user files error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving files',
    });
  }
});

/**
 * @openapi
 * /knowledgebase:
 *   post:
 *     summary: Create a new knowledge base
 *     description: Creates a new knowledge base container for the authenticated user.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the knowledge base
 *               description:
 *                 type: string
 *                 description: Optional description of the knowledge base
 *     responses:
 *       201:
 *         description: Knowledge base created successfully
 *       400:
 *         description: Knowledge base name is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * Creates a new knowledge base.
 * 
 * @function createKnowledgeBase
 * @param {import('express').Request} req - Express request object containing body and user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const createKnowledgeBase = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        'Creating knowledge base is only available for authenticated users',
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
    const knowledgeBase = await knowledgebaseService.createKnowledgeBase(
      req.body,
      userId,
      req
    );

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: 'Knowledge base created successfully',
      data: knowledgeBase,
    });
  } catch (error) {
    logger.error('Create knowledge base error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message || 'An error occurred while creating the knowledge base',
    });
  }
});

/**
 * @openapi
 * /knowledgebase:
 *   get:
 *     summary: Get user's knowledge bases
 *     description: Retrieves all knowledge bases belonging to the authenticated user.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Knowledge bases retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

/**
 * Retrieves all knowledge bases belonging to the authenticated user.
 * 
 * @function getUserKnowledgeBases
 * @param {import('express').Request} req - Express request object containing user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const getUserKnowledgeBases = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        'Access to knowledge bases is only available for authenticated users',
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
    // Optimization: If knowledgebaseService.getUserKnowledgeBases fetches documents for read-only,
    // consider adding .lean() inside the service method for better performance.
    const knowledgeBases = await knowledgebaseService.getUserKnowledgeBases(
      userId,
      req
    );

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
    logger.error('Get user knowledge bases error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving knowledge bases',
    });
  }
});

/**
 * @openapi
 * /knowledgebase/invoke-rag:
 *   post:
 *     summary: Invoke the RAG system
 *     description: Directly triggers or tests the RAG system.
 *     tags:
 *       - Knowledge Base
 *     responses:
 *       200:
 *         description: RAG system invoked successfully
 *       500:
 *         description: Internal server error
 */

/**
 * Invokes the RAG system directly.
 * 
 * @function invokeRagSystem
 * @param {import('express').Request} req - Express request object
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const invokeRagSystem = async (req, res) => {
  const response = await knowledgebaseService.invokeRagSystem();
  console.log('RAG Response:', response);
  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'RAG system invoked successfully',
    data: response,
  });
};

/**
 * @openapi
 * /knowledgebase/chat:
 *   post:
 *     summary: Chat with a knowledge base
 *     description: Sends a message to a specific knowledge base and retrieves a RAG-generated answer, managing conversation history.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *               - knowledgebaseId
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's message/query
 *               knowledgebaseId:
 *                 type: string
 *                 description: The ID of the knowledge base to query
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to continue
 *     responses:
 *       200:
 *         description: Chat response generated successfully
 *       400:
 *         description: Message or Knowledge base ID is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Knowledge base or Conversation not found
 *       500:
 *         description: Internal server error
 */

/**
 * Handles chat interactions with a specific knowledge base using RAG.
 * Manages conversation creation, message history, and updates.
 * 
 * @function chatWithKnowledgeBase
 * @param {import('express').Request} req - Express request object containing body and user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const chatWithKnowledgeBase = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        'Chat with knowledge base is only available for authenticated users',
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
    // Optimization: If knowledgebaseService.getKnowledgeBaseById fetches documents for read-only,
    // consider adding .lean() inside the service method for better performance.
    const knowledgeBase = await knowledgebaseService.getKnowledgeBaseById(
      knowledgebaseId,
      userId
    );
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
      // .lean() is not used here because the conversation document is modified and saved later.
      conversation = await Conversation.findByConversationId(
        conversationId,
        userId
      );
      if (
        !conversation ||
        conversation.knowledgebaseId?.toString() !== knowledgebaseId
      ) {
        return sendResponse(res, {
          statusCode: httpStatus.NOT_FOUND,
          success: false,
          message:
            'Conversation not found or does not belong to this knowledge base',
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
    logger.error('Chat with knowledge base error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message || 'An error occurred while processing your message',
    });
  }
});

/**
 * @openapi
 * /knowledgebase/{knowledgebaseId}/conversations:
 *   get:
 *     summary: Get conversations for a knowledge base
 *     description: Retrieves active conversations associated with a specific knowledge base for the authenticated user.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: knowledgebaseId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the knowledge base
 *     responses:
 *       200:
 *         description: Conversations retrieved successfully
 *       400:
 *         description: Knowledge base ID is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Knowledge base not found
 *       500:
 *         description: Internal server error
 */

/**
 * Retrieves active conversations for a specific knowledge base.
 * 
 * @function getKnowledgeBaseConversations
 * @param {import('express').Request} req - Express request object containing params and user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const getKnowledgeBaseConversations = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        'Access to conversations is only available for authenticated users',
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
    // Optimization: If knowledgebaseService.getKnowledgeBaseById fetches documents for read-only,
    // consider adding .lean() inside the service method for better performance.
    const knowledgeBase = await knowledgebaseService.getKnowledgeBaseById(
      knowledgebaseId,
      userId
    );
    if (!knowledgeBase) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Knowledge base not found',
      });
    }

    // Get conversations for this knowledge base
    // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
    // Indexing Recommendation: For optimal performance, consider adding a compound index on the Conversation model:
    // { userId: 1, knowledgebaseId: 1, status: 1, lastActivity: -1 }
    const conversations = await Conversation.find({
      userId: userId,
      knowledgebaseId: knowledgebaseId,
      status: 'active',
    })
      .select(
        'conversationId title lastActivity messageCount createdAt updatedAt metadata'
      )
      .sort({ lastActivity: -1 })
      .limit(50)
      .lean(); // Added .lean()

    const decryptedConversations = conversations.map(decryptConversation);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversations retrieved successfully',
      data: {
        conversations: decryptedConversations,
        totalCount: conversations.length,
        knowledgebaseId: knowledgebaseId,
        knowledgebaseName: knowledgeBase.name,
      },
    });
  } catch (error) {
    logger.error('Get knowledge base conversations error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving conversations',
    });
  }
});

/**
 * @openapi
 * /knowledgebase/files/{fileId}:
 *   delete:
 *     summary: Delete an uploaded file
 *     description: Deletes a specific file from the knowledge base and decrements the user's storage usage.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fileId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the file to delete
 *     responses:
 *       200:
 *         description: File deleted successfully
 *       400:
 *         description: File ID is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: File not found or could not be deleted
 *       500:
 *         description: Internal server error
 */

/**
 * Deletes an uploaded file and decrements the user's storage usage.
 * Supports multi-tenant context via `req.currentTenantId`.
 * 
 * @function deleteFile
 * @param {import('express').Request} req - Express request object containing params, user, and tenant context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
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
    const result = await knowledgebaseService.deleteUserFile(
      fileId,
      userId,
      req
    );
    if (!result) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'File not found or could not be deleted',
      });
    }

    // Decrement storage usage
    const tenantId = req.currentTenantId ?? null;
    await UserUsageModel.updateStorage(
      userId,
      tenantId,
      -(result.fileSize || 0)
    ).catch((err) =>
      logger.error('[Knowledgebase] Storage decrement error:', err)
    );

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'File deleted successfully',
    });
  } catch (error) {
    logger.error('Delete user file error:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while deleting the file',
    });
  }
});

/**
 * @openapi
 * /knowledgebase/conversations/{conversationId}:
 *   get:
 *     summary: Get conversation messages
 *     description: Retrieves all messages and metadata for a specific conversation.
 *     tags:
 *       - Knowledge Base
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conversationId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the conversation
 *     responses:
 *       200:
 *         description: Conversation messages retrieved successfully
 *       400:
 *         description: Conversation ID is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Conversation not found
 *       500:
 *         description: Internal server error
 */

/**
 * Retrieves messages and metadata for a specific conversation.
 * 
 * @function getConversationMessages
 * @param {import('express').Request} req - Express request object containing params and user context
 * @param {import('express').Response} res - Express response object
 * @returns {Promise<void>}
 */
const getConversationMessages = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;

  if (isGuest) {
    return sendResponse(res, {
      statusCode: httpStatus.UNAUTHORIZED,
      success: false,
      message:
        'Access to conversation messages is only available for authenticated users',
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
    // Optimization: Added .lean() for read-only query to return plain JavaScript objects, improving performance.
    // Indexing Recommendation: For optimal performance, consider adding a compound index on the Conversation model:
    // { conversationId: 1, userId: 1 }
    const conversation = await Conversation.findByConversationId(
      conversationId,
      userId
    ).populate('knowledgebaseId', 'name description').lean(); // Added .lean()

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    const decryptedConv = decryptConversation(conversation);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Conversation messages retrieved successfully',
      data: {
        conversationId: decryptedConv.conversationId,
        title: decryptedConv.title,
        knowledgebaseId: decryptedConv.knowledgebaseId?._id,
        knowledgebaseName: decryptedConv.knowledgebaseId?.name,
        messages: decryptedConv.messages,
        messageCount: decryptedConv.messageCount,
        lastActivity: decryptedConv.lastActivity,
        createdAt: decryptedConv.createdAt,
        updatedAt: decryptedConv.updatedAt,
      },
    });
  } catch (error) {
    logger.error('Get conversation messages error:', error);

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An error occurred while retrieving conversation messages',
    });
  }
});

/**
 * Controller object containing all knowledge base route handlers.
 * @type {Object}
 * @property {Function} uploadFile - Upload files to knowledge base
 * @property {Function} getUserFiles - Get user's uploaded files
 * @property {Function} deleteFile - Delete an uploaded file
 * @property {Function} deleteKnowledgeBase - Delete a knowledge base
 * @property {Function} createKnowledgeBase - Create a new knowledge base
 * @property {Function} getUserKnowledgeBases - Get user's knowledge bases
 * @property {Function} invokeRagSystem - Invoke the RAG system directly
 * @property {Function} chatWithKnowledgeBase - Chat with a knowledge base
 * @property {Function} getKnowledgeBaseConversations - Get conversations for a knowledge base
 * @property {Function} getConversationMessages - Get messages for a conversation
 */
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