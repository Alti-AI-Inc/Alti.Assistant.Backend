import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { transcriptionService } from './transcription.service.js';
import { geminiAudioService } from './geminiAudioService.js';
import { bucketUploadService } from './bucketUpload.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import {
  ERROR_MESSAGES,
  AUDIO_PROCESSING,
  PROCESSING_TYPES
} from './transcription.constant.js';
import fs from 'fs';

/**
 * Smart transcription assistant - unified endpoint for all transcription actions
 * Handles: audio uploads, batch processing, chat messages, and inline audio
 */
export const smartTranscriptionAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? transcriptionService.generateGuestUserId()
    : (req.user?.userId || req.user?._id);

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

  // Extract audio files from multer fields
  const audioFile = req.files?.audio?.[0];
  const audioFiles = req.files?.audios;

  // Determine action type
  const actionType = determineActionType(audioFile, audioFiles, message);
  logger.info(`Smart transcription action: ${actionType}, conversationId: ${conversationId || 'new'}`);

  // Check subscription for authenticated users
  if (!isGuest && conversationId) {
    try {
      const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
      const promptUsage = userSubscription ? userSubscription.usage : 0;
      const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);
      const messageCount = conversation?.messages ? conversation.messages.length : 0;

      if (promptUsage <= messageCount) {
        return sendResponse(res, {
          statusCode: httpStatus.FORBIDDEN,
          success: false,
          message: ERROR_MESSAGES.USAGE_LIMIT_REACHED,
        });
      }
    } catch (error) {
      logger.warn('Subscription check failed:', error.message);
    }
  }

  console.log('Proceeding with action type:', actionType);

  try {
    switch (actionType) {
      case 'AUDIO_UPLOAD':
        return await handleAudioUpload(req, res, userId, isGuest, audioFile);

      case 'BATCH_UPLOAD':
        return await handleBatchUpload(req, res, userId, isGuest, audioFiles);

      case 'CHAT_MESSAGE':
        return await handleChatMessage(req, res, userId, isGuest, message, conversationId);

      default:
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'Invalid request. Please provide either an audio file or a message.',
        });
    }
  } catch (error) {
    logger.error('Smart assistant error:', error);

    // Clean up uploaded files on error
    if (audioFile?.path && fs.existsSync(audioFile.path)) {
      fs.unlinkSync(audioFile.path);
    }
    if (audioFiles) {
      audioFiles.forEach(file => {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      });
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to process request',
    });
  }
});

/**
 * Determine action type based on request content
 */
function determineActionType(audioFile, audioFiles, message) {
  if (audioFiles && audioFiles.length > 0) return 'BATCH_UPLOAD';
  if (audioFile) return 'AUDIO_UPLOAD';
  if (message) return 'CHAT_MESSAGE';
  return 'UNKNOWN';
}

/**
 * Handle single audio file upload and processing
 */
