import * as zod from 'zod';
const { z } = zod;
import {
  SUPPORTED_OUTPUT_FORMATS,
  REPORT_TYPES,
  REPORT_TONES,
  REPORT_SECTIONS,
} from './report.constant.js';

/**
 * Conversational assistant request schema
 * Supports both text messages and file uploads
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(10000, 'Message too long')
      .optional(),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
    outputFormat: z.enum(SUPPORTED_OUTPUT_FORMATS).optional(),
    reportType: z.enum(REPORT_TYPES).optional(),
  }),
});

/**
 * Direct report generation schema
 * For programmatic access with all parameters provided
 */
const generateReportSchema = z.object({
  body: z.object({
    content: z
      .string()
      .min(1, 'Content is required')
      .max(50000, 'Content too large'),
    title: z.string().max(200, 'Title too long').optional(),
    reportType: z.enum(REPORT_TYPES).optional(),
    outputFormat: z.enum(SUPPORTED_OUTPUT_FORMATS).optional(),
    tone: z.enum(REPORT_TONES).optional(),
    sections: z.array(z.enum(Object.values(REPORT_SECTIONS))).optional(),
    includeTitlePage: z.boolean().optional(),
    includeTableOfContents: z.boolean().optional(),
    includeExecutiveSummary: z.boolean().optional(),
    includeCharts: z.boolean().optional(),
    customInstructions: z.string().max(1000).optional(),
    metadata: z.record(z.any()).optional(),
  }),
});

/**
 * Analyze files schema
 * For analyzing multiple uploaded files
 */
const analyzeFilesSchema = z.object({
  body: z.object({
    analysisType: z
      .enum(['summary', 'detailed', 'comparison', 'extraction'])
      .optional(),
    instructions: z.string().max(2000).optional(),
    conversationId: z.string().optional(),
    userId: z.string().optional(),
  }),
});

/**
 * Export report schema
 * For exporting existing report to different format
 */
const exportReportSchema = z.object({
  body: z.object({
    reportId: z.string({
      required_error: 'Report ID is required',
    }),
    outputFormat: z.enum(SUPPORTED_OUTPUT_FORMATS, {
      required_error: 'Valid output format is required',
    }),
  }),
});

/**
 * Check task status schema
 */
const checkStatusSchema = z.object({
  params: z.object({
    taskId: z.string({
      required_error: 'Task ID is required',
    }),
  }),
});

/**
 * Get report schema
 */
const getReportSchema = z.object({
  params: z.object({
    reportId: z.string({
      required_error: 'Report ID is required',
    }),
  }),
});

/**
 * Modify report schema
 */
const modifyReportSchema = z.object({
  body: z.object({
    reportId: z.string({
      required_error: 'Report ID is required',
    }),
    modifications: z.string({
      required_error: 'Modification instructions are required',
    }),
    sections: z.array(z.enum(Object.values(REPORT_SECTIONS))).optional(),
    conversationId: z.string().optional(),
  }),
});

/**
 * List reports schema
 */
const listReportsSchema = z.object({
  query: z.object({
    page: z.string().optional(),
    limit: z.string().optional(),
    reportType: z.enum(REPORT_TYPES).optional(),
    sortBy: z.enum(['createdAt', 'title', 'reportType']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const ReportValidation = {
  conversationalRequestSchema,
  generateReportSchema,
  analyzeFilesSchema,
  exportReportSchema,
  checkStatusSchema,
  getReportSchema,
  modifyReportSchema,
  listReportsSchema,
};
