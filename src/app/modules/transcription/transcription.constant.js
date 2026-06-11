/**
 * @file Defines constants related to transcription services within the application.
 * @module app/modules/transcription/transcription.constant
 */

/**
 * Transcription specific constants.
 * These define core properties and identifiers for the transcription module.
 * @constant
 * @type {object}
 * @property {string} CATEGORY - The category identifier for transcription services.
 * @property {string} MODEL - The default AI model used for transcription.
 * @property {string} TYPE - The type of AI understanding task (e.g., audio understanding).
 */
export const TRANSCRIPTION_CONSTANTS = {
  CATEGORY: 'transcription',
  MODEL: 'gemini-2.5-flash',
  TYPE: 'audio_understanding',
};

/**
 * Defines different user types relevant to transcription services.
 * These can be used for feature gating or rate limiting.
 * @constant
 * @type {object}
 * @property {string} AUTHENTICATED - Represents a logged-in user.
 * @property {string} GUEST - Represents an unauthenticated user.
 */
export const USER_TYPES = {
  AUTHENTICATED: 'authenticated',
  GUEST: 'guest',
};

/**
 * Configuration settings specifically for guest users.
 * This includes prefixes for IDs and conversations, and feature limitations.
 * @constant
 * @type {object}
 * @property {string} ID_PREFIX - Prefix used for generating unique IDs for guest users.
 * @property {string} CONVERSATION_PREFIX - Prefix used for guest conversation identifiers.
 * @property {object} FEATURES - Defines features available or restricted for guest users.
 * @property {boolean} FEATURES.CONVERSATION_HISTORY - Whether guest users have access to conversation history.
 * @property {boolean} FEATURES.STATISTICS - Whether guest users can view usage statistics.
 * @property {boolean} FEATURES.UNLIMITED_USAGE - Whether guest users have unlimited usage (typically false).
 * @property {number} FEATURES.MAX_AUDIO_LENGTH - Maximum audio length in seconds allowed for guest users.
 */
export const GUEST_USER_CONFIG = {
  ID_PREFIX: 'guest-',
  CONVERSATION_PREFIX: 'transcription-guest-',
  FEATURES: {
    CONVERSATION_HISTORY: false,
    STATISTICS: false,
    UNLIMITED_USAGE: false,
    MAX_AUDIO_LENGTH: 300, // 5 minutes for guests
  },
};

/**
 * Defines various parameters and limits for audio processing.
 * @constant
 * @type {object}
 * @property {number} MAX_INLINE_SIZE - Maximum size in bytes for audio files to be processed inline (e.g., 20MB).
 * @property {number} MAX_AUDIO_LENGTH - Maximum audio duration in seconds allowed for authenticated users (e.g., 9.5 hours).
 * @property {number} MAX_GUEST_AUDIO_LENGTH - Maximum audio duration in seconds specifically for guest users, referencing `GUEST_USER_CONFIG`.
 * @property {number} TOKENS_PER_SECOND - Estimated number of tokens processed per second of audio.
 * @property {number} SAMPLE_RATE - The expected audio sample rate in Hz (e.g., 16 kHz).
 */
export const AUDIO_PROCESSING = {
  MAX_INLINE_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_AUDIO_LENGTH: 9.5 * 60 * 60, // 9.5 hours in seconds (for authenticated users)
  MAX_GUEST_AUDIO_LENGTH: GUEST_USER_CONFIG.FEATURES.MAX_AUDIO_LENGTH, // Reference guest-specific limit
  TOKENS_PER_SECOND: 32,
  SAMPLE_RATE: 16000, // 16 kHz (samples per second)
};

/**
 * A list of supported audio formats and their corresponding MIME types.
 * @constant
 * @type {object}
 * @property {string} WAV - MIME type for WAV audio.
 * @property {string} MP3 - MIME type for MP3 audio.
 * @property {string} AIFF - MIME type for AIFF audio.
 * @property {string} AAC - MIME type for AAC audio.
 * @property {string} OGG - MIME type for OGG audio.
 * @property {string} FLAC - MIME type for FLAC audio.
 */
export const SUPPORTED_AUDIO_FORMATS = {
  WAV: 'audio/wav',
  MP3: 'audio/mp3',
  AIFF: 'audio/aiff',
  AAC: 'audio/aac',
  OGG: 'audio/ogg',
  FLAC: 'audio/flac',
};

/**
 * Defines various types of audio processing tasks that can be performed.
 * @constant
 * @type {object}
 * @property {string} TRANSCRIBE - Task to convert speech to text.
 * @property {string} DESCRIBE - Task to generate a description of the audio content.
 * @property {string} SUMMARIZE - Task to create a summary of the audio content.
 * @property {string} ANALYZE - Task to perform general analysis on the audio.
 * @property {string} SEGMENT - Task to segment the audio based on timestamps or speakers.
 * @property {string} QUESTION - Task to answer questions based on the audio content.
 */
export const PROCESSING_TYPES = {
  TRANSCRIBE: 'transcribe',
  DESCRIBE: 'describe',
  SUMMARIZE: 'summarize',
  ANALYZE: 'analyze',
  SEGMENT: 'segment',
  QUESTION: 'question',
};

