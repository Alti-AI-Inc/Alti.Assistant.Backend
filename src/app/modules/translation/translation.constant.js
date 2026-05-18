// Translation API configuration
export const TRANSLATION_CONFIG = {
  // Using Google Cloud Translation API
  PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  USE_GOOGLE_TRANSLATE: true,
};

// Supported languages (ISO 639-1 codes)
export const SUPPORTED_LANGUAGES = {
  ENGLISH: 'en',
  SPANISH: 'es',
  FRENCH: 'fr',
  GERMAN: 'de',
  ITALIAN: 'it',
  PORTUGUESE: 'pt',
  RUSSIAN: 'ru',
  JAPANESE: 'ja',
  KOREAN: 'ko',
  CHINESE_SIMPLIFIED: 'zh-CN',
  CHINESE_TRADITIONAL: 'zh-TW',
  ARABIC: 'ar',
  HINDI: 'hi',
  BENGALI: 'bn',
  TURKISH: 'tr',
  VIETNAMESE: 'vi',
  THAI: 'th',
  DUTCH: 'nl',
  POLISH: 'pl',
  SWEDISH: 'sv',
  NORWEGIAN: 'no',
  DANISH: 'da',
  FINNISH: 'fi',
  GREEK: 'el',
  CZECH: 'cs',
  HUNGARIAN: 'hu',
  ROMANIAN: 'ro',
  UKRAINIAN: 'uk',
  INDONESIAN: 'id',
  MALAY: 'ms',
  FILIPINO: 'fil',
  HEBREW: 'he',
  PERSIAN: 'fa',
  URDU: 'ur',
  SWAHILI: 'sw',
};

// Language names for display
export const LANGUAGE_NAMES = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  'zh-CN': 'Chinese (Simplified)',
  'zh-TW': 'Chinese (Traditional)',
  ar: 'Arabic',
  hi: 'Hindi',
  bn: 'Bengali',
  tr: 'Turkish',
  vi: 'Vietnamese',
  th: 'Thai',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  no: 'Norwegian',
  da: 'Danish',
  fi: 'Finnish',
  el: 'Greek',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  uk: 'Ukrainian',
  id: 'Indonesian',
  ms: 'Malay',
  fil: 'Filipino',
  he: 'Hebrew',
  fa: 'Persian',
  ur: 'Urdu',
  sw: 'Swahili',
};

// Supported document formats
export const SUPPORTED_DOCUMENT_FORMATS = [
  '.txt',
  '.docx',
  '.pdf',
  '.html',
  '.md',
  '.json',
  '.csv',
  '.xlsx',
];

// MIME types for document validation
export const ALLOWED_MIME_TYPES = [
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/pdf',
  'text/html',
  'text/markdown',
  'application/json',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// File size limits
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TEXT_LENGTH: 100000, // 100K characters for direct text input
};

// Intent types for conversation handling
export const TRANSLATION_INTENTS = {
  TRANSLATE_TEXT: 'translate_text',
  TRANSLATE_FILE: 'translate_file',
  DETECT_LANGUAGE: 'detect_language',
  GET_SUPPORTED_LANGUAGES: 'get_supported_languages',
  GENERAL_QUESTION: 'general_question',
};

// Required parameters for each intent
export const REQUIRED_PARAMS = {
  [TRANSLATION_INTENTS.TRANSLATE_TEXT]: ['text', 'targetLanguage'],
  [TRANSLATION_INTENTS.TRANSLATE_FILE]: ['targetLanguage'],
  [TRANSLATION_INTENTS.DETECT_LANGUAGE]: ['text'],
  [TRANSLATION_INTENTS.GET_SUPPORTED_LANGUAGES]: [],
};

// Optional parameters with defaults
export const DEFAULT_PARAMS = {
  sourceLanguage: 'auto', // Auto-detect
  preserveFormatting: true,
  glossary: null,
};

// Conversation context metadata
export const CONVERSATION_CATEGORY = 'translation';
export const CONVERSATION_MODEL = 'translation-assistant';

// Task status
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Error messages
export const ERROR_MESSAGES = {
  NO_TEXT_OR_FILE: 'Please provide text to translate or upload a document',
  INVALID_LANGUAGE:
    'Invalid language code. Use ISO 639-1 format (e.g., en, es, fr)',
  UNSUPPORTED_FORMAT:
    'Unsupported file format. Please upload txt, docx, pdf, html, md, json, csv, or xlsx files',
  FILE_TOO_LARGE: 'File size exceeds 10MB limit',
  TEXT_TOO_LONG: 'Text exceeds 100,000 character limit',
  TRANSLATION_FAILED: 'Translation service failed. Please try again',
  LANGUAGE_DETECTION_FAILED: 'Could not detect source language',
  MISSING_TARGET_LANGUAGE: 'Please specify the target language for translation',
};

// Success messages
export const SUCCESS_MESSAGES = {
  TRANSLATION_COMPLETED: 'Translation completed successfully',
  LANGUAGE_DETECTED: 'Language detected successfully',
};

// File storage configuration
export const STORAGE_CONFIG = {
  UPLOAD_FOLDER: 'translations',
  TEMP_FOLDER: 'uploads/translations',
  GCS_BUCKET: process.env.GCS_BUCKET_NAME || '',
  MAX_CACHED_TEXT_SIZE: 1 * 1024 * 1024, // 1MB text cache limit in documents_metadata
};
