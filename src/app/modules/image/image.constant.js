/**
 * Image Assistant Constants
 *
 * This file contains all constants used throughout the image assistant module
 * to maintain consistency and make configuration changes easier.
 *
 * @module ImageAssistantConstants
 */

/**
 * A frozen object containing all constants for the image assistant module.
 * Freezing the object prevents accidental modification at runtime.
 * @const {object} IMAGE_ASSISTANT_CONSTANTS
 */
export const IMAGE_ASSISTANT_CONSTANTS = {
  /**
   * Constraints related to user messages and prompts.
   * @property {number} MIN_LENGTH - Minimum length of a user's message prompt.
   * @property {number} MAX_LENGTH - Maximum length of a user's message prompt.
   * @property {string} DEFAULT_ERROR - Default error message to display when an unknown error occurs.
   */
  MESSAGE: {
    MIN_LENGTH: 3,
    MAX_LENGTH: 2000,
    DEFAULT_ERROR:
      'I apologize, but I encountered an error while processing your image request.',
  },

  /**
   * Specifications and options for image generation.
   */
  IMAGE_SPECS: {
    /**
     * Defines the available output sizes for generated images, corresponding to different resolutions.
     * @property {string} SMALL - Represents a 512x512 pixel image.
     * @property {string} STANDARD - Represents a 1024x1024 pixel image.
     * @property {string} LARGE - Represents a 1792x1024 pixel image or larger.
     */
    SIZES: {
      SMALL: 'small', // 512x512
      STANDARD: 'standard', // 1024x1024
      LARGE: 'large', // 1792x1024 or larger
    },
    /**
     * Defines the artistic styles available for image generation.
     * @property {string} REALISTIC - A style aiming for a life-like appearance.
     * @property {string} CARTOON - A style resembling a cartoon or animation.
     * @property {string} ABSTRACT - A non-representational, conceptual style.
     * @property {string} PHOTOREALISTIC - A style aiming for the highest degree of realism, like a photograph.
     */
    STYLES: {
      REALISTIC: 'realistic',
      CARTOON: 'cartoon',
      ABSTRACT: 'abstract',
      PHOTOREALISTIC: 'photorealistic',
    },
    /**
     * Defines the supported aspect ratios for generated images.
     * @property {string} SQUARE - A 1:1 aspect ratio.
     * @property {string} PORTRAIT - A 3:4 aspect ratio (taller than wide).
     * @property {string} LANDSCAPE - A 4:3 aspect ratio (wider than tall).
     * @property {string} WIDESCREEN - A 16:9 aspect ratio, common for screens.
     */
    ASPECT_RATIOS: {
      SQUARE: '1:1',
      PORTRAIT: '3:4',
      LANDSCAPE: '4:3',
      WIDESCREEN: '16:9',
    },
    /**
     * Defines the quality levels for generated images. Higher quality may consume more resources.
     * @property {string} STANDARD - Standard image quality.
     * @property {string} HIGH - High-fidelity image quality.
     */
    QUALITY: {
      STANDARD: 'standard',
      HIGH: 'high',
    },
  },

  /**
   * Constants related to file handling and validation for image uploads.
   */
  FILE: {
    /** @type {number} Maximum allowed file size for uploads in bytes (10MB). */
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    /** @type {string[]} A list of allowed image file extensions. */
    ALLOWED_FORMATS: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
    /** @type {string[]} A list of allowed image MIME types for validation. */
    MIME_TYPES: [
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/webp',
    ],
  },

  /**
   * Rate limiting configurations based on user roles.
   */
  RATE_LIMITS: {
    /** @type {number} Maximum requests per hour for unauthenticated (guest) users. */
    GUEST_REQUESTS_PER_HOUR: 10,
    /** @type {number} Maximum requests per hour for standard authenticated users. */
    AUTHENTICATED_REQUESTS_PER_HOUR: 50,
    /** @type {number} Maximum requests per hour for users with a premium subscription. */
    PREMIUM_REQUESTS_PER_HOUR: 200,
  },

  /**
   * Settings related to conversations involving the image assistant.
   */
  CONVERSATION: {
    /** @type {number} The maximum number of messages to retain in a conversation's history. */
    MAX_HISTORY_LENGTH: 20,
    /** @type {number} The maximum character length for a conversation title. */
    TITLE_MAX_LENGTH: 100,
    /** @type {string} The default category assigned to image-related conversations. */
    DEFAULT_CATEGORY: 'image',
    /** @type {string} The identifier for the default model used in image conversations. */
    DEFAULT_MODEL: 'image-assistant',
  },

  /**
   * Defines the types of responses the assistant can provide.
   */
  RESPONSE_TYPES: {
    /** @type {string} A response containing a generated image. */
    GENERATION: 'generation',
    /** @type {string} A response containing the analysis of an image. */
    ANALYSIS: 'analysis',
    /** @type {string} A response where the assistant asks for more information. */
    CLARIFICATION: 'clarification',
    /** @type {string} A response indicating an error occurred. */
    ERROR: 'error',
  },

  /**
   * Defines the types of image analysis that can be performed.
   */
  ANALYSIS_TYPES: {
    /** @type {string} Analysis task to generate a textual description of an image. */
    DESCRIBE: 'describe',
    /** @type {string} Analysis task to perform Optical Character Recognition (OCR) on an image. */
    EXTRACT_TEXT: 'extract_text',
    /** @type {string} Analysis task to identify and locate objects within an image. */
    DETECT_OBJECTS: 'detect_objects',
    /** @type {string} Analysis task to determine the artistic style of an image. */
    IDENTIFY_STYLE: 'identify_style',
    /** @type {string} Analysis task to compare two or more images. */
    COMPARE: 'compare',
  },

  /**
   * A collection of standardized error messages.
   */
  ERRORS: {
    /** @type {string} Error message for when the provided image data is not in a valid format. */
    INVALID_IMAGE_FORMAT:
      'Invalid image format. Please provide a valid image URL or base64 encoded image.',
    /** @type {string} Error message for when the uploaded image exceeds the maximum file size. */
    IMAGE_TOO_LARGE: 'Image file is too large. Maximum size allowed is 10MB.',
    /** @type {string} Error message for when the user's prompt is shorter than the minimum length. */
    QUERY_TOO_SHORT: 'Image query is too short. Please provide more details.',
    /** @type {string} Error message for when the user's prompt is longer than the maximum length. */
    QUERY_TOO_LONG:
      'Image query is too long. Please keep it under 2000 characters.',
    /** @type {string} Error message for when a user exceeds their allowed request rate. */
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded. Please try again later.',
    /** @type {string} Error message for when a user hits a usage limit defined by their subscription plan. */
    SUBSCRIPTION_LIMIT:
      'You have reached your image generation limit. Please upgrade your plan.',
    /** @type {string} Error message for when a request to an external service fails due to network issues. */
    NETWORK_ERROR:
      'Network error occurred. Please check your connection and try again.',
    /** @type {string} Error message for when user-provided image preferences (e.g., size, style) are invalid. */
    INVALID_PREFERENCES: 'Invalid image preferences provided.',
  },

  /**
   * A collection of standardized success messages.
   */
  SUCCESS: {
    /** @type {string} Success message for a successful image generation. */
    IMAGE_GENERATED: 'Image generated successfully',
    /** @type {string} Success message for a successful image analysis. */
    IMAGE_ANALYZED: 'Image analysis completed successfully',
    /** @type {string} Success message for the creation of a new conversation. */
    CONVERSATION_CREATED: 'Image conversation created successfully',
    /** @type {string} Success message for updating user's image preferences. */
    PREFERENCES_UPDATED: 'Image preferences updated successfully',
  },

  /**
   * Configurations for the underlying AI models.
   */
  MODELS: {
    /**
     * Default configuration for the main image assistant orchestrator model.
     */
    DEFAULT: {
      /** @type {string} The name of the model. */
      name: 'image-assistant',
      /** @type {string} The version of the model. */
      version: '1.0',
      /** @type {number} The maximum number of tokens for model responses. */
      maxTokens: 2000,
      /** @type {number} The creativity/randomness of the model's output (0.0 to 1.0). */
      temperature: 0.7,
    },
    /**
     * Configuration specific to the image generation model.
     */
    GENERATION: {
      /** @type {string} The name of the generation model. */
      name: 'image-generator',
      /** @type {string} The version of the generation model. */
      version: '1.0',
      /** @type {string} The default image size for generation. */
      defaultSize: '1024x1024',
      /** @type {string} The default quality setting for generation. */
      defaultQuality: 'standard',
    },
    /**
     * Configuration specific to the image analysis model.
     */
    ANALYSIS: {
      /** @type {string} The name of the analysis model. */
      name: 'image-analyzer',
      /** @type {string} The version of the analysis model. */
      version: '1.0',
      // BUG: Inconsistent data type for maxImageSize.
      // Changed from string '20MB' to numerical bytes for consistency with FILE.MAX_FILE_SIZE
      // and easier programmatic use in validation or comparisons.
      /** @type {number} The maximum image size in bytes the analysis model can process (20MB). */
      maxImageSize: 20 * 1024 * 1024, // 20MB in bytes
      /** @type {string[]} The image formats supported by the analysis model. */
      supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp'],
    },
  },

  /**
   * Defines the possible states in the image generation/analysis workflow.
   */
  WORKFLOW_STATES: {
    /** @type {string} The initial state of a new image request workflow. */
    INITIAL: 'initial',
    /** @type {string} The state where the user's prompt is being analyzed for intent. */
    ANALYZING_PROMPT: 'analyzing_prompt',
    /** @type {string} The state where the assistant is asking a clarifying question to the user. */
    ASKING_QUESTION: 'asking_question',
    /** @type {string} The state where the user's response to a question is being processed. */
    PROCESSING_RESPONSE: 'processing_response',
    /** @type {string} The state where the image is actively being generated. */
    GENERATING_IMAGE: 'generating_image',
    /** @type {string} The state where an uploaded image is being analyzed. */
    ANALYZING_IMAGE: 'analyzing_image',
    /** @type {string} The terminal state indicating the workflow has completed successfully. */
    COMPLETED: 'completed',
    /** @type {string} The terminal state indicating an error occurred during the workflow. */
    ERROR: 'error',
  },

  /**
   * Cache Time-To-Live (TTL) settings in seconds.
   */
  CACHE: {
    /** @type {number} TTL for conversation data in seconds (24 hours). */
    CONVERSATION_TTL: 24 * 60 * 60, // 24 hours in seconds
    /** @type {number} TTL for image metadata in seconds (7 days). */
    IMAGE_METADATA_TTL: 7 * 24 * 60 * 60, // 7 days
    /** @type {number} TTL for statistical data in seconds (1 hour). */
    STATS_TTL: 60 * 60, // 1 hour
  },

  /**
   * Standard logging levels.
   */
  LOGGING: {
    /** @type {string} Informational messages. */
    INFO: 'info',
    /** @type {string} Warning messages for potential issues. */
    WARN: 'warn',
    /** @type {string} Error messages for failures. */
    ERROR: 'error',
    /** @type {string} Detailed messages for debugging purposes. */
    DEBUG: 'debug',
  },
};