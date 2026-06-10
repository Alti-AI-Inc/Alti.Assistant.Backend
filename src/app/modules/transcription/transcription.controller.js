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
import { conversationHelpers } from '../conversations/conversation.helpers.js';

/**
 * Helper to safely delete a file asynchronously, ignoring 'file not found' errors.
 * @param {string} path - The path to the file to delete.
 * @returns {Promise<void>} A promise that resolves when the file is deleted or if it didn't exist.
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
 * Determines the action type based on the presence of audio files or a message.
 * @param {object | undefined} audioFile - The single audio file object from Multer, if present.
 * @param {Array<object> | undefined} audioFiles - An array of audio file objects from Multer, if present.
 * @param {string | undefined} message - The chat message string, if present.
 * @returns {'BATCH_UPLOAD' | 'AUDIO_UPLOAD' | 'CHAT_MESSAGE' | 'UNKNOWN'} The determined action type.
 */
function determineActionType(audioFile, audioFiles, message) {
  if (audioFiles && audioFiles.length > 0) return 'BATCH_UPLOAD';
  if (audioFile) return 'AUDIO_UPLOAD';
  if (message) return 'CHAT_MESSAGE';
  return 'UNKNOWN';
}

/**
 * Handles the upload and processing of a single audio file.
 * This function orchestrates the upload to GCS, Gemini File API, audio processing,
 * and conversation updates.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} userId - The ID of the user or guest.
 * @param {boolean} isGuest - True if the user is a guest, false otherwise.
 * @param {object} audioFile - The audio file object from Multer.
 * @param {string} audioFile.path - The temporary path of the uploaded file.
 * @param {string} audioFile.originalname - The original name of the uploaded file.
 * @param {string} audioFile.mimetype - The MIME type of the uploaded file.
 * @param {number} audioFile.size - The size of the uploaded file in bytes.
 * @returns {Promise<void>} A promise that resolves when the audio is processed and a response is sent.
 * @throws {Error} If any step of the processing fails.
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
    // Indexing Recommendation: Ensure an index exists on `userId` (or `guestId` if applicable)
    // and potentially a compound index on `{ userId: 1, conversationId: 1 }` for efficient lookups
    // on the Conversation model used by `transcriptionService.handleTranscriptionConversation`.
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
      // optimizing the database query in `transcriptionService.handleTranscriptionConversation`
      // or a subsequent call to fetch only the last N messages directly
      // using aggregation or a specific Mongoose query with $slice.
      // The current approach fetches the entire messages array and then slices in memory.
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
 * Handles the upload and processing of multiple audio files in a batch.
 * Each file is uploaded to GCS, Gemini File API, processed, and results are aggregated.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} userId - The ID of the user or guest.
 * @param {boolean} isGuest - True if the user is a guest, false otherwise.
 * @param {Array<object>} audioFiles - An array of audio file objects from Multer.
 * @returns {Promise<void>} A promise that resolves when all audio files are processed and a response is sent.
 * @throws {Error} If any step of the batch processing fails.
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
    // Indexing Recommendation: Ensure an index exists on `userId` (or `guestId` if applicable)
    // and potentially a compound index on `{ userId: 1, conversationId: 1 }` for efficient lookups
    // on the Conversation model used by `transcriptionService.handleTranscriptionConversation`.
    const conversation =
      await transcriptionService.handleTranscriptionConversation(
        userId,
        conversationId,
        `batch-${audioFiles.length}-files`,
        isGuest,
        req
      );
    const actualConversationId = conversation.conversationId;

    // Optimization: Use Promise.all to process audio files concurrently.
    // This significantly speeds up batch processing if external services (GCS, Gemini File API)
    // can handle concurrent requests, reducing the overall execution time.
    const fileProcessingPromises = audioFiles.map(async (file) => {
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

        return {
          fileName: file.originalname,
          result: result.text,
          audioUrl: bucketUpload.publicUrl,
          gsUri: bucketUpload.gsUri,
          gcsFileName: bucketUpload.fileName,
          bucketName: bucketUpload.bucketName,
          success: true,
        };
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}:`, error);
        return {
          fileName: file.originalname,
          error: error.message,
          success: false,
        };
      } finally {
        // Ensure local file is cleaned up even if processing fails
        await safeUnlink(file.path);
      }
    });

    const results = await Promise.all(fileProcessingPromises);

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
 * Handles chat messages, allowing users to ask questions about previous transcriptions
 * within a specific conversation context.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @param {string} userId - The ID of the user or guest.
 * @param {boolean} isGuest - True if the user is a guest, false otherwise.
 * @param {string} message - The user's chat message.
 * @param {string} conversationId - The ID of the conversation to which the message belongs.
 * @returns {Promise<void>} A promise that resolves when the chat message is processed and a response is sent.
 * @throws {Error} If the conversation is not found or processing fails.
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
    // Optimization: Use .select() with $slice to fetch only the last N messages
    // directly from the database, avoiding loading a potentially very large array into memory.
    // Indexing Recommendation: Ensure an index exists on `conversationId`
    // and potentially a compound index on `{ conversationId: 1, userId: 1 }`
    // if `userId` is consistently used in queries for non-guest users.
    const conversation = await conversationHelpers
      .getConversationById(conversationId, isGuest ? null : userId)
      .select({ messages: { $slice: -20 }, _id: 1 }) // Fetch only last 20 messages and the conversation ID
      .lean();

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
      // The messages array is already sliced to the last 20 by the database query.
      conversationHistory = conversation.messages
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
        // Note: conversation.messages.length now reflects the sliced array length (max 20),
        // not the total number of messages in the conversation. If the total count is needed,
        // it should be fetched separately or stored as a top-level field in the Conversation model.
        messageCount: (conversation.messages?.length || 0) + 2,
        hasAudioContext: !!lastAudioFileUri,
      },
    });
  } catch (error) {
    logger.error('Chat message error:', error);
    throw error;
  }
}

/**
 * Builds a context-aware prompt for the AI model based on the user's message,
 * conversation history, and the presence of an audio file URI.
 *
 * @param {string} message - The user's current message.
 * @param {Array<object>} conversationHistory - An array of previous messages in the conversation.
 * @param {string | null} audioFileUri - The URI of the last audio file uploaded in the conversation, if any.
 * @returns {string} The constructed prompt string for the AI.
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
 * @swagger
 * /api/v1/transcription/assistant:
 *   post:
 *     summary: Smart transcription assistant - unified endpoint for all transcription actions.
 *     description: |
 *       This endpoint handles various transcription-related actions based on the request payload:
 *       - **Single Audio Upload**: Uploads a single audio file for transcription or other processing.
 *       - **Batch Audio Upload**: Uploads multiple audio files for batch transcription.
 *       - **Chat Message**: Sends a chat message to an existing conversation, potentially querying previous transcriptions.
 *
 *       The `actionType` is determined automatically based on the presence of `audio`, `audios`, or `message` in the request.
 *     tags:
 *       - Transcription
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             oneOf:
 *               - title: Single Audio Upload
 *                 description: For uploading a single audio file for transcription or other processing.
 *                 properties:
 *                   audio:
 *                     type: string
 *                     format: binary
 *                     description: The audio file to upload (e.g., MP3, WAV, M4A). Max size 10MB.
 *                   prompt:
 *                     type: string
 *                     description: An optional prompt or instruction for the AI model.
 *                   processingType:
 *                     type: string
 *                     enum: [TRANSCRIBE, SUMMARIZE, TRANSLATE, ANALYZE]
 *                     default: TRANSCRIBE
 *                     description: The type of processing to perform on the audio.
 *                   startTimestamp:
 *                     type: number
 *                     description: Start timestamp in seconds for partial audio processing.
 *                   endTimestamp:
 *                     type: number
 *                     description: End timestamp in seconds for partial audio processing.
 *                   conversationId:
 *                     type: string
 *                     description: Optional ID of an existing conversation to continue.
 *                   outputFormat:
 *                     type: string
 *                     enum: [text, srt, vtt]
 *                     default: text
 *                     description: Desired output format for transcription.
 *                   includeTimestamps:
 *                     type: boolean
 *                     default: false
 *                     description: Whether to include timestamps in the transcription output.
 *                   userId:
 *                     type: string
 *                     description: Optional user ID for guest users to explicitly set/override.
 *                 required:
 *                   - audio
 *               - title: Batch Audio Upload
 *                 description: For uploading multiple audio files for batch transcription.
 *                 properties:
 *                   audios:
 *                     type: array
 *                     items:
 *                       type: string
 *                       format: binary
 *                     description: An array of audio files to upload.
 *                   conversationId:
 *                     type: string
 *                     description: Optional ID of an existing conversation to continue.
 *                   outputFormat:
 *                     type: string
 *                     enum: [text, srt, vtt]
 *                     default: text
 *                     description: Desired output format for transcription.
 *                   userId:
 *                     type: string
 *                     description: Optional user ID for guest users to explicitly set/override.
 *                 required:
 *                   - audios
 *         application/json:
 *           schema:
 *             type: object
 *             title: Chat Message
 *             description: For sending a chat message within an existing conversation.
 *             properties:
 *               message:
 *                 type: string
 *                 description: The chat message from the user.
 *               conversationId:
 *                 type: string
 *                 description: The ID of the conversation to send the message to.
 *               userId:
 *                 type: string
 *                 description: Optional user ID for guest users to explicitly set/override.
 *             required:
 *               - message
 *               - conversationId
 *     responses:
 *       200:
 *         description: Request processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Audio processed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     conversationId:
 *                       type: string
 *                       example: "65e7a8b9c0d1e2f3a4b5c6d7"
 *                     userId:
 *                       type: string
 *                       example: "user123"
 *                     result:
 *                       type: string
 *                       example: "This is the transcribed text."
 *                     processingType:
 *                       type: string
 *                       example: "TRANSCRIBE"
 *                     metadata:
 *                       type: object
 *                       properties:
 *                         fileName:
 *                           type: string
 *                           example: "audio.mp3"
 *                         tokenCount:
 *                           type: number
 *                           example: 150
 *                         estimatedDuration:
 *                           type: number
 *                           example: 60.5
 *                     conversationHistory:
 *                       type: number
 *                       example: 5
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 * @param {import('express').Request} req - The Express request object, containing audio files (if any) and body parameters.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the request is processed and a response is sent.
 */
