import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationAnalyzer } from './services/conversationAnalyzer.js';
import { exportDocument } from './utils/documentExporter.js';
import { uploadDocumentToGCS } from './services/gcsUploadService.js';
import {
  DOCUMENT_CONFIG,
  DOCUMENT_INTENTS,
  DOCUMENT_TYPES,
  OUTPUT_FORMATS,
  REQUIRED_PARAMS,
  DEFAULT_PARAMS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  TONES,
  LENGTH_OPTIONS,
} from './document.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
const model = genAI.getGenerativeModel({
  model: DOCUMENT_CONFIG.MODEL,
  generationConfig: {
    temperature: DOCUMENT_CONFIG.TEMPERATURE,
    maxOutputTokens: DOCUMENT_CONFIG.MAX_OUTPUT_TOKENS,
  },
});

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
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle document conversation (create or retrieve)
 */
const handleDocumentConversation = async (
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
          userId,
          req
        );
        logger.info(`Retrieved existing conversation: ${conversationId}`);
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
          title: `Document: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
          },
        },
        newConversationId,
        req
      );

      logger.info(
        `Created new document conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling document conversation:', error);
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
 * Save conversation summary
 */
const saveConversationSummary = async (
  conversationId,
  userId,
  summary,
  req = null
) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (conversation) {
      conversation.metadata = {
        ...conversation.metadata,
        conversationSummary: summary,
        summarizedAt: new Date().toISOString(),
        summarizedMessageCount: conversation.messages.length,
      };

      await conversation.save();
      logger.info(`Saved conversation summary for ${conversationId}`);
    }
  } catch (error) {
    logger.error('Error saving conversation summary:', error);
  }
};

/**
 * Generate document content using AI
 */
const generateDocumentContent = async (params) => {
  try {
    logger.info('Generating document content with params:', params);

    const {
      content,
      documentType = DEFAULT_PARAMS.documentType,
      tone = DEFAULT_PARAMS.tone,
      length = DEFAULT_PARAMS.length,
      wordCount,
      language = DEFAULT_PARAMS.language,
      additionalInstructions = '',
    } = params;

    // Build generation prompt
    let prompt = `You are a professional document writer. Generate a high-quality ${documentType} document.

Topic/Content: ${content}

Requirements:
- Document Type: ${documentType}
- Tone: ${tone}
- Length: ${length}${wordCount ? ` (approximately ${wordCount} words)` : ''}
- Language: ${language}
${additionalInstructions ? `- Additional Instructions: ${additionalInstructions}` : ''}

Guidelines:
1. Create well-structured, professional content
2. Use appropriate formatting (headings, paragraphs, lists where needed)
3. Ensure logical flow and coherence
4. Match the specified tone and style
5. Be clear, concise, and engaging

Generate the complete document content now:`;

    const result = await model.generateContent(prompt);
    const documentContent = result.response.text();

    logger.info('Document content generated successfully', {
      contentLength: documentContent.length,
    });

    return documentContent;
  } catch (error) {
    logger.error('Error generating document content:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate document content'
    );
  }
};

/**
 * Handle draft intent
 */
