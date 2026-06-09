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

/**
 * Initializes the Google Generative AI client using the API key from configuration.
 * @type {GoogleGenerativeAI}
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
/**
 * Initializes the Google AI File Manager client using the API key from configuration.
 * Used for uploading and managing files with Google Gemini.
 * @type {GoogleAIFileManager}
 */
const fileManager = new GoogleAIFileManager(config.gemini_secret_key);

/**
 * Generates a unique guest user ID using Mongoose's ObjectId.
 * This is used for users who are not authenticated.
 * @returns {string} A unique string representing a guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for article writing sessions.
 * The ID is a combination of a timestamp and a random string.
 * @returns {string} A unique string representing a conversation ID.
 */
const generateConversationId = () => {
  return `article_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of an article writer conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no `conversationId` is provided or the existing one is not found, a new conversation is created.
 *
 * @param {string} userId - The ID of the user (authenticated or guest).
 * @param {string | null} conversationId - The ID of an existing conversation, or null to create a new one.
 * @param {string} userMessage - The initial message from the user, used for the conversation title if new.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {object} [req=null] - The Express request object, potentially containing transaction information.
 * @returns {Promise<object>} The conversation object (either existing or newly created).
 * @throws {ApiError} If there's an internal server error during conversation handling.
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
 * Adds a new message to an existing conversation.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user' | 'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The text content of the message.
 * @param {object} [metadata={}] - Optional metadata to store with the message.
 * @param {object} [req=null] - The Express request object, potentially containing transaction information.
 * @returns {Promise<object>} The updated conversation object after adding the message.
 * @throws {ApiError} If there's an internal server error during message addition.
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
 * Processes an uploaded file by uploading it to Google Gemini's file manager.
 * This makes the file accessible to Gemini models for content generation.
 *
 * @param {object} fileInfo - Information about the uploaded file.
 * @param {string} fileInfo.path - The local path to the uploaded file.
 * @param {string} fileInfo.location - Alternative local path to the uploaded file (used if `path` is not present).
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {string} fileInfo.originalName - The original name of the file.
 * @returns {Promise<{fileUri: string, mimeType: string, displayName: string} | null>} An object containing the Gemini file URI, MIME type, and display name, or null if no fileInfo is provided.
 * @throws {ApiError} If there's an internal server error during file processing or upload.
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
 * Builds a comprehensive prompt for the Gemini AI model to generate an article.
 * The prompt incorporates user message, desired article type, tone, length, and file content if available.
 *
 * @param {string} message - The user's core request or topic for the article.
 * @param {string | null} articleType - The type of article (e.g., 'blog_post', 'news_article'), or null for general.
 * @param {string | null} tone - The desired writing tone (e.g., 'professional', 'casual').
 * @param {string | null} length - The desired length of the article (e.g., 'short', 'medium', 'long', 'comprehensive').
 * @param {object | null} [fileContent=null] - Optional object indicating if file content is provided, used to adjust the prompt.
 * @returns {string} The fully constructed prompt string for the AI model.
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
 * Generates an article using the Google Gemini AI model based on a given prompt.
 * It can optionally include file data as context for generation.
 *
 * @param {string} prompt - The text prompt to guide the AI in generating the article.
 * @param {object | null} [fileData=null] - Optional file data object containing `mimeType` and `fileUri` for context.
 * @returns {Promise<string>} The generated article text.
 * @throws {ApiError} If there's an internal server error during article generation.
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
 * Orchestrates the entire process of handling a conversational article writing request.
 * This includes managing the conversation, processing uploaded files, building the AI prompt,
 * generating the article, and updating the conversation history.
 *
 * @param {string} userId - The ID of the user making the request.
 * @param {string} message - The user's input message for the article.
 * @param {string | null} conversationId - The ID of the current conversation, or null for a new one.
 * @param {object | null} [fileInfo=null] - Optional object containing details of an uploaded file.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {string | null} [articleType=null] - The desired type of article (e.g., 'blog_post').
 * @param {string | null} [tone=null] - The desired writing tone.
 * @param {string | null} [length=null] - The desired length of the article.
 * @param {object} [req=null] - The Express request object, potentially containing transaction information.
 * @returns {Promise<{conversationId: string, userId: string, article: string, metadata: object}>} An object containing the conversation ID, user ID, generated article text, and metadata about the generation.
 * @throws {ApiError} If any step in the process fails.
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
    // Handle conversation (create or retrieve)
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
 * Retrieves the complete conversation history for a given conversation ID and user.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @returns {Promise<object>} The conversation object, including its messages.
 * @throws {ApiError} If the conversation is not found or an internal server error occurs.
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

/**
 * Service object for article writer functionalities.
 * Provides methods for generating user/conversation IDs, processing article requests,
 * and retrieving conversation history.
 * @namespace articleWriterService
 */
export const articleWriterService = {
  generateGuestUserId,
  generateConversationId,
  processConversationalRequest,
  getConversationHistory,
};