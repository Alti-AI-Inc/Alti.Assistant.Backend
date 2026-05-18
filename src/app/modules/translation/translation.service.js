import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { translationAPIClient } from './services/translationAPIClient.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { fileProcessor } from './services/fileProcessor.js';
import Conversation from '../conversations/conversation.model.js';
import {
  TRANSLATION_INTENTS,
  REQUIRED_PARAMS,
  DEFAULT_PARAMS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  STORAGE_CONFIG,
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
const handleTranslationConversation = async (
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
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId
        );
        logger.info('Fetched conversation', { conversationId });
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (
  conversationId,
  userId,
  role,
  content,
  metadata = {},
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
 * Store uploaded document in conversation with GCS upload
 */
const storeDocumentInConversation = async (
  conversationId,
  userId,
  fileInfo,
  extractedText,
  translationParams = {},
  req = null
) => {
  try {
    logger.info('Storing translation document in conversation', {
      conversationId,
      filename: fileInfo.originalname,
      size: fileInfo.size,
    });

    // Upload to GCS
    const uploadResult = await fileProcessor.uploadToGCS(
      fileInfo.path,
      fileInfo.filename,
      {
        userId: userId,
        originalName: fileInfo.originalname,
        documentType: 'translation',
        targetLanguage: translationParams.targetLanguage,
        sourceLanguage: translationParams.sourceLanguage,
      }
    );

    // Create document data object
    const documentData = {
      id: `trans_doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalname,
      filename: fileInfo.filename,
      publicUrl: uploadResult.publicUrl || uploadResult.localPath,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
      extractedText:
        extractedText.length <= STORAGE_CONFIG.MAX_CACHED_TEXT_SIZE
          ? extractedText
          : extractedText.substring(0, STORAGE_CONFIG.MAX_CACHED_TEXT_SIZE),
      textLength: extractedText.length,
      textTruncated: extractedText.length > STORAGE_CONFIG.MAX_CACHED_TEXT_SIZE,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
      extractedAt: new Date(),
      translationParams: {
        targetLanguage: translationParams.targetLanguage,
        sourceLanguage: translationParams.sourceLanguage,
      },
    };

    // Update conversation documents_metadata
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );
    const existingDocuments = conversation.documents_metadata?.documents || [];

    await Conversation.updateOne(
      { conversationId },
      {
        $set: {
          'documents_metadata.documents': [...existingDocuments, documentData],
          'documents_metadata.currentDocumentId': documentData.id,
        },
      }
    );

    logger.info('Document stored in conversation with GCS upload', {
      documentId: documentData.id,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
    });

    // Cleanup temporary local file
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

    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to store document in conversation'
    );
  }
};

/**
 * Fetch file from GCS when needed (for re-translation or reference)
 */
const fetchDocumentFromGCS = async (
  conversationId,
  userId,
  documentId,
  req = null
) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );
    const documents = conversation.documents_metadata?.documents || [];

    const document = documents.find((doc) => doc.id === documentId);

    if (!document) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'Document not found in conversation'
      );
    }

    // If stored locally, return the local path
    if (document.storageType === 'local') {
      return {
        success: true,
        localPath: document.publicUrl,
        document,
      };
    }

    // Download from GCS to temporary location
    const tempPath = `uploads/translations/temp_${Date.now()}_${document.filename}`;
    const downloadResult = await fileProcessor.downloadFromGCS(
      document.gcsPath,
      tempPath
    );

    logger.info('Document fetched from GCS', {
      documentId,
      gcsPath: document.gcsPath,
      tempPath,
    });

    return {
      success: true,
      localPath: downloadResult.localPath,
      document,
      isTemporary: true, // Indicates this file should be cleaned up after use
    };
  } catch (error) {
    logger.error('Error fetching document from GCS:', error);
    throw error;
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
  uploadedFile = null,
  req = null
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
      userMessage, // Include original message for intelligent file selection
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
const handleTranslateText = async (
  conversationId,
  userId,
  params,
  analysis
) => {
  try {
    // Check if we have required parameters
    const requiredParams = REQUIRED_PARAMS[TRANSLATION_INTENTS.TRANSLATE_TEXT];
    const missingParams = requiredParams.filter((param) => !params[param]);

    if (missingParams.length > 0 || analysis.needsMoreInfo) {
      return {
        conversationId,
        success: false,
        needsMoreInfo: true,
        message:
          analysis.followUpQuestion ||
          'Please provide the text and target language.',
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
const handleTranslateFile = async (
  conversationId,
  userId,
  uploadedFile,
  params,
  analysis
) => {
  let tempFilePath = null;
  let selectionReason = ''; // Define at function scope

  try {
    let fileToProcess = uploadedFile;
    let extractedText = null;
    let fileMetadata = null;
    let isExistingFile = false;

    // If no new file uploaded, check for existing files in conversation
    if (!uploadedFile) {
      logger.info(
        'No new file uploaded, checking conversation for existing files'
      );

      const conversation = await conversationHelpers.getConversationById(
        conversationId,
        userId,
        req
      );
      const existingDocuments =
        conversation.documents_metadata?.documents || [];

      if (existingDocuments.length === 0) {
        return {
          conversationId,
          success: false,
          needsMoreInfo: true,
          message: 'Please upload a file to translate.',
          collectedParams: params,
        };
      }

      // Determine which file to use
      let selectedDocument;

      if (existingDocuments.length === 1) {
        // Only one file - use it
        selectedDocument = existingDocuments[0];
        selectionReason = 'Only one file available';
        logger.info('Using the only file in conversation', {
          documentId: selectedDocument.id,
        });
      } else {
        // Multiple files - use LLM to intelligently select the right file
        logger.info(
          'Multiple files found, using LLM to select appropriate file',
          {
            totalFiles: existingDocuments.length,
          }
        );

        const userMessage =
          params.userMessage || 'translate to ' + params.targetLanguage;
        const selection = await conversationAnalyzer.selectFileFromMultiple(
          userMessage,
          existingDocuments
        );

        selectedDocument = selection.selectedDocument;
        selectionReason = selection.reason;

        logger.info('LLM selected file', {
          documentId: selectedDocument.id,
          fileName: selectedDocument.originalName,
          confidence: selection.confidence,
          reason: selection.reason,
        });
      }

      // Check if we have cached text
      if (selectedDocument.extractedText && !selectedDocument.textTruncated) {
        extractedText = selectedDocument.extractedText;
        fileMetadata = {
          fileName: selectedDocument.originalName,
          fileExtension: selectedDocument.originalName.split('.').pop(),
          fileSize: selectedDocument.size,
          characterCount: selectedDocument.textLength,
          wordCount: extractedText.split(/\s+/).filter(Boolean).length,
        };
        logger.info('Using cached extracted text from document metadata');
      } else {
        // Need to fetch file from GCS and extract text
        logger.info('Fetching file from GCS for text extraction', {
          gcsPath: selectedDocument.gcsPath,
        });

        const fetchResult = await fetchDocumentFromGCS(
          conversationId,
          userId,
          selectedDocument.id
        );
        tempFilePath = fetchResult.localPath;

        // Extract text from downloaded file
        const extractedTextFromFile = await fileProcessor.extractTextFromFile({
          path: fetchResult.localPath,
          originalname: selectedDocument.originalName,
        });

        extractedText = extractedTextFromFile;
        fileMetadata = {
          fileName: selectedDocument.originalName,
          characterCount: extractedTextFromFile.length,
          fileSize: selectedDocument.size,
        };

        logger.info('Text extracted from fetched file', {
          characterCount: fileMetadata.characterCount,
        });
      }

      isExistingFile = true;
      fileMetadata.documentId = selectedDocument.id;
    } else {
      // New file uploaded - extract text from it
      extractedText = await fileProcessor.extractTextFromFile({
        path: uploadedFile.path,
        originalname: uploadedFile.originalname,
      });

      fileMetadata = {
        fileName: uploadedFile.originalname,
        characterCount: extractedText.length,
        fileSize: uploadedFile.size,
      };

      logger.info('File text extracted from new upload', {
        fileName: uploadedFile.originalname,
        characterCount: extractedText.length,
      });
    }

    // Check if target language is specified
    if (!params.targetLanguage) {
      // Clean up temp file if exists
      if (tempFilePath) {
        await fileProcessor.cleanupFile(tempFilePath);
      }

      return {
        conversationId,
        success: false,
        needsMoreInfo: true,
        message:
          analysis.followUpQuestion ||
          'What language would you like to translate the file to?',
        collectedParams: params,
      };
    }

    // Translate extracted text
    const translationResult = await translationAPIClient.translateText(
      extractedText,
      params.targetLanguage,
      params.sourceLanguage || 'auto'
    );

    let storedDocument = null;

    // Only store new document if a new file was uploaded
    if (uploadedFile && !isExistingFile) {
      storedDocument = await storeDocumentInConversation(
        conversationId,
        userId,
        {
          originalname: uploadedFile.originalname,
          filename: uploadedFile.filename,
          path: uploadedFile.path,
          size: uploadedFile.size,
          mimetype: uploadedFile.mimetype,
        },
        extractedText,
        {
          targetLanguage: params.targetLanguage,
          sourceLanguage: translationResult.sourceLanguage,
        }
      );

      // Clean up local temporary file after GCS upload
      await fileProcessor.cleanupFile(uploadedFile.path);
    } else if (tempFilePath) {
      // Clean up temporary downloaded file
      await fileProcessor.cleanupFile(tempFilePath);
    }

    // Build success message
    let successMessage = `File "${fileMetadata.fileName}" translated successfully from ${translationResult.sourceLanguageName} to ${translationResult.targetLanguageName}.`;

    // Add selection reason if multiple files were available
    if (isExistingFile && selectionReason) {
      successMessage += ` (${selectionReason})`;
    }

    return {
      conversationId,
      success: true,
      needsMoreInfo: false,
      message: successMessage,
      translation: translationResult,
      fileMetadata: fileMetadata,
      documentId: storedDocument?.id || fileMetadata.documentId,
      gcsPath: storedDocument?.gcsPath,
      storageType: storedDocument?.storageType,
      isExistingFile,
      selectionReason: isExistingFile ? selectionReason : undefined,
      collectedParams: params,
    };
  } catch (error) {
    logger.error('File translation failed:', error);

    // Clean up file on error
    if (uploadedFile?.path) {
      await fileProcessor.cleanupFile(uploadedFile.path);
    }
    if (tempFilePath) {
      await fileProcessor.cleanupFile(tempFilePath);
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
const handleDetectLanguage = async (
  conversationId,
  userId,
  params,
  analysis
) => {
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
      .map((lang) => `${lang.name} (${lang.code})`)
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
const translateTextDirect = async (
  text,
  targetLanguage,
  sourceLanguage = null
) => {
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
  storeDocumentInConversation,
  fetchDocumentFromGCS,
};
