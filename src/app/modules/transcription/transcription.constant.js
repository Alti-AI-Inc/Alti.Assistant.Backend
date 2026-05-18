// Transcription specific constants
export const TRANSCRIPTION_CONSTANTS = {
  CATEGORY: 'transcription',
  MODEL: 'gemini-2.5-flash',
  TYPE: 'audio_understanding',
};

// User types for transcription
export const USER_TYPES = {
  AUTHENTICATED: 'authenticated',
  GUEST: 'guest',
};

// Guest user configuration
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

// Audio processing options
export const AUDIO_PROCESSING = {
  MAX_INLINE_SIZE: 20 * 1024 * 1024, // 20MB
  MAX_AUDIO_LENGTH: 9.5 * 60 * 60, // 9.5 hours in seconds
  MAX_GUEST_AUDIO_LENGTH: 300, // 5 minutes for guests
  TOKENS_PER_SECOND: 32,
  SAMPLE_RATE: 16000, // 16 Kbps
};

// Supported audio formats
export const SUPPORTED_AUDIO_FORMATS = {
  WAV: 'audio/wav',
  MP3: 'audio/mp3',
  AIFF: 'audio/aiff',
  AAC: 'audio/aac',
  OGG: 'audio/ogg',
  FLAC: 'audio/flac',
};

// Audio processing types
export const PROCESSING_TYPES = {
  TRANSCRIBE: 'transcribe',
  DESCRIBE: 'describe',
  SUMMARIZE: 'summarize',
  ANALYZE: 'analyze',
  SEGMENT: 'segment',
  QUESTION: 'question',
};

// Transcription message types
export const TRANSCRIPTION_MESSAGE_TYPES = {
  UPLOAD: 'audio_upload',
  PROCESSING: 'audio_processing',
  RESULT: 'transcription_result',
  ERROR: 'error',
};

// Rate limits
export const TRANSCRIPTION_RATE_LIMITS = {
  TRANSCRIPTION_REQUESTS: { requests: 20, window: 15 }, // 20 per 15 minutes
  STATS_REQUESTS: { requests: 10, window: 15 }, // 10 per 15 minutes
  GUEST_REQUESTS: { requests: 5, window: 60 }, // Lower limit for guests
};

// Validation limits
export const TRANSCRIPTION_VALIDATION = {
  PROMPT_MIN_LENGTH: 1,
  PROMPT_MAX_LENGTH: 1000,
  TIMESTAMP_REGEX: /^(\d{2}):(\d{2})$/,
  MAX_SEGMENTS: 50, // Maximum number of timestamp segments per request
};

// Output formats
export const OUTPUT_FORMATS = {
  TEXT: 'text',
  JSON: 'json',
  SRT: 'srt',
  VTT: 'vtt',
};

// Error messages
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
