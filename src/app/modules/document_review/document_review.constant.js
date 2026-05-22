// Document Review Configuration
export const DOCUMENT_REVIEW_CONFIG = {
  MODEL: 'gemini-3.1-pro',
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

// Review intents
export const REVIEW_INTENTS = {
  GENERAL_REVIEW: 'general_review',
  GRAMMAR_CHECK: 'grammar_check',
  CONTENT_ANALYSIS: 'content_analysis',
  SUMMARY: 'summary',
  SUGGEST_IMPROVEMENTS: 'suggest_improvements',
  FACT_CHECK: 'fact_check',
  TONE_ANALYSIS: 'tone_analysis',
  FORMATTING_REVIEW: 'formatting_review',
  CLARIFICATION: 'clarification',
  UNKNOWN: 'unknown',
};

// Review aspects users can request
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

// Review depth levels
export const REVIEW_DEPTH = {
  QUICK: 'quick', // Quick overview
  STANDARD: 'standard', // Standard review
  DETAILED: 'detailed', // In-depth analysis
  COMPREHENSIVE: 'comprehensive', // Most thorough
};

// Document types for specialized reviews
export const DOCUMENT_TYPES = {
  ACADEMIC: 'academic',
  BUSINESS: 'business',
  TECHNICAL: 'technical',
  CREATIVE: 'creative',
  LEGAL: 'legal',
  MARKETING: 'marketing',
  GENERAL: 'general',
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'document_review';
export const CONVERSATION_MODEL = 'gemini-3.1-pro';

// Required parameters for review
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

// Default parameters
export const DEFAULT_PARAMS = {
  reviewDepth: REVIEW_DEPTH.STANDARD,
  documentType: DOCUMENT_TYPES.GENERAL,
  aspects: [
    REVIEW_ASPECTS.GRAMMAR,
    REVIEW_ASPECTS.CLARITY,
    REVIEW_ASPECTS.STRUCTURE,
  ],
};

// System prompts for different review types
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

// Response templates
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

// File storage configuration
export const STORAGE_CONFIG = {
  UPLOAD_FOLDER: 'document_reviews',
  TEMP_FOLDER: 'uploads/document_reviews',
  GCS_BUCKET: process.env.GCS_BUCKET_NAME || '',
};
