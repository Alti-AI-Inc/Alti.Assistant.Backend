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
// Unused import removed: import { transcriptionService } from './transcription.service.js';
import config from '../../../../config/index.js';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

// Initialize Google Cloud Storage
const storage = new Storage();
const gcsBucketName = config.gcs?.bucketName;

/**
 * Uploads an audio file stream directly to a Google Cloud Storage bucket.
 * This avoids saving the file to the local filesystem.
 *
 * @param {ReadableStream} fileStream - The readable stream of the audio file.
 * @param {string} originalFilename - The original name of the file, used for its extension.
 * @param {string} mimeType - The MIME type of the audio file (e.g., 'audio/mpeg', 'audio/wav').
 * @returns {Promise<Object>} A promise that resolves to an object containing the GCS file's details.
 * @returns {string} .gsUri - The GCS URI of the uploaded file (e.g., 'gs://bucket-name/file-name.mp3').
 * @returns {string} .fileName - The resource name of the uploaded file in the GCS bucket.
 * @returns {string} .mimeType - The MIME type of the uploaded file.
 * @throws {ApiError} If the file upload to GCS fails.
 */
const uploadAudioStreamToGcs = (fileStream, originalFilename, mimeType) => {
  if (!gcsBucketName) {
    logger.error('GCS bucket name is not configured.');
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Server configuration error for file uploads.'
    );
  }

  return new Promise((resolve, reject) => {
    const bucket = storage.bucket(gcsBucketName);
    const fileExtension = originalFilename.includes('.')
      ? originalFilename.substring(originalFilename.lastIndexOf('.'))
      : '';
    const uniqueFilename = `${uuidv4()}${fileExtension}`;

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
        `File ${uniqueFilename} uploaded to GCS bucket ${gcsBucketName}.`
      );
      resolve({
        gsUri: `gs://${gcsBucketName}/${uniqueFilename}`,
        fileName: uniqueFilename, // This is the GCS object name
        mimeType: mimeType,
      });
    });

    fileStream.pipe(stream);
  });
};

/**
 * Processes an audio file (either uploaded to Gemini Files API or accessible via GCS URI)
 * using the Gemini Pro Vision model for various tasks like transcription, summarization, or description.
 *
 * @param {Object} audioFile - An object containing information about the audio file.
 * @param {string} [audioFile.fileUri] - The URI of the audio file on the Gemini Files API.
 * @param {string} [audioFile.gsUri] - GCS URI of the audio file (e.g., 'gs://bucket/file.mp3').
 * @param {string} audioFile.mimeType - The MIME type of the audio file.
 * @param {string} [audioFile.fileName] - Optional original file name for logging/metadata.
 * @param {string} prompt - The user's specific prompt or question for the audio processing.
 * @param {string} processingType - The type of processing to perform (e.g., 'transcribe', 'summarize', 'describe').
 * @param {Object} [options={}] - Additional options for processing.
 * @param {string} [options.startTimestamp] - Optional start timestamp for processing a specific segment (e.g., '0:00:10').
 * @param {string} [options.endTimestamp] - Optional end timestamp for processing a specific segment (e.g., '0:00:30').
 * @param {boolean} [options.includeTimestamps=false] - Whether to include timestamps in the transcription output.
 * @returns {Promise<Object>} A promise that resolves to an object containing the processed text and metadata.
 * @returns {string} .text - The processed text output from Gemini.
 * @returns {string} .processingType - The type of processing performed.
 * @returns {Object} .metadata - Additional metadata about the processing.
 * @returns {string} .metadata.model - The Gemini model used.
 * @returns {string} .metadata.fileUri - The URI of the processed audio file.
 * @returns {string} [.metadata.fileName] - The original file name if available.
 * @returns {string} [.metadata.gsUri] - The GCS URI if used.
 * @throws {ApiError} If the audio processing fails due to an internal server error.
 */
