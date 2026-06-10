import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import mongoose from 'mongoose';
import {
  TRANSCRIPTION_CONSTANTS,
  AUDIO_PROCESSING,
  ERROR_MESSAGES,
} from './transcription.constant.js';

/**
 * Generates a unique identifier for a guest user.
 * This ID is a MongoDB ObjectId converted to a string.
 * @returns {string} A unique string representing the guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique identifier for a new transcription conversation.
 * The ID is a combination of a prefix, current timestamp, and a random string.
 * @returns {string} A unique string representing the transcription conversation ID.
 */
const generateTranscriptionConversationId = () => {
  return `transcription-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};

/**
 * Handles the creation or retrieval of a transcription-specific conversation.
 * If a `conversationId` is provided, it attempts to retrieve it. If not found or invalid
 * (e.g., guest user trying to access non-guest conversation), a new conversation is created.
 * @param {string} userId - The ID of the user initiating the transcription.
 * @param {string | null} conversationId - Optional. The ID of an existing conversation to use. If null or not found, a new one is created.
 * @param {string} fileName - The name of the audio file being transcribed, used for the conversation title.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {import('express').Request | null} [req=null] - Optional Express request object, potentially used for context in underlying services.
 * @returns {Promise<Object>} A promise that resolves to the conversation object.
 * @throws {ApiError} If there's an internal server error during conversation handling.
 */
const handleTranscriptionConversation = async (
  userId,
  conversationId,
  fileName,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          isGuest ? null : userId,
          req
        );
        // Optimization Recommendation: If `conversationHelpers.getConversationById` only retrieves data for read-only purposes
        // (as it appears here, checking `conversation.metadata?.userType`), consider adding `.lean()` to the Mongoose query
        // within `conversationHelpers.getConversationById` for better performance by returning a plain JavaScript object.

        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          // Deny access and force creation of a new guest conversation
          conversation = null;
        }
      } catch (error) {
        // If conversation not found or an error occurred during retrieval,
        // treat it as if no conversation was provided, and create a new one.
        logger.warn(
          `Conversation ${conversationId} not found or inaccessible for user ${userId}, creating new one`
        );
        conversation = null;
      }
    }

    if (!conversation) {
      // If no valid conversation was found or provided, always generate a new ID for the new conversation.
      // Reusing a potentially invalid or inaccessible conversationId for a new conversation is not ideal.
      const newConversationId = generateTranscriptionConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Transcription: ${fileName.substring(0, 50)}...`,
          metadata: {
            category: TRANSCRIPTION_CONSTANTS.CATEGORY,
            model: TRANSCRIPTION_CONSTANTS.MODEL,
            type: TRANSCRIPTION_CONSTANTS.TYPE,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest: isGuest,
          },
        },
        newConversationId
      );

      logger.info(
        `Created new transcription conversation ${newConversationId} for user ${userId} (guest: ${isGuest})`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling transcription conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle transcription conversation'
    );
  }
};

/**
 * Adds a message to a conversation indicating that an audio file has been uploaded.
 * This message typically represents the user's action of uploading the audio.
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user who uploaded the audio.
 * @param {string} fileName - The name of the uploaded audio file.
 * @param {Object} [metadata={}] - Additional metadata to include with the message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {import('express').Request | null} [req=null] - Optional Express request object, potentially used for context in underlying services.
 * @returns {Promise<Object>} A promise that resolves to the updated conversation message object.
 * @throws {ApiError} If there's an internal server error while recording the audio upload.
 */
const addAudioUploadMessage = async (
  conversationId,
  userId,
  fileName,
  metadata = {},
  isGuest = false,
  req = null
) => {
  try {
    const messageData = {
      role: 'user',
      content: `Uploaded audio file: ${fileName}`,
      metadata: {
        type: 'audio_upload',
        fileName,
        ...metadata,
      },
    };

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      messageData
    );
  } catch (error) {
    logger.error('Error adding audio upload message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to record audio upload'
    );
  }
};

