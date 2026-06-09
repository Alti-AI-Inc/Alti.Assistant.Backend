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
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} userMessage
 * @param {boolean} isGuest
 * @param {object} req
 * @returns {Promise<object>} The conversation document.
 */
const handleDocumentReviewConversation = async (
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
        // This fetch is to check for existence and get initial conversation data.
        // It returns a full Mongoose document as it might be used for further operations
        // or passed to services that expect a Mongoose document.
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
          title: `Document Review: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            // 'uploadedFiles' field seems unused or redundant with 'documents_metadata.documents'
            // Consider removing if not actively used.
            uploadedFiles: [],
          },
        },
        newConversationId,
        req
      );

      logger.info(
        `Created new document review conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling document review conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Add message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} role
 * @param {string} content
 * @param {object} metadata
 * @param {boolean} isGuest
 * @param {object} req
 * @returns {Promise<object>} The updated conversation document.
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
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      message,
      req
    );
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add message'
    );
  }
};

/**
 * Update conversation metadata
 * @param {string} conversationId
 * @param {string} userId
 * @param {object} params
 * @param {object} req
 * @returns {Promise<void>}
 */
const updateConversationMetadata = async (
  conversationId,
  userId,
  params,
  req = null
) => {
  try {
    await conversationService.updateConversationMetadata(
      conversationId,
      userId,
      {
        collectedParams: params,
      },
      req
    );
  } catch (error) {
    logger.warn('Error updating conversation metadata:', error);
  }
};

/**
 * Store uploaded document in conversation metadata with text extraction and GCS upload
 * @param {string} conversationId
 * @param {string} userId
 * @param {object} fileInfo
 * @param {object} req
 * @returns {Promise<object>} The document data stored.
 */
const storeDocumentInConversation = async (
  conversationId,
  userId,
  fileInfo,
  req = null
) => {
  try {
    logger.info('Storing document in conversation', {
      conversationId,
      filename: fileInfo.originalName,
      size: fileInfo.size,
    });

    // 1. Extract text from document
    const extractedText = await fileProcessor.extractTextFromFile(fileInfo);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Unable to extract text from the document'
      );
    }

    // 2. Upload to GCS and get public URL (with metadata)
    const uploadResult = await fileProcessor.uploadToGCS(
      fileInfo.path,
      fileInfo.filename,
      {
        userId: userId,
        originalName: fileInfo.originalName,
        documentType: 'review',
      }
    );

    // 3. Create document data object
    const documentData = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalName,
      filename: fileInfo.filename,
      publicUrl: uploadResult.publicUrl || uploadResult.localPath,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
      extractedText:
        extractedText.length <= DOCUMENT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE
          ? extractedText
          : extractedText.substring(
              0,
              DOCUMENT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE
            ),
      textLength: extractedText.length,
      textTruncated:
        extractedText.length > DOCUMENT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
      extractedAt: new Date(),
    };

    // 4. Update conversation documents_metadata
    // Fetch the conversation document. This must be a full Mongoose document
    // because we are modifying its subdocuments/fields in memory before saving.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    // Ensure documents_metadata and documents array exist.
    // Corrected to update 'documents_metadata' directly, aligning with the original 'updateOne' intent.
    if (!conversation.documents_metadata) {
      conversation.documents_metadata = {};
    }
    if (!conversation.documents_metadata.documents) {
      conversation.documents_metadata.documents = [];
    }

    console.log(
      'Existing Documents in Metadata:',
      conversation.documents_metadata.documents, // Corrected access path
      conversationId
    );

    conversation.documents_metadata.documents.push(documentData);
    conversation.documents_metadata.currentDocumentId = documentData.id;
    console.log('Updated Documents in Metadata:', conversation.documents_metadata); // Corrected access path

    // Optimization: Instead of using Conversation.updateOne with $set,
    // which replaces the entire documents_metadata object,
    // use conversation.save() to persist changes made to the Mongoose document in memory.
    // This is more idiomatic and often more efficient when working with fetched Mongoose documents.
    await conversation.save();

    logger.info('Document stored successfully in conversation', {
      documentId: documentData.id,
      textLength: documentData.textLength,
      textTruncated: documentData.textTruncated,
      publicUrl: documentData.publicUrl,
      storageType: documentData.storageType,
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
 * @param {object} documentData
 * @param {object} reviewParams
 * @param {Array<object>} conversationHistory
 * @returns {Promise<object>} Review result.
 */
const performDocumentReview = async (
  documentData,
  reviewParams,
  conversationHistory = []
) => {
  try {
    logger.info('Starting document review', {
      filename: documentData.originalName,
      reviewType: reviewParams.reviewType,
      reviewDepth: reviewParams.reviewDepth,
      usingCachedText: true,
      textLength: documentData.textLength,
    });

    // Use cached extracted text
    const documentContent = documentData.extractedText;

    if (!documentContent || documentContent.trim().length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Document has no extractable text content'
      );
    }

    // Log if text was truncated
    if (documentData.textTruncated) {
      logger.warn('Document text was truncated for caching', {
        originalLength: documentData.textLength,
        cachedLength: documentContent.length,
      });
    }

    // Determine review intent and system prompt
    const reviewType = reviewParams.reviewType || REVIEW_INTENTS.GENERAL_REVIEW;
    const systemPrompt =
      SYSTEM_PROMPTS[reviewType] ||
      SYSTEM_PROMPTS[REVIEW_INTENTS.GENERAL_REVIEW];

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5);
      contextPrompt =
        '\n\nPrevious conversation context:\n' +
        recentMessages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
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
        documentId: documentData.id,
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
 * @param {object} params
 * @returns {string}
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
    detailed:
      'Provide an in-depth analysis with specific examples and detailed suggestions.',
    comprehensive:
      'Provide the most thorough analysis possible, covering all aspects in detail with extensive examples and actionable recommendations.',
  };

  instructions += `\n\nReview depth: ${depthInstructions[params.reviewDepth] || depthInstructions.standard}`;

  return instructions;
};

