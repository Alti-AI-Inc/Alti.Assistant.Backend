import { GoogleGenerativeAI } from '@google/generative-ai';
import httpStatus from 'http-status';
import { v4 as uuidv4 } from 'uuid';
import { Storage } from '@google-cloud/storage';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import {
  TRANSCRIPTION_CONSTANTS,
  SUPPORTED_AUDIO_FORMATS,
  PROCESSING_TYPES,
  ERROR_MESSAGES,
} from './transcription.constant.js';
import config from '../../../../config/index.js';
// INTEGRATION: Import a hypothetical usage service to handle limits and billing.
// This is critical for ensuring user actions correctly propagate usage details.
import { usageService } from '../../services/usage.service.js'; // NOTE: Path is assumed for this integration.

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

// Initialize Google Cloud Storage
const storage = new Storage();
const gcsBucketName = config.gcs?.bucketName;

/**
 * Validates if the user has permission to access a GCS resource based on tenant isolation.
 * @param {string} gsUri - The GCS URI of the file (e.g., 'gs://bucket/tenantId/...')
 * @param {Object} user - The authenticated user object, containing at least a `tenantId`.
 * @throws {ApiError} If validation fails (unauthorized, forbidden, bad format).
 */
const validateGcsAccess = async (gsUri, user) => {
  // SECURITY: Ensure a valid user context with tenant information is always present for authorization.
  if (!user || !user.tenantId) {
    throw new ApiError(
      httpStatus.UNAUTHORIZED,
      'User context is missing or invalid.'
    );
  }

  // gsUri format: gs://bucket-name/path/to/object
  const prefix = `gs://${gcsBucketName}/`;
  if (!gsUri.startsWith(prefix)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Invalid GCS URI format for this bucket.'
    );
  }

  const objectName = gsUri.substring(prefix.length);

  // SECURITY FIX (IDOR): Enforce tenant boundary. Users (including admins/managers) can only access resources
  // within their own tenant, preventing cross-tenant data access vulnerabilities.
  if (!objectName.startsWith(`${user.tenantId}/`)) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have permission to access this resource.'
    );
  }
};

/**
 * Uploads an audio file stream directly to a Google Cloud Storage bucket, enforcing tenant isolation.
 *
 * @param {ReadableStream} fileStream - The readable stream of the audio file.
 * @param {string} originalFilename - The original name of the file, used for its extension.
 * @param {string} mimeType - The MIME type of the audio file (e.g., 'audio/mpeg', 'audio/wav').
 * @param {Object} user - The authenticated user object with `tenantId` and `userId`.
 * @returns {Promise<Object>} A promise that resolves to an object containing the GCS file's details.
 * @throws {ApiError} If the file upload to GCS fails or user context is invalid.
 */
const uploadAudioStreamToGcs = (
  fileStream,
  originalFilename,
  mimeType,
  user
) => {
  if (!gcsBucketName) {
    logger.error('GCS bucket name is not configured.');
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Server configuration error for file uploads.'
    );
  }

  // SECURITY: User context is mandatory for ensuring data is stored with correct ownership and tenancy.
  if (!user || !user.tenantId || !user.userId) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Valid user context with tenant and user ID is required for uploads.'
    );
  }

  return new Promise((resolve, reject) => {
    const bucket = storage.bucket(gcsBucketName);
    const fileExtension = originalFilename.includes('.')
      ? originalFilename.substring(originalFilename.lastIndexOf('.'))
      : '';

    // BUG FIX & SECURITY: Enforce multi-tenancy by storing files in tenant/user specific paths.
    // This prevents data leakage between tenants and simplifies access control.
    const uniqueFilename = `${user.tenantId}/${user.userId}/${uuidv4()}${fileExtension}`;

    const gcsFile = bucket.file(uniqueFilename);
    const stream = gcsFile.createWriteStream({
      metadata: {
        contentType: mimeType,
      },
      resumable: false,
    });

    stream.on('error', err => {
      logger.error('GCS stream upload error:', err);
      reject(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to upload audio file to GCS'
        )
      );
    });

    stream.on('finish', () => {
      logger.info(
        `File ${uniqueFilename} uploaded to GCS bucket ${gcsBucketName} by user ${user.userId}.`
      );
      resolve({
        gsUri: `gs://${gcsBucketName}/${uniqueFilename}`,
        fileName: uniqueFilename, // This is the full GCS object name/path
        mimeType: mimeType,
      });
    });

    fileStream.pipe(stream);
  });
};

