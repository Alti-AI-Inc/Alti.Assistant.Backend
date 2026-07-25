import httpStatus from 'http-status';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { Storage } from '@google-cloud/storage';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { proxyToAgent } from '../gateway/agentProxy.js';

// Initialize GCS storage client
const storage = new Storage();
const uploadBucketName = config.gcs?.uploads_bucket || 'inso_assistant_uploads';

/**
 * Generates a unique MongoDB ObjectId string to serve as a guest user ID.
 * @returns {string} A new unique guest user ID.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique, human-readable ID for an audio conversation.
 * @returns {string} A new unique audio conversation ID.
 */
const generateAudioConversationId = () => {
  return `aud-conv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Retrieves an existing audio conversation or creates a new one.
 */
const handleAudioConversation = async (
  userId,
  conversationId,
  audioQuery,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;
    let newConversationIdToCreate = null;

    if (conversationId) {
      try {
        const queryOptions = { lean: true };
        if (isGuest) {
          queryOptions['metadata.userType'] = 'guest';
        }

        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          queryOptions
        );
      } catch (err) {
        logger.warn(`Audio conversation ${conversationId} not found, will create new one`);
        newConversationIdToCreate = conversationId;
      }
    }

    if (!conversation) {
      const finalConversationId = newConversationIdToCreate || generateAudioConversationId();
      const safeTitle = audioQuery.length > 40 ? `${audioQuery.substring(0, 40)}...` : audioQuery;

      if (isGuest) {
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Audio: ${safeTitle}`,
            metadata: {
              category: 'audio',
              model: 'audio-assistant',
              audioType: 'generation',
              userType: 'guest',
              isGuest: true,
            },
            is_audio_assistant: true,
          },
          finalConversationId,
          req
        );
      } else {
        conversation = await conversationService.createConversation(
          {
            userId,
            title: `Audio: ${safeTitle}`,
            metadata: {
              category: 'audio',
              model: 'audio-assistant',
              audioType: 'generation',
              userType: 'authenticated',
            },
            is_audio_assistant: true,
          },
          finalConversationId,
          req
        );
      }

      logger.info(`Created new audio conversation ${finalConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling audio conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle audio conversation'
    );
  }
};

/**
 * Adds a user's query message to the conversation.
 */
const addAudioQueryMessage = async (
  conversationId,
  userId,
  audioQuery,
  isGuest = false,
  req = null
) => {
  try {
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'user',
        content: audioQuery,
        metadata: {
          messageType: 'audio_query',
          timestamp: new Date().toISOString(),
        },
      },
      req
    );
    return message;
  } catch (error) {
    logger.error('Error adding audio query message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add audio query message'
    );
  }
};

/**
 * Adds the assistant's audio result message to the conversation.
 */
const addAudioResultMessage = async (
  conversationId,
  userId,
  assistantResponse,
  audioMetadata,
  isGuest = false,
  req = null
) => {
  try {
    const message = await conversationService.addMessageToConversation(
      conversationId,
      userId,
      {
        role: 'assistant',
        content: assistantResponse,
        metadata: {
          messageType: 'audio_result',
          timestamp: new Date().toISOString(),
          audioUrl: audioMetadata.audioUrl,
        },
      },
      req
    );
    return message;
  } catch (error) {
    logger.error('Error adding audio result message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add audio result message'
    );
  }
};

/**
 * Generates an audio script, synthesizes it to speech via GCP Text-to-Speech,
 * uploads the MP3 to GCS, and returns a signed read URL.
 */
const generateAudio = async (userId, conversationId, message, isGuest = false, req = null) => {
  const conversation = await handleAudioConversation(userId, conversationId, message, isGuest, req);
  const actualConversationId = conversation.conversationId;

  // Add the user message first
  await addAudioQueryMessage(actualConversationId, userId, message, isGuest, req);

  // Fetch the conversation history
  const historyResult = await conversationHelpers.getConversationMessages(
    actualConversationId,
    userId,
    { limit: 10 },
    req
  );
  
  const history = historyResult?.messages || [];
  // Sort oldest first for Claude context
  history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  logger.info(`Proxying audio request to Audio Agent...`);
  const proxyUser = req?.user || { userId: userId.toString(), email: '', plan: 'free' };
  const proxyResult = await proxyToAgent('audio', '/execute', {
    prompt: message,
    options: {}
  }, proxyUser);

  const resultData = proxyResult.data || {};
  const fullText = resultData.content || '';
  const audioBase64 = resultData.audioBase64;

  if (!audioBase64) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Speech synthesis failed to return content');
  }

  const audioBuffer = Buffer.from(audioBase64, 'base64');
  const fileName = `${crypto.randomUUID()}.mp3`;
  const gcsObjectName = `uploads/audio/${userId}/${Date.now()}-${fileName}`;

  logger.info(`Uploading synthesized audio to GCS bucket: ${uploadBucketName}...`);
  const file = storage.bucket(uploadBucketName).file(gcsObjectName);
  await file.save(audioBuffer, {
    contentType: 'audio/mpeg',
    metadata: {
      cacheControl: 'public, max-age=31536000',
    }
  });

  const [signedUrl] = await file.getSignedUrl({
    version: 'v4',
    action: 'read',
    expires: Date.now() + 2 * 60 * 60 * 1000 // 2 hours expiration
  });

  // Track and increment usage limits if authenticated user
  if (!isGuest) {
    const tenantId = req?.user?.tenantId || req?.tenantId || null;
    const subscriptionService = (await import('../subscription/subscription.service.js')).default;
    subscriptionService.trackAndIncrementMonthlyUsage(userId, tenantId, 'audio').catch((err) => {
      logger.error('Error incrementing audio monthly usage:', err);
    });
  }

  // Save the result to conversation history
  await addAudioResultMessage(actualConversationId, userId, fullText, { audioUrl: signedUrl }, isGuest, req);

  return {
    conversationId: actualConversationId,
    responseMessage: {
      text: fullText,
      audioUrl: signedUrl
    }
  };
};

export const audioService = {
  generateGuestUserId,
  generateAudioConversationId,
  handleAudioConversation,
  addAudioQueryMessage,
  addAudioResultMessage,
  generateAudio
};
