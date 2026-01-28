import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs/promises';
import path from 'path';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { fileProcessor } from '../document_review/services/fileProcessor.js';
import { uploadRewriteToGCS } from './services/gcsUploadService.js';
import {
  REWRITE_CONFIG,
  REWRITE_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  INTENT_KEYWORDS,
  FILE_KEYWORDS,
  OUTPUT_FORMATS,
  STORAGE_CONFIG,
} from './rewrite.constant.js';

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
  return `rewrite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle rewrite conversation (create or retrieve)
 */
const handleRewriteConversation = async (userId, conversationId, userMessage, isGuest = false, req = null) => {
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
          title: `Rewrite: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            uploadedFiles: [],
            textContent: null,
          },
        },
        newConversationId,
        req
      );

      logger.info(`Created new rewrite conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling rewrite conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}, req = null) => {
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
 * Store uploaded file information in conversation metadata
 */
const storeFileInConversation = async (conversationId, userId, fileInfo) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    if (conversation) {
      const uploadedFiles = conversation.metadata?.uploadedFiles || [];
      uploadedFiles.push({
        filename: fileInfo.filename,
        originalName: fileInfo.originalName,
        mimetype: fileInfo.mimetype,
        size: fileInfo.size,
        path: fileInfo.path,
        uploadedAt: new Date(),
      });

      conversation.metadata = {
        ...conversation.metadata,
        uploadedFiles,
        currentFile: fileInfo,
      };

      await conversation.save();
      logger.info(`Stored file info in conversation ${conversationId}`);
    }
  } catch (error) {
    logger.error('Error storing file in conversation:', error);
  }
};

/**
 * Store text content in conversation metadata
 */
const storeTextInConversation = async (conversationId, userId, textContent) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    if (conversation) {
      conversation.metadata = {
        ...conversation.metadata,
        textContent,
      };

      await conversation.save();
      logger.info(`Stored text content in conversation ${conversationId}`);
    }
  } catch (error) {
    logger.error('Error storing text in conversation:', error);
  }
};

/**
 * Detect rewrite intent from user message
 */
const detectIntent = (message) => {
  const lowerMessage = message.toLowerCase();

  // Check for specific intents based on keywords
  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      return intent;
    }
  }

  // Check if it's just asking for a general rewrite
  if (
    lowerMessage.includes('rewrite') ||
    lowerMessage.includes('reword') ||
    lowerMessage.includes('improve')
  ) {
    return REWRITE_INTENTS.GENERAL_REWRITE;
  }

  return REWRITE_INTENTS.UNKNOWN;
};

/**
 * Detect if user wants file output
 */
const shouldGenerateFile = (message) => {
  const lowerMessage = message.toLowerCase();
  return FILE_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
};

/**
 * Build rewrite instructions based on parameters
 */
const buildRewriteInstructions = (rewriteParams, userMessage = '') => {
  let instructions = [];

  if (rewriteParams.style) {
    instructions.push(`Style: ${rewriteParams.style}`);
  }

  if (rewriteParams.mode) {
    instructions.push(`Mode: ${rewriteParams.mode}`);
  }

  if (rewriteParams.targetAudience) {
    instructions.push(`Target Audience: ${rewriteParams.targetAudience}`);
  }

  if (rewriteParams.additionalInstructions) {
    instructions.push(`Additional Instructions: ${rewriteParams.additionalInstructions}`);
  }

  if (userMessage) {
    instructions.push(`User Request: ${userMessage}`);
  }

  return instructions.length > 0 ? instructions.join('\n') : 'Please rewrite the content.';
};

/**
 * Perform content rewrite using AI
 */
const performRewrite = async (content, rewriteParams, conversationHistory = []) => {
  try {

    //If no content provided, use the conversation history to rewrite. Get the context from there. Content could be anywhere in the history. So we need full history to be passed.
    if (!content || content.trim().length === 0) {
      let combinedContent = '';
      conversationHistory.forEach(msg => {
        if (msg.role === 'user' || msg.role === 'assistant') {
          combinedContent += `${msg.content}\n`;
        }
      });
      content = combinedContent.trim();
    }
    logger.info('Starting content rewrite', {
      contentLength: content.length,
      intent: rewriteParams.intent,
      style: rewriteParams.style,
    });

    // Determine intent and system prompt
    const intent = rewriteParams.intent || REWRITE_INTENTS.GENERAL_REWRITE;
    const systemPrompt = SYSTEM_PROMPTS[intent] || SYSTEM_PROMPTS[REWRITE_INTENTS.GENERAL_REWRITE];

    // Build context from conversation history
    let contextPrompt = '';
    if (conversationHistory.length > 0) {
      const recentMessages = conversationHistory.slice(-5);
      contextPrompt =
        '\n\nPrevious conversation context:\n' +
        recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    // Build rewrite instructions
    const rewriteInstructions = buildRewriteInstructions(
      rewriteParams,
      rewriteParams.userMessage || ''
    );

    // Create comprehensive prompt
    const fullPrompt = `${systemPrompt}

${rewriteInstructions}

${contextPrompt}

Original Content:
${content}

Please provide the rewritten version.`;

    // Generate rewrite using Gemini
    const model = genAI.getGenerativeModel({
      model: REWRITE_CONFIG.MODEL,
      generationConfig: {
        temperature: REWRITE_CONFIG.TEMPERATURE,
        maxOutputTokens: REWRITE_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const rewrittenContent = response.text();

    logger.info('Rewrite completed successfully');

    return {
      success: true,
      originalContent: content,
      rewrittenContent,
      metadata: {
        intent,
        style: rewriteParams.style,
        mode: rewriteParams.mode,
        contentLength: {
          original: content.length,
          rewritten: rewrittenContent.length,
        },
      },
    };
  } catch (error) {
    logger.error('Error performing rewrite:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to rewrite content'
    );
  }
};

/**
 * Generate file from rewritten content
 */
const generateRewriteFile = async (rewrittenContent, originalFilename = null, userId = null, metadata = {}) => {
  try {
    // Ensure output directory exists
    await fs.mkdir(STORAGE_CONFIG.OUTPUT_FOLDER, { recursive: true });

    const timestamp = Date.now();
    const filename = originalFilename
      ? `rewritten_${timestamp}_${originalFilename}`
      : `rewritten_${timestamp}.txt`;

    const filePath = path.join(STORAGE_CONFIG.OUTPUT_FOLDER, filename);

    await fs.writeFile(filePath, rewrittenContent, 'utf-8');

    logger.info(`Generated rewrite file: ${filePath}`);

    // Upload to GCS
    const gcsResult = await uploadRewriteToGCS(filePath, {
      userId,
      intent: metadata.intent,
      style: metadata.style,
      mode: metadata.mode,
      originalFileName: originalFilename,
    });

    // Delete local file after successful GCS upload
    if (gcsResult.storageType === 'gcs' && gcsResult.success) {
      try {
        await fs.unlink(filePath);
        logger.info(`Deleted local file after GCS upload: ${filePath}`);
      } catch (unlinkError) {
        logger.warn(`Failed to delete local file: ${unlinkError.message}`);
      }
    }

    return {
      filename,
      path: gcsResult.storageType === 'gcs' ? gcsResult.gcsPath : filePath,
      localPath: gcsResult.localPath,
      publicUrl: gcsResult.publicUrl,
      size: Buffer.byteLength(rewrittenContent, 'utf-8'),
      storageType: gcsResult.storageType,
      gcsDestination: gcsResult.destination,
    };
  } catch (error) {
    logger.error('Error generating rewrite file:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to generate file');
  }
};

/**
 * Process conversational rewrite request
 */
const processConversationalRequest = async (
  userId,
  message,
  conversationId,
  fileInfo = null,
  textContent = null,
  isGuest = false,
  req = null
) => {
  try {
    // Handle conversation
    const conversation = await handleRewriteConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );

    const convId = conversation.conversationId;

    // Add user message to conversation
    await addMessage(convId, userId, 'user', message, {
      hasFile: !!fileInfo,
      hasText: !!textContent,
    }, req);

    // Detect intent and file generation preference
    const intent = detectIntent(message);
    const wantsFile = shouldGenerateFile(message);

    logger.info('Detected intent and preferences', {
      intent,
      wantsFile,
      hasFile: !!fileInfo,
      hasText: !!textContent,
    });

    // Extract content from file if provided
    let contentToRewrite = textContent;

    if (fileInfo) {
      try {
        contentToRewrite = await fileProcessor.extractTextFromFile(fileInfo);
        await storeFileInConversation(convId, userId, fileInfo);
      } catch (error) {
        logger.error('Error extracting text from file:', error);
        const errorMessage = 'Unable to extract text from the file. Please ensure the file is in a supported format.';
        await addMessage(convId, userId, 'assistant', errorMessage, {}, req);
        return {
          success: false,
          conversationId: convId,
          message: errorMessage,
          needsFile: false,
          needsMoreInfo: true,
        };
      }
    } else if (textContent) {
      await storeTextInConversation(convId, userId, textContent);
    }

    // If no content in current request, check conversation metadata for previous content
    if (!contentToRewrite || contentToRewrite.trim().length === 0) {
      // Check for previously stored text content
      console.log('conversation.metadata:', conversation);
      if (conversation.metadata?.textContent) {
        contentToRewrite = conversation.metadata.textContent;
        logger.info('Using previously stored text content from conversation metadata');
      }
      // Check for previously uploaded files
      else if (conversation.metadata?.currentFile) {
        try {
          contentToRewrite = await fileProcessor.extractTextFromFile(conversation.metadata.currentFile);
          logger.info('Using previously uploaded file from conversation metadata');
        } catch (error) {
          logger.error('Error extracting text from previous file:', error);
        }
      }
      // Check the uploadedFiles array if currentFile is not set
      else if (conversation.metadata?.uploadedFiles && conversation.metadata.uploadedFiles.length > 0) {
        try {
          const lastFile = conversation.metadata.uploadedFiles[conversation.metadata.uploadedFiles.length - 1];
          contentToRewrite = await fileProcessor.extractTextFromFile(lastFile);
          logger.info('Using last uploaded file from conversation history');
        } catch (error) {
          logger.error('Error extracting text from conversation file history:', error);
        }
      }
    }

    // Check if we still don't have content to rewrite
    if ((!contentToRewrite || contentToRewrite.trim().length === 0) && !conversationId) {
      const needContentMessage = 'Please provide the text you want to rewrite or upload a document.';
      await addMessage(convId, userId, 'assistant', needContentMessage, {}, req);
      return {
        success: false,
        conversationId: convId,
        message: needContentMessage,
        needsFile: true,
        needsMoreInfo: true,
      };
    }

    // Get conversation history for context
    const conversationHistory = conversation.messages || [];

    // Prepare rewrite parameters
    const rewriteParams = {
      intent,
      style: DEFAULT_PARAMS.style,
      mode: DEFAULT_PARAMS.mode,
      userMessage: message,
    };

    // Extract style and mode from message if mentioned
    const messageLower = message.toLowerCase();
    if (messageLower.includes('formal')) rewriteParams.style = 'formal';
    if (messageLower.includes('casual')) rewriteParams.style = 'casual';
    if (messageLower.includes('professional')) rewriteParams.style = 'professional';
    if (messageLower.includes('academic')) rewriteParams.style = 'academic';
    if (messageLower.includes('simplify')) rewriteParams.mode = 'simplify';
    if (messageLower.includes('expand')) rewriteParams.mode = 'expand';
    if (messageLower.includes('shorten')) rewriteParams.mode = 'shorten';

    // Update conversation metadata
    await updateConversationMetadata(convId, userId, rewriteParams, req);

    // Perform rewrite
    const rewriteResult = await performRewrite(
      contentToRewrite,
      rewriteParams,
      conversationHistory
    );

    let fileGenerated = null;

    // Generate file if requested
    if (wantsFile) {
      try {
        fileGenerated = await generateRewriteFile(
          rewriteResult.rewrittenContent,
          fileInfo?.originalName,
          userId,
          {
            intent: rewriteParams.intent,
            style: rewriteParams.style,
            mode: rewriteParams.mode,
          }
        );
      } catch (error) {
        logger.warn('Error generating file, continuing with text response:', error);
      }
    }

    // Add assistant response to conversation
    const assistantMessage = fileGenerated
      ? `${rewriteResult.rewrittenContent}\n\n${RESPONSE_MESSAGES.FILE_GENERATED}: ${fileGenerated.filename}`
      : rewriteResult.rewrittenContent;

    await addMessage(convId, userId, 'assistant', assistantMessage, {
      rewriteMetadata: rewriteResult.metadata,
      fileGenerated: fileGenerated ? true : false,
    }, req);

    return {
      success: true,
      conversationId: convId,
      message: RESPONSE_MESSAGES.SUCCESS,
      rewrittenContent: rewriteResult.rewrittenContent,
      originalContent: rewriteResult.originalContent,
      metadata: rewriteResult.metadata,
      file: fileGenerated,
      outputFormat: wantsFile ? OUTPUT_FORMATS.BOTH : OUTPUT_FORMATS.TEXT,
    };
  } catch (error) {
    logger.error('Error in conversational rewrite:', error);
    throw error;
  }
};

/**
 * Direct rewrite (non-conversational)
 */
const rewriteContent = async (content, rewriteParams, userId, isGuest = false) => {
  try {
    // Perform rewrite
    const rewriteResult = await performRewrite(content, rewriteParams);

    let fileGenerated = null;

    // Generate file if output format is FILE or BOTH
    if (
      rewriteParams.outputFormat === OUTPUT_FORMATS.FILE ||
      rewriteParams.outputFormat === OUTPUT_FORMATS.BOTH
    ) {
      fileGenerated = await generateRewriteFile(
        rewriteResult.rewrittenContent,
        null,
        userId,
        {
          intent: rewriteParams.intent,
          style: rewriteParams.style,
          mode: rewriteParams.mode,
        }
      );
    }

    return {
      success: true,
      message: RESPONSE_MESSAGES.SUCCESS,
      rewrittenContent: rewriteResult.rewrittenContent,
      originalContent: rewriteResult.originalContent,
      metadata: rewriteResult.metadata,
      file: fileGenerated,
      outputFormat: rewriteParams.outputFormat || OUTPUT_FORMATS.TEXT,
    };
  } catch (error) {
    logger.error('Error in direct rewrite:', error);
    throw error;
  }
};

export const rewriteService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  rewriteContent,
  detectIntent,
  shouldGenerateFile,
};