async function handleAudioUpload(req, res, userId, isGuest, audioFile) {
  const {
    prompt,
    processingType = PROCESSING_TYPES.TRANSCRIBE,
    startTimestamp,
    endTimestamp,
    conversationId,
    outputFormat = 'text',
    includeTimestamps = false,
  } = req.body;

  // Validate audio file
  if (!geminiAudioService.isValidAudioFormat(audioFile.mimetype)) {
    if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: ERROR_MESSAGES.INVALID_FORMAT,
    });
  }

  if (audioFile.size > AUDIO_PROCESSING.MAX_INLINE_SIZE) {
    if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: ERROR_MESSAGES.FILE_TOO_LARGE,
    });
  }

  try {
    // Handle conversation
    const conversation = await transcriptionService.handleTranscriptionConversation(
      userId,
      conversationId,
      audioFile.originalname,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId;

    // Get conversation history for context
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      conversationHistory = conversation.messages
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content,
          metadata: msg.metadata
        }));
    }

    // Upload audio file to GCS bucket for permanent storage
    logger.info(`Uploading audio to GCS bucket: ${audioFile.originalname}`);
    const bucketUpload = await bucketUploadService.uploadAudioToBucket(
      audioFile.path,
      audioFile.originalname,
      audioFile.mimetype
    );

    // Upload to Gemini File API for processing (required for standard Gemini API)
    logger.info(`Uploading audio to Gemini File API: ${audioFile.originalname}`);
    const uploadedFile = await geminiAudioService.uploadAudioFile(
      audioFile.path,
      audioFile.mimetype
    );

    console.log('Uploaded file to Gemini File API:', {
      fileSize: audioFile.size,
      mimeType: audioFile.mimetype,
      audioUrl: bucketUpload.publicUrl,
      gsUri: bucketUpload.gsUri,
      gcsFileName: bucketUpload.fileName,
      bucketName: bucketUpload.bucketName,
      processingType,
    });

    // Add upload message to conversation with GCS public URL (not File API URL)
    await transcriptionService.addAudioUploadMessage(
      actualConversationId,
      userId,
      audioFile.originalname,
      {
        fileSize: audioFile.size,
        mimeType: audioFile.mimetype,
        audioUrl: bucketUpload.publicUrl,
        gsUri: bucketUpload.gsUri,
        gcsFileName: bucketUpload.fileName,
        bucketName: bucketUpload.bucketName,
        processingType,
      },
      isGuest
    );

    // Process audio with context using File API URI
    const options = {
      startTimestamp,
      endTimestamp,
      includeTimestamps,
      outputFormat,
      conversationHistory,
    };

    const result = await geminiAudioService.processAudioWithGemini(
      uploadedFile,
      prompt,
      processingType,
      options
    );

    // Calculate tokens
    const estimatedDuration = audioFile.size / (AUDIO_PROCESSING.SAMPLE_RATE * 2);
    const tokenCount = transcriptionService.calculateAudioTokens(estimatedDuration);

    // Add result to conversation
    await transcriptionService.addTranscriptionResult(
      actualConversationId,
      userId,
      {
        ...result,
        duration: estimatedDuration,
        tokenCount,
      },
      isGuest
    );

    // Clean up local file
    if (fs.existsSync(audioFile.path)) {
      fs.unlinkSync(audioFile.path);
    }

    logger.info(`Audio processed successfully for conversation: ${actualConversationId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Audio processed successfully',
      data: {
        conversationId: actualConversationId,
        userId,
        result: result.text,
        processingType,
        metadata: {
          fileName: audioFile.originalname,
          tokenCount,
          estimatedDuration,
          ...result.metadata,
        },
        conversationHistory: conversationHistory.length,
      },
    });

  } catch (error) {
    if (fs.existsSync(audioFile.path)) fs.unlinkSync(audioFile.path);
    throw error;
  }
}

/**
 * Handle batch audio file uploads
 */
async function handleBatchUpload(req, res, userId, isGuest, audioFiles) {
  const { conversationId, outputFormat = 'text' } = req.body;

  if (!audioFiles || audioFiles.length === 0) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: ERROR_MESSAGES.NO_AUDIO_FILE,
    });
  }

  try {
    const conversation = await transcriptionService.handleTranscriptionConversation(
      userId,
      conversationId,
      `batch-${audioFiles.length}-files`,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId;

    const results = [];

    for (let i = 0; i < audioFiles.length; i++) {
      const file = audioFiles[i];

      try {
        // Upload to GCS bucket for permanent storage
        const bucketUpload = await bucketUploadService.uploadAudioToBucket(
          file.path,
          file.originalname,
          file.mimetype
        );

        // Upload to Gemini File API for processing
        const uploadedFile = await geminiAudioService.uploadAudioFile(
          file.path,
          file.mimetype
        );

        // Process with default transcription using File API URI
        const result = await geminiAudioService.processAudioWithGemini(
          uploadedFile,
          `Transcribe this audio file`,
          PROCESSING_TYPES.TRANSCRIBE,
          { outputFormat }
        );

        results.push({
          fileName: file.originalname,
          result: result.text,
          audioUrl: bucketUpload.publicUrl,
          gsUri: bucketUpload.gsUri,
          gcsFileName: bucketUpload.fileName,
          bucketName: bucketUpload.bucketName,
          success: true,
        });

        // Clean up
        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error);
        results.push({
          fileName: file.originalname,
          error: error.message,
          success: false,
        });

        if (fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
        }
      }
    }

    // Add batch result to conversation
    await transcriptionService.addTranscriptionResult(
      actualConversationId,
      userId,
      {
        text: `Batch processing completed: ${results.filter(r => r.success).length}/${results.length} files successful`,
        content: JSON.stringify(results),
        processingType: 'batch',
      },
      isGuest
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Batch transcription completed',
      data: {
        conversationId: actualConversationId,
        results,
        totalFiles: audioFiles.length,
        successCount: results.filter(r => r.success).length,
        failureCount: results.filter(r => !r.success).length,
      },
    });

  } catch (error) {
    // Clean up files on error
    audioFiles.forEach(file => {
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }
    });
    throw error;
  }
}

/**
 * Handle chat messages (questions about previous transcriptions)
 */
async function handleChatMessage(req, res, userId, isGuest, message, conversationId) {
  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required for chat',
    });
  }

  if (!conversationId) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Conversation ID is required for chat messages',
    });
  }

  try {
    // Get conversation with history
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      isGuest ? null : userId
    );

    if (!conversation) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }

    // Get conversation history including transcriptions
    let conversationHistory = [];
    let lastAudioFileUri = null;

    if (conversation.messages) {
      conversationHistory = conversation.messages
        .slice(-20) // Get last 20 messages for context
        .map(msg => {
          // Extract audio file URI if present
          if (msg.metadata?.type === 'audio_upload' && msg.metadata?.fileUri) {
            lastAudioFileUri = msg.metadata.fileUri;
          }
          return {
            role: msg.role,
            content: msg.content,
            metadata: msg.metadata
          };
        });
    }

    // Add user message
    await transcriptionService.addChatMessage(
      conversationId,
      userId,
      message,
      isGuest
    );

    // Build context-aware prompt
    const contextPrompt = buildChatPrompt(message, conversationHistory, lastAudioFileUri);

    // Use Gemini to answer based on context
    const result = await geminiAudioService.processChatMessage(
      contextPrompt,
      conversationHistory,
      lastAudioFileUri
    );

    // Add assistant response
    await transcriptionService.addChatMessage(
      conversationId,
      userId,
      result.text,
      isGuest,
      'assistant'
    );

    logger.info(`Chat message processed for conversation: ${conversationId}`);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Chat message processed',
      data: {
        conversationId,
        result: result.text,
        messageCount: conversation.messages.length + 2,
        hasAudioContext: !!lastAudioFileUri,
      },
    });

  } catch (error) {
    logger.error('Chat message error:', error);
    throw error;
  }
}

/**
 * Build context-aware chat prompt
 */
function buildChatPrompt(message, conversationHistory, audioFileUri) {
  let prompt = '';

  if (audioFileUri) {
    prompt += 'You have access to the transcription and audio context from previous messages. ';
  }

  if (conversationHistory.length > 0) {
    prompt += 'Consider the conversation history when answering. ';
  }

  prompt += `\n\nUser question: ${message}`;

  return prompt;
}

/**
 * Get transcription statistics
 */
export const getTranscriptionStats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  try {
    const stats = await transcriptionService.getTranscriptionStats(userId, req);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Transcription statistics retrieved successfully',
      data: stats,
    });

  } catch (error) {
    logger.error('Error getting transcription stats:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to retrieve statistics',
    });
  }
});

export const transcriptionController = {
  smartTranscriptionAssistant,
  getTranscriptionStats,
};
