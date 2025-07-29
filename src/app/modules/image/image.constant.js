/**
 * Image Assistant Constants
 * 
 * This file contains all constants used throughout the image assistant module
 * to maintain consistency and make configuration changes easier.
 * 
 * @module ImageAssistantConstants
 */

export const IMAGE_ASSISTANT_CONSTANTS = {
  // Message constraints
  MESSAGE: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 2000,
    DEFAULT_ERROR: 'I apologize, but I encountered an error while processing your image request.',
  },

  // Image specifications
  IMAGE_SPECS: {
    SIZES: {
      SMALL: 'small',      // 512x512
      STANDARD: 'standard', // 1024x1024
      LARGE: 'large',      // 1792x1024 or larger
    },
    STYLES: {
      REALISTIC: 'realistic',
      CARTOON: 'cartoon',
      ABSTRACT: 'abstract',
      PHOTOREALISTIC: 'photorealistic',
    },
    ASPECT_RATIOS: {
      SQUARE: '1:1',
      PORTRAIT: '3:4',
      LANDSCAPE: '4:3',
      WIDESCREEN: '16:9',
    },
    QUALITY: {
      STANDARD: 'standard',
      HIGH: 'high',
    },
  },

  // File handling
  FILE: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_FORMATS: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
    MIME_TYPES: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/webp'
    ],
  },

  // Rate limiting
  RATE_LIMITS: {
    GUEST_REQUESTS_PER_HOUR: 10,
    AUTHENTICATED_REQUESTS_PER_HOUR: 50,
    PREMIUM_REQUESTS_PER_HOUR: 200,
  },

  // Conversation settings
  CONVERSATION: {
    MAX_HISTORY_LENGTH: 20,
    TITLE_MAX_LENGTH: 100,
    DEFAULT_CATEGORY: 'image',
    DEFAULT_MODEL: 'image-assistant',
  },

  // Response types
  RESPONSE_TYPES: {
    GENERATION: 'generation',
    ANALYSIS: 'analysis',
    CLARIFICATION: 'clarification',
    ERROR: 'error',
  },

  // Image analysis types
  ANALYSIS_TYPES: {
    DESCRIBE: 'describe',
    EXTRACT_TEXT: 'extract_text',
    DETECT_OBJECTS: 'detect_objects',
    IDENTIFY_STYLE: 'identify_style',
    COMPARE: 'compare',
  },

  // Error messages
  ERRORS: {
    INVALID_IMAGE_FORMAT: 'Invalid image format. Please provide a valid image URL or base64 encoded image.',
    IMAGE_TOO_LARGE: 'Image file is too large. Maximum size allowed is 10MB.',
    QUERY_TOO_SHORT: 'Image query is too short. Please provide more details.',
    QUERY_TOO_LONG: 'Image query is too long. Please keep it under 2000 characters.',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
    SUBSCRIPTION_LIMIT: 'You have reached your image generation limit. Please upgrade your plan.',
    NETWORK_ERROR: 'Network error occurred. Please check your connection and try again.',
    INVALID_PREFERENCES: 'Invalid image preferences provided.',
  },

  // Success messages
  SUCCESS: {
    IMAGE_GENERATED: 'Image generated successfully',
    IMAGE_ANALYZED: 'Image analysis completed successfully',
    CONVERSATION_CREATED: 'Image conversation created successfully',
    PREFERENCES_UPDATED: 'Image preferences updated successfully',
  },

  // Model configurations
  MODELS: {
    DEFAULT: {
      name: 'image-assistant',
      version: '1.0',
      maxTokens: 2000,
      temperature: 0.7,
    },
    GENERATION: {
      name: 'image-generator',
      version: '1.0',
      defaultSize: '1024x1024',
      defaultQuality: 'standard',
    },
    ANALYSIS: {
      name: 'image-analyzer',
      version: '1.0',
      maxImageSize: '20MB',
      supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
    },
  },

  // Workflow states
  WORKFLOW_STATES: {
    INITIAL: 'initial',
    ANALYZING_PROMPT: 'analyzing_prompt',
    ASKING_QUESTION: 'asking_question',
    PROCESSING_RESPONSE: 'processing_response',
    GENERATING_IMAGE: 'generating_image',
    ANALYZING_IMAGE: 'analyzing_image',
    COMPLETED: 'completed',
    ERROR: 'error',
  },

  // Cache settings
  CACHE: {
    CONVERSATION_TTL: 24 * 60 * 60, // 24 hours in seconds
    IMAGE_METADATA_TTL: 7 * 24 * 60 * 60, // 7 days
    STATS_TTL: 60 * 60, // 1 hour
  },

  // Logging levels
  LOGGING: {
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    DEBUG: 'debug',
  },
};
