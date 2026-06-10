/**
 * @fileoverview This file contains various constants and configurations related to the rewrite module
 * in the Alti.Assistant backend. It defines settings for AI models, storage, Google Cloud Storage,
 * rewrite intents, styles, modes, output formats, conversation parameters, system prompts,
 * response messages, and keyword mappings for intent detection and file generation.
 */

/**
 * @typedef {object} RewriteConfig
 * @property {string} MODEL The AI model to be used for rewrite operations (e.g., 'gemini-2.5-flash').
 * @property {number} TEMPERATURE The creativity/randomness of the AI model's output (0.0 to 1.0).
 * @property {number} MAX_OUTPUT_TOKENS The maximum number of tokens the AI model should generate in its response.
 * @property {number} MAX_FILE_SIZE The maximum allowed size for input files in bytes (e.g., 10MB).
 * @property {string[]} SUPPORTED_MIME_TYPES An array of MIME types for files that can be processed for rewriting.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS An array of file extensions for files that can be processed for rewriting.
 */

/**
 * Rewrite Configuration settings for the AI model and file processing.
 * @type {RewriteConfig}
 */
export const REWRITE_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  TEMPERATURE: 0.7,
  MAX_OUTPUT_TOKENS: 8192,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  SUPPORTED_MIME_TYPES: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-powerpoint',
  ],
  SUPPORTED_FILE_EXTENSIONS: [
    '.pdf',
    '.docx',
    '.doc',
    '.txt',
    '.xlsx',
    '.xls',
    '.pptx',
    '.ppt',
  ],
};

/**
 * @typedef {object} StorageConfig
 * @property {string} TEMP_FOLDER The temporary folder path for storing uploaded files during processing.
 * @property {string} OUTPUT_FOLDER The folder path for storing generated output files.
 */

/**
 * Storage configuration for temporary and output files.
 * @type {StorageConfig}
 */
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/rewrites',
  OUTPUT_FOLDER: 'output/rewrites',
};

/**
 * @typedef {object} GCSConfig
 * @property {string} BUCKET_NAME The name of the Google Cloud Storage bucket.
 * @property {string} PROJECT_ID The Google Cloud Project ID.
 * @property {string} KEY_FILE The path to the Google Cloud service account key file.
 * @property {string} FOLDER_PREFIX The prefix for folders within the GCS bucket where rewrite-related files are stored.
 */

/**
 * Google Cloud Storage configuration settings.
 * @type {GCSConfig}
 */
export const GCS_CONFIG = {
  BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'alti_files',
  PROJECT_ID: process.env.GCP_PROJECT_ID,
  KEY_FILE: process.env.GCS_KEY_FILE,
  FOLDER_PREFIX: 'rewrites/',
};

/**
 * @typedef {object} RewriteIntents
 * @property {string} GENERAL_REWRITE General purpose rewrite.
 * @property {string} FORMAL Rewrite in a formal tone.
 * @property {string} CASUAL Rewrite in a casual tone.
 * @property {string} PROFESSIONAL Rewrite in a professional tone.
 * @property {string} ACADEMIC Rewrite in an academic style.
 * @property {string} CREATIVE Rewrite with a creative flair.
 * @property {string} SIMPLIFY Simplify the text.
 * @property {string} EXPAND Expand the text with more details.
 * @property {string} SHORTEN Shorten the text.
 * @property {string} IMPROVE_CLARITY Improve the clarity of the text.
 * @property {string} CHANGE_TONE Change the tone of the text.
 * @property {string} FIX_GRAMMAR Fix grammar, spelling, and punctuation.
 * @property {string} PARAPHRASE Paraphrase the text completely.
 * @property {string} CLARIFICATION Request for clarification.
 * @property {string} UNKNOWN Unknown intent.
 */

/**
 * Defines the various intents or purposes for a rewrite operation.
 * These are used to guide the AI's rewriting process.
 * @type {RewriteIntents}
 */
export const REWRITE_INTENTS = {
  GENERAL_REWRITE: 'general_rewrite',
  FORMAL: 'formal',
  CASUAL: 'casual',
  PROFESSIONAL: 'professional',
  ACADEMIC: 'academic',
  CREATIVE: 'creative',
  SIMPLIFY: 'simplify',
  EXPAND: 'expand',
  SHORTEN: 'shorten',
  IMPROVE_CLARITY: 'improve_clarity',
  CHANGE_TONE: 'change_tone',
  FIX_GRAMMAR: 'fix_grammar',
  PARAPHRASE: 'paraphrase',
  CLARIFICATION: 'clarification',
  UNKNOWN: 'unknown',
};

