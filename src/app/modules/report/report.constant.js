// Report generation AI configuration
export const REPORT_CONFIG = {
  MODEL: process.env.REPORT_AI_MODEL || 'gemini-3-flash-preview',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 8192,
};

// Supported input file formats
export const SUPPORTED_INPUT_FORMATS = [
  'pdf',
  'txt',
  'doc',
  'docx',
  'csv',
  'xlsx',
  'xls',
  'json',
  'md',
  'html',
];

// Supported output formats
export const SUPPORTED_OUTPUT_FORMATS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'csv',
  'txt',
  'md',
  'html',
  'json',
];

// Report types
export const REPORT_TYPES = [
  'executive_summary',
  'analytical',
  'financial',
  'technical',
  'research',
  'business',
  'comparison',
  'custom',
];

// Report sections
export const REPORT_SECTIONS = {
  TITLE_PAGE: 'title_page',
  EXECUTIVE_SUMMARY: 'executive_summary',
  TABLE_OF_CONTENTS: 'table_of_contents',
  INTRODUCTION: 'introduction',
  METHODOLOGY: 'methodology',
  FINDINGS: 'findings',
  ANALYSIS: 'analysis',
  RECOMMENDATIONS: 'recommendations',
  CONCLUSION: 'conclusion',
  APPENDIX: 'appendix',
  REFERENCES: 'references',
};

// Report tone options
export const REPORT_TONES = [
  'professional',
  'formal',
  'technical',
  'casual',
  'academic',
  'persuasive',
];

// Conversation intents
export const REPORT_INTENTS = {
  GENERATE: 'generate_report',
  MODIFY: 'modify_report',
  EXPORT: 'export_report',
  ANALYZE: 'analyze_data',
  SUMMARIZE: 'summarize_content',
  COMPARE: 'compare_data',
  UNCLEAR: 'unclear',
};

// Required parameters for report generation
export const REQUIRED_PARAMS = {
  content: true,
  reportType: false,
  outputFormat: false,
  tone: false,
};

// Default parameters
export const DEFAULT_PARAMS = {
  reportType: 'analytical',
  outputFormat: 'pdf',
  tone: 'professional',
  includeTitlePage: true,
  includeTableOfContents: true,
  includeExecutiveSummary: true,
  sections: [
    REPORT_SECTIONS.TITLE_PAGE,
    REPORT_SECTIONS.EXECUTIVE_SUMMARY,
    REPORT_SECTIONS.TABLE_OF_CONTENTS,
    REPORT_SECTIONS.INTRODUCTION,
    REPORT_SECTIONS.FINDINGS,
    REPORT_SECTIONS.ANALYSIS,
    REPORT_SECTIONS.RECOMMENDATIONS,
    REPORT_SECTIONS.CONCLUSION,
  ],
};

// Task status
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

// Conversation configuration
export const CONVERSATION_CATEGORY = 'report';
export const CONVERSATION_MODEL = REPORT_CONFIG.MODEL;

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  PDF: 10 * 1024 * 1024, // 10MB
  DOC: 5 * 1024 * 1024, // 5MB
  DOCX: 5 * 1024 * 1024, // 5MB
  XLSX: 5 * 1024 * 1024, // 5MB
  CSV: 2 * 1024 * 1024, // 2MB
  TXT: 1 * 1024 * 1024, // 1MB
  DEFAULT: 5 * 1024 * 1024, // 5MB
};

// Maximum number of files per request
export const MAX_FILES_PER_REQUEST = 10;

// Report templates
export const REPORT_TEMPLATES = {
  EXECUTIVE: 'executive',
  DETAILED: 'detailed',
  SUMMARY: 'summary',
  MINIMAL: 'minimal',
};

// Chart types for data visualization
export const CHART_TYPES = [
  'bar',
  'line',
  'pie',
  'scatter',
  'area',
  'table',
];

// Export configuration
export const EXPORT_CONFIG = {
  PDF: {
    margins: { top: 72, bottom: 72, left: 72, right: 72 },
    fontSize: 12,
    lineHeight: 1.5,
  },
  DOCX: {
    margins: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // In twips
    fontSize: 24, // In half-points
  },
};
