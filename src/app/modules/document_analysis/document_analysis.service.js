import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { fileProcessor } from './services/fileProcessor.js';
import { textAnalyzer } from './services/textAnalyzer.js';
import {
  DOCUMENT_ANALYSIS_CONFIG,
  ANALYSIS_TYPES,
  OUTPUT_FORMATS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  RESPONSE_MESSAGES,
  DEFAULT_PARAMS,
} from './document_analysis.constant.js';

// Database Optimization Recommendation:
// For the 'Conversation' schema (used by conversationService and conversationHelpers),
// consider adding indexes for frequently queried fields to improve performance.
// - A compound index on `{ conversationId: 1, userId: 1 }` would be highly beneficial
//   for lookups like `getConversationById` which often filter by both.
// - An individual index on `{ userId: 1 }` could also be useful for queries
//   that fetch all conversations for a specific user.
// - An index on `{ 'metadata.category': 1 }` might be useful if filtering conversations
//   by category is a common operation.

/**
 * Generates a unique guest user ID using Mongoose's ObjectId.
 * This ID can be used for unauthenticated users to track their analysis sessions.
 *
 * @returns {string} A unique guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for document analysis sessions.
 * The ID is a combination of a timestamp and a random string to ensure uniqueness.
 *
 * @returns {string} A unique conversation ID string.
 */
const generateConversationId = () => {
  return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Adds a new message (either from the user or the assistant) to an existing conversation.
 * This function interacts with the `conversationService` to persist the message.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user' | 'assistant'} role - The role of the message sender ('user' or 'assistant').
 * @param {string} content - The actual content of the message.
 * @param {object} [metadata={}] - Optional metadata associated with the message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object | null} [req=null] - Optional Express request object, potentially for context or logging.
 * @returns {Promise<object>} The updated conversation object after adding the message.
 */
const addMessage = async (
  conversationId,
  userId,
  role,
  content,
  metadata = {},
  isGuest = false,
  req = null
) => {
  const message = {
    role,
    content,
    metadata,
  };

  return await conversationService.addMessageToConversation(
    conversationId,
    userId,
    message,
    req
  );
};

/**
 * Handles the creation or retrieval of a document analysis conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no `conversationId` is provided or the existing one is not found, a new conversation is created.
 *
 * @param {string} userId - The ID of the user initiating the analysis.
 * @param {string | null} conversationId - The ID of an existing conversation, or `null` to create a new one.
 * @param {string} userMessage - The initial user message or prompt for the analysis, used for the conversation title.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object | null} [req=null] - Optional Express request object.
 * @returns {Promise<object>} The conversation object (either newly created or retrieved).
 * @throws {ApiError} If there's an internal server error during conversation handling.
 */