const handleDraftIntent = async (
  analysis,
  updatedParams,
  conversationId,
  userId,
  isGuest
) => {
  try {
    // Check if we can proceed
    if (!analysis.canProceed) {
      await addMessage(
        conversationId,
        userId,
        'assistant',
        analysis.suggestedResponse,
        { needsMoreInfo: true },
        isGuest
      );

      return {
        conversationId,
        userId,
        success: true,
        needsMoreInfo: true,
        message: analysis.suggestedResponse,
        improvementQuestions: analysis.improvementQuestions || [],
        collectedParams: updatedParams,
      };
    }

    // Generate document
    const documentContent = await generateDocumentContent(updatedParams);

    // Prepare metadata for export
    const metadata = {
      title:
        updatedParams.title || `${updatedParams.documentType || 'Document'}`,
      documentType: updatedParams.documentType,
      includeDate: updatedParams.includeDate !== false,
      includeTitle: updatedParams.includeTitle !== false,
    };

    // Export to specified format
    const outputFormat =
      updatedParams.outputFormat || DEFAULT_PARAMS.outputFormat;
    const exportResult = await exportDocument(
      documentContent,
      outputFormat,
      metadata
    );

    // Upload to GCS
    const uploadResult = await uploadDocumentToGCS(exportResult.filePath, {
      userId,
      documentType: updatedParams.documentType,
      title: metadata.title,
    });

    // Build response message with refinement offer
    const improvementQuestions = analysis.improvementQuestions || [];
    let responseMessage = `I've created a draft ${updatedParams.documentType || 'document'} for you in ${outputFormat.toUpperCase()} format.\n\n`;

    if (improvementQuestions.length > 0) {
      responseMessage += `Would you like me to refine it? I can improve the document if you answer these questions:\n\n`;
      improvementQuestions.forEach((question, index) => {
        responseMessage += `${index + 1}. ${question}\n`;
      });
      responseMessage += `\nFeel free to answer any or all of these questions, or just tell me what you'd like to change!`;
    } else {
      responseMessage += `Let me know if you'd like any changes or refinements!`;
    }

    await addMessage(
      conversationId,
      userId,
      'assistant',
      responseMessage,
      {
        documentGenerated: true,
        isDraft: true,
        exportResult,
        uploadResult,
      },
      isGuest
    );

    return {
      conversationId,
      userId,
      success: true,
      needsMoreInfo: false,
      isDraft: true,
      message: responseMessage,
      document: {
        content: documentContent,
        format: outputFormat,
        file: exportResult,
        url: uploadResult.publicUrl || uploadResult.localPath,
        metadata,
      },
      improvementQuestions,
      collectedParams: updatedParams,
    };
  } catch (error) {
    logger.error('Error handling draft intent:', error);
    throw error;
  }
};

/**
 * Handle export intent
 */
const handleExportIntent = async (
  analysis,
  updatedParams,
  conversationId,
  userId,
  isGuest
) => {
  try {
    const { content, outputFormat, title, documentType } = updatedParams;

    if (!content) {
      const message =
        'I need the document content to export. Could you provide it?';
      await addMessage(
        conversationId,
        userId,
        'assistant',
        message,
        {},
        isGuest
      );

      return {
        conversationId,
        userId,
        success: true,
        needsMoreInfo: true,
        message,
        collectedParams: updatedParams,
      };
    }

    if (!outputFormat) {
      const message =
        'What format would you like to export to? (PDF, DOCX, TXT, HTML, or MD)';
      await addMessage(
        conversationId,
        userId,
        'assistant',
        message,
        {},
        isGuest
      );

      return {
        conversationId,
        userId,
        success: true,
        needsMoreInfo: true,
        message,
        collectedParams: updatedParams,
      };
    }

    // Export document
    const metadata = {
      title: title || 'Document',
      documentType: documentType,
      includeDate: true,
      includeTitle: true,
    };

    const exportResult = await exportDocument(content, outputFormat, metadata);
    const uploadResult = await uploadDocumentToGCS(exportResult.filePath, {
      userId,
      documentType,
      title: metadata.title,
    });

    const responseMessage = `I've exported your document to ${outputFormat.toUpperCase()} format!`;

    await addMessage(
      conversationId,
      userId,
      'assistant',
      responseMessage,
      { exportResult, uploadResult },
      isGuest
    );

    return {
      conversationId,
      userId,
      success: true,
      needsMoreInfo: false,
      message: responseMessage,
      document: {
        format: outputFormat,
        file: exportResult,
        url: uploadResult.publicUrl || uploadResult.localPath,
      },
      collectedParams: updatedParams,
    };
  } catch (error) {
    logger.error('Error handling export intent:', error);
    throw error;
  }
};

/**
 * Main conversational handler
 */
