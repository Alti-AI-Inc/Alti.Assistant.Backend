// Document drafting configuration
export const DOCUMENT_CONFIG = {
  MODEL: 'gemini-2.5-flash',
  MAX_CONTEXT_TOKENS: 50000,
  MAX_OUTPUT_TOKENS: 8192,
  TEMPERATURE: 0.7,
};

// Document types
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

// Output format options
export const OUTPUT_FORMATS = {
  PDF: 'pdf',
  DOCX: 'docx',
  DOC: 'doc',
  TXT: 'txt',
  HTML: 'html',
  MD: 'md',
};

// Document intents
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

// Required parameters for document generation
export const REQUIRED_PARAMS = {
  content: true, // Main content/topic
  documentType: false, // Type of document
  outputFormat: false, // Export format
};

// Default parameters
export const DEFAULT_PARAMS = {
  documentType: DOCUMENT_TYPES.GENERAL,
  outputFormat: OUTPUT_FORMATS.PDF,
  tone: 'professional',
  length: 'medium', // short, medium, long
  includeTitle: true,
  includeDate: true,
  language: 'en',
};

// Tone options
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

// Length options
export const LENGTH_OPTIONS = {
  SHORT: 'short', // ~250-500 words
  MEDIUM: 'medium', // ~500-1500 words
  LONG: 'long', // ~1500-3000 words
  CUSTOM: 'custom', // User-specified word count
};

// Task status
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Conversation settings
export const CONVERSATION_CATEGORY = 'document_drafting';
export const CONVERSATION_MODEL = 'gemini-2.5-flash';

// Document templates
export const DOCUMENT_TEMPLATES = {
  BUSINESS_LETTER: 'business_letter',
  FORMAL_REPORT: 'formal_report',
  ACADEMIC_PAPER: 'academic_paper',
  CREATIVE_WRITING: 'creative_writing',
  TECHNICAL_DOC: 'technical_documentation',
  STANDARD: 'standard',
};

// GCS Configuration
export const GCS_CONFIG = {
  BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'alti_assistant_documents',
  PROJECT_ID: process.env.GCP_PROJECT_ID,
  KEY_FILE: process.env.GCS_KEY_FILE,
  FOLDER_PREFIX: 'documents/',
};

// File size limits (in bytes)
export const FILE_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_CONTENT_LENGTH: 100000, // characters
};

// Error messages
export const ERROR_MESSAGES = {
  MISSING_CONTENT: 'Content or topic is required to draft a document',
  INVALID_FORMAT: 'Invalid output format specified',
  GENERATION_FAILED: 'Failed to generate document',
  EXPORT_FAILED: 'Failed to export document',
  CONVERSATION_FAILED: 'Failed to process conversation',
};