/**
 * Processes an audio file using Gemini, ensuring user authorization and tracking usage.
 *
 * @param {Object} audioFile - An object containing information about the audio file.
 * @param {string} [audioFile.gsUri] - GCS URI of the audio file (e.g., 'gs://bucket/file.mp3').
 * @param {string} audioFile.mimeType - The MIME type of the audio file.
 * @param {string} prompt - The user's specific prompt or question for the audio processing.
 * @param {string} processingType - The type of processing to perform.
 * @param {Object} user - The authenticated user object for authorization and usage tracking.
 * @param {Object} [options={}] - Additional options for processing.
 * @returns {Promise<Object>} A promise that resolves to an object containing the processed text and metadata.
 * @throws {ApiError} If processing fails, user is unauthorized, or usage limits are exceeded.
 */
const processAudioWithGemini = async (
  audioFile,
  prompt,
  processingType,
  user,
  options = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    let systemPrompt = buildPromptForType(processingType, options);
    const fullPrompt = prompt ? `${systemPrompt}\n\n${prompt}` : systemPrompt;

    logger.info(
      `Processing audio for user ${user.userId} with type: ${processingType}`
    );

    const fileUri = audioFile.gsUri; // Assuming direct GCS URI usage primarily
    if (!fileUri) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No audio file URI (gsUri) provided.'
      );
    }

    // SECURITY FIX (IDOR): Validate that the user has permission to access this GCS resource.
    await validateGcsAccess(fileUri, user);

    // INTEGRATION FIX: Check usage limits and charge for the operation.
    // Step 1: Get the token count to estimate the cost. Pass user for authorization.
    const { totalTokens } = await countAudioTokens(audioFile, user);

    // Step 2: Authorize the operation against user/workspace limits and deduct usage.
    // This service call is responsible for checking limits for the user, their manager, and the workspace admin,
    // and for propagating usage metrics up the hierarchy.
    await usageService.authorizeAndCharge({
      user,
      usage: { tokens: totalTokens, operation: 'audio_processing' },
      source: 'geminiAudioService.processAudioWithGemini',
    });

    const result = await model.generateContent([
      fullPrompt,
      { fileData: { fileUri, mimeType: audioFile.mimeType } },
    ]);

    const response = await result.response;
    const text = response.text();

    logger.info(`Audio processed successfully for user ${user.userId}`);

    return {
      text,
      processingType,
      metadata: {
        model: TRANSCRIPTION_CONSTANTS.MODEL,
        fileUri: fileUri,
        fileName: audioFile.fileName,
        gsUri: audioFile.gsUri,
        ...options,
      },
    };
  } catch (error) {
    // Re-throw ApiErrors (like from usage service or validation) directly
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error processing audio with Gemini:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.PROCESSING_FAILED
    );
  }
};

/**
 * Processes audio data provided directly as a buffer, with usage tracking.
 *
 * @param {Buffer} audioBuffer - The audio data as a Buffer.
 * @param {string} mimeType - The MIME type of the audio data.
 * @param {string} prompt - The user's specific prompt.
 * @param {string} processingType - The type of processing to perform.
 * @param {Object} user - The authenticated user object for usage tracking.
 * @param {Object} [options={}] - Additional options for processing.
 * @returns {Promise<Object>} A promise that resolves to an object containing the processed text and metadata.
 * @throws {ApiError} If processing fails or usage limits are exceeded.
 */
const processInlineAudio = async (
  audioBuffer,
  mimeType,
  prompt,
  processingType,
  user,
  options = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    let systemPrompt = buildPromptForType(processingType, options);
    const fullPrompt = prompt ? `${systemPrompt}\n\n${prompt}` : systemPrompt;

    logger.info(
      `Processing inline audio for user ${user.userId} with type: ${processingType}`
    );

    const result = await model.generateContent([
      fullPrompt,
      { inlineData: { data: audioBuffer.toString('base64'), mimeType } },
    ]);

    const response = await result.response;
    const text = response.text();

    // INTEGRATION FIX: Charge the user based on actual tokens consumed, after the fact.
    // This call handles limit checks and propagates usage up the user's hierarchy.
    if (response.usageMetadata && response.usageMetadata.totalTokenCount) {
      await usageService.authorizeAndCharge({
        user,
        usage: {
          tokens: response.usageMetadata.totalTokenCount,
          operation: 'inline_audio_processing',
        },
        source: 'geminiAudioService.processInlineAudio',
      });
    } else {
      logger.warn(
        'Could not find usage metadata in Gemini response for inline audio. Usage not charged.'
      );
    }

    logger.info(`Inline audio processed successfully for user ${user.userId}`);

    return {
      text,
      processingType,
      metadata: {
        model: TRANSCRIPTION_CONSTANTS.MODEL,
        processedInline: true,
        ...options,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error processing inline audio:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.PROCESSING_FAILED
    );
  }
};