const processConversationalRequest = async (
  userId,
  userMessage,
  conversationId,
  isGuest = false
) => {
  try {
    logger.info('Processing conversational request for document drafting', {
      userId,
      conversationId,
    });

    // Handle or create conversation
    const conversation = await handleDocumentConversation(
      userId,
      conversationId,
      userMessage,
      isGuest
    );
    const actualConversationId = conversation.conversationId;

    // Get conversation history
    const conversationHistory = conversation.messages || [];
    const recentHistory = conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Get existing parameters
    const existingParams = conversation.metadata?.collectedParams || {};
    let conversationSummary =
      conversation.metadata?.conversationSummary || null;

    // Add user message
    await addMessage(
      actualConversationId,
      userId,
      'user',
      userMessage,
      {},
      isGuest
    );

    // Check if we need to summarize
    const estimatedTokens = conversationAnalyzer._calculateConversationTokens(
      recentHistory,
      existingParams
    );

    if (
      estimatedTokens > 5000 &&
      (!conversationSummary ||
        conversation.metadata?.summarizedMessageCount <
          conversationHistory.length - 5)
    ) {
      logger.info('Summarizing conversation...');
      conversationSummary = await conversationAnalyzer.summarizeConversation(
        recentHistory,
        existingParams
      );
      await saveConversationSummary(
        actualConversationId,
        userId,
        conversationSummary
      );
    }

    // Analyze intent
    const analysis = await conversationAnalyzer.analyzeIntent(
      userMessage,
      recentHistory,
      existingParams,
      conversationSummary
    );

    logger.info('Intent analysis:', {
      intent: analysis.intent,
      confidence: analysis.confidence,
      canProceed: analysis.canProceed,
    });

    // Merge parameters
    const updatedParams = { ...existingParams, ...analysis.parameters };
    await updateConversationMetadata(
      actualConversationId,
      userId,
      updatedParams
    );

    // Handle different intents
    let response;

    switch (analysis.intent) {
      case DOCUMENT_INTENTS.DRAFT:
        response = await handleDraftIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case DOCUMENT_INTENTS.REFINE:
      case DOCUMENT_INTENTS.EDIT:
      case DOCUMENT_INTENTS.REWRITE:
      case DOCUMENT_INTENTS.EXPAND:
        // If user wants to refine/edit, regenerate with updated params
        response = await handleDraftIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case DOCUMENT_INTENTS.EXPORT:
      case DOCUMENT_INTENTS.FORMAT:
        response = await handleExportIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case DOCUMENT_INTENTS.CLARIFY:
      case DOCUMENT_INTENTS.INFO:
      default:
        // General response
        await addMessage(
          actualConversationId,
          userId,
          'assistant',
          analysis.suggestedResponse,
          {},
          isGuest
        );

        response = {
          conversationId: actualConversationId,
          userId,
          success: true,
          needsMoreInfo: !analysis.canProceed,
          message: analysis.suggestedResponse,
          collectedParams: updatedParams,
        };
        break;
    }

    return response;
  } catch (error) {
    logger.error('Error processing conversational request:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process document request'
    );
  }
};

/**
 * Direct document generation (non-conversational)
 */
const generateDocument = async (
  params,
  userId,
  isGuest = false,
  req = null
) => {
  try {
    logger.info('Direct document generation', { params });

    // Generate content
    const documentContent = await generateDocumentContent(params);

    // Prepare metadata
    const metadata = {
      title: params.title || `${params.documentType || 'Document'}`,
      documentType: params.documentType,
      includeDate: params.includeDate !== false,
      includeTitle: params.includeTitle !== false,
    };

    // Export to format
    const outputFormat = params.outputFormat || DEFAULT_PARAMS.outputFormat;
    const exportResult = await exportDocument(
      documentContent,
      outputFormat,
      metadata
    );

    // Upload to GCS
    const uploadResult = await uploadDocumentToGCS(exportResult.filePath, {
      userId,
      documentType: params.documentType,
      title: metadata.title,
    });

    return {
      success: true,
      document: {
        content: documentContent,
        format: outputFormat,
        file: exportResult,
        url: uploadResult.publicUrl || uploadResult.localPath,
        metadata,
      },
    };
  } catch (error) {
    logger.error('Error generating document:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate document'
    );
  }
};

export const documentService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  generateDocument,
  generateDocumentContent,
  exportDocument,
};
