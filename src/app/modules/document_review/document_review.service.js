import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { fileProcessor } from './services/fileProcessor.js';
import {
  DOCUMENT_REVIEW_CONFIG,
  REVIEW_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
} from './document_review.constant.js';
import Conversation from '../conversations/conversation.model.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

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
  return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle document review conversation (create or retrieve)
 */
const handleDocumentReviewConversation = async (userId, conversationId, userMessage, isGuest = false, req = null) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId, req);
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found, creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Document Review: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            uploadedFiles: [],
          },
        },
        newConversationId,
        req
      );

      logger.info(`Created new document review conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling document review conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}, isGuest = false, req = null) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(conversationId, userId, message, req);
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Update conversation metadata
 */
const updateConversationMetadata = async (conversationId, userId, params, req = null) => {
  try {
    await conversationService.updateConversationMetadata(conversationId, userId, {
      collectedParams: params,
    }, req);
  } catch (error) {
    logger.warn('Error updating conversation metadata:', error);
  }
};

/**
 * Store uploaded document in conversation metadata with text extraction and GCS upload
 */
const storeDocumentInConversation = async (conversationId, userId, fileInfo, req = null) => {
  try {
    logger.info('Storing document in conversation', {
      conversationId,
      filename: fileInfo.originalName,
      size: fileInfo.size
    });

    // 1. Extract text from document
    const extractedText = await fileProcessor.extractTextFromFile(fileInfo);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Unable to extract text from the document');
    }

    // 2. Upload to GCS and get public URL (with metadata)
    const uploadResult = await fileProcessor.uploadToGCS(fileInfo.path, fileInfo.filename, {
      userId: userId,
      originalName: fileInfo.originalName,
      documentType: 'review'
    });

    // 3. Create document data object
    const documentData = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalName,
      filename: fileInfo.filename,
      publicUrl: uploadResult.publicUrl || uploadResult.localPath,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
      extractedText: extractedText.length <= DOCUMENT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE
        ? extractedText
        : extractedText.substring(0, DOCUMENT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE),
      textLength: extractedText.length,
      textTruncated: extractedText.length > DOCUMENT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
      extractedAt: new Date()
    };

    // 4. Update conversation metadata
    const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

    if (!conversation.metadata.documents) {
      conversation.metadata.documents = [];
    }

    console.log('Existing Documents in Metadata:', conversation.metadata.documents, conversationId);

    conversation.metadata.documents.push(documentData);
    conversation.metadata.currentDocumentId = documentData.id;
    console.log('Updated Documents in Metadata:', conversation.metadata);
    await Conversation.updateOne({ conversationId }, {
      $set: {
        documents_metadata: {
          documents: conversation.metadata.documents,
          currentDocumentId: documentData.id
        }
      }
    })

    logger.info('Document stored successfully in conversation', {
      documentId: documentData.id,
      textLength: documentData.textLength,
      textTruncated: documentData.textTruncated,
      publicUrl: documentData.publicUrl,
      storageType: documentData.storageType
    });

    // 5. Cleanup temporary local file
    await fileProcessor.cleanupFile(fileInfo.path);

    return documentData;
  } catch (error) {
    logger.error('Error storing document in conversation:', error);
    // Try to cleanup file even if upload failed
    try {
      await fileProcessor.cleanupFile(fileInfo.path);
    } catch (cleanupError) {
      logger.warn('Failed to cleanup file after error:', cleanupError);
    }
    throw error;
  }
};

/**
 * Process document and perform review using cached document data
 */
const performDocumentReview = async (documentData, reviewParams, conversationHistory = []) => {
  try {
    logger.info('Starting document review', {
      filename: documentData.originalName,
      reviewType: reviewParams.reviewType,
      reviewDepth: reviewParams.reviewDepth,
      usingCachedText: true,
      textLength: documentData.textLength
    });

    // Use cached extracted text
    const documentContent = documentData.extractedText;

    if (!documentContent || documentContent.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Document has no extractable text content');
    }

    // Log if text was truncated
    if (documentData.textTruncated) {
      logger.warn('Document text was truncated for caching', {
        originalLength: documentData.textLength,
        cachedLength: documentContent.length
      });
    }

    // Determine review intent and system prompt
    const reviewType = reviewParams.reviewType || REVIEW_INTENTS.GENERAL_REVIEW;
    const systemPrompt = SYSTEM_PROMPTS[reviewType] || SYSTEM_PROMPTS[REVIEW_INTENTS.GENERAL_REVIEW];

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5);
      contextPrompt = '\n\nPrevious conversation context:\n' +
        recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    // Build review instructions
    const reviewInstructions = buildReviewInstructions(reviewParams);

    // Create comprehensive prompt
    const fullPrompt = `${systemPrompt}

${reviewInstructions}

Document Information:
- Filename: ${documentData.originalName}
- Type: ${reviewParams.documentType || 'general'}
- Review Depth: ${reviewParams.reviewDepth || 'standard'}

${contextPrompt}

Document Content:
${documentContent}

Please provide a detailed review based on the instructions above.`;

    // Generate review using Gemini
    const model = genAI.getGenerativeModel({
      model: DOCUMENT_REVIEW_CONFIG.MODEL,
      generationConfig: {
        temperature: DOCUMENT_REVIEW_CONFIG.TEMPERATURE,
        maxOutputTokens: DOCUMENT_REVIEW_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const reviewText = response.text();

    logger.info('Document review completed', {
      filename: documentData.originalName,
      reviewLength: reviewText.length,
    });

    return {
      success: true,
      review: reviewText,
      documentInfo: {
        filename: documentData.originalName,
        size: documentData.size,
        contentLength: documentData.textLength,
        publicUrl: documentData.publicUrl,
        documentId: documentData.id
      },
      reviewParams,
    };
  } catch (error) {
    logger.error('Error performing document review:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to review document: ${error.message}`
    );
  }
};

