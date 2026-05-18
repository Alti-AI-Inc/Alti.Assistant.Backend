/**
 * Video Assistant Constants
 *
 * This file contains all constants used throughout the video assistant module
 * to maintain consistency and make configuration changes easier.
 *
 * @module VideoAssistantConstants
 */

export const VIDEO_ASSISTANT_CONSTANTS = {
  // Message constraints
  MESSAGE: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 2000,
    DEFAULT_ERROR:
      'I apologize, but I encountered an error while processing your video request.',
  },

  // Video specifications
  VIDEO_SPECS: {
    DURATIONS: {
      SHORT: 5, // 5 seconds
      STANDARD: 10, // 10 seconds
      LONG: 30, // 30 seconds
    },
    STYLES: {
      REALISTIC: 'realistic',
      CARTOON: 'cartoon',
      CINEMATIC: 'cinematic',
      ABSTRACT: 'abstract',
    },
    RESOLUTIONS: {
      HD: '720p',
      FULL_HD: '1080p',
      FOUR_K: '4k',
    },
    ASPECT_RATIOS: {
      SQUARE: '1:1',
      PORTRAIT: '9:16',
      LANDSCAPE: '16:9',
      WIDESCREEN: '21:9',
    },
    QUALITY: {
      STANDARD: 'standard',
      HIGH: 'high',
      PREMIUM: 'premium',
    },
  },

  // File handling
  FILE: {
    MAX_FILE_SIZE: 100 * 1024 * 1024, // 100MB
    ALLOWED_FORMATS: ['mp4', 'mov', 'avi', 'webm'],
    MIME_TYPES: [
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/webm',
    ],
  },

  // Response types
  RESPONSE_TYPES: {
    GENERATION: 'generation',
    QUESTION: 'question',
    CONFIRMATION: 'confirmation',
    ERROR: 'error',
  },

  // Conversation states
  CONVERSATION_STATES: {
    INITIAL: 'initial',
    QUESTIONING: 'questioning',
    CONFIRMING: 'confirming',
    GENERATING: 'generating',
    COMPLETED: 'completed',
    ERROR: 'error',
  },

  // Error messages
  ERRORS: {
    INVALID_PROMPT: 'Please provide a valid video description',
    GENERATION_FAILED: 'Video generation failed. Please try again.',
    RATE_LIMIT: 'Rate limit exceeded. Please try again later.',
    QUOTA_EXCEEDED: 'Monthly quota exceeded. Please upgrade your plan.',
    NETWORK_ERROR: 'Network error occurred. Please check your connection.',
    INVALID_FORMAT: 'Invalid video format or specifications.',
  },

  // Success messages
  SUCCESS: {
    VIDEO_GENERATED: 'Video generated successfully',
    CONVERSATION_RETRIEVED: 'Conversation retrieved successfully',
    STATS_RETRIEVED: 'Video statistics retrieved successfully',
  },

  // Limits
  LIMITS: {
    MAX_CONVERSATION_LENGTH: 50,
    MAX_DAILY_GENERATIONS: 100,
    MAX_MONTHLY_GENERATIONS: 1000,
  },
};