export const smartTranscriptionAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? transcriptionService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId; // Allow guest users to explicitly provide userId

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
 * @swagger
 * /api/v1/transcription/stats:
 *   get:
 *     summary: Get transcription statistics for the authenticated user.
 *     description: Retrieves various statistics related to the user's transcription activities, such as total transcriptions, total duration, etc.
 *     tags:
 *       - Transcription
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Transcription statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Transcription statistics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalTranscriptions:
 *                       type: number
 *                       example: 15
 *                     totalAudioDurationSeconds:
 *                       type: number
 *                       example: 3600
 *                     averageTranscriptionLength:
 *                       type: number
 *                       example: 240
 *                     lastTranscriptionDate:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T10:00:00Z"
 *                     # Add more relevant stats here
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the statistics are retrieved and a response is sent.
 */
export const getTranscriptionStats = catchAsync(async (req, res) => {
  const userId = req.user?.userId || req.user?._id;

  try {
    // Optimization Note: Ensure that transcriptionService.getTranscriptionStats
    // uses .lean() for any read-only Mongoose queries it performs to return
    // plain JavaScript objects, improving performance.
    // Indexing Recommendation: Ensure appropriate indexes exist on fields
    // used for filtering/sorting statistics (e.g., userId, createdAt)
    // within the `transcriptionService.getTranscriptionStats` implementation.
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

/**
 * @typedef {object} TranscriptionController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} smartTranscriptionAssistant - Unified endpoint for all transcription actions.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getTranscriptionStats - Retrieves transcription statistics for the authenticated user.
 */

/**
 * Exports the transcription controller functions.
 * @type {TranscriptionController}
 */
export const transcriptionController = {
  smartTranscriptionAssistant,
  getTranscriptionStats,
};