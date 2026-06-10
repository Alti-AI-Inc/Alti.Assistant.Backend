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

/**
 * @global
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client using the API key from the application configuration.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates a unique guest user ID using a new Mongoose ObjectId.
 * This ID can be used to track guest user sessions without requiring authentication.
 *
 * @returns {string} A unique string representation of a Mongoose ObjectId.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for document review sessions.
 * The ID is prefixed with 'review_' and includes a timestamp and a random alphanumeric string.
 *
 * @returns {string} A unique conversation ID string.
 */
const generateConversationId = () => {
  return `review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of a document review conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no `conversationId` is provided or the existing one is not found, a new conversation is created.
 *
 * @async
 * @param {string} userId - The ID of the user initiating or participating in the conversation.
 * @param {string} [conversationId] - Optional. The ID of an existing conversation to retrieve.
 * @param {string} userMessage - The initial message from the user, used for the conversation title if a new one is created.
 * @param {boolean} [isGuest=false] - Optional. Indicates if the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for request-scoped context or transactions.
 * @returns {Promise<object>} The conversation document (Mongoose document) after creation or retrieval.
 * @throws {ApiError} If there's an internal server error during conversation handling.
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
 * Adds a new message to an existing conversation.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user sending the message.
 * @param {'user'|'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The text content of the message.
 * @param {object} [metadata={}] - Optional. Additional metadata to store with the message.
 * @param {boolean} [isGuest=false] - Optional. Indicates if the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for request-scoped context or transactions.
 * @returns {Promise<object>} The updated conversation document with the new message.
 * @throws {ApiError} If there's an internal server error during message addition.
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
 * Updates the `collectedParams` within the metadata of a specific conversation.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {object} params - An object containing the parameters to be updated or merged into `collectedParams`.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for request-scoped context or transactions.
 * @returns {Promise<void>} A Promise that resolves when the metadata has been updated.
 * @throws {ApiError} If there's an internal server error during metadata update (though caught internally, it could propagate if not).
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
 * Stores an uploaded document's information, extracted text, and GCS upload details
 * within a conversation's `documents_metadata`.
 * This involves extracting text, uploading the file to Google Cloud Storage,
 * and then updating the conversation document in the database.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to associate the document with.
 * @param {string} userId - The ID of the user who uploaded the document.
 * @param {object} fileInfo - An object containing details about the uploaded file.
 * @param {string} fileInfo.path - The temporary local path of the uploaded file.
 * @param {string} fileInfo.filename - The generated unique filename for the stored file.
 * @param {string} fileInfo.originalName - The original name of the file as uploaded by the user.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for request-scoped context or transactions.
 * @returns {Promise<object>} The document data object that was stored in the conversation metadata.
 * @throws {ApiError} If text extraction fails, or if there's an internal server error during storage or GCS upload.
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
 * Performs a document review using the Google Generative AI model based on extracted document content
 * and specified review parameters. It constructs a comprehensive prompt including system instructions,
 * review parameters, conversation context, and the document content.
 *
 * @async
 * @param {object} documentData - An object containing the document's extracted text and metadata.
 * @param {string} documentData.id - Unique ID of the document.
 * @param {string} documentData.originalName - Original filename of the document.
 * @param {string} documentData.filename - Stored filename of the document.
 * @param {string} documentData.publicUrl - Public URL of the document (e.g., GCS URL).
 * @param {string} documentData.gcsPath - GCS path of the document.
 * @param {string} documentData.storageType - Type of storage (e.g., 'gcs').
 * @param {string} documentData.extractedText - The full or truncated extracted text content of the document.
 * @param {number} documentData.textLength - The original length of the extracted text.
 * @param {boolean} documentData.textTruncated - Indicates if the extracted text was truncated for caching.
 * @param {number} documentData.size - Size of the document in bytes.
 * @param {string} documentData.mimetype - MIME type of the document.
 * @param {Date} documentData.uploadedAt - Timestamp when the document was uploaded.
 * @param {Date} documentData.extractedAt - Timestamp when text was extracted.
 * @param {object} reviewParams - Parameters guiding the review process.
 * @param {string} [reviewParams.reviewType='GENERAL_REVIEW'] - The type of review to perform (e.g., 'LEGAL_REVIEW', 'FINANCIAL_REVIEW').
 * @param {string} [reviewParams.reviewDepth='standard'] - The desired depth of the review ('quick', 'standard', 'detailed', 'comprehensive').
 * @param {string[]} [reviewParams.aspects] - Specific aspects to focus on during the review.
 * @param {string} [reviewParams.additionalInstructions] - Any additional free-form instructions for the AI.
 * @param {string} [reviewParams.documentType] - The type of document being reviewed (e.g., 'contract', 'report').
 * @param {Array<object>} [conversationHistory=[]] - An array of recent messages in the conversation, used for context.
 * @param {'user'|'assistant'} conversationHistory[].role - The role of the message sender.
 * @param {string} conversationHistory[].content - The content of the message.
 * @returns {Promise<object>} An object containing the review result.
 * @returns {boolean} return.success - Indicates if the review was successful.
 * @returns {string} return.review - The detailed review text generated by the AI.
 * @returns {object} return.documentInfo - Information about the reviewed document.
 * @returns {string} return.documentInfo.filename - Original filename.
 * @returns {number} return.documentInfo.size - Document size.
 * @returns {number} return.documentInfo.contentLength - Length of the extracted text content.
 * @returns {string} return.documentInfo.publicUrl - Public URL of the document.
 * @returns {string} return.documentInfo.documentId - ID of the document.
 * @returns {object} return.reviewParams - The parameters used for the review.
 * @throws {ApiError} If the document has no extractable text or if the AI generation fails.
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
 * Constructs a string of review instructions based on the provided parameters.
 * This string is then incorporated into the prompt for the AI model.
 *
 * @param {object} params - An object containing various review parameters.
 * @param {string[]} [params.aspects] - An array of strings, each representing an aspect to focus on.
 * @param {string} [params.additionalInstructions] - Any free-form text providing extra instructions.
 * @param {'quick'|'standard'|'detailed'|'comprehensive'} [params.reviewDepth='standard'] - The desired depth of the review.
 * @returns {string} A formatted string containing the review instructions.
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
 * Main conversational handler for document review.
 * This function orchestrates the entire process:
 * 1. Manages conversation creation/retrieval.
 * 2. Adds user messages to the conversation.
 * 3. Stores uploaded documents, extracts text, and uploads to GCS.
 * 4. Refetches the conversation to ensure the latest state.
 * 5. Analyzes user intent and extracts parameters from the message and history.
 * 6. Updates conversation metadata with collected parameters.
 * 7. Performs the document review using the AI model.
 * 8. Adds the AI's review response to the conversation.
 *
 * @async
 * @param {string} userId - The ID of the user making the request.
 * @param {string} userMessage - The message sent by the user.
 * @param {string} [conversationId] - Optional. The ID of the existing conversation. If not provided, a new one is created.
 * @param {object} [fileInfo=null] - Optional. Details about an uploaded file, if any.
 * @param {string} [fileInfo.path] - The temporary local path of the uploaded file.
 * @param {string} [fileInfo.filename] - The generated unique filename for the stored file.
 * @param {string} [fileInfo.originalName] - The original name of the file as uploaded by the user.
 * @param {number} [fileInfo.size] - The size of the file in bytes.
 * @param {string} [fileInfo.mimetype] - The MIME type of the file.
 * @param {boolean} [isGuest=false] - Optional. Indicates if the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for request-scoped context or transactions.
 * @returns {Promise<object>} An object containing the conversational response.
 * @returns {boolean} return.success - Indicates if the request was processed successfully.
 * @returns {string} return.conversationId - The ID of the conversation.
 * @returns {string} return.response - The AI's response message (the document review).
 * @returns {object} return.documentInfo - Information about the reviewed document.
 * @returns {object} return.reviewParams - The parameters used for the review.
 * @returns {boolean} return.needsFile - Indicates if a file is required (currently always false as per logic).
 * @returns {boolean} return.needsMoreInfo - Indicates if more information is needed (currently always false as per logic).
 * @throws {ApiError} If any step in the process fails, such as conversation handling, file processing, or AI review.
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
    // The commented out block for `!documentData` implies that `documentData` is expected to be present at this point.
    // If it's not, the `performDocumentReview` function will likely throw an error.
    // The current logic assumes `documentData` is always available either from `newDocumentData` or cached.
    if (!documentData) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No document available for review. Please upload a document.'
      );
    }

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
 * Provides a direct, non-conversational document review.
 * This function is intended for single-shot review requests where a file is uploaded
 * and review parameters are provided upfront, without ongoing conversation context.
 * It handles text extraction, GCS upload, and then performs the AI review.
 *
 * @async
 * @param {object} fileInfo - An object containing details about the uploaded file.
 * @param {string} fileInfo.path - The temporary local path of the uploaded file.
 * @param {string} fileInfo.filename - The generated unique filename for the stored file.
 * @param {string} fileInfo.originalName - The original name of the file as uploaded by the user.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {object} reviewParams - Parameters guiding the review process.
 * @param {string} [reviewParams.reviewType='GENERAL_REVIEW'] - The type of review to perform.
 * @param {string} [reviewParams.reviewDepth='standard'] - The desired depth of the review.
 * @param {string[]} [reviewParams.aspects] - Specific aspects to focus on.
 * @param {string} [reviewParams.additionalInstructions] - Any additional free-form instructions.
 * @param {string} [reviewParams.documentType] - The type of document being reviewed.
 * @param {string} userId - The ID of the user initiating the review.
 * @param {boolean} [isGuest=false] - Optional. Indicates if the user is a guest. Defaults to `false`.
 * @param {object} [req=null] - Optional. The Express request object, potentially used for request-scoped context or transactions.
 * @returns {Promise<object>} An object containing the review result.
 * @returns {boolean} return.success - Indicates if the review was successful.
 * @returns {string} return.review - The detailed review text generated by the AI.
 * @returns {object} return.documentInfo - Information about the reviewed document.
 * @returns {object} return.reviewParams - The parameters used for the review.
 * @throws {ApiError} If file processing fails or the AI review encounters an error.
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

    // 3. Create document data object similar to `storeDocumentInConversation`
    const documentData = {
      id: `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Generate a temporary ID
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

    // Perform review
    const reviewResult = await performDocumentReview(documentData, params);

    // 4. Cleanup temporary local file
    await fileProcessor.cleanupFile(fileInfo.path);

    return reviewResult;
  } catch (error) {
    logger.error('Error in direct document review:', error);
    // Try to cleanup file even if upload failed
    try {
      if (fileInfo && fileInfo.path) {
        await fileProcessor.cleanupFile(fileInfo.path);
      }
    } catch (cleanupError) {
      logger.warn('Failed to cleanup file after error in direct review:', cleanupError);
    }
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to review document'
    );
  }
};

/**
 * @namespace documentReviewService
 * @description Provides core functionalities for document review, including conversational handling,
 * document storage, AI-powered review, and direct review capabilities.
 */
export const documentReviewService = {
  /**
   * @function generateGuestUserId
   * @memberof documentReviewService
   * @see {@link generateGuestUserId}
   */
  generateGuestUserId,
  /**
   * @function generateConversationId
   * @memberof documentReviewService
   * @see {@link generateConversationId}
   */
  generateConversationId,
  /**
   * @function processConversationalRequest
   * @memberof documentReviewService
   * @see {@link processConversationalRequest}
   */
  processConversationalRequest,
  /**
   * @function reviewDocument
   * @memberof documentReviewService
   * @see {@link reviewDocument}
   */
  reviewDocument,
};