/**
 * Constructs a system prompt based on the desired processing type and additional options.
 *
 * @param {string} processingType - The type of processing.
 * @param {Object} [options={}] - Additional options that might influence the prompt.
 * @returns {string} The constructed system prompt.
 */
const buildPromptForType = (processingType, options = {}) => {
  const { startTimestamp, endTimestamp, includeTimestamps } = options;
  let basePrompt = '';
  switch (processingType) {
    case PROCESSING_TYPES.TRANSCRIBE:
      basePrompt =
        'Generate a detailed transcript of the speech in this audio file.';
      if (includeTimestamps) {
        basePrompt += ' Include timestamps for each segment.';
      }
      break;
    case PROCESSING_TYPES.DESCRIBE:
      basePrompt =
        'Describe this audio clip in detail. Include information about speech, sounds, music, and any other audio elements.';
      break;
    case PROCESSING_TYPES.SUMMARIZE:
      basePrompt =
        'Provide a concise summary of the content in this audio file.';
      break;
    case PROCESSING_TYPES.ANALYZE:
      basePrompt =
        'Analyze this audio clip. Identify key themes, topics, speakers, tone, and any significant audio elements.';
      break;
    case PROCESSING_TYPES.SEGMENT:
      basePrompt =
        'Break down this audio into distinct segments and provide a summary of each segment with timestamps.';
      break;
    case PROCESSING_TYPES.QUESTION:
      basePrompt =
        'Answer questions about this audio clip based on its content.';
      break;
    default:
      basePrompt = 'Process this audio file.';
  }
  if (startTimestamp && endTimestamp) {
    basePrompt += ` Focus on the audio segment from ${startTimestamp} to ${endTimestamp}.`;
  } else if (startTimestamp) {
    basePrompt += ` Start from ${startTimestamp}.`;
  } else if (endTimestamp) {
    basePrompt += ` Process up to ${endTimestamp}.`;
  }
  return basePrompt;
};

/**
 * Counts the number of tokens in an audio file, ensuring user has access.
 *
 * @param {Object} audioFile - An object containing information about the audio file.
 * @param {string} audioFile.gsUri - The GCS URI of the audio file.
 * @param {string} audioFile.mimeType - The MIME type of the audio file.
 * @param {Object} user - The authenticated user object for authorization.
 * @returns {Promise<Object>} A promise that resolves to an object with the total token count.
 * @throws {ApiError} If token counting fails or user is unauthorized.
 */
const countAudioTokens = async (audioFile, user) => {
  try {
    // SECURITY FIX (IDOR): Validate that the user has permission to access this GCS resource before counting tokens.
    await validateGcsAccess(audioFile.gsUri, user);

    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    const result = await model.countTokens([
      { fileData: { fileUri: audioFile.gsUri, mimeType: audioFile.mimeType } },
    ]);

    return { totalTokens: result.totalTokens };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error counting audio tokens:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to count tokens'
    );
  }
};

/**
 * Processes multiple audio files in a batch, with authorization and usage tracking for each.
 *
 * @param {Array<Object>} audioFiles - An array of audio file configurations to process.
 * @param {Object} user - The authenticated user object.
 * @param {Object} [options={}] - General options to apply to all batch processing tasks.
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of results.
 * @throws {ApiError} If any part of the batch processing fails.
 */
const processBatchAudio = async (audioFiles, user, options = {}) => {
  try {
    const processingPromises = audioFiles.map(async audioConfig => {
      const { file, prompt, processingType } = audioConfig;

      // INTEGRATION: Pass user context down for per-file authorization and usage tracking.
      const result = await processAudioWithGemini(
        file,
        prompt,
        processingType || PROCESSING_TYPES.TRANSCRIBE,
        user,
        options
      );

      return { fileName: file.fileName, result };
    });

    const results = await Promise.all(processingPromises);
    return results;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error processing batch audio:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process batch audio'
    );
  }
};

