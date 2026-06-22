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
import { vertexClaudeService } from '../search/services/vertexClaudeService.js';

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client with the API key.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * @constant {object} model - Configured Gemini generative model for document drafting.
 * @property {string} model.model - The specific Gemini model ID to use.
 * @property {object} model.generationConfig - Configuration for content generation.
 * @property {number} model.generationConfig.temperature - Controls the randomness of the output.
 * @property {number} model.generationConfig.maxOutputTokens - The maximum number of tokens to generate.
 */
const model = genAI.getGenerativeModel({
  model: DOCUMENT_CONFIG.MODEL,
  generationConfig: {
    temperature: DOCUMENT_CONFIG.TEMPERATURE,
    maxOutputTokens: DOCUMENT_CONFIG.MAX_OUTPUT_TOKENS,
  },
});

/**
 * @function generateGuestUserId
 * @description Generates a unique guest user ID using a new Mongoose ObjectId.
 * @returns {string} A unique string representation of a Mongoose ObjectId.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * @function generateConversationId
 * @description Generates a unique conversation ID with a 'doc_' prefix, timestamp, and random string.
 * @returns {string} A unique string identifier for a new conversation.
 */
const generateConversationId = () => {
  return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * @function handleDocumentConversation
 * @description Handles the creation or retrieval of a document drafting conversation.
 * If a `conversationId` is provided, it attempts to retrieve it. If not found or not provided,
 * a new conversation is created.
 *
 * @param {string} userId - The ID of the user initiating or continuing the conversation.
 * @param {string | null | undefined} conversationId - The ID of an existing conversation, or null/undefined to create a new one.
 * @param {string} userMessage - The initial message from the user, used for new conversation title.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, if available, for context/tracing.
 * @returns {Promise<object>} A promise that resolves to the conversation object (either retrieved or newly created).
 * @throws {ApiError} If the conversation ID was provided but not found or not accessible (HTTP 404).
 * @throws {ApiError} For other internal server errors during conversation handling (HTTP 500).
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
    let actualConversationId = conversationId; // Use provided ID initially

    if (conversationId) {
      try {
        // Optimization Note: This function returns a full Mongoose document
        // because it might be modified and saved later in the request lifecycle (e.g., in saveConversationSummary).
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        );
        logger.info(`Retrieved existing conversation: ${conversationId}`);
      } catch (error) {
        // BUG/SECURITY FIX: If conversationId was provided but not found or not accessible,
        // it should be treated as an error (e.g., NOT_FOUND or FORBIDDEN),
        // not silently creating a new conversation. This prevents masking IDOR attempts.
        logger.warn(
          `Attempted to retrieve conversation ${conversationId} for user ${userId} but failed. Error: ${error.message}`
        );
        throw new ApiError(
          httpStatus.NOT_FOUND, // Or FORBIDDEN if getConversationById specifically checks ownership
          `Conversation with ID ${conversationId} not found or not accessible.`
        );
      }
    }

    if (!conversation) {
      // Only generate a new ID if no conversationId was provided initially.
      // If we reach here, it means conversationId was null/undefined.
      actualConversationId = documentService.generateConversationId();

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
        actualConversationId, // Use the newly generated ID
        req
      );

      logger.info(
        `Created new document conversation ${actualConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    // Re-throw ApiError if it's already one, otherwise wrap it.
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error handling document conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * @function addMessage
 * @description Adds a new message to an existing conversation.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user' | 'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The content of the message.
 * @param {object} [metadata={}] - Optional metadata to associate with the message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, if available.
 * @returns {Promise<object>} A promise that resolves to the updated conversation object.
 * @throws {ApiError} If adding the message to the conversation fails (HTTP 500).
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
 * @function updateConversationMetadata
 * @description Updates specific metadata parameters within a conversation.
 * This is typically used to store collected parameters for document generation.
 *
 * @param {string} conversationId - The ID of the conversation to update.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {object} params - The parameters to update in the conversation's `collectedParams` metadata.
 * @param {object} [req=null] - The Express request object, if available.
 * @returns {Promise<void>} A promise that resolves when the metadata is updated.
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
 * @function saveConversationSummary
 * @description Saves a generated summary to the conversation's metadata.
 * This helps in managing long conversations by providing a concise context.
 *
 * @param {object} conversation - The Mongoose conversation document to update.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} summary - The generated summary of the conversation.
 * @param {object} [req=null] - The Express request object, if available.
 * @returns {Promise<void>} A promise that resolves when the summary is saved.
 */
const saveConversationSummary = async (
  conversation, // Optimized: Accept the conversation object directly to avoid re-fetching.
  userId,
  summary,
  req = null
) => {
  try {
    // Optimization: Removed redundant fetch of conversation as it's passed directly.
    if (conversation) {
      conversation.metadata = {
        ...conversation.metadata,
        conversationSummary: summary,
        summarizedAt: new Date().toISOString(),
        summarizedMessageCount: conversation.messages.length,
      };

      await conversation.save();
      logger.info(`Saved conversation summary for ${conversation.conversationId}`);
    }
  } catch (error) {
    logger.error('Error saving conversation summary:', error);
  }
};

/**
 * @function generateDocumentContent
 * @description Generates document content using the configured AI model based on provided parameters.
 * It constructs a detailed prompt to guide the AI in creating a high-quality document.
 *
 * @param {object} params - Parameters for document generation.
 * @param {string} params.content - The main content or topic for the document.
 * @param {string} [params.documentType=DEFAULT_PARAMS.documentType] - The type of document to generate (e.g., 'email', 'report').
 * @param {string} [params.tone=DEFAULT_PARAMS.tone] - The desired tone of the document (e.g., 'formal', 'friendly').
 * @param {string} [params.length=DEFAULT_PARAMS.length] - The desired length of the document (e.g., 'short', 'medium', 'long').
 * @param {number} [params.wordCount] - An approximate word count for the document.
 * @param {string} [params.language=DEFAULT_PARAMS.language] - The language of the document.
 * @param {string} [params.additionalInstructions=''] - Any additional instructions for the AI.
 * @returns {Promise<string>} A promise that resolves to the generated document content as a string.
 * @throws {ApiError} If the AI content generation fails (HTTP 500).
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

    // BUG/SECURITY FIX: Wrap user-provided free-form text in distinct markers
    // to mitigate prompt injection risks. This clearly delineates user input
    // from system instructions for the AI model.
    let prompt = `You are a professional document writer. Generate a high-quality ${documentType} document.

<user_content>
${content}
</user_content>

Requirements:
- Document Type: ${documentType}
- Tone: ${tone}
- Length: ${length}${wordCount ? ` (approximately ${wordCount} words)` : ''}
- Language: ${language}
${additionalInstructions ? `- Additional Instructions: <user_instructions>${additionalInstructions}</user_instructions>` : ''}

Guidelines:
1. Create well-structured, professional content
2. Use appropriate formatting (headings, paragraphs, lists where needed)
3. Ensure logical flow and coherence
4. Match the specified tone and style
5. Be clear, concise, and engaging

Generate the complete document content now:`;

    let documentContent;
    try {
      const result = await vertexClaudeService.generateText([
        { role: 'user', content: prompt }
      ], {
        temperature: DOCUMENT_CONFIG.TEMPERATURE,
        maxTokens: DOCUMENT_CONFIG.MAX_OUTPUT_TOKENS
      });
      documentContent = result.text;
    } catch (claudeError) {
      logger.error('Vertex Claude failed for document content generation, falling back to Gemini:', claudeError);
      const result = await model.generateContent(prompt);
      documentContent = result.response.text();
    }

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
 * @function handleDraftIntent
 * @description Handles the 'DRAFT' intent, which involves generating a document, exporting it,
 * uploading it to GCS, and responding to the user with the document details and refinement options.
 *
 * @param {object} analysis - The intent analysis result from `conversationAnalyzer`.
 * @param {boolean} analysis.canProceed - Indicates if enough information is available to proceed with drafting.
 * @param {string} analysis.suggestedResponse - A response message for the user, especially if `canProceed` is false.
 * @param {string[]} [analysis.improvementQuestions] - An array of questions to ask the user for potential refinements.
 * @param {object} updatedParams - The merged and updated parameters for document generation, including `content`, `documentType`, `tone`, `length`, `outputFormat`, etc.
 * @param {string} conversationId - The ID of the current conversation.
 * @param {string} userId - The ID of the user.
 * @param {boolean} isGuest - Indicates if the user is a guest.
 * @returns {Promise<object>} A promise that resolves to an object containing the draft result,
 * including document content, format, URL, and refinement questions.
 * @throws {ApiError} If document generation, export, or upload fails.
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
      await documentService.addMessage(
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

    await documentService.addMessage(
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
        // BUG/SECURITY FIX: Do not expose localPath to the client.
        // Only publicUrl should be returned. If publicUrl is not available,
        // the URL will be null, which is safer than exposing internal paths.
        url: uploadResult.publicUrl,
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
 * @function handleExportIntent
 * @description Handles the 'EXPORT' intent, which involves taking existing document content
 * and exporting it to a specified format, then uploading it to GCS.
 *
 * @param {object} analysis - The intent analysis result (though not fully used here, kept for consistency).
 * @param {object} updatedParams - The merged and updated parameters for document export.
 * @param {string} updatedParams.content - The document content to be exported.
 * @param {string} updatedParams.outputFormat - The desired output format (e.g., 'pdf', 'docx', 'txt', 'html', 'md').
 * @param {string} [updatedParams.title] - The title for the exported document.
 * @param {string} [updatedParams.documentType] - The type of document.
 * @param {string} conversationId - The ID of the current conversation.
 * @param {string} userId - The ID of the user.
 * @param {boolean} isGuest - Indicates if the user is a guest.
 * @returns {Promise<object>} A promise that resolves to an object containing the export result,
 * including the format and URL of the exported document.
 * @throws {ApiError} If document export or upload fails.
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
      await documentService.addMessage(
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
      await documentService.addMessage(
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

    await documentService.addMessage(
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
        // BUG/SECURITY FIX: Do not expose localPath to the client.
        // Only publicUrl should be returned.
        url: uploadResult.publicUrl,
      },
      collectedParams: updatedParams,
    };
  } catch (error) {
    logger.error('Error handling export intent:', error);
    throw error;
  }
};

/**
 * @function processConversationalRequest
 * @description The main entry point for handling conversational document drafting requests.
 * It manages conversation state, analyzes user intent, collects parameters,
 * generates/exports documents, and provides conversational responses.
 *
 * @param {string} userId - The ID of the user.
 * @param {string} userMessage - The message from the user.
 * @param {string | null | undefined} conversationId - The ID of an existing conversation, or null/undefined for a new one.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @returns {Promise<object>} A promise that resolves to the conversational response object,
 * which may include generated document details, messages, or questions for more info.
 * @throws {ApiError} For any internal server errors during the conversational process (HTTP 500).
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
    const conversation = await documentService.handleDocumentConversation(
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
    await documentService.addMessage(
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
      // Optimization: Pass the already-fetched conversation object to avoid a redundant database query.
      await documentService.saveConversationSummary(
        conversation, // Pass the Mongoose document directly
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
    await documentService.updateConversationMetadata(
      actualConversationId,
      userId,
      updatedParams
    );

    // Handle different intents
    let response;

    switch (analysis.intent) {
      case DOCUMENT_INTENTS.DRAFT:
        response = await documentService.handleDraftIntent(
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
        response = await documentService.handleDraftIntent(
          analysis,
          updatedParams,
          actualConversationId,
          userId,
          isGuest
        );
        break;

      case DOCUMENT_INTENTS.EXPORT:
      case DOCUMENT_INTENTS.FORMAT:
        response = await documentService.handleExportIntent(
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
        await documentService.addMessage(
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
 * @function generateDocument
 * @description Provides a direct, non-conversational way to generate and export a document.
 * This function takes all necessary parameters upfront, generates the content,
 * exports it to a specified format, and uploads it to GCS.
 *
 * @param {object} params - Parameters for document generation and export.
 * @param {string} params.content - The main content or topic for the document.
 * @param {string} [params.documentType=DEFAULT_PARAMS.documentType] - The type of document to generate.
 * @param {string} [params.tone=DEFAULT_PARAMS.tone] - The desired tone.
 * @param {string} [params.length=DEFAULT_PARAMS.length] - The desired length.
 * @param {number} [params.wordCount] - An approximate word count.
 * @param {string} [params.language=DEFAULT_PARAMS.language] - The language.
 * @param {string} [params.additionalInstructions=''] - Any additional instructions.
 * @param {string} [params.title] - Optional title for the document.
 * @param {boolean} [params.includeDate=true] - Whether to include the date in the document metadata.
 * @param {boolean} [params.includeTitle=true] - Whether to include the title in the document metadata.
 * @param {string} [params.outputFormat=DEFAULT_PARAMS.outputFormat] - The desired output format (e.g., 'pdf', 'docx').
 * @param {string} userId - The ID of the user requesting the document.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, if available.
 * @returns {Promise<object>} A promise that resolves to an object containing the generated document details,
 * including content, format, and a public URL.
 * @throws {ApiError} If document generation, export, or upload fails (HTTP 500).
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
        // BUG/SECURITY FIX: Do not expose localPath to the client.
        // Only publicUrl should be returned.
        url: uploadResult.publicUrl,
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

/**
 * @constant {object} documentService
 * @description Provides a collection of functions for document drafting, generation, and conversational handling.
 * This service encapsulates the core logic for interacting with AI models, managing conversations,
 * and handling document output.
 * @property {function(): string} generateGuestUserId - Generates a unique ID for guest users.
 * @property {function(): string} generateConversationId - Generates a unique ID for new conversations.
 * @property {function(string, string, string, boolean): Promise<object>} processConversationalRequest - Handles the main conversational flow for document drafting.
 * @property {function(object, string, boolean, object): Promise<object>} generateDocument - Generates a document directly based on provided parameters.
 * @property {function(object): Promise<string>} generateDocumentContent - Generates the raw text content of a document using AI.
 * @property {function(string, string, object): Promise<object>} exportDocument - Exports document content to a specified file format.
 */
export const documentService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  generateDocument,
  generateDocumentContent,
  exportDocument,
  handleDocumentConversation,
  handleDraftIntent,
  handleExportIntent,
  addMessage,
  updateConversationMetadata,
  saveConversationSummary,
};