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
 * Generate unique guest user ID
 * @returns {string}
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate transcription conversation ID
 * @returns {string}
 */
const generateTranscriptionConversationId = () => {
  return `transcription-${Date.now()}-${Math.random().toString(36).substring(7)}`;
};

/**
 * Create or get transcription conversation
 * @param {string} userId
 * @param {string} conversationId
 * @param {string} fileName
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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

        if (isGuest && conversation.metadata?.userType !== 'guest') {
          logger.warn(
            `Guest user ${userId} trying to access non-guest conversation ${conversationId}`
          );
          conversation = null;
        }
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found for user ${userId}, creating new one`
        );
      }
    }

    if (!conversation) {
      const newConversationId =
        conversationId || generateTranscriptionConversationId();

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
 * Add audio upload message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} fileName
 * @param {Object} metadata
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Add transcription result to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {Object} result
 * @param {boolean} isGuest
 * @returns {Promise<Object>}
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
 * Validate audio duration
 * @param {number} duration - Duration in seconds
 * @param {boolean} isGuest
 * @returns {boolean}
 */
const validateAudioDuration = (duration, isGuest = false) => {
  const maxDuration = isGuest
    ? AUDIO_PROCESSING.MAX_GUEST_AUDIO_LENGTH
    : AUDIO_PROCESSING.MAX_AUDIO_LENGTH;

  return duration <= maxDuration;
};

/**
 * Calculate token count for audio
 * @param {number} durationInSeconds
 * @returns {number}
 */
const calculateAudioTokens = (durationInSeconds) => {
  return Math.ceil(durationInSeconds * AUDIO_PROCESSING.TOKENS_PER_SECOND);
};

/**
 * Parse timestamp to seconds
 * @param {string} timestamp - Timestamp in MM:SS format
 * @returns {number}
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
 * Format seconds to timestamp
 * @param {number} seconds
 * @returns {string}
 */
const formatTimestamp = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

/**
 * Get transcription statistics for user
 * @param {string} userId
 * @returns {Promise<Object>}
 */
const getTranscriptionStats = async (userId, req = null) => {
  try {
    const conversations = await conversationHelpers.getUserConversations(
      userId,
      {
        'metadata.category': TRANSCRIPTION_CONSTANTS.CATEGORY,
      }
    );

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
 * Add chat message to conversation
 * @param {string} conversationId
 * @param {string} userId
 * @param {string} message
 * @param {boolean} isGuest
 * @param {string} role
 * @returns {Promise<Object>}
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