/**
 * Defines different types of messages that can be exchanged during the transcription process.
 * @constant
 * @type {object}
 * @property {string} UPLOAD - Message type indicating an audio file upload.
 * @property {string} PROCESSING - Message type indicating that audio processing is underway.
 * @property {string} RESULT - Message type indicating the final transcription result.
 * @property {string} ERROR - Message type indicating an error occurred during the process.
 */
export const TRANSCRIPTION_MESSAGE_TYPES = {
  UPLOAD: 'audio_upload',
  PROCESSING: 'audio_processing',
  RESULT: 'transcription_result',
  ERROR: 'error',
};

/**
 * Defines request-based rate limiting configurations for different types of transcription-related requests.
 * This helps prevent API abuse from rapid, repeated requests.
 * @constant
 * @type {object}
 * @property {object} AUTHENTICATED_USER - Rate limit for general transcription requests by authenticated users.
 * @property {number} AUTHENTICATED_USER.requests - Number of allowed requests.
 * @property {number} AUTHENTICATED_USER.window - Time window in minutes for the limit.
 * @property {object} GUEST_USER - Rate limit specifically for guest user requests.
 * @property {number} GUEST_USER.requests - Number of allowed requests.
 * @property {number} GUEST_USER.window - Time window in minutes for the limit.
 * @property {object} STATS - Rate limit for requests related to usage statistics.
 * @property {number} STATS.requests - Number of allowed requests.
 * @property {number} STATS.window - Time window in minutes for the limit.
 */
export const TRANSCRIPTION_RATE_LIMITS = {
  AUTHENTICATED_USER: { requests: 50, window: 10 }, // 50 requests per 10 minutes for logged-in users
  GUEST_USER: { requests: 5, window: 60 }, // 5 requests per hour for guests
  STATS: { requests: 20, window: 5 }, // 20 requests per 5 minutes for stats endpoints
};

/**
 * Defines usage-based limiting configurations based on cumulative audio duration.
 * This is a critical defense against cost-runaway abuse, where a user submits many long audio files.
 * @constant
 * @type {object}
 * @property {object} AUTHENTICATED_USER - Usage limits for authenticated users.
 * @property {number} AUTHENTICATED_USER.duration - Maximum cumulative audio duration in seconds.
 * @property {number} AUTHENTICATED_USER.window - Time window in minutes for the limit.
 * @property {object} GUEST_USER - Usage limits for guest users.
 * @property {number} GUEST_USER.duration - Maximum cumulative audio duration in seconds.
 * @property {number} GUEST_USER.window - Time window in minutes for the limit.
 */
export const TRANSCRIPTION_USAGE_LIMITS = {
  AUTHENTICATED_USER: { duration: 2 * 60 * 60, window: 60 }, // 2 hours of audio processing per hour
  GUEST_USER: { duration: 15 * 60, window: 60 }, // 15 minutes of audio processing per hour
};

/**
 * Defines validation parameters and regular expressions for transcription inputs.
 * @constant
 * @type {object}
 * @property {number} PROMPT_MIN_LENGTH - Minimum length for a transcription prompt.
 * @property {number} PROMPT_MAX_LENGTH - Maximum length for a transcription prompt.
 * @property {RegExp} TIMESTAMP_REGEX - Regular expression for validating timestamp formats (e.g., MM:SS).
 * @property {number} MAX_SEGMENTS - Maximum number of timestamp segments allowed per request.
 */
export const TRANSCRIPTION_VALIDATION = {
  PROMPT_MIN_LENGTH: 1,
  PROMPT_MAX_LENGTH: 1000,
  TIMESTAMP_REGEX: /^(\d{2}):(\d{2})$/,
  MAX_SEGMENTS: 50, // Maximum number of timestamp segments per request
};

/**
 * Defines supported output formats for transcription results.
 * @constant
 * @type {object}
 * @property {string} TEXT - Plain text output format.
 * @property {string} JSON - JSON object output format.
 * @property {string} SRT - SubRip Subtitle format.
 * @property {string} VTT - WebVTT format.
 */
export const OUTPUT_FORMATS = {
  TEXT: 'text',
  JSON: 'json',
  SRT: 'srt',
  VTT: 'vtt',
};

/**
 * Standardized error messages used across the transcription module.
 * @constant
 * @type {object}
 * @property {string} NO_AUDIO_FILE - Error message for missing audio file.
 * @property {string} INVALID_FORMAT - Error message for unsupported audio format.
 * @property {string} FILE_TOO_LARGE - Error message for audio file exceeding size limit.
 * @property {string} AUDIO_TOO_LONG - Error message for audio duration exceeding length limit.
 * @property {string} INVALID_TIMESTAMP - Error message for incorrect timestamp format.
 * @property {string} PROCESSING_FAILED - Error message when audio processing fails.
 * @property {string} USAGE_LIMIT_REACHED - Error message when a user hits their usage limit.
 */
export const ERROR_MESSAGES = {
  NO_AUDIO_FILE: 'Audio file is required',
  INVALID_FORMAT: 'Unsupported audio format',
  FILE_TOO_LARGE: 'Audio file exceeds maximum size limit',
  AUDIO_TOO_LONG: 'Audio duration exceeds maximum length',
  INVALID_TIMESTAMP: 'Invalid timestamp format. Use MM:SS',
  PROCESSING_FAILED: 'Failed to process audio file',
  USAGE_LIMIT_REACHED:
    'You have reached your transcription limit for this month',
};