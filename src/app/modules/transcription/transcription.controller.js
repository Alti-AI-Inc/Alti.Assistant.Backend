import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { transcriptionService } from './transcription.service.js';
import { geminiAudioService } from './geminiAudioService.js';
import { bucketUploadService } from './bucketUpload.service.js';
import {
  ERROR_MESSAGES,
  AUDIO_PROCESSING,
  PROCESSING_TYPES,
} from './transcription.constant.js';
import fs from 'fs';
import fsp from 'fs/promises'; // New import for async file operations
import { conversationHelpers } from '../../utils/conversationHelpers.js'; // Assuming this path for conversationHelpers

/**
 * Helper to safely delete a file asynchronously, ignoring 'file not found' errors.
 * @param {string} path - The path to the file to delete.
 */
async function safeUnlink(path) {
  try {
    await fsp.unlink(path);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      logger.error(`Failed to unlink file ${path}:`, error);
    }
  }
}

/**
 * Smart transcription assistant - unified endpoint for all transcription actions
 * Handles: audio uploads, batch processing, chat messages, and inline audio
 */
export const smartTranscriptionAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? transcriptionService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

  // Extract audio files from multer fields
  const audioFile = req.files?.audio?.[0];
  const audioFiles = req.files?.audios;

  // Determine action type
  const actionType = determineActionType(audioFile, audioFiles, message);
  logger.info(
    `Smart transcription action: ${actionType}, conversationId: ${conversationId || 'new'}`
  );

  console.log('Proceeding with action type:', actionType);

  try {
    switch (actionType) {
      case 'AUDIO_UPLOAD':
        return await handleAudioUpload(req, res, userId, isGuest, audioFile);

      case 'BATCH_UPLOAD':
        return await handleBatchUpload(req, res, userId, isGuest, audioFiles);

      case 'CHAT_MESSAGE':
        return await handleChatMessage(
          req,
          res,
          userId,
          isGuest,
          message,
          conversationId
        );

      default:
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message:
            'Invalid request. Please provide either an audio file or a message.',
        });
    }
  } catch (error) {
    logger.error('Smart assistant error:', error);

    // Clean up uploaded files on error asynchronously
    if (audioFile?.path) {
      await safeUnlink(audioFile.path);
    }
    if (audioFiles) {
      // Use Promise.all to concurrently unlink files
      await Promise.all(audioFiles.map(file => safeUnlink(file.path)));
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
    // Clean up local file asynchronously
    await safeUnlink(audioFile.path);
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: ERROR_MESSAGES.INVALID_FORMAT,
    });
  }

  if (audioFile.size > AUDIO_PROCESSING.MAX_INLINE_SIZE) {
    // Clean up local file asynchronously
    await safeUnlink(audioFile.path);
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: ERROR_MESSAGES.FILE_TOO_LARGE,
    });
  }

  try {
    // Handle conversation
    const conversation =
      await transcriptionService.handleTranscriptionConversation(
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
      // Optimization Note: If conversation.messages can be very large, consider
      // optimizing the database query to fetch only the last N messages directly
      // using aggregation or a specific Mongoose query with $slice.
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
        metadata: msg.metadata,
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
    logger.info(
      `Uploading audio to Gemini File API: ${audioFile.originalname}`
    );
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
    const estimatedDuration =
      audioFile.size / (AUDIO_PROCESSING.SAMPLE_RATE * 2);
    const tokenCount =
      transcriptionService.calculateAudioTokens(estimatedDuration);

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

    // Clean up local file asynchronously
    await safeUnlink(audioFile.path);

    logger.info(
      `Audio processed successfully for conversation: ${actualConversationId}`
    );

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
    // Clean up local file asynchronously on error
    await safeUnlink(audioFile.path);
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
    const conversation =
      await transcriptionService.handleTranscriptionConversation(
        userId,
        conversationId,
        `batch-${audioFiles.length}-files`,
        isGuest,
        req
      );
    const actualConversationId = conversation.conversationId;

    const results = [];

    // Optimization Note: If external services (uploadAudioToBucket, uploadAudioFile, processAudioWithGemini)
    // can handle concurrent requests, consider using Promise.all for batch processing
    // to speed up the overall execution time for multiple files.
    // Example: Promise.all(audioFiles.map(async (file) => { ... process file ... }))
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

        // Clean up asynchronously
        await safeUnlink(file.path);
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error);
        results.push({
          fileName: file.originalname,
          error: error.message,
          success: false,
        });

        // Clean up asynchronously on error
        await safeUnlink(file.path);
      }
    }

    // Add batch result to conversation
    await transcriptionService.addTranscriptionResult(
      actualConversationId,
      userId,
      {
        text: `Batch processing completed: ${results.filter((r) => r.success).length}/${results.length} files successful`,
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
        successCount: results.filter((r) => r.success).length,
        failureCount: results.filter((r) => !r.success).length,
      },
    });
  } catch (error) {
    // Clean up files on error asynchronously
    await Promise.all(audioFiles.map(file => safeUnlink(file.path)));
    throw error;
  }
}

/**
 * Handle chat messages (questions about previous transcriptions)
 */
async function handleChatMessage(
  req,
  res,
  userId,
  isGuest,
  message,
  conversationId
) {
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
    // Optimization: Use .lean() for read-only operations to improve performance
    // by returning plain JavaScript objects instead of Mongoose documents.
    // Indexing Recommendation: Ensure an index exists on `conversationId`
    // and potentially a compound index on `{ conversationId: 1, userId: 1 }`
    // if `userId` is consistently used in queries for non-guest users.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      isGuest ? null : userId
    ).lean(); // Added .lean()

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
      // Optimization Note: If conversation.messages can be very large, consider
      // optimizing the database query to fetch only the last N messages directly
      // using aggregation or a specific Mongoose query with $slice.
      conversationHistory = conversation.messages
        .slice(-20) // Get last 20 messages for context
        .map((msg) => {
          // Extract audio file URI if present
          if (msg.metadata?.type === 'audio_upload' && msg.metadata?.fileUri) {
            lastAudioFileUri = msg.metadata.fileUri;
          }
          return {
            role: msg.role,
            content: msg.content,
            metadata: msg.metadata,
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
    const contextPrompt = buildChatPrompt(
      message,
      conversationHistory,
      lastAudioFileUri
    );

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
    prompt +=
      'You have access to the transcription and audio context from previous messages. ';
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
    // Optimization Note: Ensure that transcriptionService.getTranscriptionStats
    // uses .lean() for any read-only Mongoose queries it performs to return
    // plain JavaScript objects, improving performance.
    // Indexing Recommendation: Ensure appropriate indexes exist on fields
    // used for filtering/sorting statistics (e.g., userId, createdAt).
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