/**
 * Adds the transcription result as an assistant message to the specified conversation.
 * This message contains the transcribed text and relevant metadata about the transcription process.
 * @param {string} conversationId - The ID of the conversation to add the result to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {Object} result - The transcription result object.
 * @param {string} result.text - The transcribed text content.
 * @param {string} [result.content] - Alternative field for transcribed text content if `text` is not present.
 * @param {string} result.processingType - The type of transcription processing (e.g., 'transcribe', 'summarize').
 * @param {number} result.duration - The duration of the audio transcribed, in seconds.
 * @param {number} result.tokenCount - The estimated token count for the transcription.
 * @param {Object} [result.metadata={}] - Additional metadata specific to the transcription result.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {import('express').Request | null} [req=null] - Optional Express request object, potentially used for context in underlying services.
 * @returns {Promise<Object>} A promise that resolves to the updated conversation message object.
 * @throws {ApiError} If there's an internal server error while saving the transcription result.
 */
const addTranscriptionResult = async (
  conversationId,
  userId,
  result,
  isGuest = false,
  req = null
) => {
  try {
    const messageData = {
      role: 'assistant',
      content: result.text || result.content,
      metadata: {
        type: 'transcription_result',
        processingType: result.processingType,
        duration: result.duration,
        tokenCount: result.tokenCount,
        timestamp: new Date().toISOString(),
        ...result.metadata,
      },
    };

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      messageData
    );
  } catch (error) {
    logger.error('Error adding transcription result:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to save transcription result'
    );
  }
};

/**
 * Validates if the given audio duration is within the allowed limits.
 * The maximum duration varies based on whether the user is a guest or authenticated.
 * @param {number} duration - The duration of the audio in seconds.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest, which affects the maximum allowed duration.
 * @returns {boolean} True if the duration is valid (within limits), false otherwise.
 */
const validateAudioDuration = (duration, isGuest = false) => {
  const maxDuration = isGuest
    ? AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH
    : AUDIO_PROCESSING.MAX_AUDIO_LENGTH;

  return duration <= maxDuration;
};

/**
 * Calculates an estimated token count for a given audio duration.
 * This is typically used for billing or rate limiting purposes, based on a predefined tokens-per-second rate.
 * @param {number} durationInSeconds - The duration of the audio in seconds.
 * @returns {number} The estimated number of tokens.
 */
const calculateAudioTokens = (durationInSeconds) => {
  return Math.ceil(durationInSeconds * AUDIO_PROCESSING.TOKENS_PER_SECOND);
};

/**
 * Parses a timestamp string in "MM:SS" format into total seconds.
 * @param {string | null | undefined} timestamp - The timestamp string in "MM:SS" format (e.g., "01:30" for 90 seconds).
 * @returns {number | null} The total number of seconds, or null if the timestamp is null/empty.
 * @throws {ApiError} If the timestamp format is invalid.
 */
const parseTimestamp = (timestamp) => {
  if (!timestamp) return null;

  const match = timestamp.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      ERROR_MESSAGES.INVALID_TIMESTAMP
    );
  }

  const minutes = parseInt(match[1], 10);
  const seconds = parseInt(match[2], 10);

  return minutes * 60 + seconds;
};

/**
 * Formats a given number of seconds into a "MM:SS" timestamp string.
 * @param {number} seconds - The total number of seconds to format.
 * @returns {string} The formatted timestamp string (e.g., "01:30" for 90 seconds).
 */
