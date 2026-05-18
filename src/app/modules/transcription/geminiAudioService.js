import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import {
  TRANSCRIPTION_CONSTANTS,
  SUPPORTED_AUDIO_FORMATS,
  PROCESSING_TYPES,
  ERROR_MESSAGES,
} from './transcription.constant.js';
import { transcriptionService } from './transcription.service.js';
import fs from 'fs';
import path from 'path';
import config from '../../../../config/index.js';

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);
const fileManager = new GoogleAIFileManager(config.gemini_secret_key);

/**
 * Upload audio file to Gemini Files API
 * @param {string} filePath - Local file path
 * @param {string} mimeType - Audio mime type
 * @returns {Promise<Object>}
 */
const uploadAudioFile = async (filePath, mimeType) => {
  try {
    logger.info(`Uploading audio file: ${filePath}`);

    const uploadResult = await fileManager.uploadFile(filePath, {
      mimeType,
      displayName: path.basename(filePath),
    });

    logger.info(`File uploaded successfully: ${uploadResult.file.uri}`);

    return {
      fileUri: uploadResult.file.uri,
      fileName: uploadResult.file.name,
      mimeType: uploadResult.file.mimeType,
      sizeBytes: uploadResult.file.sizeBytes,
    };
  } catch (error) {
    logger.error('Error uploading audio file:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to upload audio file'
    );
  }
};

/**
 * Process audio file with Gemini
 * @param {Object} audioFile - Audio file object from upload (can contain fileUri or bucketUrl)
 * @param {string} prompt - User prompt
 * @param {string} processingType - Type of processing
 * @param {Object} options - Additional options
 * @returns {Promise<Object>}
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
    const fileUri = audioFile.fileUri || audioFile.gsUri;

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
 * Process inline audio data
 * @param {Buffer} audioBuffer - Audio data buffer
 * @param {string} mimeType - Audio mime type
 * @param {string} prompt - User prompt
 * @param {string} processingType - Type of processing
 * @param {Object} options - Additional options
 * @returns {Promise<Object>}
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
 * Build prompt based on processing type
 * @param {string} processingType
 * @param {Object} options
 * @returns {string}
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
 * Count tokens in audio file
 * @param {Object} audioFile - Audio file object
 * @returns {Promise<Object>}
 */
const countAudioTokens = async (audioFile) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    const result = await model.countTokens([
      {
        fileData: {
          fileUri: audioFile.fileUri,
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
 * Process batch audio files
 * @param {Array} audioFiles - Array of audio file objects
 * @param {Object} options - Processing options
 * @returns {Promise<Array>}
 */
const processBatchAudio = async (audioFiles, options = {}) => {
  try {
    const results = [];

    for (const audioConfig of audioFiles) {
      const { file, prompt, processingType } = audioConfig;

      const result = await processAudioWithGemini(
        file,
        prompt,
        processingType || PROCESSING_TYPES.TRANSCRIBE,
        options
      );

      results.push({
        fileName: file.fileName,
        result,
      });
    }

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
 * Delete uploaded file
 * @param {string} fileName - File name from upload
 * @returns {Promise<void>}
 */
const deleteUploadedFile = async (fileName) => {
  try {
    await fileManager.deleteFile(fileName);
    logger.info(`Deleted file: ${fileName}`);
  } catch (error) {
    logger.error('Error deleting file:', error);
    // Don't throw error, just log it
  }
};

/**
 * Validate audio file format
 * @param {string} mimeType
 * @returns {boolean}
 */
const isValidAudioFormat = (mimeType) => {
  return Object.values(SUPPORTED_AUDIO_FORMATS).includes(mimeType);
};

/**
 * Process chat message with context from previous transcriptions
 * @param {string} message - User message
 * @param {Array} conversationHistory - Previous messages
 * @param {string} audioFileUri - Optional audio file URI for context
 * @returns {Promise<Object>}
 */
const processChatMessage = async (
  message,
  conversationHistory,
  audioFileUri = null
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: TRANSCRIPTION_CONSTANTS.MODEL,
    });

    // Build chat context
    const chatHistory = conversationHistory
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      }));

    // Start chat session with history
    const chat = model.startChat({
      history: chatHistory,
    });

    // Send message (optionally with audio context)
    let result;
    if (audioFileUri) {
      result = await chat.sendMessage([
        message,
        {
          fileData: {
            fileUri: audioFileUri,
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
        hasAudioContext: !!audioFileUri,
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

export const geminiAudioService = {
  uploadAudioFile,
  processAudioWithGemini,
  processInlineAudio,
  countAudioTokens,
  processBatchAudio,
  deleteUploadedFile,
  isValidAudioFormat,
  buildPromptForType,
  processChatMessage,
};
