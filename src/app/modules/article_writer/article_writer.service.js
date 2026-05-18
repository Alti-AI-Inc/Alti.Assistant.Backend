import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import fs from 'fs/promises';
import path from 'path';
import {
  ARTICLE_WRITER_CONFIG,
  ARTICLE_TYPES,
  WRITING_TONES,
  ARTICLE_LENGTHS,
  SYSTEM_PROMPTS,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  RESPONSE_MESSAGES,
} from './article_writer.constant.js';

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
const fileManager = new GoogleAIFileManager(config.gemini_secret_key);

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
  return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle article writer conversation (create or retrieve)
 */
const handleArticleWriterConversation = async (
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
          title: `Article: ${userMessage.substring(0, 50)}...`,
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

      logger.info(
        `Created new article writer conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling article writer conversation:', error);
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
 * Process uploaded file and extract text content
 */
const processUploadedFile = async (fileInfo) => {
  try {
    if (!fileInfo) return null;

    const filePath = fileInfo.path || fileInfo.location;
    const mimeType = fileInfo.mimetype;

    logger.info(`Processing file: ${fileInfo.originalName}, type: ${mimeType}`);

    // Upload file to Gemini
    const uploadResponse = await fileManager.uploadFile(filePath, {
      mimeType: mimeType,
      displayName: fileInfo.originalName,
    });

    logger.info(`File uploaded to Gemini: ${uploadResponse.file.uri}`);

    return {
      fileUri: uploadResponse.file.uri,
      mimeType: uploadResponse.file.mimeType,
      displayName: fileInfo.originalName,
    };
  } catch (error) {
    logger.error('Error processing file:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process uploaded file'
    );
  }
};

/**
 * Build article generation prompt based on parameters
 */
const buildArticlePrompt = (
  message,
  articleType,
  tone,
  length,
  fileContent = null
) => {
  const typePrompt =
    articleType && articleType !== ARTICLE_TYPES.GENERAL
      ? SYSTEM_PROMPTS[articleType]
      : '';

  const lengthGuidelines = {
    short: '300-500 words',
    medium: '500-1000 words',
    long: '1000-2000 words',
    comprehensive: '2000+ words',
  };

  const lengthGuideline = lengthGuidelines[length] || lengthGuidelines.medium;
  const toneDescription = tone || WRITING_TONES.PROFESSIONAL;

  let prompt = `${SYSTEM_PROMPTS.CONVERSATIONAL}\n\n`;

  if (typePrompt) {
    prompt += `Article Type Instructions: ${typePrompt}\n\n`;
  }

  prompt += `Writing Requirements:
- Tone: ${toneDescription}
- Target Length: ${lengthGuideline}
- Format: Plain text with proper structure
- Use clear headings and paragraphs
- Make it engaging and well-organized\n\n`;

  if (fileContent) {
    prompt += `The user has uploaded a file with content to use as the basis for the article.\n\n`;
  }

  prompt += `User Request: ${message}\n\n`;
  prompt += `Please write the article based on these requirements. Return only the article text, properly formatted with headings and paragraphs.`;

  return prompt;
};

/**
 * Generate article using Gemini AI
 */
const generateArticle = async (prompt, fileData = null) => {
  try {
    const model = genAI.getGenerativeModel({
      model: ARTICLE_WRITER_CONFIG.MODEL,
    });

    const generationConfig = {
      temperature: ARTICLE_WRITER_CONFIG.TEMPERATURE,
      maxOutputTokens: ARTICLE_WRITER_CONFIG.MAX_OUTPUT_TOKENS,
    };

    let result;

    if (fileData) {
      // Generate with file context
      result = await model.generateContent(
        [
          {
            fileData: {
              mimeType: fileData.mimeType,
              fileUri: fileData.fileUri,
            },
          },
          { text: prompt },
        ],
        generationConfig
      );
    } else {
      // Generate without file
      result = await model.generateContent(prompt, generationConfig);
    }

    const response = result.response;
    const articleText = response.text();

    return articleText;
  } catch (error) {
    logger.error('Error generating article with Gemini:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate article'
    );
  }
};

/**
 * Process conversational article writing request
 */
const processConversationalRequest = async (
  userId,
  message,
  conversationId,
  fileInfo = null,
  isGuest = false,
  articleType = null,
  tone = null,
  length = null,
  req = null
) => {
  try {
    // Handle conversation
    const conversation = await handleArticleWriterConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );

    // Add user message to conversation
    await addMessage(
      conversation.conversationId,
      userId,
      'user',
      message,
      {
        hasFile: !!fileInfo,
        fileName: fileInfo?.originalName,
      },
      req
    );

    // Process file if uploaded
    let fileData = null;
    if (fileInfo) {
      fileData = await processUploadedFile(fileInfo);

      // Update conversation metadata with uploaded file info
      if (conversation.metadata && conversation.metadata.uploadedFiles) {
        conversation.metadata.uploadedFiles.push({
          fileName: fileInfo.originalName,
          uploadedAt: new Date(),
        });
        await conversation.save();
      }
    }

    // Use provided parameters or defaults
    const finalArticleType = articleType || DEFAULT_PARAMS.articleType;
    const finalTone = tone || DEFAULT_PARAMS.tone;
    const finalLength = length || DEFAULT_PARAMS.length;

    // Build prompt
    const prompt = buildArticlePrompt(
      message,
      finalArticleType,
      finalTone,
      finalLength,
      fileData
    );

    // Generate article
    const articleText = await generateArticle(prompt, fileData);

    // Add AI response to conversation
    await addMessage(
      conversation.conversationId,
      userId,
      'assistant',
      articleText,
      {
        articleType: finalArticleType,
        tone: finalTone,
        length: finalLength,
        hasFile: !!fileData,
      },
      req
    );

    // Clean up uploaded file if it exists
    if (fileInfo && fileInfo.path) {
      try {
        await fs.unlink(fileInfo.path);
        logger.info(`Cleaned up uploaded file: ${fileInfo.path}`);
      } catch (error) {
        logger.warn(`Failed to delete uploaded file: ${error.message}`);
      }
    }

    return {
      conversationId: conversation.conversationId,
      userId: userId,
      article: articleText,
      metadata: {
        articleType: finalArticleType,
        tone: finalTone,
        length: finalLength,
      },
    };
  } catch (error) {
    logger.error('Error processing conversational article request:', error);
    throw error;
  }
};

/**
 * Get conversation history
 */
const getConversationHistory = async (conversationId, userId) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId
    );

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    return conversation;
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    throw error;
  }
};

export const articleWriterService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  getConversationHistory,
};