/**
 * Deletes a file from the Google Cloud Storage bucket, with authorization checks.
 *
 * @param {string} fileName - The resource name of the file to delete from the GCS bucket.
 * @param {Object} user - The authenticated user object for authorization.
 * @returns {Promise<void>} A promise that resolves when the file is deleted.
 * @throws {ApiError} If the user is not permitted to delete the file.
 */
const deleteFileFromGcs = async (fileName, user) => {
  try {
    if (!gcsBucketName) {
      logger.error('GCS bucket name is not configured for file deletion.');
      return;
    }
    if (!user || !user.tenantId) {
      logger.error(
        'Attempted to delete GCS file without valid user/tenant context.'
      );
      throw new ApiError(
        httpStatus.UNAUTHORIZED,
        'User context is missing or invalid.'
      );
    }

    // SECURITY FIX (IDOR): Ensure user can only delete files within their own tenant.
    // Different roles (e.g., admin, manager) could have broader permissions within the tenant,
    // which would be handled by a more sophisticated authorization service. This check enforces the tenant boundary.
    if (!fileName.startsWith(`${user.tenantId}/`)) {
      logger.warn(
        `Forbidden attempt by user ${user.userId} to delete file outside their tenant: ${fileName}`
      );
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'You do not have permission to delete this file.'
      );
    }

    await storage.bucket(gcsBucketName).file(fileName).delete();
    logger.info(`Deleted file from GCS: ${fileName} by user ${user.userId}`);
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    if (error.code === 404) {
      logger.warn(
        `Attempted to delete non-existent file from GCS: ${fileName}`
      );
    } else {
      logger.error(`Error deleting file from GCS: ${fileName}`, error);
      // Do not throw for general GCS errors to avoid disrupting other operations, but do throw for auth errors.
    }
  }
};

/**
 * Validates if the given MIME type is a supported audio format for Gemini processing.
 *
 * @param {string} mimeType - The MIME type to validate.
 * @returns {boolean} True if the format is supported, false otherwise.
 */
const isValidAudioFormat = mimeType => {
  return Object.values(SUPPORTED_AUDIO_FORMATS).includes(mimeType);
};

/**
 * Processes a chat message, optionally with audio context, with authorization and usage tracking.
 *
 * @param {string} message - The user's current message.
 * @param {Array<Object>} conversationHistory - An array of previous chat messages.
 * @param {Object} user - The authenticated user object.
 * @param {Object} [audioFile=null] - Optional audio file object with `{gsUri, mimeType}`.
 * @returns {Promise<Object>} A promise that resolves to the model's response.
 * @throws {ApiError} If processing fails, user is unauthorized, or limits are exceeded.
 */
const processChatMessage = async (
  message,
  conversationHistory,
  user,
  audioFile = null
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    const chatHistory = conversationHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    const chat = model.startChat({ history: chatHistory });

    let result;
    const messageParts = [message];

    if (audioFile && audioFile.gsUri) {
      // SECURITY FIX (IDOR): Validate access to the audio file.
      await validateGcsAccess(audioFile.gsUri, user);

      // BUG FIX: Use the provided mimeType instead of hardcoding.
      if (!audioFile.mimeType) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Audio file must include a mimeType.'
        );
      }
      messageParts.push({
        fileData: {
          fileUri: audioFile.gsUri,
          mimeType: audioFile.mimeType,
        },
      });
    }

    result = await chat.sendMessage(messageParts);
    const response = await result.response;
    const text = response.text();

    // INTEGRATION FIX: Charge the user for the chat interaction based on actual tokens consumed.
    if (response.usageMetadata && response.usageMetadata.totalTokenCount) {
      await usageService.authorizeAndCharge({
        user,
        usage: {
          tokens: response.usageMetadata.totalTokenCount,
          operation: 'chat_message',
        },
        source: 'geminiAudioService.processChatMessage',
      });
    } else {
      logger.warn(
        'Could not find usage metadata in Gemini response for chat. Usage not charged.'
      );
    }

    logger.info(`Chat message processed successfully for user ${user.userId}`);

    return {
      text,
      metadata: {
        model: TRANSCRIPTION_CONSTANTS.MODEL,
        hasAudioContext: !!(audioFile && audioFile.gsUri),
        historyLength: conversationHistory.length,
      },
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error processing chat message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process chat message'
    );
  }
};

export const geminiAudioService = {
  uploadAudioStreamToGcs,
  processAudioWithGemini,
  processInlineAudio,
  countAudioTokens,
  processBatchAudio,
  deleteFileFromGcs,
  isValidAudioFormat,
  buildPromptForType,
  processChatMessage,
};