import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { translationAPIClient } from './services/translationAPIClient.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { fileExtractionService } from './services/fileExtractionService.js';
import {
  TRANSLATION_INTENTS,
  REQUIRED_PARAMS,
  DEFAULT_PARAMS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
} from './translation.constant.js';

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
  return `trans_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle translation conversation (create or retrieve)
 */
const handleTranslationConversation = async (userId, conversationId, userMessage, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId
        );
        logger.info("Fetched conversation", { conversationId });
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found, creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Translation: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
          },
        },
        newConversationId
      );

      logger.info(`Created new translation conversation ${newConversationId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling translation conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}) => {
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
 * Process conversational translation request
 */
const processConversationalRequest = async (
  userId,
  userMessage,
  conversationId = null,
  isGuest = false,
  uploadedFile = null
) => {
  try {
    logger.info('Processing translation request', {
      userId,
      conversationId,
      isGuest,
      hasFile: !!uploadedFile,
      messageLength: userMessage.length,
    });

    // Handle conversation
    const conversation = await handleTranslationConversation(
      userId,
      conversationId,
      userMessage,
      isGuest
    );

    console.log('Conversation ID:', conversation);
    // Add user message
    await addMessage(conversation.conversationId, userId, 'user', userMessage, {
      hasFile: !!uploadedFile,
      fileName: uploadedFile?.originalname,
    });

    // Get conversation history
    const conversationHistory = conversation.messages || [];
    const existingParams = conversation.metadata?.collectedParams || {};

    // Check if we need to summarize conversation
    let conversationSummary = null;
    const totalTokens = conversationHistory.reduce((sum, msg) => {
      return sum + Math.ceil(msg.content.length / 4);
    }, 0);

    if (totalTokens > 5000 && conversationHistory.length > 10) {
      conversationSummary = await conversationAnalyzer.summarizeConversation(
        conversationHistory,
        existingParams
      );
    }

    // Analyze intent
    const analysis = await conversationAnalyzer.analyzeIntent(
      userMessage,
      conversationHistory,
      existingParams,
      conversationSummary
    );

    logger.info('Intent analysis completed', {
      intent: analysis.intent,
      needsMoreInfo: analysis.needsMoreInfo,
      confidence: analysis.confidence,
    });

    // Handle file upload if present
    if (uploadedFile && analysis.extractedParams) {
      analysis.extractedParams.hasFile = true;
      analysis.extractedParams.fileName = uploadedFile.originalname;
    }

    // Merge extracted params with existing params
    const updatedParams = {
      ...existingParams,
      ...analysis.extractedParams,
    };

    // Update conversation metadata
    await conversationService.updateConversationMetadata(
      conversation.conversationId,
      userId,
      {
        ...conversation.metadata,
        collectedParams: updatedParams,
        lastIntent: analysis.intent,
      }
    );

    // Handle different intents
    let result;
    switch (analysis.intent) {
      case TRANSLATION_INTENTS.TRANSLATE_TEXT:
        result = await handleTranslateText(
          conversation.conversationId.toString(),
          userId,
          updatedParams,
          analysis
        );
        break;

      case TRANSLATION_INTENTS.TRANSLATE_FILE:
        result = await handleTranslateFile(
          conversation.conversationId.toString(),
          userId,
          uploadedFile,
          updatedParams,
          analysis
        );
        break;

      case TRANSLATION_INTENTS.DETECT_LANGUAGE:
        result = await handleDetectLanguage(
          conversation.conversationId.toString(),
          userId,
          updatedParams,
          analysis
        );
        break;

      case TRANSLATION_INTENTS.GET_SUPPORTED_LANGUAGES:
        result = await handleGetSupportedLanguages(
          conversation.conversationId.toString(),
          userId
        );
        break;

      case TRANSLATION_INTENTS.GENERAL_QUESTION:
      default:
        result = {
          conversationId: conversation.conversationId.toString(),
          success: true,
          needsMoreInfo: analysis.needsMoreInfo,
          message: analysis.assistantResponse,
          followUpQuestion: analysis.followUpQuestion,
          collectedParams: updatedParams,
        };
        break;
    }

    // Add assistant response
    await addMessage(
      conversation.conversationId.toString(),
      userId,
      'assistant',
      result.message || analysis.assistantResponse,
      {
        intent: analysis.intent,
        success: result.success,
      }
    );

    // Add userId to result if guest user
    if (isGuest) {
      result.userId = userId;
    }

    return result;
  } catch (error) {
    logger.error('Error processing conversational request:', error);
    throw error;
  }
};

/**
 * Handle translate text intent
 */
const handleTranslateText = async (conversationId, userId, params, analysis) => {
  try {
    // Check if we have required parameters
    const requiredParams = REQUIRED_PARAMS[TRANSLATION_INTENTS.TRANSLATE_TEXT];
    const missingParams = requiredParams.filter(param => !params[param]);

    if (missingParams.length > 0 || analysis.needsMoreInfo) {
      return {
        conversationId,
        success: false,
        needsMoreInfo: true,
        message: analysis.followUpQuestion || 'Please provide the text and target language.',
        missingParams,
        collectedParams: params,
      };
    }

    // Perform translation
    const translationResult = await translationAPIClient.translateText(
      params.text,
      params.targetLanguage,
      params.sourceLanguage || 'auto'
    );

    return {
      conversationId,
      success: true,
      needsMoreInfo: false,
      message: `Translation completed! Translated from ${translationResult.sourceLanguageName} to ${translationResult.targetLanguageName}.`,
      translation: translationResult,
      collectedParams: params,
    };
  } catch (error) {
    logger.error('Translation failed:', error);
    return {
      conversationId,
      success: false,
      needsMoreInfo: false,
      message: error.message || ERROR_MESSAGES.TRANSLATION_FAILED,
      error: error.message,
    };
  }
};

/**
 * Handle translate file intent
 */
const handleTranslateFile = async (conversationId, userId, uploadedFile, params, analysis) => {
  try {
    // Check if file is present
    if (!uploadedFile) {
      return {
        conversationId,
        success: false,
        needsMoreInfo: true,
        message: 'Please upload a file to translate.',
        collectedParams: params,
      };
    }

    // Check if target language is specified
    if (!params.targetLanguage) {
      return {
        conversationId,
        success: false,
        needsMoreInfo: true,
        message: analysis.followUpQuestion || 'What language would you like to translate the file to?',
        collectedParams: params,
      };
    }

    // Extract text from file
    const extraction = await fileExtractionService.extractTextFromFile(
      uploadedFile.path,
      uploadedFile.originalname
    );

    logger.info('File text extracted', {
      fileName: uploadedFile.originalname,
      characterCount: extraction.metadata.characterCount,
    });

    // Translate extracted text
    const translationResult = await translationAPIClient.translateText(
      extraction.text,
      params.targetLanguage,
      params.sourceLanguage || 'auto'
    );

    // Clean up uploaded file
    await fileExtractionService.cleanupFile(uploadedFile.path);

    return {
      conversationId,
      success: true,
      needsMoreInfo: false,
      message: `File "${extraction.metadata.fileName}" translated successfully from ${translationResult.sourceLanguageName} to ${translationResult.targetLanguageName}.`,
      translation: translationResult,
      fileMetadata: extraction.metadata,
      collectedParams: params,
    };
  } catch (error) {
    logger.error('File translation failed:', error);

    // Clean up file on error
    if (uploadedFile?.path) {
      await fileExtractionService.cleanupFile(uploadedFile.path);
    }

    return {
      conversationId,
      success: false,
      needsMoreInfo: false,
      message: error.message || ERROR_MESSAGES.TRANSLATION_FAILED,
      error: error.message,
    };
  }
};

/**
 * Handle detect language intent
 */
const handleDetectLanguage = async (conversationId, userId, params, analysis) => {
  try {
    if (!params.text) {
      return {
        conversationId,
        success: false,
        needsMoreInfo: true,
        message: 'Please provide text for language detection.',
        collectedParams: params,
      };
    }

    const detection = await translationAPIClient.detectLanguage(params.text);

    return {
      conversationId,
      success: true,
      needsMoreInfo: false,
      message: `Detected language: ${detection.languageName} (${detection.languageCode}) with ${(detection.confidence * 100).toFixed(1)}% confidence.`,
      detection,
      collectedParams: params,
    };
  } catch (error) {
    logger.error('Language detection failed:', error);
    return {
      conversationId,
      success: false,
      needsMoreInfo: false,
      message: error.message || ERROR_MESSAGES.LANGUAGE_DETECTION_FAILED,
      error: error.message,
    };
  }
};

/**
 * Handle get supported languages intent
 */
const handleGetSupportedLanguages = async (conversationId, userId) => {
  try {
    const languagesResult = await translationAPIClient.getSupportedLanguages();

    const languageList = languagesResult.languages
      .map(lang => `${lang.name} (${lang.code})`)
      .join(', ');

    return {
      conversationId,
      success: true,
      needsMoreInfo: false,
      message: `We support ${languagesResult.count} languages: ${languageList.substring(0, 500)}...`,
      languages: languagesResult.languages,
      count: languagesResult.count,
    };
  } catch (error) {
    logger.error('Failed to get supported languages:', error);
    return {
      conversationId,
      success: false,
      needsMoreInfo: false,
      message: 'Failed to retrieve supported languages.',
      error: error.message,
    };
  }
};

/**
 * Direct translation (non-conversational)
 */
const translateTextDirect = async (text, targetLanguage, sourceLanguage = null) => {
  try {
    logger.info('Direct translation request', {
      textLength: text.length,
      targetLanguage,
      sourceLanguage: sourceLanguage || 'auto',
    });

    const result = await translationAPIClient.translateText(
      text,
      targetLanguage,
      sourceLanguage
    );

    return {
      success: true,
      message: SUCCESS_MESSAGES.TRANSLATION_COMPLETED,
      translation: result,
    };
  } catch (error) {
    logger.error('Direct translation failed:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || ERROR_MESSAGES.TRANSLATION_FAILED
    );
  }
};

/**
 * Detect language directly (non-conversational)
 */
const detectLanguageDirect = async (text) => {
  try {
    logger.info('Direct language detection request', {
      textLength: text.length,
    });

    const result = await translationAPIClient.detectLanguage(text);

    return {
      success: true,
      message: SUCCESS_MESSAGES.LANGUAGE_DETECTED,
      detection: result,
    };
  } catch (error) {
    logger.error('Direct language detection failed:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || ERROR_MESSAGES.LANGUAGE_DETECTION_FAILED
    );
  }
};

export const translationService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  translateTextDirect,
  detectLanguageDirect,
};
