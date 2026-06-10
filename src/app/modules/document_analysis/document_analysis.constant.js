/**
 * @file Document Analysis Configuration Constants
 * @module document_analysis.constant
 * @description Defines configuration settings, analysis types, output formats, system prompts,
 *              and response messages for the document analysis module.
 */

/**
 * @constant {object} DOCUMENT_ANALYSIS_CONFIG - Configuration settings for document analysis.
 * @property {string} MODEL - The AI model to use for document analysis.
 * @property {number} TEMPERATURE - The creativity/randomness of the AI model's output (0.0 - 1.0).
 * @property {number} MAX_OUTPUT_TOKENS - The maximum number of tokens the AI model should generate in its response.
 * @property {number} MAX_FILE_SIZE - The maximum allowed file size for document uploads in bytes (10MB).
 * @property {string[]} SUPPORTED_MIME_TYPES - An array of MIME types supported for document analysis.
 * @property {string[]} SUPPORTED_FILE_EXTENSIONS - An array of file extensions supported for document analysis.
 */
export const DOCUMENT_ANALYSIS_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  TEMPERATURE: 0.7,
  MAX_OUTPUT_TOKENS: 4096,
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
 * @constant {object} ANALYSIS_TYPES - Defines the various types of analysis that can be performed on a document.
 * @property {string} GENERAL - General comprehensive analysis.
 * @property {string} SENTIMENT - Sentiment analysis to determine emotional tone.
 * @property {string} SUMMARY - Summarization of the document's content.
 * @property {string} KEY_POINTS - Extraction of main ideas and critical facts.
 * @property {string} ENTITY_EXTRACTION - Identification and categorization of entities (people, places, organizations, etc.).
 * @property {string} TOPIC_CLASSIFICATION - Classification of the document's primary and secondary topics.
 * @property {string} LANGUAGE_DETECTION - Analysis of linguistic aspects like language, style, and readability.
 */
export const ANALYSIS_TYPES = {
  GENERAL: 'general',
  SENTIMENT: 'sentiment',
  SUMMARY: 'summary',
  KEY_POINTS: 'key_points',
  ENTITY_EXTRACTION: 'entity_extraction',
  TOPIC_CLASSIFICATION: 'topic_classification',
  LANGUAGE_DETECTION: 'language_detection',
};

/**
 * @constant {object} OUTPUT_FORMATS - Defines the available output formats for analysis results.
 * @property {string} STRUCTURED - Output formatted in a structured way (e.g., JSON, bullet points).
 * @property {string} NARRATIVE - Output formatted as a free-form, descriptive text.
 */
export const OUTPUT_FORMATS = {
  STRUCTURED: 'structured',
  NARRATIVE: 'narrative',
};

/**
 * @constant {string} CONVERSATION_CATEGORY - The category identifier for document analysis conversations.
 */
export const CONVERSATION_CATEGORY = 'document_analysis';

/**
 * @constant {string} CONVERSATION_MODEL - The AI model to use for document analysis related conversations.
 */
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

/**
 * @constant {object} SYSTEM_PROMPTS - A collection of system prompts tailored for different analysis types.
 * Each key corresponds to an `ANALYSIS_TYPES` value, and its value is the specific prompt
 * instructing the AI on how to perform that analysis.
 * @property {string} [ANALYSIS_TYPES.GENERAL] - Prompt for general document analysis.
 * @property {string} [ANALYSIS_TYPES.SENTIMENT] - Prompt for sentiment analysis.
 * @property {string} [ANALYSIS_TYPES.SUMMARY] - Prompt for document summarization.
 * @property {string} [ANALYSIS_TYPES.KEY_POINTS] - Prompt for key point extraction.
 * @property {string} [ANALYSIS_TYPES.ENTITY_EXTRACTION] - Prompt for entity extraction.
 * @property {string} [ANALYSIS_TYPES.TOPIC_CLASSIFICATION] - Prompt for topic classification.
 * @property {string} [ANALYSIS_TYPES.LANGUAGE_DETECTION] - Prompt for language detection and linguistic analysis.
 */
