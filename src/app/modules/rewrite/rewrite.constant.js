// Rewrite Configuration
export const REWRITE_CONFIG = {
  MODEL: 'gemini-3.5-flash',
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

// Storage configuration
export const STORAGE_CONFIG = {
  TEMP_FOLDER: 'uploads/rewrites',
  OUTPUT_FOLDER: 'output/rewrites',
};

// Google Cloud Storage configuration
export const GCS_CONFIG = {
  BUCKET_NAME: process.env.GCS_BUCKET_NAME || 'alti_files',
  PROJECT_ID: process.env.GCP_PROJECT_ID,
  KEY_FILE: process.env.GCS_KEY_FILE,
  FOLDER_PREFIX: 'rewrites/',
};

// Rewrite intents
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

// Rewrite styles
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

// Rewrite modes
export const REWRITE_MODES = {
  PRESERVE_MEANING: 'preserve_meaning', // Keep original meaning
  IMPROVE_CLARITY: 'improve_clarity', // Focus on clarity
  SIMPLIFY: 'simplify', // Make it simpler
  EXPAND: 'expand', // Add more details
  SHORTEN: 'shorten', // Make it shorter
  PARAPHRASE: 'paraphrase', // Complete rewrite
};

// Output formats
export const OUTPUT_FORMATS = {
  TEXT: 'text', // Plain text response
  FILE: 'file', // Generate downloadable file
  BOTH: 'both', // Both text and file
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'rewrite';
export const CONVERSATION_MODEL = 'gemini-3.5-flash';

// Default parameters
export const DEFAULT_PARAMS = {
  mode: REWRITE_MODES.PRESERVE_MEANING,
  style: REWRITE_STYLES.PROFESSIONAL,
  outputFormat: OUTPUT_FORMATS.TEXT,
};

// System prompts for different rewrite types
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

// Response messages
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

// Intent detection keywords
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

// File generation keywords
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