const handleAnalysisConversation = async (
  userId,
  conversationId,
  userMessage,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        // Optimization Recommendation:
        // For read-heavy operations where the Mongoose document is not directly modified and saved
        // within this function, consider adding .lean() to the query in conversationHelpers.getConversationById.
        // This converts the Mongoose document to a plain JavaScript object, improving performance
        // by skipping Mongoose's hydration overhead.
        // Example: `Conversation.findById(id).lean()` in conversationHelpers.getConversationById.
        // This is suitable here because any updates to the conversation are handled by
        // conversationService.updateConversationMetadata, which likely performs its own database operation.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        );
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        // BUG FIX: Only create a new conversation if the existing one is explicitly not found (404).
        // Other errors (e.g., database connection issues, permission errors) should be re-thrown.
        if (error instanceof ApiError && error.statusCode === httpStatus.NOT_FOUND) {
          logger.warn(
            `Conversation ${conversationId} not found for user ${userId}, creating new one`
          );
          // 'conversation' remains undefined, allowing the next 'if (!conversation)' block to execute.
        } else {
          logger.error(`Error fetching conversation ${conversationId} for user ${userId}:`, error);
          // Re-throw the error to prevent silent failure or incorrect new conversation creation.
          throw error;
        }
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Document Analysis: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            uploadedFiles: [],
          },
        },
        newConversationId,
        req
      );

      logger.info(
        `Created new analysis conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling analysis conversation:', error);
    // Re-throw ApiError directly, wrap other errors in a generic ApiError
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      RESPONSE_MESSAGES.CONVERSATION_ERROR
    );
  }
};

/**
 * The main service function for processing text or file content, performing analysis,
 * and managing the conversation flow. It handles file validation, content extraction,
 * conversation creation/retrieval, AI analysis (with or without context), and
 * saving messages and metadata to the conversation.
 *
 * @param {string} userId - The ID of the user performing the analysis.
 * @param {string | null} message - The user's text message for analysis. Can be `null` if `fileInfo` is provided.
 * @param {object | null} fileInfo - Information about an uploaded file, if any.
 *   - `fileInfo.path` {string} The temporary path where the file is stored.
 *   - `fileInfo.originalname` {string} The original name of the uploaded file.
 *   - `fileInfo.filename` {string} The unique filename assigned to the uploaded file.
 * @param {string | null} conversationId - The ID of an existing conversation, or `null` to start a new one.
 * @param {string} analysisType - The type of analysis to perform (e.g., 'summary', 'keywords').
 * @param {string} outputFormat - The desired output format for the analysis (e.g., 'text', 'json').
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object | null} [req=null] - Optional Express request object.
 * @returns {Promise<object>} An object containing the analysis result, conversation ID, and metadata.
 * @returns {boolean} return.success - Always `true` if the analysis was successful.
 * @returns {string} return.conversationId - The ID of the conversation where the analysis took place.
 * @returns {string} return.analysis - The actual analysis result from the AI.
 * @returns {string} [return.userId] - (Only for guest users) The ID of the guest user.
 * @returns {object} return.metadata - Additional metadata about the analysis.
 * @returns {string} return.metadata.analysisType - The type of analysis performed.
 * @returns {string} return.metadata.outputFormat - The format of the analysis output.
 * @returns {string} return.metadata.model - The AI model used for analysis.
 * @returns {boolean} return.metadata.fileProcessed - `true` if a file was processed, `false` otherwise.
 * @returns {string | null} return.metadata.fileName - The original name of the processed file, if any.
 * @throws {ApiError} If no content is provided, file validation fails, file processing fails, or analysis fails.
 */
const analyzeContent = async (
  userId,
  message,
  fileInfo,
  conversationId,
  analysisType,
  outputFormat,
  isGuest = false,
  req = null
) => {
  try {
    // Set defaults
    const finalAnalysisType = analysisType || DEFAULT_PARAMS.analysisType;
    const finalOutputFormat = outputFormat || DEFAULT_PARAMS.outputFormat;

    // Validate that we have content to analyze
    if (!message && !fileInfo) {
      throw new ApiError(httpStatus.BAD_REQUEST, RESPONSE_MESSAGES.NO_CONTENT);
    }

    // Validate file if provided
    if (fileInfo) {
      const validation = fileProcessor.validateFile(
        fileInfo,
        DOCUMENT_ANALYSIS_CONFIG.MAX_FILE_SIZE
      );
      if (!validation.valid) {
        throw new ApiError(httpStatus.BAD_REQUEST, validation.error);
      }
    }

    // Extract content from file if provided
    let fileContent = '';
    let fileName = null;
    if (fileInfo) {
      try {
        logger.info(`Processing file: ${fileInfo.originalname}`);
        fileContent = await fileProcessor.processFile({
          path: fileInfo.path,
          originalName: fileInfo.originalname,
          filename: fileInfo.filename,
        });
        fileName = fileInfo.originalname;
        logger.info(`Extracted ${fileContent.length} characters from file`);
      } catch (error) {
        logger.error('File processing error:', error);
        throw new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          `${RESPONSE_MESSAGES.PROCESSING_ERROR}: ${error.message}`
        );
      }
    }

    // Combine file content and message
    // Optimization: Simplified contentToAnalyze assignment.
    const contentToAnalyze = fileContent || message;

    // Handle conversation
    const displayMessage =
      message || `Analyze this document: ${fileName || 'uploaded file'}`;
    const conversation = await handleAnalysisConversation(
      userId,
      conversationId,
      displayMessage,
      isGuest,
      req
    );

    // Get conversation history for context
    // If 'conversation' was returned as a lean object from handleAnalysisConversation,
    // 'conversation.messages' will be a plain array, which is efficient.
    const conversationHistory = conversation.messages || [];

    // Perform analysis
    let analysisResult;
    try {
      if (conversationHistory.length > 0) {
        // Use contextual analysis if there's conversation history
        analysisResult = await textAnalyzer.analyzeWithContext(
          contentToAnalyze,
          conversationHistory,
          finalAnalysisType,
          finalOutputFormat,
          message
        );
      } else {
        // First message - simple analysis
        analysisResult = await textAnalyzer.analyzeWithGemini(
          contentToAnalyze,
          finalAnalysisType,
          finalOutputFormat,
          message
        );
      }
    } catch (error) {
      logger.error('Analysis error:', error);
      throw new ApiError(
        httpStatus.INTERNAL_SERVER_ERROR,
        `${RESPONSE_MESSAGES.ANALYSIS_ERROR}: ${error.message}`
      );
    }

    // Save user message and AI response to conversation
    await addMessage(
      conversation.conversationId,
      userId,
      'user',
      displayMessage,
      {
        hasFile: !!fileInfo,
        fileName: fileName,
        analysisType: finalAnalysisType,
        outputFormat: finalOutputFormat,
      },
      isGuest,
      req
    );

    await addMessage(
      conversation.conversationId,
      userId,
      'assistant',
      analysisResult.analysis,
      {
        model: CONVERSATION_MODEL,
        ...analysisResult.metadata,
      },
      isGuest,
      req
    );

    // Update conversation metadata with file info if applicable
    if (fileInfo) {
      // Ensure metadata is treated as a plain object for updates.
      // If 'conversation' was a lean object, 'conversation.metadata' is already a plain object.
      // If 'conversation' was a Mongoose document (e.g., if newly created),
      // 'conversation.metadata' is a subdocument. Spreading it ensures we pass a plain object.
      const currentMetadata = conversation.metadata ? { ...conversation.metadata } : {};
      // Create a new plain array for uploadedFiles to avoid modifying a Mongoose array directly
      const uploadedFiles = currentMetadata.uploadedFiles ? [...currentMetadata.uploadedFiles] : [];
      uploadedFiles.push({
        filename: fileInfo.filename,
        originalName: fileInfo.originalname,
        uploadedAt: new Date(),
      });

      await conversationService.updateConversationMetadata(
        conversation.conversationId,
        userId,
        {
          ...currentMetadata, // Spread the (now plain) current metadata
          uploadedFiles,
        },
        req
      );
    }

    logger.info(
      `Analysis completed for conversation ${conversation.conversationId}`
    );

    return {
      success: true,
      conversationId: conversation.conversationId,
      analysis: analysisResult.analysis,
      ...(isGuest && { userId }), // Include userId for guest users
      metadata: {
        analysisType: finalAnalysisType,
        outputFormat: finalOutputFormat,
        model: CONVERSATION_MODEL,
        fileProcessed: !!fileInfo,
        fileName: fileName,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Unexpected error in analyzeContent:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'An unexpected error occurred during analysis'
    );
  }
};

/**
 * Retrieves the complete history of a specific conversation, including its title, messages, and metadata.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {object | null} [req=null] - Optional Express request object.
 * @returns {Promise<object>} An object containing the conversation details and messages.
 * @returns {string} return.conversationId - The ID of the conversation.
 * @returns {string} return.title - The title of the conversation.
 * @returns {Array<object>} return.messages - An array of message objects in the conversation.
 * @returns {object} return.metadata - Additional metadata associated with the conversation.
 * @returns {Date} return.createdAt - The creation timestamp of the conversation.
 * @returns {Date} return.updatedAt - The last update timestamp of the conversation.
 * @throws {ApiError} If the conversation is not found or an internal server error occurs.
 */
const getConversationHistory = async (conversationId, userId, req = null) => {
  try {
    // Optimization Recommendation:
    // For read-only operations like fetching conversation history, adding .lean()
    // to the Mongoose query in conversationHelpers.getConversationById is highly recommended.
    // This reduces memory footprint and improves query speed by returning a plain JavaScript object
    // instead of a full Mongoose document.
    // Example: `Conversation.findById(conversationId).lean()` in conversationHelpers.getConversationById.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    // If conversation was a lean object, these properties are already plain JS values.
    // If it was a Mongoose document, accessing them here triggers getters, which is less efficient
    // than having a lean object from the start.
    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      messages: conversation.messages,
      metadata: conversation.metadata,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error fetching conversation history:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to fetch conversation history'
    );
  }
};

/**
 * @typedef {object} DocumentAnalysisService
 * @property {function(string, string | null, object | null, string | null, string, string, boolean, object | null): Promise<object>} analyzeContent - Main service function to analyze content.
 * @property {function(string, string, object | null): Promise<object>} getConversationHistory - Retrieves the history of a specific conversation.
 * @property {function(): string} generateGuestUserId - Generates a unique ID for guest users.
 * @property {function(): string} generateConversationId - Generates a unique ID for new conversations.
 */

/**
 * Provides a collection of services related to document analysis and conversation management.
 * This includes functions for content analysis, conversation history retrieval, and ID generation.
 *
 * @type {DocumentAnalysisService}
 */
export const documentAnalysisService = {
  analyzeContent,
  getConversationHistory,
  generateGuestUserId,
  generateConversationId,
};