export const SYSTEM_PROMPTS = {
  [ANALYSIS_TYPES.GENERAL]: `You are an expert document analysis assistant. Analyze the provided content comprehensively, covering:
- Main themes and topics
- Key insights and findings
- Document structure and organization
- Important data points or statistics
- Overall tone and purpose
Provide a thorough, well-organized analysis.`,

  [ANALYSIS_TYPES.SENTIMENT]: `You are a sentiment analysis expert. Analyze the emotional tone and sentiment of the content:
- Overall sentiment (positive, negative, neutral, mixed)
- Emotional undertones
- Tone variations throughout the text
- Confidence level of your analysis
Provide specific examples to support your findings.`,

  [ANALYSIS_TYPES.SUMMARY]: `You are a professional summarization expert. Create a concise yet comprehensive summary:
- Capture all main points
- Maintain key details and context
- Organize information logically
- Keep it clear and readable
Provide a summary that gives readers a complete understanding without reading the full document.`,

  [ANALYSIS_TYPES.KEY_POINTS]: `You are an information extraction specialist. Extract and present key points:
- Main ideas and arguments
- Critical facts and statistics
- Important conclusions or recommendations
- Action items (if any)
Format as clear, scannable bullet points.`,

  [ANALYSIS_TYPES.ENTITY_EXTRACTION]: `You are an entity recognition expert. Extract and categorize entities from the content:
- People (names, roles, organizations)
- Places (locations, countries, cities)
- Organizations (companies, institutions)
- Dates and times
- Products or services
- Monetary values
Present findings in organized categories.`,

  [ANALYSIS_TYPES.TOPIC_CLASSIFICATION]: `You are a content classification expert. Identify and categorize the topics:
- Primary topic/theme
- Secondary topics
- Subject matter category (business, technical, academic, etc.)
- Keywords and tags
- Content type (report, article, proposal, etc.)
Provide clear categorization with confidence levels.`,

  [ANALYSIS_TYPES.LANGUAGE_DETECTION]: `You are a language analysis expert. Analyze the linguistic aspects:
- Primary language(s) used
- Language proficiency level
- Writing style (formal, informal, technical, etc.)
- Readability level
- Target audience
Provide detailed linguistic insights.`,
};

/**
 * @constant {object} RESPONSE_MESSAGES - Standardized response messages for various outcomes in document analysis.
 * @property {string} SUCCESS - Message for successful analysis completion.
 * @property {string} NO_CONTENT - Message when no content is provided for analysis.
 * @property {string} UNSUPPORTED_FILE_TYPE - Message for unsupported file types, listing supported extensions.
 * @property {string} FILE_TOO_LARGE - Message when the uploaded file exceeds the maximum size limit.
 * @property {string} PROCESSING_ERROR - Generic message for errors during document processing.
 * @property {string} ANALYSIS_ERROR - Generic message for errors during content analysis.
 * @property {string} CONVERSATION_ERROR - Generic message for errors during conversation handling.
 */
export const RESPONSE_MESSAGES = {
  SUCCESS: 'Analysis completed successfully',
  NO_CONTENT:
    'No content provided for analysis. Please provide text or upload a file.',
  // BUG FIX: Updated the unsupported file type message to include all supported extensions
  // as defined in DOCUMENT_ANALYSIS_CONFIG.SUPPORTED_FILE_EXTENSIONS for accuracy.
  UNSUPPORTED_FILE_TYPE:
    'Unsupported file type. Please upload PDF, DOCX, DOC, TXT, XLSX, XLS, PPTX, or PPT files.',
  FILE_TOO_LARGE: 'File size exceeds the maximum limit of 10MB',
  PROCESSING_ERROR: 'Error processing document',
  ANALYSIS_ERROR: 'Error analyzing content',
  CONVERSATION_ERROR: 'Error handling conversation',
};

/**
 * @constant {object} DEFAULT_PARAMS - Default parameters to be used for document analysis requests.
 * @property {string} analysisType - The default analysis type, set to general analysis.
 * @property {string} outputFormat - The default output format, set to narrative.
 */
export const DEFAULT_PARAMS = {
  analysisType: ANALYSIS_TYPES.GENERAL,
  outputFormat: OUTPUT_FORMATS.NARRATIVE,
};