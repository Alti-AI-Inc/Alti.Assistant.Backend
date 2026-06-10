/**
 * @file Defines constants used throughout the report generation module.
 * @module report.constant
 */

/**
 * Configuration for the AI model used in report generation.
 * @constant
 * @type {{MODEL: string, TEMPERATURE: number, MAX_TOKENS: number}}
 * @property {string} MODEL - The identifier of the AI model to use (e.g., 'gemini-2.5-flash'). Defaults to `process.env.REPORT_AI_MODEL`.
 * @property {number} TEMPERATURE - The creativity/randomness of the AI's output (0.0 to 1.0).
 * @property {number} MAX_TOKENS - The maximum number of tokens (words/subwords) in the generated report.
 */
export const REPORT_CONFIG = {
  MODEL: process.env.REPORT_AI_MODEL || 'gemini-2.5-flash',
  TEMPERATURE: 0.7,
  MAX_TOKENS: 8192,
};

/**
 * An array of file extensions representing the supported input formats for report generation.
 * @constant
 * @type {string[]}
 */
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

/**
 * An array of file extensions representing the supported output formats for generated reports.
 * @constant
 * @type {string[]}
 */
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

/**
 * An array of predefined report types that users can choose from.
 * @constant
 * @type {string[]}
 */
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

/**
 * An enumeration of standard sections that can be included in a report.
 * @constant
 * @type {Object<string, string>}
 */
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

/**
 * An array of possible tones of voice for the generated report content.
 * @constant
 * @type {string[]}
 */
export const REPORT_TONES = [
  'professional',
  'formal',
  'technical',
  'casual',
  'academic',
  'persuasive',
];

/**
 * An enumeration of user intents recognized by the AI in report-related conversations.
 * @constant
 * @type {Object<string, string>}
 */
export const REPORT_INTENTS = {
  GENERATE: 'generate_report',
  MODIFY: 'modify_report',
  EXPORT: 'export_report',
  ANALYZE: 'analyze_data',
  SUMMARIZE: 'summarize_content',
  COMPARE: 'compare_data',
  UNCLEAR: 'unclear',
};

/**
 * Defines which parameters are required for a report generation request.
 * `true` indicates a mandatory parameter, `false` indicates an optional one.
 * @constant
 * @type {{content: boolean, reportType: boolean, outputFormat: boolean, tone: boolean}}
 */
export const REQUIRED_PARAMS = {
  content: true,
  reportType: false,
  outputFormat: false,
  tone: false,
};

/**
 * Default parameters for report generation, used when a user does not specify them.
 * @constant
 * @type {{reportType: string, outputFormat: string, tone: string, includeTitlePage: boolean, includeTableOfContents: boolean, includeExecutiveSummary: boolean, sections: string[]}}
 */
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

/**
 * An enumeration of possible statuses for an asynchronous report generation task.
 * @constant
 * @type {Object<string, string>}
 */
export const TASK_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
};

/**
 * The category identifier for conversations related to report generation.
 * Used for routing and context management.
 * @constant
 * @type {string}
 */
export const CONVERSATION_CATEGORY = 'report';

/**
 * The specific AI model used for report-related conversations.
 * Inherits from the main report AI configuration.
 * @constant
 * @type {string}
 */
export const CONVERSATION_MODEL = REPORT_CONFIG.MODEL;

/**
 * Defines the maximum allowed file size in bytes for various input file types.
 * @constant
 * @type {Object<string, number>}
 */
export const FILE_SIZE_LIMITS = {
  PDF: 10 * 1024 * 1024, // 10MB
  DOC: 5 * 1024 * 1024, // 5MB
  DOCX: 5 * 1024 * 1024, // 5MB
  XLSX: 5 * 1024 * 1024, // 5MB
  CSV: 2 * 1024 * 1024, // 2MB
  TXT: 1 * 1024 * 1024, // 1MB
  DEFAULT: 5 * 1024 * 1024, // 5MB
};

/**
 * The maximum number of files that can be uploaded in a single report generation request.
 * @constant
 * @type {number}
 */
export const MAX_FILES_PER_REQUEST = 10;

/**
 * An enumeration of predefined report templates that affect structure and styling.
 * @constant
 * @type {Object<string, string>}
 */
export const REPORT_TEMPLATES = {
  EXECUTIVE: 'executive',
  DETAILED: 'detailed',
  SUMMARY: 'summary',
  MINIMAL: 'minimal',
};

/**
 * An array of supported chart types for data visualization within reports.
 * @constant
 * @type {string[]}
 */
export const CHART_TYPES = ['bar', 'line', 'pie', 'scatter', 'area', 'table'];

/**
 * Configuration settings for exporting reports to different file formats.
 * @constant
 * @type {Object}
 * @property {Object} PDF - Configuration for PDF export.
 * @property {Object} PDF.margins - Page margins in points (72 points = 1 inch).
 * @property {number} PDF.fontSize - Default font size.
 * @property {number} PDF.lineHeight - Line height multiplier.
 * @property {Object} DOCX - Configuration for DOCX export.
 * @property {Object} DOCX.margins - Page margins in twips (1440 twips = 1 inch).
 * @property {number} DOCX.fontSize - Font size in half-points (e.g., 24 = 12pt).
 */
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