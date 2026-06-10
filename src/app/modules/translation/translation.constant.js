/**
 * @fileoverview Configuration constants for the translation module.
 * This file defines various settings, supported languages, file formats,
 * and messages used throughout the translation service.
 */

/**
 * @typedef {object} TranslationConfig
 * @property {string} PROJECT_ID - The Google Cloud Project ID used for translation services.
 *                                 Defaults to an empty string if not set in environment variables.
 * @property {boolean} USE_GOOGLE_TRANSLATE - Flag indicating whether to use Google Cloud Translation API.
 */

/**
 * Translation API configuration settings.
 * @type {TranslationConfig}
 */
export const TRANSLATION_CONFIG = {
  // Using Google Cloud Translation API
  PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID || '',
  USE_GOOGLE_TRANSLATE: true,
};

/**
 * Supported languages for translation, represented by ISO 639-1 codes.
 * @type {object.<string, string>}
 */
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

/**
 * Human-readable names for supported languages, mapped by their ISO 639-1 codes.
 * @type {object.<string, string>}
 */
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

/**
 * List of supported document file extensions for translation.
 * @type {string[]}
 */
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

/**
 * List of allowed MIME types for document uploads, corresponding to supported formats.
 * @type {string[]}
 */
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

/**
 * @typedef {object} FileSizeLimits
 * @property {number} MAX_FILE_SIZE - Maximum allowed file size for document uploads in bytes (10MB).
 * @property {number} MAX_TEXT_LENGTH - Maximum allowed character length for direct text input (100,000 characters).
 */

/**
 * Defines file and text size limits for translation requests.
 * @type {FileSizeLimits}
 */
export const FILE_SIZE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TEXT_LENGTH: 100000, // 100K characters for direct text input
};

/**
 * Defines different intent types for translation-related conversation handling.
 * These intents categorize user requests.
 * @type {object.<string, string>}
 */
export const TRANSLATION_INTENTS = {
  TRANSLATE_TEXT: 'translate_text',
  TRANSLATE_FILE: 'translate_file',
  DETECT_LANGUAGE: 'detect_language',
  GET_SUPPORTED_LANGUAGES: 'get_supported_languages',
  GENERAL_QUESTION: 'general_question',
};

/**
 * Maps each translation intent to an array of parameters required for that intent.
 * @type {object.<string, string[]>}
 */
export const REQUIRED_PARAMS = {
  [TRANSLATION_INTENTS.TRANSLATE_TEXT]: ['text', 'targetLanguage'],
  [TRANSLATION_INTENTS.TRANSLATE_FILE]: ['targetLanguage'],
  [TRANSLATION_INTENTS.DETECT_LANGUAGE]: ['text'],
  [TRANSLATION_INTENTS.GET_SUPPORTED_LANGUAGES]: [],
};

/**
 * Defines default values for optional translation parameters.
 * @type {object}
 * @property {string} sourceLanguage - Default source language ('auto' for auto-detection).
 * @property {boolean} preserveFormatting - Whether to preserve formatting in translated text.
 * @property {?string} glossary - Optional glossary ID to use for translation.
 */
export const DEFAULT_PARAMS = {
  sourceLanguage: 'auto', // Auto-detect
  preserveFormatting: true,
  glossary: null,
};

/**
 * Category identifier for translation-related conversations.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'translation';

/**
 * Model identifier for the translation assistant.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'translation-assistant';

/**
 * Defines possible statuses for a translation task.
 * @type {object.<string, string>}
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * Collection of user-facing error messages for various translation scenarios.
 * @type {object.<string, string>}
 */
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

/**
 * Collection of user-facing success messages for translation operations.
 * @type {object.<string, string>}
 */
export const SUCCESS_MESSAGES = {
  TRANSLATION_COMPLETED: 'Translation completed successfully',
  LANGUAGE_DETECTED: 'Language detected successfully',
};

/**
 * @typedef {object} StorageConfig
 * @property {string} UPLOADS_GCS_FOLDER - The GCS folder for storing original uploaded files for translation.
 * @property {string} OUTPUTS_GCS_FOLDER - The GCS folder for storing translated output files.
 * @property {string} GCS_BUCKET - The Google Cloud Storage bucket name for persistent storage.
 *                                 Defaults to an empty string if not set in environment variables.
 * @property {number} MAX_CACHED_TEXT_SIZE - Maximum size of text content (in bytes) to cache directly in metadata.
 * @property {number} SIGNED_URL_EXPIRATION_SECONDS - The duration in seconds for which a generated signed URL is valid.
 */

/**
 * Configuration settings for Google Cloud Storage related to translation documents.
 * All paths are relative to the GCS bucket root. This configuration ensures
 * that no files are written to the local ephemeral filesystem.
 * @type {StorageConfig}
 */
export const STORAGE_CONFIG = {
  UPLOADS_GCS_FOLDER: 'translations/uploads',
  OUTPUTS_GCS_FOLDER: 'translations/outputs',
  GCS_BUCKET: process.env.GCS_BUCKET_NAME || '',
  MAX_CACHED_TEXT_SIZE: 1 * 1024 * 1024, // 1MB text cache limit in documents_metadata
  SIGNED_URL_EXPIRATION_SECONDS: 15 * 60, // 15 minutes for upload/download URLs
};