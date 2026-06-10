/**
 * @fileoverview This file contains constants and configuration settings related to the document review module.
 * It defines parameters for AI models, file handling, review intents, aspects, depths, document types,
 * system prompts, response messages, and storage configurations.
 */

/**
 * @typedef {object} DocumentReviewConfig
 * @property {string} MODEL The AI model to be used for document review tasks.
 * @property {number} TEMPERATURE The creativity/randomness of the AI model's output (0.0 - 1.0).
 * @property {number} MAX_OUTPUT_TOKENS The maximum number of tokens the AI model can generate in a single response.
 * @property {number} MAX_FILE_SIZE The maximum allowed size for an uploaded document file in bytes (e.g., 10MB).
 * @property {number} MAX_CACHED_TEXT_SIZE The maximum size of text content that can be cached for processing in bytes (e.g., 1MB).
 * @property {string[]} SUPPORTED_MIME_TYPES A list of MIME types for document files that are supported for review.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS A list of file extensions for document files that are supported for review.
 */
/**
 * Configuration settings for the document review process, including AI model parameters,
 * file size limits, and supported file types.
 * @type {DocumentReviewConfig}
 */
export const DOCUMENT_REVIEW_CONFIG = {
  MODEL: 'gemini-2.5-pro',
  TEMPERATURE: 0.7,
  MAX_OUTPUT_TOKENS: 8192,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CACHED_TEXT_SIZE: 1 * 1024 * 1024, // 1MB text cache limit
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
 * @typedef {object} ReviewIntents
 * @property {string} GENERAL_REVIEW A broad review covering multiple aspects.
 * @property {string} GRAMMAR_CHECK Focus on grammar, spelling, and punctuation.
 * @property {string} CONTENT_ANALYSIS Analyze the substance, clarity, and coherence of the content.
 * @property {string} SUMMARY Generate a concise summary of the document.
 * @property {string} SUGGEST_IMPROVEMENTS Provide actionable suggestions for enhancing the document.
 * @property {string} FACT_CHECK Verify factual accuracy within the document.
 * @property {string} TONE_ANALYSIS Assess the document's tone and style.
 * @property {string} FORMATTING_REVIEW Evaluate the document's layout and presentation.
 * @property {string} CLARIFICATION Request for more specific details from the user.
 * @property {string} UNKNOWN Indicates an unrecognized or unsupported review intent.
 */
/**
 * Defines the various types of review intents or purposes a user might request.
 * These are used to guide the AI's focus during document analysis.
 * @type {ReviewIntents}
 */
export const REVIEW_INTENTS = {
  GENERAL_REVIEW: 'general_review',
  GRAMMAR_CHECK: 'grammar_check',
  CONTENT_ANALYSIS: 'content_analysis',
  SUMMARY: 'summary',
  SUGGEST_IMPROVEMENTS: 'suggest_improvements',
  FACT_CHECK: 'fact_CHECK',
  TONE_ANALYSIS: 'tone_analysis',
  FORMATTING_REVIEW: 'formatting_review',
  CLARIFICATION: 'clarification',
  UNKNOWN: 'unknown',
};

/**
 * @typedef {object} ReviewAspects
 * @property {string} GRAMMAR Focus on grammatical correctness.
 * @property {string} SPELLING Focus on spelling accuracy.
 * @property {string} CLARITY Focus on how easy the text is to understand.
 * @property {string} COHERENCE Focus on the logical flow and connection of ideas.
 * @property {string} STRUCTURE Focus on the organization and layout of the document.
 * @property {string} TONE Focus on the emotional character or attitude of the writing.
 * @property {string} FORMATTING Focus on visual presentation, fonts, spacing, etc.
 * @property {string} FACTUAL_ACCURACY Focus on the correctness of stated facts.
 * @property {string} COMPLETENESS Focus on whether all necessary information is present.
 * @property {string} CONSISTENCY Focus on uniformity in style, terminology, and formatting.
 */
/**
 * Defines specific aspects or dimensions of a document that users can request to be reviewed.
 * These can be combined to form a more detailed review request.
 * @type {ReviewAspects}
 */
export const REVIEW_ASPECTS = {
  GRAMMAR: 'grammar',
  SPELLING: 'spelling',
  CLARITY: 'clarity',
  COHERENCE: 'coherence',
  STRUCTURE: 'structure',
  TONE: 'tone',
  FORMATTING: 'formatting',
  FACTUAL_ACCURACY: 'factual_accuracy',
  COMPLETENESS: 'completeness',
  CONSISTENCY: 'consistency',
};

/**
 * @typedef {object} ReviewDepth
 * @property {string} QUICK A rapid, high-level overview.
 * @property {string} STANDARD A balanced review with reasonable detail.
 * @property {string} DETAILED An in-depth analysis with comprehensive feedback.
 * @property {string} COMPREHENSIVE The most thorough and exhaustive review level.
 */
/**
 * Defines the different levels of depth for a document review.
 * This allows users to specify how thorough they want the AI's analysis to be.
 * @type {ReviewDepth}
 */
export const REVIEW_DEPTH = {
  QUICK: 'quick', // Quick overview
  STANDARD: 'standard', // Standard review
  DETAILED: 'detailed', // In-depth analysis
  COMPREHENSIVE: 'comprehensive', // Most thorough
};

/**
 * @typedef {object} DocumentTypes
 * @property {string} ACADEMIC Documents typically found in educational or research contexts.
 * @property {string} BUSINESS Documents related to commerce, management, or corporate operations.
 * @property {string} TECHNICAL Documents detailing technical information, instructions, or specifications.
 * @property {string} CREATIVE Documents like stories, poems, or marketing copy.
 * @property {string} LEGAL Documents related to law, contracts, or regulations.
 * @property {string} MARKETING Documents aimed at promoting products, services, or brands.
 * @property {string} GENERAL Documents that do not fit into a specific specialized category.
 */
/**
 * Defines various categories of documents to allow for specialized review approaches.
 * The AI can tailor its analysis based on the document's type.
 * @type {DocumentTypes}
 */
export const DOCUMENT_TYPES = {
  ACADEMIC: 'academic',
  BUSINESS: 'business',
  TECHNICAL: 'technical',
  CREATIVE: 'creative',
  LEGAL: 'legal',
  MARKETING: 'marketing',
  GENERAL: 'general',
};

/**
 * The category identifier for conversations related to document review.
 * Used for routing or categorizing interactions within the system.
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'document_review';

/**
 * The AI model specifically designated for handling conversation flows within the document review module.
 * @type {string}
 */
export const CONVERSATION_MODEL = 'gemini-2.5-pro';

/**
 * @typedef {object} RequiredParams
 * @property {Array<string>} general_review An array of parameters required for a general review intent.
 * @property {Array<string>} grammar_check An array of parameters required for a grammar check intent.
 * @property {Array<string>} content_analysis An array of parameters required for a content analysis intent.
 * @property {Array<string>} summary An array of parameters required for a summary intent.
 * @property {Array<string>} suggest_improvements An array of parameters required for suggesting improvements.
 * @property {Array<string>} fact_check An array of parameters required for fact-checking.
 * @property {Array<string>} tone_analysis An array of parameters required for tone analysis.
 * @property {Array<string>} formatting_review An array of parameters required for formatting review.
 */
/**
 * Maps each review intent to an array of parameters that are strictly required for that intent to be processed.
 * Currently, no specific parameters are universally required for these intents beyond the document itself.
 * @type {RequiredParams}
 */
export const REQUIRED_PARAMS = {
  [REVIEW_INTENTS.GENERAL_REVIEW]: [],
  [REVIEW_INTENTS.GRAMMAR_CHECK]: [],
  [REVIEW_INTENTS.CONTENT_ANALYSIS]: [],
  [REVIEW_INTENTS.SUMMARY]: [],
  [REVIEW_INTENTS.SUGGEST_IMPROVEMENTS]: [],
  [REVIEW_INTENTS.FACT_CHECK]: [],
  [REVIEW_INTENTS.TONE_ANALYSIS]: [],
  [REVIEW_INTENTS.FORMATTING_REVIEW]: [],
};

/**
 * @typedef {object} DefaultParams
 * @property {string} reviewDepth The default depth level for a document review.
 * @property {string} documentType The default type of document assumed for review.
 * @property {string[]} aspects An array of default aspects to focus on during a review.
 */
/**
 * Defines the default parameters to be used when specific review options are not provided by the user.
 * This ensures a baseline review configuration.
 * @type {DefaultParams}
 */
export const DEFAULT_PARAMS = {
  reviewDepth: REVIEW_DEPTH.STANDARD,
  documentType: DOCUMENT_TYPES.GENERAL,
  aspects: [
    REVIEW_ASPECTS.GRAMMAR,
    REVIEW_ASPECTS.CLARITY,
    REVIEW_ASPECTS.STRUCTURE,
  ],
};

/**
 * @typedef {object} SystemPrompts
 * @property {string} general_review System prompt for a general document review.
 * @property {string} grammar_check System prompt for a grammar and language check.
 * @property {string} content_analysis System prompt for content analysis.
 * @property {string} summary System prompt for generating a document summary.
 * @property {string} suggest_improvements System prompt for suggesting document improvements.
 * @property {string} fact_check System prompt for fact-checking a document.
 * @property {string} tone_analysis System prompt for analyzing the document's tone.
 * @property {string} formatting_review System prompt for reviewing document formatting.
 */
/**
 * A collection of system prompts, each tailored to a specific review intent.
 * These prompts guide the AI model on how to approach and execute each type of document review.
 * @type {SystemPrompts}
 */
export const SYSTEM_PROMPTS = {
  [REVIEW_INTENTS.GENERAL_REVIEW]: `You are an expert document reviewer. Provide a comprehensive review of the document covering grammar, clarity, structure, and overall quality. Be constructive and specific in your feedback.`,

  [REVIEW_INTENTS.GRAMMAR_CHECK]: `You are an expert grammar and language checker. Focus on identifying and correcting grammatical errors, spelling mistakes, punctuation issues, and language usage problems. Provide clear explanations for each correction.`,

  [REVIEW_INTENTS.CONTENT_ANALYSIS]: `You are a content analysis expert. Analyze the document's content for clarity, coherence, logical flow, argument strength, and completeness. Provide insights on how to improve the content.`,

  [REVIEW_INTENTS.SUMMARY]: `You are an expert at summarizing documents. Provide a clear, concise summary that captures the main points, key arguments, and important details of the document.`,

  [REVIEW_INTENTS.SUGGEST_IMPROVEMENTS]: `You are a document improvement specialist. Identify areas for improvement and provide specific, actionable suggestions to enhance the document's quality, effectiveness, and impact.`,

  [REVIEW_INTENTS.FACT_CHECK]: `You are a fact-checking expert. Review the document for factual accuracy, identify claims that need verification, and point out any potentially incorrect or misleading information.`,

  [REVIEW_INTENTS.TONE_ANALYSIS]: `You are a tone and style analyst. Analyze the document's tone, voice, and style. Assess whether it's appropriate for the intended audience and purpose, and suggest adjustments if needed.`,

  [REVIEW_INTENTS.FORMATTING_REVIEW]: `You are a formatting and structure expert. Review the document's formatting, layout, organization, and visual presentation. Suggest improvements for better readability and professional appearance.`,
};

/**
 * @typedef {object} ResponseMessages
 * @property {string} FILE_REQUIRED Message indicating that a file upload is necessary.
 * @property {string} FILE_UPLOADED Message confirming successful file upload and prompting for review intent.
 * @property {string} REVIEW_COMPLETE Message indicating that the document review has finished.
 * @property {string} CLARIFICATION_NEEDED Message requesting the user to provide more specific details.
 * @property {string} PROCESSING Message indicating that the document is currently being analyzed.
 * @property {string} ERROR Generic error message for review failures.
 */
/**
 * Standardized response messages used by the document review module to communicate with users.
 * @type {ResponseMessages}
 */
export const RESPONSE_MESSAGES = {
  FILE_REQUIRED: 'Please upload a document file to review.',
  FILE_UPLOADED:
    'Document uploaded successfully. What would you like me to review?',
  REVIEW_COMPLETE: "I've completed the review of your document.",
  CLARIFICATION_NEEDED:
    "Could you please clarify what specific aspect you'd like me to focus on?",
  PROCESSING: "I'm analyzing your document now...",
  ERROR:
    'I encountered an error while reviewing your document. Please try again.',
};

/**
 * @typedef {object} StorageConfig
 * @property {string} GCS_BUCKET The name of the Google Cloud Storage bucket to use for persistent storage.
 * @property {string} GCS_UPLOAD_FOLDER The base folder name within the GCS bucket for storing uploaded document review files.
 * @property {number} GCS_SIGNED_URL_EXPIRATION_MINUTES The duration in minutes for which a generated signed URL for upload is valid.
 */
/**
 * Configuration settings for Google Cloud Storage related to document reviews.
 * This configuration supports a stateless architecture by using signed URLs for direct client uploads,
 * avoiding any writes to the local container filesystem.
 * @type {StorageConfig}
 */
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/document_reviews',
  GCS_BUCKET: process.env.GCS_BUCKET_NAME || '',
  GCS_UPLOAD_FOLDER: 'document_reviews',
  GCS_SIGNED_URL_EXPIRATION_MINUTES: 15, // Signed URL is valid for 15 minutes
};