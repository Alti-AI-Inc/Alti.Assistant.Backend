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
  return `contract_review_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle legal contract review conversation (create or retrieve)
 */
const handleLegalContractReviewConversation = async (userId, conversationId, userMessage, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId);
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
          title: `Legal Contract Review: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            uploadedContracts: [],
          },
        },
        newConversationId
      );

      logger.info(`Created new legal contract review conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling legal contract review conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}, isGuest = false) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(conversationId, userId, message);
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Update conversation metadata
 */
const updateConversationMetadata = async (conversationId, userId, params) => {
  try {
    await conversationService.updateConversationMetadata(conversationId, userId, {
      collectedParams: params,
    });
  } catch (error) {
    logger.warn('Error updating conversation metadata:', error);
  }
};

/**
 * Store uploaded contract in conversation metadata with text extraction and GCS upload
 */
const storeContractInConversation = async (conversationId, userId, fileInfo) => {
  try {
    logger.info('Storing contract in conversation', {
      conversationId,
      filename: fileInfo.originalName,
      size: fileInfo.size
    });

    // 1. Extract text from contract
    const extractedText = await fileProcessor.extractTextFromFile(fileInfo);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Unable to extract text from the contract');
    }

    // 2. Upload to GCS and get public URL (with metadata)
    const uploadResult = await fileProcessor.uploadToGCS(fileInfo.path, fileInfo.filename, {
      userId: userId,
      originalName: fileInfo.originalName,
      documentType: 'legal_contract_review'
    });

    // 3. Create contract data object
    const contractData = {
      id: `contract_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalName,
      filename: fileInfo.filename,
      publicUrl: uploadResult.publicUrl || uploadResult.localPath,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
      extractedText: extractedText.length <= LEGAL_CONTRACT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE
        ? extractedText
        : extractedText.substring(0, LEGAL_CONTRACT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE),
      textLength: extractedText.length,
      textTruncated: extractedText.length > LEGAL_CONTRACT_REVIEW_CONFIG.MAX_CACHED_TEXT_SIZE,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
      extractedAt: new Date()
    };

    // 4. Update conversation metadata
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    if (!conversation.metadata.contracts) {
      conversation.metadata.contracts = [];
    }

    conversation.metadata.contracts.push(contractData);
    conversation.metadata.currentContractId = contractData.id;

    await Conversation.updateOne({ conversationId }, {
      $set: {
        contracts_metadata: {
          contracts: conversation.metadata.contracts,
          currentContractId: contractData.id
        }
      }
    });

    logger.info('Contract stored successfully in conversation', {
      contractId: contractData.id,
      textLength: contractData.textLength,
      textTruncated: contractData.textTruncated,
      publicUrl: contractData.publicUrl,
      storageType: contractData.storageType
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
 * Process contract and perform review using cached contract data
 */
const performContractReview = async (contractData, reviewParams, conversationHistory = [], outputFormat = 'text') => {
  try {
    logger.info('Starting legal contract review', {
      filename: contractData?.originalName || 'text input',
      reviewType: reviewParams.reviewType,
      reviewDepth: reviewParams.reviewDepth,
      contractType: reviewParams.contractType,
      usingCachedText: !!contractData,
      textLength: contractData?.textLength
    });

    // Use cached extracted text from contract or direct text input
    const contractContent = contractData?.extractedText || reviewParams.contractText;

    if (!contractContent || contractContent.trim().length === 0) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Contract has no extractable text content');
    }

    // Log if text was truncated
    if (contractData?.textTruncated) {
      logger.warn('Contract text was truncated for caching', {
        originalLength: contractData.textLength,
        cachedLength: contractContent.length
      });
    }

    // Determine review intent and system prompt
    const reviewType = reviewParams.reviewType || CONTRACT_REVIEW_INTENTS.GENERAL_REVIEW;
    const systemPrompt = SYSTEM_PROMPTS[reviewType] || SYSTEM_PROMPTS.CONVERSATIONAL_ASSISTANT;

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5);
      contextPrompt = '\n\nPrevious conversation context:\n' +
        recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    // Build review instructions
    const reviewInstructions = buildContractReviewInstructions(reviewParams);

    // Determine output format instruction
    let formatInstruction = '';
    switch (outputFormat) {
      case 'markdown':
        formatInstruction = '\n\nPlease format your response using Markdown with appropriate headings, lists, and emphasis.';
        break;
      case 'pdf':
      case 'docx':
        formatInstruction = '\n\nPlease format your response in a professional document structure suitable for conversion to a formal report.';
        break;
      default:
        formatInstruction = '\n\nPlease provide your response in clear, well-structured plain text.';
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
      contractInfo: contractData ? {
        filename: contractData.originalName,
        size: contractData.size,
        contentLength: contractData.textLength,
        publicUrl: contractData.publicUrl,
        contractId: contractData.id
      } : null,
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
 * Build review instructions based on parameters
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
    quick: 'Provide a quick overview of key clauses, main obligations, and any obvious red flags.',
    standard: 'Provide a comprehensive review covering main clauses, obligations, rights, liabilities, and potential risks.',
    detailed: 'Provide a detailed clause-by-clause analysis with specific risk assessments and practical recommendations.',
    comprehensive: 'Provide the most thorough analysis possible including detailed clause analysis, comprehensive risk assessment with severity levels, compliance considerations, fairness evaluation, and extensive actionable recommendations for negotiation.',
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
 * Main conversational handler - processes user messages intelligently
 */
const processConversationalRequest = async (userId, userMessage, conversationId, fileInfo = null, outputFormat = 'text', isGuest = false) => {
  try {
    logger.info('Processing conversational contract review request for user:', userId);

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
    await addMessage(actualConversationId, userId, 'user', userMessage, {
      hasFile: !!fileInfo,
    }, isGuest);

    // If a file is uploaded, store it with text extraction and GCS upload
    let newContractData = null;
    if (fileInfo) {
      newContractData = await storeContractInConversation(actualConversationId, userId, fileInfo);
      logger.info('New contract uploaded and stored', {
        contractId: newContractData.id,
        filename: newContractData.originalName
      });
    }

    // Retrieve current contract from metadata
    const currentContractId = conversation.contracts_metadata?.currentContractId;
    let contractData = null;

    if (newContractData) {
      // Use newly uploaded contract
      contractData = newContractData;
    } else if (currentContractId && conversation.contracts_metadata?.contracts) {
      // Retrieve from cached contracts
      contractData = conversation.contracts_metadata.contracts.find(doc => doc.id === currentContractId);

      if (contractData) {
        logger.info('Using cached contract from conversation', {
          contractId: contractData.id,
          filename: contractData.originalName,
          cachedTextLength: contractData.extractedText?.length
        });
      }
    }

    // Check if contract text is provided in the message (for pasted contracts)
    const hasContractText = userMessage.length > 200; // Heuristic: long messages likely contain contract text

    // If no contract is available (no file and no cached), check if message contains contract text
    if (!contractData && !hasContractText) {
      const responseMessage = RESPONSE_MESSAGES.NEED_CONTRACT;
      await addMessage(actualConversationId, userId, 'assistant', responseMessage, {}, isGuest);

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
      contractText: hasContractText && !contractData ? userMessage : null
    };

    // Update metadata with collected parameters
    await updateConversationMetadata(actualConversationId, userId, updatedParams);

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
 * Direct review endpoint (non-conversational)
 */
const reviewContract = async (fileInfo, reviewParams, userId, isGuest = false) => {
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
    const reviewResult = await performContractReview(contractData, params, [], params.outputFormat || 'text');

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

export const legalContractReviewService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  reviewContract,
};