const processAudioWithGemini = async (
  audioFile,
  prompt,
  processingType,
  options = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    // Build the prompt based on processing type
    let systemPrompt = buildPromptForType(processingType, options);
    const fullPrompt = prompt ? `${systemPrompt}\n\n${prompt}` : systemPrompt;

    logger.info(`Processing audio with type: ${processingType}`);

    // Support both Gemini File API URIs and direct GCS URIs
    // For GCS URIs (gs://...), Gemini can access them directly if in the same project
    const fileUri = audioFile.gsUri || audioFile.fileUri;

    if (!fileUri) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No audio file URI (gsUri or fileUri) provided.'
      );
    }

    // Generate content with audio
    const result = await model.generateContent([
      fullPrompt,
      {
        fileData: {
          fileUri: fileUri,
          mimeType: audioFile.mimeType,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    logger.info('Audio processed successfully');

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
    logger.error('Error processing audio with Gemini:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.PROCESSING_FAILED
    );
  }
};

/**
 * Processes audio data provided directly as a buffer (inline) using the Gemini Pro Vision model.
 * This is suitable for smaller audio clips that don't require prior upload to the Gemini Files API.
 *
 * @param {Buffer} audioBuffer - The audio data as a Buffer.
 * @param {string} mimeType - The MIME type of the audio data (e.g., 'audio/mpeg').
 * @param {string} prompt - The user's specific prompt or question for the audio processing.
 * @param {string} processingType - The type of processing to perform (e.g., 'transcribe', 'summarize').
 * @param {Object} [options={}] - Additional options for processing.
 * @param {string} [options.startTimestamp] - Optional start timestamp for processing a specific segment (e.g., '0:00:10').
 * @param {string} [options.endTimestamp] - Optional end timestamp for processing a specific segment (e.g., '0:00:30').
 * @param {boolean} [options.includeTimestamps=false] - Whether to include timestamps in the transcription output.
 * @returns {Promise<Object>} A promise that resolves to an object containing the processed text and metadata.
 * @returns {string} .text - The processed text output from Gemini.
 * @returns {string} .processingType - The type of processing performed.
 * @returns {Object} .metadata - Additional metadata about the processing.
 * @returns {string} .metadata.model - The Gemini model used.
 * @returns {boolean} .metadata.processedInline - Indicates that the audio was processed inline.
 * @throws {ApiError} If the inline audio processing fails due to an internal server error.
 */
const processInlineAudio = async (
  audioBuffer,
  mimeType,
  prompt,
  processingType,
  options = {}
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    let systemPrompt = buildPromptForType(processingType, options);
    const fullPrompt = prompt ? `${systemPrompt}\n\n${prompt}` : systemPrompt;

    logger.info(`Processing inline audio with type: ${processingType}`);

    const result = await model.generateContent([
      fullPrompt,
      {
        inlineData: {
          data: audioBuffer.toString('base64'),
          mimeType,
        },
      },
    ]);

    const response = await result.response;
    const text = response.text();

    logger.info('Inline audio processed successfully');

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
    logger.error('Error processing inline audio:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      ERROR_MESSAGES.PROCESSING_FAILED
    );
  }
};

/**
 * Constructs a system prompt based on the desired processing type and additional options.
 * This prompt guides the Gemini model on how to interpret and respond to the audio input.
 *
 * @param {string} processingType - The type of processing (e.g., 'transcribe', 'summarize', 'describe', 'analyze', 'segment', 'question').
 * @param {Object} [options={}] - Additional options that might influence the prompt.
 * @param {string} [options.startTimestamp] - Optional start timestamp for focusing on a specific audio segment.
 * @param {string} [options.endTimestamp] - Optional end timestamp for focusing on a specific audio segment.
 * @param {boolean} [options.includeTimestamps=false] - Whether to request timestamps in the transcription output.
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

  // Add timestamp constraints if provided
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
 * Counts the number of tokens in an audio file using the Gemini model.
 * This can be useful for estimating costs or understanding input size limitations.
 *
 * @param {Object} audioFile - An object containing information about the audio file.
 * @param {string} audioFile.gsUri - The GCS URI of the audio file.
 * @param {string} audioFile.mimeType - The MIME type of the audio file.
 * @returns {Promise<Object>} A promise that resolves to an object containing the total token count.
 * @returns {number} .totalTokens - The total number of tokens in the audio file.
 * @throws {ApiError} If token counting fails due to an internal server error.
 */
const countAudioTokens = async audioFile => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    const result = await model.countTokens([
      {
        fileData: {
          fileUri: audioFile.gsUri,
          mimeType: audioFile.mimeType,
        },
      },
    ]);

    return {
      totalTokens: result.totalTokens,
    };
  } catch (error) {
    logger.error('Error counting audio tokens:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to count tokens'
    );
  }
};

/**
 * Processes multiple audio files in a batch using `processAudioWithGemini`.
 * Each audio file can have its own prompt and processing type.
 *
 * @param {Array<Object>} audioFiles - An array of audio file configurations to process.
 * @param {Object} audioFiles[].file - The audio file object (same as `audioFile` parameter for `processAudioWithGemini`).
 * @param {string} audioFiles[].prompt - The specific prompt for this audio file.
 * @param {string} [audioFiles[].processingType='transcribe'] - The processing type for this audio file. Defaults to 'transcribe'.
 * @param {Object} [options={}] - General options to apply to all batch processing tasks (e.g., global timestamps).
 * @returns {Promise<Array<Object>>} A promise that resolves to an array of results for each processed audio file.
 * @returns {string} .fileName - The name of the processed file.
 * @returns {Object} .result - The processing result for the file (same as return for `processAudioWithGemini`).
 * @throws {ApiError} If any part of the batch processing fails due to an internal server error.
 */