/**
 * @typedef {object} RewriteStyles
 * @property {string} FORMAL Formal writing style.
 * @property {string} CASUAL Casual writing style.
 * @property {string} PROFESSIONAL Professional writing style.
 * @property {string} ACADEMIC Academic writing style.
 * @property {string} CREATIVE Creative writing style.
 * @property {string} TECHNICAL Technical writing style.
 * @property {string} CONVERSATIONAL Conversational writing style.
 * @property {string} PERSUASIVE Persuasive writing style.
 */

/**
 * Defines the various stylistic approaches for a rewrite operation.
 * @type {RewriteStyles}
 */
export const REWRITE_STYLES = {
  FORMAL: 'formal',
  CASUAL: 'casual',
  PROFESSIONAL: 'professional',
  ACADEMIC: 'academic',
  CREATIVE: 'creative',
  TECHNICAL: 'technical',
  CONVERSATIONAL: 'conversational',
  PERSUASIVE: 'persuasive',
};

/**
 * @typedef {object} RewriteModes
 * @property {string} PRESERVE_MEANING Focus on keeping the original meaning intact.
 * @property {string} IMPROVE_CLARITY Focus on enhancing clarity.
 * @property {string} SIMPLIFY Focus on making the text simpler.
 * @property {string} EXPAND Focus on adding more details.
 * @property {string} SHORTEN Focus on making the text shorter.
 * @property {string} PARAPHRASE Focus on a complete rephrasing.
 */

/**
 * Defines the different modes or primary objectives for a rewrite operation.
 * @type {RewriteModes}
 */
export const REWRITE_MODES = {
  PRESERVE_MEANING: 'preserve_meaning', // Keep original meaning
  IMPROVE_CLARITY: 'improve_clarity', // Focus on clarity
  SIMPLIFY: 'simplify', // Make it simpler
  EXPAND: 'expand', // Add more details
  SHORTEN: 'shorten', // Make it shorter
  PARAPHRASE: 'paraphrase', // Complete rewrite
};

/**
 * @typedef {object} OutputFormats
 * @property {string} TEXT Plain text response.
 * @property {string} FILE Generate a downloadable file.
 * @property {string} BOTH Both text response and a downloadable file.
 */

/**
 * Defines the possible output formats for the rewritten content.
 * @type {OutputFormats}
 */
export const OUTPUT_FORMATS = {
  TEXT: 'text', // Plain text response
  FILE: 'file', // Generate downloadable file
  BOTH: 'both', // Both text and file
};

/**
 * The category for conversation context related to rewrite operations.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'rewrite';

/**
 * The AI model to be used for general conversation related to rewrite operations.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

/**
 * @typedef {object} DefaultParams
 * @property {string} mode The default rewrite mode, e.g., 'preserve_meaning'.
 * @property {string} style The default rewrite style, e.g., 'professional'.
 * @property {string} outputFormat The default output format, e.g., 'text'.
 */

/**
 * Default parameters to be used when specific rewrite options are not provided.
 * @type {DefaultParams}
 */
export const DEFAULT_PARAMS = {
  mode: REWRITE_MODES.PRESERVE_MEANING,
  style: REWRITE_STYLES.PROFESSIONAL,
  outputFormat: OUTPUT_FORMATS.TEXT,
};

/**
 * @typedef {object.<string, string>} SystemPrompts
 * A dictionary where keys are {@link REWRITE_INTENTS} and values are the corresponding system prompts
 * to guide the AI model for that specific rewrite intent.
 */

/**
 * System prompts tailored for different rewrite intents.
 * These prompts instruct the AI on how to perform the rewrite based on the detected intent.
 * @type {SystemPrompts}
 */
