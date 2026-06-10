/**
 * @fileoverview This file contains constants used throughout the document drafting module.
 * These constants define configuration settings, enumerations for various options,
 * and default values to ensure consistency and ease of maintenance.
 * @module app/modules/document_drafting/document.constant
 */

/**
 * Configuration settings for the AI model used in document drafting.
 * @type {{
 *   MODEL: string,
 *   MAX_CONTEXT_TOKENS: number,
 *   MAX_OUTPUT_TOKENS: number,
 *   TEMPERATURE: number
 * }}
 */
export const DOCUMENT_CONFIG = {
  /** The specific AI model to use for generation (e.g., 'gemini-2.5-flash'). */
  MODEL: 'gemini-2.5-flash',
  /** The maximum number of tokens to be included in the model's context window. */
  MAX_CONTEXT_TOKENS: 50000,
  /** The maximum number of tokens the model can generate in a single response. */
  MAX_OUTPUT_TOKENS: 8192,
  /** The creativity/randomness of the model's output. Higher values (e.g., 0.9) are more creative, lower values (e.g., 0.2) are more deterministic. */
  TEMPERATURE: 0.7,
};

/**
 * An enumeration of supported document types.
 * @enum {string}
 */
export const DOCUMENT_TYPES = {
  LETTER: 'letter',
  ESSAY: 'essay',
  ARTICLE: 'article',
  BLOG_POST: 'blog_post',
  REPORT: 'report',
  PROPOSAL: 'proposal',
  MEMO: 'memo',
  EMAIL: 'email',
  CONTRACT: 'contract',
  RESUME: 'resume',
  COVER_LETTER: 'cover_letter',
  RESEARCH_PAPER: 'research_paper',
  WHITE_PAPER: 'white_paper',
  BUSINESS_PLAN: 'business_plan',
  TECHNICAL_DOC: 'technical_doc',
  GENERAL: 'general',
};

/**
 * An enumeration of supported output file formats for generated documents.
 * @enum {string}
 */
export const OUTPUT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx',
  DOC: 'doc',
  TXT: 'txt',
  HTML: 'html',
  MD: 'md',
};

/**
 * An enumeration of user intents or actions related to document drafting.
 * This helps the system understand the user's goal.
 * @enum {string}
 */
export const DOCUMENT_INTENTS = {
  DRAFT: 'draft',
  EDIT: 'edit',
  REFINE: 'refine',
  EXPAND: 'expand',
  SUMMARIZE: 'summarize',
  REWRITE: 'rewrite',
  FORMAT: 'format',
  EXPORT: 'export',
  INFO: 'info',
  CLARIFY: 'clarify',
};

/**
 * Defines which parameters are mandatory for a document generation request.
 * `true` indicates a required parameter.
 * @type {{content: boolean, documentType: boolean, outputFormat: boolean}}
 */
export const REQUIRED_PARAMS = {
  /** The main content, topic, or prompt for the document. */
  content: true,
  /** The type of document to be generated (e.g., 'letter', 'essay'). */
  documentType: false,
  /** The desired file format for the final document. */
  outputFormat: false,
};

/**
 * Default parameters for document generation if not specified by the user.
 * @type {{
 *   documentType: string,
 *   outputFormat: string,
 *   tone: string,
 *   length: string,
 *   includeTitle: boolean,
 *   includeDate: boolean,
 *   language: string
 * }}
 */
export const DEFAULT_PARAMS = {
  documentType: DOCUMENT_TYPES.GENERAL,
  outputFormat: OUTPUT_FORMATS.PDF,
  tone: 'professional',
  length: 'medium', // short, medium, long
  includeTitle: true,
  includeDate: true,
  language: 'en',
};

/**
 * An enumeration of possible writing tones for the generated document.
 * @enum {string}
 */
export const TONES = {
  PROFESSIONAL: 'professional',
  CASUAL: 'casual',
  FORMAL: 'formal',
  FRIENDLY: 'friendly',
  ACADEMIC: 'academic',
  CREATIVE: 'creative',
  PERSUASIVE: 'persuasive',
  TECHNICAL: 'technical',
};

/**
 * An enumeration of predefined length options for the generated document.
 * @enum {string}
 */
export const LENGTH_OPTIONS = {
  /** Approximately 250-500 words. */
  SHORT: 'short',
  /** Approximately 500-1500 words. */
  MEDIUM: 'medium',
  /** Approximately 1500-3000 words. */
  LONG: 'long',
  /** A user-specified word count. */
  CUSTOM: 'custom',
};

/**
 * An enumeration of possible statuses for a document generation task.
 * @enum {string}
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * The category identifier for conversations related to document drafting.
 * Used for context management and routing.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'document_drafting';

/**
 * The AI model used specifically for conversational aspects of document drafting.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

/**
 * An enumeration of predefined document templates that provide a starting structure.
 * @enum {string}
 */
export const DOCUMENT_TEMPLATES = {
  BUSINESS_LETTER: 'business_letter',
  FORMAL_REPORT: 'formal_report',
  ACADEMIC_PAPER: 'academic_paper',
  CREATIVE_WRITING: 'creative_writing',
  TECHNICAL_DOC: 'technical_documentation',
  STANDARD: 'standard',
};

/**
 * Configuration for Google Cloud Storage (GCS) used for storing generated documents.
 * Values are sourced from environment variables.
 * @type {{
 *   BUCKET_NAME: string,
 *   PROJECT_ID: string | undefined,
 *   KEY_FILE: string | undefined,
 *   FOLDER_PREFIX: string
 * }}
 */
export const GCS_CONFIG = {
  /** The name of the GCS bucket where documents will be stored. */
  BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'alti_assistant_documents',
  /** The Google Cloud Platform project ID. */
  PROJECT_ID: process.env.GCP_PROJECT_ID,
  /** The path to the GCS key file for authentication. */
  KEY_FILE: process.env.GCS_KEY_FILE,
  /** The prefix (folder path) within the bucket to store documents. */
  FOLDER_PREFIX: 'documents/',
};

/**
 * Defines file size and content length limits for document generation.
 * @type {{MAX_FILE_SIZE: number, MAX_CONTENT_LENGTH: number}}
 */
export const FILE_LIMITS = {
  /** Maximum allowed file size for uploads or generated documents, in bytes (10MB). */
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  /** Maximum allowed length of the input content/prompt, in characters. */
  MAX_CONTENT_LENGTH: 100000,
};

/**
 * A collection of standardized error messages for the document drafting module.
 * @enum {string}
 */
export const ERROR_MESSAGES = {
  MISSING_CONTENT: 'Content or topic is required to draft a document',
  INVALID_FORMAT: 'Invalid output format specified',
  GENERATION_FAILED: 'Failed to generate document',
  EXPORT_FAILED: 'Failed to export document',
  CONVERSATION_FAILED: 'Failed to process conversation',
};