const processBatchAudio = async (audioFiles, options = {}) => {
  try {
    // OPTIMIZATION: Use Promise.all to process audio files in parallel instead of sequentially.
    // This significantly reduces the total processing time for batches by running the independent
    // API calls concurrently, which is crucial for handling multiple files efficiently.
    const processingPromises = audioFiles.map(async audioConfig => {
      const { file, prompt, processingType } = audioConfig;

      const result = await processAudioWithGemini(
        file,
        prompt,
        processingType || PROCESSING_TYPES.TRANSCRIBE,
        options
      );

      return {
        fileName: file.fileName,
        result,
      };
    });

    const results = await Promise.all(processingPromises);
    return results;
  } catch (error) {
    logger.error('Error processing batch audio:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process batch audio'
    );
  }
};

/**
 * Deletes a file from the Google Cloud Storage bucket.
 * This helps manage storage and comply with data retention policies.
 * Errors during deletion are logged but not re-thrown to avoid disrupting other operations.
 *
 * @param {string} fileName - The resource name of the file to delete from the GCS bucket.
 * @returns {Promise<void>} A promise that resolves when the file is deleted.
 */
const deleteFileFromGcs = async fileName => {
  try {
    if (!gcsBucketName) {
      logger.error('GCS bucket name is not configured for file deletion.');
      return;
    }
    await storage.bucket(gcsBucketName).file(fileName).delete();
    logger.info(`Deleted file from GCS: ${fileName}`);
  } catch (error) {
    if (error.code === 404) {
      logger.warn(
        `Attempted to delete non-existent file from GCS: ${fileName}`
      );
    } else {
      logger.error(`Error deleting file from GCS: ${fileName}`, error);
    }
    // Don't throw error, just log it
  }
};

/**
 * Validates if the given MIME type is a supported audio format for Gemini processing.
 *
 * @param {string} mimeType - The MIME type to validate (e.g., 'audio/mpeg', 'audio/wav').
 * @returns {boolean} True if the format is supported, false otherwise.
 */
const isValidAudioFormat = mimeType => {
  return Object.values(SUPPORTED_AUDIO_FORMATS).includes(mimeType);
};

/**
 * Processes a chat message, optionally with audio context, using the Gemini model.
 * This allows for conversational interactions where audio can provide additional context.
 *
 * @param {string} message - The user's current message.
 * @param {Array<Object>} conversationHistory - An array of previous chat messages to provide context for the current turn.
 * @param {string} conversationHistory[].role - The role of the sender ('user' or 'assistant').
 * @param {string} conversationHistory[].content - The content of the message.
 * @param {string} [audioFileGsUri=null] - Optional GCS URI of an audio file to include as context for the current message.
 * @returns {Promise<Object>} A promise that resolves to an object containing the model's response and metadata.
 * @returns {string} .text - The text response from the Gemini model.
 * @returns {Object} .metadata - Additional metadata about the chat processing.
 * @returns {string} .metadata.model - The Gemini model used.
 * @returns {boolean} .metadata.hasAudioContext - Indicates if an audio file was provided as context.
 * @returns {number} .metadata.historyLength - The number of messages in the conversation history.
 * @throws {ApiError} If the chat message processing fails due to an internal server error.
 */
const processChatMessage = async (
  message,
  conversationHistory,
  audioFileGsUri = null
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    // Build chat context
    const chatHistory = conversationHistory
      .filter(msg => msg.role !== 'system')
      .map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    // Start chat session with history
    const chat = model.startChat({
      history: chatHistory,
    });

    // Send message (optionally with audio context)
    let result;
    if (audioFileGsUri) {
      result = await chat.sendMessage([
        message,
        {
          fileData: {
            fileUri: audioFileGsUri,
            mimeType: 'audio/mp3', // Assume mp3, adjust if needed
          },
        },
      ]);
    } else {
      result = await chat.sendMessage(message);
    }

    const response = await result.response;
    const text = response.text();

    logger.info('Chat message processed successfully');

    return {
      text,
      metadata: {
        model: TRANSCRIPTION_CONSTANTS.MODEL,
        hasAudioContext: !!audioFileGsUri,
        historyLength: conversationHistory.length,
      },
    };
  } catch (error) {
    logger.error('Error processing chat message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process chat message'
    );
  }
};

/**
 * @constant {Object} geminiAudioService - Provides a collection of services for interacting with the Gemini API for audio processing tasks.
 * This service encapsulates functionalities like uploading, processing, token counting, and managing audio files with Gemini.
 */
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