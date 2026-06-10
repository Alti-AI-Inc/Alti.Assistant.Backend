/**
 * Configuration object for the Presenton API.
 * Contains the base URL and API key required for making requests.
 * These values are typically sourced from environment variables.
 * @type {{BASE_URL: string, API_KEY: string}}
 */
export const PRESENTON_CONFIG = {
  BASE_URL: process.env.PRESENTON_API_URL || 'http://localhost:5000',
  API_KEY: process.env.PRESENTON_API_KEY || '',
};

/**
 * A collection of API endpoint paths for the Presenton service.
 * These are appended to the `BASE_URL` to form the full request URL.
 * @type {{
 *   GENERATE: string,
 *   GENERATE_ASYNC: string,
 *   CHECK_STATUS: string,
 *   GET_PRESENTATION: string,
 *   EDIT: string,
 *   DERIVE: string
 * }}
 */
export const PRESENTON_ENDPOINTS = {
  GENERATE: '/api/v1/ppt/presentation/generate',
  GENERATE_ASYNC: '/api/v1/ppt/presentation/generate/async',
  CHECK_STATUS: '/api/v1/ppt/presentation/status',
  GET_PRESENTATION: '/api/v1/ppt/presentation',
  EDIT: '/api/v1/ppt/presentation/edit',
  DERIVE: '/api/v1/ppt/presentation/derive',
};

/**
 * An array of available template names for presentation generation.
 * @type {string[]}
 */
export const TEMPLATES = ['general', 'modern', 'standard', 'swift'];

/**
 * An array of available theme names for presentation styling.
 * @type {string[]}
 */
export const THEMES = [
  'edge-yellow',
  'mint-blue',
  'light-rose',
  'professional-blue',
  'professional-dark',
];

/**
 * An array of available tones for the generated presentation content.
 * This influences the writing style of the text.
 * @type {string[]}
 */
export const TONES = [
  'default',
  'casual',
  'professional',
  'funny',
  'educational',
  'sales_pitch',
];

/**
 * An array of verbosity levels for the generated presentation content.
 * This controls the amount of text on each slide.
 * @type {string[]}
 */
export const VERBOSITY_OPTIONS = ['concise', 'standard', 'text-heavy'];

/**
 * An array of available image source types for the presentation.
 * 'stock' uses pre-existing stock photos, while 'ai-generated' creates new images.
 * @type {string[]}
 */
export const IMAGE_TYPES = ['stock', 'ai-generated'];

/**
 * An array of available file formats for exporting the final presentation.
 * @type {string[]}
 */
export const EXPORT_FORMATS = ['pptx', 'pdf'];

/**
 * An object representing the possible statuses of an asynchronous presentation generation task.
 * @type {{PENDING: string, PROCESSING: string, COMPLETED: string, FAILED: string}}
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * An object defining the various user intents related to presentation management
 * within a conversational AI context. These intents help the system understand
 * the user's goal.
 * @type {{
 *   GENERATE: string,
 *   GENERATE_ASYNC: string,
 *   CHECK_STATUS: string,
 *   EDIT: string,
 *   DERIVE: string,
 *   GET_INFO: string,
 *   GENERAL_QUESTION: string
 * }}
 */
export const PRESENTATION_INTENTS = {
  GENERATE: 'generate',
  GENERATE_ASYNC: 'generate_async',
  CHECK_STATUS: 'check_status',
  EDIT: 'edit',
  DERIVE: 'derive',
  GET_INFO: 'get_info',
  GENERAL_QUESTION: 'general_question',
};

/**
 * A mapping of presentation intents to the parameters that are required
 * to fulfill the request for that intent.
 * @type {Object<string, string[]>}
 */
export const REQUIRED_PARAMS = {
  [PRESENTATION_INTENTS.GENERATE]: ['content', 'title'],
  [PRESENTATION_INTENTS.GENERATE_ASYNC]: ['content', 'title'],
  [PRESENTATION_INTENTS.CHECK_STATUS]: ['taskId'],
  [PRESENTATION_INTENTS.EDIT]: ['presentationId', 'slides'],
  [PRESENTATION_INTENTS.DERIVE]: ['presentationId', 'slides'],
  [PRESENTATION_INTENTS.GET_INFO]: ['presentationId'],
};

/**
 * An object containing default values for optional parameters used in
 * presentation generation requests. These values are used if not explicitly
 * provided by the user.
 * @type {{
 *   n_slides: number,
 *   language: string,
 *   template: string,
 *   export_as: string,
 *   tone: string,
 *   verbosity: string,
 *   image_type: string,
 *   web_search: boolean,
 *   include_table_of_contents: boolean,
 *   include_title_slide: boolean
 * }}
 */
export const DEFAULT_PARAMS = {
  n_slides: 8,
  language: 'English',
  template: 'general',
  export_as: 'pptx',
  tone: 'default',
  verbosity: 'standard',
  image_type: 'stock',
  web_search: false,
  include_table_of_contents: false,
  include_title_slide: true,
};

/**
 * A constant defining the category for conversations related to presentations.
 * Used for logging, analytics, and context management.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'presentation';

/**
 * A constant defining the model identifier for the presentation assistant.
 * Used for logging, analytics, and routing requests to the correct AI model.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'presentation-assistant';