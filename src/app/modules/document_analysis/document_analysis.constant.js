// Document Analysis Configuration
export const DOCUMENT_ANALYSIS_CONFIG = {
  MODEL: 'gemini-3-flash-preview',
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

// Analysis types
export const ANALYSIS_TYPES = {
  GENERAL: 'general',
  SENTIMENT: 'sentiment',
  SUMMARY: 'summary',
  KEY_POINTS: 'key_points',
  ENTITY_EXTRACTION: 'entity_extraction',
  TOPIC_CLASSIFICATION: 'topic_classification',
  LANGUAGE_DETECTION: 'language_detection',
};

// Output formats
export const OUTPUT_FORMATS = {
  STRUCTURED: 'structured',
  NARRATIVE: 'narrative',
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'document_analysis';
export const CONVERSATION_MODEL = 'gemini-3.5-flash';

// System prompts for different analysis types
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

// Response messages
export const RESPONSE_MESSAGES = {
  SUCCESS: 'Analysis completed successfully',
  NO_CONTENT:
    'No content provided for analysis. Please provide text or upload a file.',
  FILE_TOO_LARGE: 'File size exceeds the maximum limit of 10MB',
  UNSUPPORTED_FILE_TYPE:
    'Unsupported file type. Please upload PDF, DOCX, TXT, XLSX, or PPTX files.',
  PROCESSING_ERROR: 'Error processing document',
  ANALYSIS_ERROR: 'Error analyzing content',
  CONVERSATION_ERROR: 'Error handling conversation',
};

// Default parameters
export const DEFAULT_PARAMS = {
  analysisType: ANALYSIS_TYPES.GENERAL,
  outputFormat: OUTPUT_FORMATS.NARRATIVE,
};