/**
 * Main conversational handler - processes user messages intelligently
 * @param {string} userId
 * @param {string} userMessage
 * @param {string} conversationId
 * @param {object} fileInfo
 * @param {boolean} isGuest
 * @param {object} req
 * @returns {Promise<object>} Conversational response.
 */
const processConversationalRequest = async (
  userId,
  userMessage,
  conversationId,
  fileInfo = null,
  isGuest = false,
  req = null
) => {
  try {
    logger.info('Processing conversational request for user:', userId);

    // 1. Handle or create conversation (initial fetch/create)
    // This 'conversation' object will become stale after subsequent DB writes.
    let conversation = await handleDocumentReviewConversation(
      userId,
      conversationId,
      userMessage,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId;

    // 2. Add user message to conversation (updates DB)
    await addMessage(
      actualConversationId,
      userId,
      'user',
      userMessage,
      {
        hasFile: !!fileInfo,
      },
      isGuest,
      req
    );

    // 3. If a file is uploaded, store it with text extraction and GCS upload (updates DB)
    let newDocumentData = null;
    if (fileInfo) {
      newDocumentData = await storeDocumentInConversation(
        actualConversationId,
        userId,
        fileInfo,
        req
      );
      logger.info('New document uploaded and stored', {
        documentId: newDocumentData.id,
        filename: newDocumentData.originalName,
      });
    }

    // Optimization: Refetch the conversation here to get the latest state
    // after all previous DB modifications (addMessage, storeDocumentInConversation).
    // This addresses an N+1 query problem by consolidating fetches and ensuring data consistency.
    // We use .lean() because from this point, the conversation object is only read.
    // Assuming conversationHelpers.getConversationById supports a 'lean' option as the fourth argument.
    conversation = await conversationHelpers.getConversationById(
      actualConversationId,
      userId,
      req,
      true // Pass true for lean option to get a plain JavaScript object
    );

    // Now, use the latest 'conversation' object for subsequent logic
    const conversationHistory = conversation.messages || [];
    const recentHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Existing parameters from the latest metadata
    const existingParams = conversation.metadata?.collectedParams || {};

    // Retrieve current document from documents_metadata
    const currentDocumentId =
      conversation.documents_metadata?.currentDocumentId;
    console.log('Current Document ID:', currentDocumentId);
    console.log('Conversation Documents Metadata:', conversation.documents_metadata); // Corrected console log

    let documentData = null;

    if (newDocumentData) {
      // Use newly uploaded document
      documentData = newDocumentData;
    } else if (
      currentDocumentId &&
      conversation.documents_metadata?.documents
    ) {
      // Retrieve from cached documents in the latest conversation object
      documentData = conversation.documents_metadata.documents.find(
        (doc) => doc.id === currentDocumentId
      );

      if (documentData) {
        logger.info('Using cached document from conversation', {
          documentId: documentData.id,
          filename: documentData.originalName,
          cachedTextLength: documentData.extractedText?.length,
        });
      }
    }

    // // If no document is available, ask for one (original commented out block)
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

    // Optimization: Removed redundant fetch of 'updatedConversation'.
    // The 'conversation' object is already up-to-date from the refetch above.

    // Merge parameters using the latest conversation metadata
    const updatedParams = {
      ...conversation.metadata, // Use the latest metadata from the refetched conversation
      ...DEFAULT_PARAMS,
      ...existingParams, // existingParams already derived from the latest metadata
      ...analysis.parameters,
    };
    console.log('Updated Params:', updatedParams);

    // Update metadata with collected parameters (this is a write operation)
    await updateConversationMetadata(
      actualConversationId,
      userId,
      updatedParams,
      req
    );

    // Perform document review using cached document data
    const reviewResult = await performDocumentReview(
      documentData, // Contains extractedText already
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
      isGuest,
      req
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
 * @param {object} fileInfo
 * @param {object} reviewParams
 * @param {string} userId
 * @param {boolean} isGuest
 * @param {object} req
 * @returns {Promise<object>} Review result.
 */
const reviewDocument = async (
  fileInfo,
  reviewParams,
  userId,
  isGuest = false,
  req = null
) => {
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