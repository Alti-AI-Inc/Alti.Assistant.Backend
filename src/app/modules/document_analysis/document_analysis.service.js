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

/**
 * Generate unique guest user ID
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique conversation ID
 */
const generateConversationId = () => {
  return `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Add a message to a conversation
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
 * Handle document analysis conversation (create or retrieve)
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
        logger.warn(
          `Conversation ${conversationId} not found, creating new one`
        );
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      RESPONSE_MESSAGES.CONVERSATION_ERROR
    );
  }
};

/**
 * Main analysis service - processes text or file content
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
    let contentToAnalyze = '';
    if (fileContent && message) {
      // Both file and message provided
      contentToAnalyze = fileContent;
    } else if (fileContent) {
      // Only file provided
      contentToAnalyze = fileContent;
    } else {
      // Only message provided
      contentToAnalyze = message;
    }

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
 * Get conversation history
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

export const documentAnalysisService = {
  analyzeContent,
  getConversationHistory,
  generateGuestUserId,
  generateConversationId,
};