/**
 * Build review instructions based on parameters
 */
const buildReviewInstructions = (params) => {
  let instructions = '';

  if (params.aspects && params.aspects.length > 0) {
    instructions += `\nFocus on these aspects: ${params.aspects.join(', ')}`;
  }

  if (params.additionalInstructions) {
    instructions += `\n\nAdditional instructions: ${params.additionalInstructions}`;
  }

  const depthInstructions = {
    quick: 'Provide a brief overview of the main issues and strengths.',
    standard: 'Provide a balanced review covering main issues and suggestions.',
    detailed: 'Provide an in-depth analysis with specific examples and detailed suggestions.',
    comprehensive: 'Provide the most thorough analysis possible, covering all aspects in detail with extensive examples and actionable recommendations.',
  };

  instructions += `\n\nReview depth: ${depthInstructions[params.reviewDepth] || depthInstructions.standard}`;

  return instructions;
};

/**
 * Main conversational handler - processes user messages intelligently
 */
const processConversationalRequest = async (userId, userMessage, conversationId, fileInfo = null, isGuest = false) => {
  try {
    logger.info('Processing conversational request for user:', userId);

    // Handle or create conversation
    const conversation = await handleDocumentReviewConversation(
      userId,
      conversationId,
      userMessage,
      isGuest
    );
    const actualConversationId = conversation.conversationId;

    // Get conversation history for context
    const conversationHistory = conversation.messages || [];
    const recentHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Get existing parameters from metadata
    const existingParams = conversation.metadata?.collectedParams || {};

    // Add user message
    await addMessage(actualConversationId, userId, 'user', userMessage, {
      hasFile: !!fileInfo,
    }, isGuest);

    // If a file is uploaded, store it with text extraction and GCS upload
    let newDocumentData = null;
    if (fileInfo) {
      newDocumentData = await storeDocumentInConversation(actualConversationId, userId, fileInfo);
      logger.info('New document uploaded and stored', {
        documentId: newDocumentData.id,
        filename: newDocumentData.originalName
      });
    }

    // Retrieve current document from metadata (not from fileInfo)
    const currentDocumentId = conversation.documents_metadata?.currentDocumentId;
    console.log('Current Document ID:', currentDocumentId);
    console.log('Conversation Metadata:', conversation.documents_metadata);
    let documentData = null;

    if (newDocumentData) {
      // Use newly uploaded document
      documentData = newDocumentData;
    } else if (currentDocumentId && conversation.documents_metadata?.documents) {
      // Retrieve from cached documents
      documentData = conversation.documents_metadata.documents.find(doc => doc.id === currentDocumentId);

      if (documentData) {
        logger.info('Using cached document from conversation', {
          documentId: documentData.id,
          filename: documentData.originalName,
          cachedTextLength: documentData.extractedText?.length
        });
      }
    }

    // // If no document is available, ask for one
    // if (!documentData) {
    //   const responseMessage = RESPONSE_MESSAGES.FILE_REQUIRED;
    //   await addMessage(actualConversationId, userId, 'assistant', responseMessage, {}, isGuest);

    //   return {
    //     success: true,
    //     conversationId: actualConversationId,
    //     response: responseMessage,
    //     needsFile: true,
    //     needsMoreInfo: false,
    //   };
    // }

    // Analyze intent and extract parameters
    const analysis = await conversationAnalyzer.analyzeIntent(
      userMessage,
      recentHistory,
      existingParams
    );

    logger.info('Intent analysis:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      parameters: analysis.parameters,
    });
    const updatedConversation = await conversationHelpers.getConversationById(actualConversationId, userId, req);
    console.log('Updated Conversation Metadata:', updatedConversation.metadata);
    // Merge parameters
    const updatedParams = {
      ...updatedConversation.metadata,
      ...DEFAULT_PARAMS,
      ...existingParams,
      ...analysis.parameters
    };
    console.log('Updated Params:', updatedParams);

    // Update metadata with collected parameters
    await updateConversationMetadata(actualConversationId, userId, updatedParams, req);

    // Perform document review using cached document data
    const reviewResult = await performDocumentReview(
      documentData,  // Contains extractedText already
      updatedParams,
      recentHistory
    );

    // Add assistant response
    await addMessage(
      actualConversationId,
      userId,
      'assistant',
      reviewResult.review,
      {
        reviewParams: updatedParams,
        documentInfo: reviewResult.documentInfo,
      },
      isGuest
    );

    return {
      success: true,
      conversationId: actualConversationId,
      response: reviewResult.review,
      documentInfo: reviewResult.documentInfo,
      reviewParams: updatedParams,
      needsFile: false,
      needsMoreInfo: false,
    };
  } catch (error) {
    logger.error('Error in conversational request:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to process request'
    );
  }
};

/**
 * Direct review endpoint (non-conversational)
 */
const reviewDocument = async (fileInfo, reviewParams, userId, isGuest = false, req = null) => {
  try {
    logger.info('Direct document review request', {
      filename: fileInfo.originalName,
      userId,
    });

    // Merge with defaults
    const params = { ...DEFAULT_PARAMS, ...reviewParams };

    // Perform review
    const reviewResult = await performDocumentReview(fileInfo, params);

    return reviewResult;
  } catch (error) {
    logger.error('Error in direct document review:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to review document'
    );
  }
};

export const documentReviewService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  reviewDocument,
};
