// Presenton API configuration
export const PRESENTON_CONFIG = {
  BASE_URL: process.env.PRESENTON_API_URL || 'http://localhost:5000',
  API_KEY: process.env.PRESENTON_API_KEY || '',
};

// API endpoints
export const PRESENTON_ENDPOINTS = {
  GENERATE: '/api/v1/ppt/presentation/generate',
  GENERATE_ASYNC: '/api/v1/ppt/presentation/generate/async',
  CHECK_STATUS: '/api/v1/ppt/presentation/status',
  GET_PRESENTATION: '/api/v1/ppt/presentation',
  EDIT: '/api/v1/ppt/presentation/edit',
  DERIVE: '/api/v1/ppt/presentation/derive',
};

// Available templates
export const TEMPLATES = ['general', 'modern', 'standard', 'swift'];

// Available themes
export const THEMES = [
  'edge-yellow',
  'mint-blue',
  'light-rose',
  'professional-blue',
  'professional-dark',
];

// Tone options
export const TONES = [
  'default',
  'casual',
  'professional',
  'funny',
  'educational',
  'sales_pitch',
];

// Verbosity options
export const VERBOSITY_OPTIONS = ['concise', 'standard', 'text-heavy'];

// Image type options
export const IMAGE_TYPES = ['stock', 'ai-generated'];

// Export format options
export const EXPORT_FORMATS = ['pptx', 'pdf'];

// Task status
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Intent types for conversation handling
export const PRESENTATION_INTENTS = {
  GENERATE: 'generate',
  GENERATE_ASYNC: 'generate_async',
  CHECK_STATUS: 'check_status',
  EDIT: 'edit',
  DERIVE: 'derive',
  GET_INFO: 'get_info',
  GENERAL_QUESTION: 'general_question',
};

// Required parameters for each intent
export const REQUIRED_PARAMS = {
  [PRESENTATION_INTENTS.GENERATE]: ['content'],
  [PRESENTATION_INTENTS.GENERATE_ASYNC]: ['content'],
  [PRESENTATION_INTENTS.CHECK_STATUS]: ['taskId'],
  [PRESENTATION_INTENTS.EDIT]: ['presentationId', 'slides'],
  [PRESENTATION_INTENTS.DERIVE]: ['presentationId', 'slides'],
  [PRESENTATION_INTENTS.GET_INFO]: ['presentationId'],
};

// Optional parameters with defaults
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

// Conversation context metadata
export const CONVERSATION_CATEGORY = 'presentation';
export const CONVERSATION_MODEL = 'presentation-assistant';