export const SYSTEM_PROMPTS = {
  [REWRITE_INTENTS.GENERAL_REWRITE]: `You are an expert content rewriter. Rewrite the provided text while maintaining its core meaning and improving its overall quality. Focus on clarity, flow, and engagement.`,

  [REWRITE_INTENTS.FORMAL]: `You are an expert in formal writing. Rewrite the text in a formal, professional tone suitable for official documents, business communications, or academic purposes. Use appropriate vocabulary and structure.`,

  [REWRITE_INTENTS.CASUAL]: `You are an expert in casual, conversational writing. Rewrite the text in a friendly, approachable tone that feels natural and easy to read. Make it sound like a conversation.`,

  [REWRITE_INTENTS.PROFESSIONAL]: `You are an expert in professional communication. Rewrite the text with a professional tone that is clear, confident, and appropriate for business settings.`,

  [REWRITE_INTENTS.ACADEMIC]: `You are an expert academic writer. Rewrite the text in an academic style with proper terminology, formal language, and structured argumentation suitable for scholarly work.`,

  [REWRITE_INTENTS.CREATIVE]: `You are a creative writer. Rewrite the text with vivid language, engaging descriptions, and creative expression while maintaining the core message.`,

  [REWRITE_INTENTS.SIMPLIFY]: `You are an expert in clear communication. Rewrite the text to make it simpler and easier to understand. Use plain language, shorter sentences, and avoid jargon.`,

  [REWRITE_INTENTS.EXPAND]: `You are an expert content developer. Expand the text by adding relevant details, examples, explanations, and context while maintaining coherence and focus.`,

  [REWRITE_INTENTS.SHORTEN]: `You are an expert editor. Condense the text to its essential points while preserving the key message. Remove redundancy and unnecessary details.`,

  [REWRITE_INTENTS.IMPROVE_CLARITY]: `You are a clarity expert. Rewrite the text to make it clearer and more understandable. Improve sentence structure, word choice, and logical flow.`,

  [REWRITE_INTENTS.CHANGE_TONE]: `You are an expert in adjusting tone. Rewrite the text to match the requested tone while keeping the core message intact.`,

  [REWRITE_INTENTS.FIX_GRAMMAR]: `You are a grammar expert. Rewrite the text fixing all grammatical errors, spelling mistakes, and punctuation issues while improving overall readability.`,

  [REWRITE_INTENTS.PARAPHRASE]: `You are an expert paraphraser. Completely rewrite the text using different words and sentence structures while preserving the original meaning.`,
};

/**
 * @typedef {object} ResponseMessages
 * @property {string} SUCCESS Message for successful rewrite.
 * @property {string} PROCESSING Message indicating processing is underway.
 * @property {string} NEED_FILE Message when a file or text is required.
 * @property {string} NEED_MORE_INFO Message when more information is needed.
 * @property {string} FILE_GENERATED Message when a file has been generated.
 * @property {string} ERROR_PROCESSING Generic error message for processing.
 * @property {string} ERROR_FILE_EXTRACTION Error message for file text extraction failure.
 * @property {string} ERROR_NO_CONTENT Error message when no content is found to rewrite.
 */

/**
 * Standardized response messages for various rewrite operation outcomes.
 * @type {ResponseMessages}
 */
export const RESPONSE_MESSAGES = {
  SUCCESS: 'Content rewritten successfully',
  PROCESSING: 'Processing your rewrite request...',
  NEED_FILE: 'Please upload a file or provide text to rewrite',
  NEED_MORE_INFO: 'I need more information to proceed with the rewrite',
  FILE_GENERATED: 'Rewritten content file has been generated',
  ERROR_PROCESSING: 'Error processing rewrite request',
  ERROR_FILE_EXTRACTION: 'Unable to extract text from the file',
  ERROR_NO_CONTENT: 'No content found to rewrite',
};

/**
 * @typedef {object.<string, string[]>} IntentKeywords
 * A dictionary where keys are {@link REWRITE_INTENTS} and values are arrays of keywords
 * associated with that intent, used for natural language intent detection.
 */

/**
 * Keywords used to detect specific rewrite intents from user input.
 * @type {IntentKeywords}
 */
export const INTENT_KEYWORDS = {
  [REWRITE_INTENTS.FORMAL]: [
    'formal',
    'official',
    'professional tone',
    'business',
  ],
  [REWRITE_INTENTS.CASUAL]: [
    'casual',
    'informal',
    'friendly',
    'conversational',
  ],
  [REWRITE_INTENTS.PROFESSIONAL]: ['professional', 'business', 'corporate'],
  [REWRITE_INTENTS.ACADEMIC]: ['academic', 'scholarly', 'research', 'thesis'],
  [REWRITE_INTENTS.CREATIVE]: ['creative', 'artistic', 'engaging', 'vivid'],
  [REWRITE_INTENTS.SIMPLIFY]: [
    'simplify',
    'simple',
    'easier',
    'plain language',
  ],
  [REWRITE_INTENTS.EXPAND]: ['expand', 'elaborate', 'more detail', 'longer'],
  [REWRITE_INTENTS.SHORTEN]: [
    'shorten',
    'condense',
    'shorter',
    'summarize',
    'brief',
  ],
  [REWRITE_INTENTS.IMPROVE_CLARITY]: [
    'clarity',
    'clear',
    'clearer',
    'understandable',
  ],
  [REWRITE_INTENTS.FIX_GRAMMAR]: [
    'grammar',
    'fix errors',
    'correct',
    'spelling',
  ],
  [REWRITE_INTENTS.PARAPHRASE]: [
    'paraphrase',
    'rephrase',
    'reword',
    'say differently',
  ],
};

/**
 * Keywords used to detect if the user intends to generate a file as output.
 * @type {string[]}
 */
export const FILE_KEYWORDS = [
  'create file',
  'generate file',
  'save as file',
  'download',
  'export',
  'make a file',
  'file format',
  'document',
];