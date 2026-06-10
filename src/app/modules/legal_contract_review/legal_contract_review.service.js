import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { legalContractAnalyzer } from './services/legalContractAnalyzer.js';
import { fileProcessor } from '../document_review/services/fileProcessor.js';
import {
  LEGAL_CONTRACT_REVIEW_CONFIG,
  CONTRACT_REVIEW_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  RISK_LEVELS,
} from './legal_contract_review.constant.js';
import Conversation from '../conversations/conversation.model.js';

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client with the API key.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates a unique guest user ID using MongoDB's ObjectId.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for legal contract review.
 * The ID is prefixed with 'contract_review_' and includes a timestamp and a random string.
 * @returns {string} A unique string representing a conversation ID.
 */
const generateConversationId = () => {
  return `contract_review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of a legal contract review conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no `conversationId` is provided or the existing one is not found, a new conversation is created.
 *
 * @async
 * @param {string} userId - The ID of the user initiating the conversation.
 * @param {string|null} conversationId - The ID of an existing conversation, or null to create a new one.
 * @param {string} userMessage - The initial message from the user, used for the conversation title if new.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} The conversation object (either newly created or retrieved).
 * @throws {ApiError} If there's an internal server error handling the conversation.
 */
const handleLegalContractReviewConversation = async (
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
        // Optimization Recommendation: For read-only operations like this,
        // `conversationHelpers.getConversationById` should ideally use `.lean()`
        // to return a plain JavaScript object, reducing Mongoose overhead.
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
          title: `Legal Contract Review: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            uploadedContracts: [],
          },
          // Optimization Recommendation: Ensure 'contracts_metadata' is initialized here
          // if it's intended to be a top-level field for contract storage.
          contracts_metadata: {
            contracts: [],
            currentContractId: null,
          },
        },
        newConversationId,
        req
      );

      logger.info(
        `Created new legal contract review conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling legal contract review conversation:', error);
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
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user'|'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The text content of the message.
 * @param {object} [metadata={}] - Optional metadata to associate with the message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} The updated conversation document after adding the message.
 * @throws {ApiError} If there's an internal server error adding the message.
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
 * @param {object} params - An object containing the parameters to be stored or updated in `collectedParams`.
 * @param {object} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<void>}
 * @throws {ApiError} If there's an internal server error updating the metadata.
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
 * Stores an uploaded contract's information and extracted text within a conversation's metadata.
 * This involves extracting text from the file, uploading the file to GCS, and updating the conversation document.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to associate the contract with.
 * @param {string} userId - The ID of the user who uploaded the contract.
 * @param {object} fileInfo - Information about the uploaded file.
 * @param {string} fileInfo.path - The temporary path where the file is stored locally.
 * @param {string} fileInfo.filename - The generated unique filename for storage.
 * @param {string} fileInfo.originalName - The original name of the file as uploaded by the user.
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {object} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} The contract data object that was stored in the conversation.
 * @throws {ApiError} If text extraction fails, GCS upload fails, or the conversation update fails.
 */
const storeContractInConversation = async (
  conversationId,
  userId,
  fileInfo,
  req = null
) => {
  try {
    logger.info('Storing contract in conversation', {
      conversationId,
      filename: fileInfo.originalName,
      size: fileInfo.size,
    });

    // 1. Extract text from contract
    const extractedText = await fileProcessor.extractTextFromFile(fileInfo);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Unable to extract text from the contract'
      );
    }

    // 2. Upload to GCS and get public URL (with metadata)
    const uploadResult = await fileProcessor.uploadToGCS(
      fileInfo.path,
      fileInfo.filename,
      {
        userId: userId,
        originalName: fileInfo.originalName,
        documentType: 'legal_contract_review',
      }
    );

    // 3. Create contract data object
    const contractData = {
      id: `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalName,
      filename: fileInfo.filename,
      publicUrl: uploadResult.publicUrl || uploadResult.localPath,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
      extractedText:
        extractedText.length <=
        LEGAL_CONTRACT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE
          ? extractedText
          : extractedText.substring(
              0,
              LEGAL_CONTRACT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE
            ),
      textLength: extractedText.length,
      textTruncated:
        extractedText.length >
        LEGAL_CONTRACT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
      extractedAt: new Date(),
    };

    // 4. Update conversation metadata directly
    // Optimization: Instead of fetching the entire conversation document,
    // modifying it in memory, and then using $set for the whole array,
    // we can directly use MongoDB's $push and $set operators.
    // This avoids an unnecessary database read and reduces data transfer.
    await Conversation.updateOne(
      { conversationId },
      {
        $push: { 'contracts_metadata.contracts': contractData }, // Add the new contract to the array
        $set: { 'contracts_metadata.currentContractId': contractData.id }, // Set the current contract ID
      }
    );

    logger.info('Contract stored successfully in conversation', {
      contractId: contractData.id,
      textLength: contractData.textLength,
      textTruncated: contractData.textTruncated,
      publicUrl: contractData.publicUrl,
      storageType: contractData.storageType,
    });

    // 5. Cleanup temporary local file
    await fileProcessor.cleanupFile(fileInfo.path);

    return contractData;
  } catch (error) {
    logger.error('Error storing contract in conversation:', error);
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
 * Performs a legal contract review using a generative AI model (Gemini).
 * It constructs a detailed prompt based on the contract content, review parameters, and conversation history.
 *
 * @async
 * @param {object|null} contractData - The cached contract data object, or null if using direct text input.
 * @param {string} [contractData.id] - Unique identifier for the contract.
 * @param {string} [contractData.originalName] - Original filename of the contract.
 * @param {string} [contractData.filename] - Stored filename of the contract.
 * @param {string} [contractData.publicUrl] - Public URL to access the stored contract (e.g., GCS URL).
 * @param {string} [contractData.gcsPath] - GCS path if stored in Google Cloud Storage.
 * @param {string} [contractData.storageType] - Type of storage used (e.g., 'GCS', 'local').
 * @param {string} [contractData.extractedText] - The extracted text content of the contract.
 * @param {number} [contractData.textLength] - The total length of the extracted text.
 * @param {boolean} [contractData.textTruncated] - True if the extracted text was truncated for caching.
 * @param {number} [contractData.size] - Original file size in bytes.
 * @param {string} [contractData.mimetype] - MIME type of the original file.
 * @param {Date} [contractData.uploadedAt] - Timestamp when the contract was uploaded.
 * @param {Date} [contractData.extractedAt] - Timestamp when text was extracted.
 * @param {object} reviewParams - Parameters defining the contract review.
 * @param {string} [reviewParams.reviewType='GENERAL_REVIEW'] - The type of review to perform (e.g., 'GENERAL_REVIEW', 'RISK_ASSESSMENT').
 * @param {string} [reviewParams.reviewDepth='standard'] - The depth of the review (e.g., 'quick', 'standard', 'detailed', 'comprehensive').
 * @param {string} [reviewParams.contractType='general'] - The specific type of contract (e.g., 'NDA', 'MSA', 'Lease Agreement').
 * @param {string[]} [reviewParams.aspects] - Specific aspects to focus on during the review.
 * @param {string} [reviewParams.additionalInstructions] - Any additional specific instructions for the AI.
 * @param {string} [reviewParams.contractText] - Direct contract text provided by the user (if no file was uploaded).
 * @param {Array<object>} [conversationHistory=[]] - An array of previous messages in the conversation for context.
 * @param {string} [outputFormat='text'] - Desired output format for the review ('text', 'markdown', 'pdf', 'docx').
 * @returns {Promise<object>} An object containing the review result, contract info, and parameters.
 * @throws {ApiError} If the contract content is empty or the AI generation fails.
 */
const performContractReview = async (
  contractData,
  reviewParams,
  conversationHistory = [],
  outputFormat = 'text'
) => {
  try {
    logger.info('Starting legal contract review', {
      filename: contractData?.originalName || 'text input',
      reviewType: reviewParams.reviewType,
      reviewDepth: reviewParams.reviewDepth,
      contractType: reviewParams.contractType,
      usingCachedText: !!contractData,
      textLength: contractData?.textLength,
    });

    // Use cached extracted text from contract or direct text input
    const contractContent =
      contractData?.extractedText || reviewParams.contractText;

    if (!contractContent || contractContent.trim().length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Contract has no extractable text content'
      );
    }

    // Log if text was truncated
    if (contractData?.textTruncated) {
      logger.warn('Contract text was truncated for caching', {
        originalLength: contractData.textLength,
        cachedLength: contractContent.length,
      });
    }

    // Determine review intent and system prompt
    const reviewType =
      reviewParams.reviewType || CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW;
    const systemPrompt =
      SYSTEM_PROMPTS[reviewType] || SYSTEM_PROMPTS.CONVERSATIONAL_ASSISTANT;

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5);
      contextPrompt =
        '\n\nPrevious conversation context:\n' +
        recentMessages.map((msg) => `${msg.role}: ${msg.content}`).join('\n');
    }

    // Build review instructions
    const reviewInstructions = buildContractReviewInstructions(reviewParams);

    // Determine output format instruction
    let formatInstruction = '';
    switch (outputFormat) {
      case 'markdown':
        formatInstruction =
          '\n\nPlease format your response using Markdown with appropriate headings, lists, and emphasis.';
        break;
      case 'pdf':
      case 'docx':
        formatInstruction =
          '\n\nPlease format your response in a professional document structure suitable for conversion to a formal report.';
        break;
      default:
        formatInstruction =
          '\n\nPlease provide your response in clear, well-structured plain text.';
    }

    // Create comprehensive prompt
    const fullPrompt = `${systemPrompt}

${reviewInstructions}

Contract Information:
- Filename: ${contractData?.originalName || 'Text Input'}
- Contract Type: ${reviewParams.contractType || 'general'}
- Review Depth: ${reviewParams.reviewDepth || 'standard'}

${contextPrompt}${formatInstruction}

Contract Content:
${contractContent}

Please provide a detailed legal contract review based on the instructions above.

${RESPONSE_MESSAGES.DISCLAIMER}`;

    // Generate review using Gemini
    const model = genAI.getGenerativeModel({
      model: LEGAL_CONTRACT_REVIEW_CONFIG.MODEL,
      generationConfig: {
        temperature: LEGAL_CONTRACT_REVIEW_CONFIG.TEMPERATURE,
        maxOutputTokens: LEGAL_CONTRACT_REVIEW_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const reviewText = response.text();

    logger.info('Legal contract review completed', {
      filename: contractData?.originalName || 'text input',
      reviewLength: reviewText.length,
    });

    return {
      success: true,
      review: reviewText,
      contractInfo: contractData
        ? {
            filename: contractData.originalName,
            size: contractData.size,
            contentLength: contractData.textLength,
            publicUrl: contractData.publicUrl,
            contractId: contractData.id,
          }
        : null,
      reviewParams,
      outputFormat,
    };
  } catch (error) {
    logger.error('Error performing legal contract review:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to review contract: ${error.message}`
    );
  }
};

/**
 * Builds a set of detailed instructions for the AI based on provided review parameters.
 * These instructions guide the AI on the focus, depth, and specific aspects of the contract review.
 *
 * @param {object} params - Parameters for building review instructions.
 * @param {string[]} [params.aspects] - Specific contractual aspects to focus on (e.g., ['indemnification', 'termination clauses']).
 * @param {string} [params.contractType] - The type of contract being reviewed (e.g., 'NDA', 'MSA').
 * @param {string} [params.additionalInstructions] - Any additional specific instructions for the AI.
 * @param {'quick'|'standard'|'detailed'|'comprehensive'} [params.reviewDepth='standard'] - The desired depth of the review.
 * @returns {string} A formatted string containing the review instructions for the AI.
 */
const buildContractReviewInstructions = (params) => {
  let instructions = '\nReview Instructions:';

  if (params.aspects && params.aspects.length > 0) {
    instructions += `\n- Focus on these contractual aspects: ${params.aspects.join(', ')}`;
  }

  if (params.contractType && params.contractType !== 'general') {
    instructions += `\n- This is a ${params.contractType} contract. Apply relevant industry-specific standards and best practices.`;
  }

  if (params.additionalInstructions) {
    instructions += `\n- Additional specific instructions: ${params.additionalInstructions}`;
  }

  const depthInstructions = {
    quick:
      'Provide a quick overview of key clauses, main obligations, and any obvious red flags.',
    standard:
      'Provide a comprehensive review covering main clauses, obligations, rights, liabilities, and potential risks.',
    detailed:
      'Provide a detailed clause-by-clause analysis with specific risk assessments and practical recommendations.',
    comprehensive:
      'Provide the most thorough analysis possible including detailed clause analysis, comprehensive risk assessment with severity levels, compliance considerations, fairness evaluation, and extensive actionable recommendations for negotiation.',
  };

  instructions += `\n\nReview Depth: ${depthInstructions[params.reviewDepth] || depthInstructions.standard}`;

  // Always include standard legal contract review elements
  instructions += `\n\nYour review should include:
1. Executive Summary (key findings)
2. Contract Overview (parties, purpose, key terms)
3. Critical Clauses Analysis
4. Risk Assessment
5. Obligations and Liabilities
6. Rights and Protections
7. Termination and Dispute Resolution
8. Recommendations and Red Flags
9. Overall Assessment`;

  return instructions;
};

/**
 * Main conversational handler for legal contract review.
 * It manages conversation state, processes user messages, handles file uploads,
 * analyzes intent, collects parameters, and orchestrates the contract review process.
 *
 * @async
 * @param {string} userId - The ID of the user.
 * @param {string} userMessage - The message sent by the user.
 * @param {string|null} conversationId - The ID of the current conversation, or null for a new one.
 * @param {object|null} [fileInfo=null] - Optional: Information about an uploaded file.
 * @param {string} [fileInfo.path] - The temporary path where the file is stored locally.
 * @param {string} [fileInfo.filename] - The generated unique filename for storage.
 * @param {string} [fileInfo.originalName] - The original name of the file as uploaded by the user.
 * @param {string} [fileInfo.mimetype] - The MIME type of the file.
 * @param {number} [fileInfo.size] - The size of the file in bytes.
 * @param {string} [outputFormat='text'] - Desired output format for the AI's response ('text', 'markdown', etc.).
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @returns {Promise<object>} An object containing the conversation ID, AI response, contract info, and other relevant flags.
 * @throws {ApiError} If any step in the conversational process fails.
 */
const processConversationalRequest = async (
  userId,
  userMessage,
  conversationId,
  fileInfo = null,
  outputFormat = 'text',
  isGuest = false
) => {
  try {
    logger.info(
      'Processing conversational contract review request for user:',
      userId
    );

    // Handle or create conversation
    const conversation = await handleLegalContractReviewConversation(
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
    await addMessage(
      actualConversationId,
      userId,
      'user',
      userMessage,
      {
        hasFile: !!fileInfo,
      },
      isGuest
    );

    // If a file is uploaded, store it with text extraction and GCS upload
    let newContractData = null;
    if (fileInfo) {
      newContractData = await storeContractInConversation(
        actualConversationId,
        userId,
        fileInfo
      );
      logger.info('New contract uploaded and stored', {
        contractId: newContractData.id,
        filename: newContractData.originalName,
      });
    }

    // Retrieve current contract from metadata
    const currentContractId =
      conversation.contracts_metadata?.currentContractId;
    let contractData = null;

    if (newContractData) {
      // Use newly uploaded contract
      contractData = newContractData;
    } else if (
      currentContractId &&
      conversation.contracts_metadata?.contracts
    ) {
      // Retrieve from cached contracts
      contractData = conversation.contracts_metadata.contracts.find(
        (doc) => doc.id === currentContractId
      );

      if (contractData) {
        logger.info('Using cached contract from conversation', {
          contractId: contractData.id,
          filename: contractData.originalName,
          cachedTextLength: contractData.extractedText?.length,
        });
      }
    }

    // Check if contract text is provided in the message (for pasted contracts)
    const hasContractText = userMessage.length > 200; // Heuristic: long messages likely contain contract text

    // If no contract is available (no file and no cached), check if message contains contract text
    if (!contractData && !hasContractText) {
      const responseMessage = RESPONSE_MESSAGES.NEED_CONTRACT;
      await addMessage(
        actualConversationId,
        userId,
        'assistant',
        responseMessage,
        {},
        isGuest
      );

      return {
        success: true,
        conversationId: actualConversationId,
        response: responseMessage,
        needsContract: true,
        needsMoreInfo: false,
      };
    }

    // Analyze intent and extract parameters
    const analysis = await legalContractAnalyzer.analyzeIntent(
      userMessage,
      recentHistory,
      existingParams
    );

    logger.info('Intent analysis:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      parameters: analysis.parameters,
    });

    // Merge parameters
    const updatedParams = {
      ...DEFAULT_PARAMS,
      ...existingParams,
      ...analysis.parameters,
      contractText: hasContractText && !contractData ? userMessage : null,
    };

    // Update metadata with collected parameters
    await updateConversationMetadata(
      actualConversationId,
      userId,
      updatedParams
    );

    // Perform contract review using cached contract data or provided text
    const reviewResult = await performContractReview(
      contractData,
      updatedParams,
      recentHistory,
      outputFormat
    );

    // Add assistant response
    await addMessage(
      actualConversationId,
      userId,
      'assistant',
      reviewResult.review,
      {
        reviewParams: updatedParams,
        contractInfo: reviewResult.contractInfo,
        outputFormat,
      },
      isGuest
    );

    return {
      success: true,
      conversationId: actualConversationId,
      response: reviewResult.review,
      contractInfo: reviewResult.contractInfo,
      reviewParams: updatedParams,
      outputFormat,
      needsContract: false,
      needsMoreInfo: false,
    };
  } catch (error) {
    logger.error('Error in conversational contract review request:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to process request'
    );
  }
};

/**
 * Provides a direct, non-conversational contract review.
 * This function handles file extraction, performs the AI review, and cleans up temporary files.
 *
 * @async
 * @param {object} fileInfo - Information about the uploaded file.
 * @param {string} fileInfo.path - The temporary path where the file is stored locally.
 * @param {string} fileInfo.filename - The generated unique filename for storage.
 * @param {string} fileInfo.originalName - The original name of the file as uploaded by the user.
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {object} reviewParams - Parameters defining the contract review.
 * @param {string} [reviewParams.reviewType='GENERAL_REVIEW'] - The type of review to perform.
 * @param {string} [reviewParams.reviewDepth='standard'] - The depth of the review.
 * @param {string} [reviewParams.contractType='general'] - The specific type of contract.
 * @param {string[]} [reviewParams.aspects] - Specific aspects to focus on.
 * @param {string} [reviewParams.additionalInstructions] - Any additional specific instructions.
 * @param {string} [reviewParams.outputFormat='text'] - Desired output format for the review.
 * @param {string} userId - The ID of the user initiating the review.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @returns {Promise<object>} An object containing the review result, contract info, and parameters.
 * @throws {ApiError} If file processing or AI review fails.
 */
const reviewContract = async (
  fileInfo,
  reviewParams,
  userId,
  isGuest = false
) => {
  try {
    logger.info('Direct contract review request', {
      filename: fileInfo?.originalName,
      userId,
    });

    // Merge with defaults
    const params = { ...DEFAULT_PARAMS, ...reviewParams };

    // For direct review, we need to extract text from file
    let contractData = null;
    if (fileInfo) {
      const extractedText = await fileProcessor.extractTextFromFile(fileInfo);
      contractData = {
        originalName: fileInfo.originalName,
        extractedText,
        textLength: extractedText.length,
        size: fileInfo.size,
      };
    }

    // Perform review
    const reviewResult = await performContractReview(
      contractData,
      params,
      [],
      params.outputFormat || 'text'
    );

    // Cleanup file
    if (fileInfo) {
      await fileProcessor.cleanupFile(fileInfo.path);
    }

    return reviewResult;
  } catch (error) {
    logger.error('Error in direct contract review:', error);
    throw new ApiError(
      error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to review contract'
    );
  }
};

/**
 * @constant {object} legalContractReviewService - Service object for legal contract review operations.
 * @property {function(): string} generateGuestUserId - Generates a unique ID for guest users.
 * @property {function(): string} generateConversationId - Generates a unique ID for new conversations.
 * @property {function(string, string, string, object|null, string, boolean): Promise<object>} processConversationalRequest - Handles conversational contract review requests, including file uploads and AI interaction.
 * @property {function(object, object, string, boolean): Promise<object>} reviewContract - Performs a direct, non-conversational contract review from an uploaded file.
 */
export const legalContractReviewService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  reviewContract,
};

// Database Indexing Recommendation:
// For the 'Conversation' model, consider adding a compound index on
// `{ conversationId: 1, userId: 1 }` to optimize queries that frequently
// filter by both conversationId and userId, such as `getConversationById`,
// `addMessageToConversation`, and `updateConversationMetadata`.
// This can significantly speed up lookup operations.
// Example: ConversationSchema.index({ conversationId: 1, userId: 1 });