const formatTimestamp = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Retrieves comprehensive transcription statistics for a given user.
 * This includes total transcriptions, total audio duration, total tokens used,
 * average duration, and counts per processing type.
 * @param {string} userId - The ID of the user for whom to retrieve statistics.
 * @param {import('express').Request | null} [req=null] - Optional Express request object, potentially used for context in underlying services.
 * @returns {Promise<Object>} A promise that resolves to an object containing transcription statistics.
 * @property {number} totalTranscriptions - The total number of transcription results found.
 * @property {number} totalDuration - The sum of all transcribed audio durations in seconds.
 * @property {number} totalTokens - The sum of all estimated tokens used for transcriptions.
 * @property {number} averageDuration - The average duration of transcribed audio per transcription.
 * @property {Object.<string, number>} processingTypes - An object mapping processing types (e.g., 'transcribe', 'summarize') to their counts.
 * @property {number} conversationCount - The total number of transcription-related conversations.
 * @throws {ApiError} If there's an internal server error while retrieving statistics.
 */
const getTranscriptionStats = async (userId, req = null) => {
  try {
    const conversations = await conversationHelpers.getUserConversations(
      userId,
      {
        'metadata.category': TRANSCRIPTION_CONSTANTS.CATEGORY,
      }
    );
    // Optimization Recommendation: For read-only operations like retrieving conversations for statistics,
    // ensure `conversationHelpers.getUserConversations` uses `.lean()` in its Mongoose query
    // to return plain JavaScript objects, reducing Mongoose document overhead.

    // Indexing Recommendation: To optimize the query for `getUserConversations` which filters by
    // `userId` (implicitly, as it's `getUserConversations(userId, ...)`) and `metadata.category`,
    // consider adding a compound index to the 'conversations' collection:
    // db.conversations.createIndex({ userId: 1, 'metadata.category': 1 });

    let totalTranscriptions = 0;
    let totalDuration = 0;
    let totalTokens = 0;
    const processingTypes = {};

    for (const conversation of conversations) {
      const messages = conversation.messages || [];

      for (const message of messages) {
        if (message.metadata?.type === 'transcription_result') {
          totalTranscriptions++;
          totalDuration += message.metadata.duration || 0;
          totalTokens += message.metadata.tokenCount || 0;

          const type = message.metadata.processingType || 'transcribe';
          processingTypes[type] = (processingTypes[type] || 0) + 1;
        }
      }
    }

    return {
      totalTranscriptions,
      totalDuration,
      totalTokens,
      averageDuration:
        totalTranscriptions > 0 ? totalDuration / totalTranscriptions : 0,
      processingTypes,
      conversationCount: conversations.length,
    };
  } catch (error) {
    logger.error('Error getting transcription stats:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve transcription statistics'
    );
  }
};

/**
 * Adds a general chat message (either from user or assistant) to a specified conversation.
 * This is used for conversational interactions within a transcription context.
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {string} message - The content of the chat message.
 * @param {boolean} [isGuest=false] - Indicates if the user is a guest.
 * @param {'user' | 'assistant'} [role='user'] - The role of the sender of the message ('user' or 'assistant').
 * @param {import('express').Request | null} [req=null] - Optional Express request object, potentially used for context in underlying services.
 * @returns {Promise<Object>} A promise that resolves to the updated conversation message object.
 * @throws {ApiError} If there's an internal server error while adding the chat message.
 */
const addChatMessage = async (
  conversationId,
  userId,
  message,
  isGuest = false,
  role = 'user',
  req = null
) => {
  try {
    const messageData = {
      role,
      content: message,
      metadata: {
        type: 'chat_message',
        timestamp: new Date().toISOString(),
      },
    };

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      messageData
    );
  } catch (error) {
    logger.error('Error adding chat message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add chat message'
    );
  }
};

/**
 * @namespace transcriptionService
 * @description Provides core business logic and utility functions for transcription-related operations,
 * including conversation management, audio processing validation, and statistics retrieval.
 */
export const transcriptionService = {
  generateGuestUserId,
  generateTranscriptionConversationId,
  handleTranscriptionConversation,
  addAudioUploadMessage,
  addTranscriptionResult,
  addChatMessage,
  validateAudioDuration,
  calculateAudioTokens,
  parseTimestamp,
  formatTimestamp,
  getTranscriptionStats,
};