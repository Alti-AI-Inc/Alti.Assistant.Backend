import * as zod from 'zod';
const { z } = zod;
import {
  SUPPORTED_OUTPUT_FORMATS,
  REPORT_TYPES,
  REPORT_TONES,
  REPORT_SECTIONS,
} from './report.constant.js';

/**
 * Generate GCS Signed Upload URL schema.
 * This endpoint is the first step in the file upload process.
 * The client requests a secure, short-lived URL to upload a file directly to GCS.
 * This avoids processing large file uploads on the application server, making the architecture stateless and scalable.
 */
const generateUploadUrlSchema = z.object({
  body: z.object({
    fileName: z
      .string({
        required_error: 'File name is required',
      })
      .min(1, 'File name cannot be empty')
      .max(1024, 'File name is too long')
      .describe('The name of the file to be uploaded, e.g., "financial-data.csv"'),
    contentType: z
      .string({
        required_error: 'Content type is required',
      })
      .regex(/^[\w-]+\/[\w-+\.]+$/, 'Invalid content type format')
      .describe('The MIME type of the file, e.g., "text/csv" or "application/pdf"'),
    // conversationId is optional, but if provided, helps associate the upload
    // with an ongoing conversation before the file is even processed.
    conversationId: z.string().uuid('Invalid Conversation ID format').optional(),
  }),
});

/**
 * Conversational assistant request schema
 * Supports both text messages and references to files already uploaded to GCS.
 */
const conversationalRequestSchema = z.object({
  body: z
    .object({
      message: z
        .string()
        .min(1, 'Message cannot be empty')
        .max(10000, 'Message too long')
        .optional(),
      // The GCS object name for a file previously uploaded via a signed URL.
      // This is the second step of the upload process, where the client notifies the backend
      // about the successfully uploaded file so it can be processed.
      gcsObjectName: z
        .string()
        .min(1, 'GCS object name cannot be empty')
        .optional(),
      // SECURITY: conversationId should be a valid UUID if provided to prevent potential enumeration issues.
      conversationId: z.string().uuid('Invalid Conversation ID format').optional(),
      // VULNERABILITY FIX: Removed `userId` from the request body.
      // User identity MUST be determined from the authenticated session (e.g., JWT) on the server-side
      // to prevent impersonation vulnerabilities. Guest user handling should be managed by the backend,
      // not by trusting a client-provided ID.
      outputFormat: z.enum(SUPPORTED_OUTPUT_FORMATS).optional(),
      reportType: z.enum(REPORT_TYPES).optional(),
    })
    // Ensure that either a message or a file reference is provided.
    .refine(data => data.message || data.gcsObjectName, {
      message: 'Either a message or a gcsObjectName must be provided.',
      path: ['message'], // Point the error to a relevant field.
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
 * For analyzing multiple files that have already been uploaded to GCS.
 */
const analyzeFilesSchema = z.object({
  body: z.object({
    // An array of GCS object names for files previously uploaded via signed URLs.
    // The client first gets signed URLs for each file, uploads them, and then calls this endpoint
    // with the list of resulting object names.
    gcsObjectNames: z
      .array(z.string().min(1, 'GCS object name cannot be empty'))
      .min(1, 'At least one file must be provided for analysis'),
    analysisType: z
      .enum(['summary', 'detailed', 'comparison', 'extraction'])
      .optional(),
    instructions: z.string().max(2000).optional(),
    // SECURITY: conversationId should be a valid UUID if provided.
    conversationId: z.string().uuid('Invalid Conversation ID format').optional(),
    // VULNERABILITY FIX: Removed `userId` from the request body.
    // User identity MUST be determined from the authenticated session.
    // Allowing clients to specify a user ID is a severe security risk (impersonation).
  }),
});

/**
 * Export report schema
 * For exporting existing report to different format.
 * The controller will generate the file, upload it to a GCS bucket,
 * and return a signed URL for the client to download it directly.
 */
const exportReportSchema = z.object({
  body: z.object({
    // SECURITY (IDOR): Enforce UUID format for reportId as a defense-in-depth measure.
    // The controller/service layer MUST still verify that the authenticated user
    // has permission to access this specific report within their tenant context.
    reportId: z
      .string({
        required_error: 'Report ID is required',
      })
      .uuid('Invalid Report ID format'),
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
    // SECURITY (IDOR): Enforce UUID format for taskId.
    // The controller/service layer MUST verify the authenticated user has permission to view this task.
    taskId: z
      .string({
        required_error: 'Task ID is required',
      })
      .uuid('Invalid Task ID format'),
  }),
});

/**
 * Get report schema
 */
const getReportSchema = z.object({
  params: z.object({
    // SECURITY (IDOR): Enforce UUID format for reportId.
    // The controller/service layer MUST verify ownership of the report to prevent IDOR.
    reportId: z
      .string({
        required_error: 'Report ID is required',
      })
      .uuid('Invalid Report ID format'),
  }),
});

/**
 * Modify report schema
 */
const modifyReportSchema = z.object({
  body: z.object({
    // SECURITY (IDOR): Enforce UUID format for reportId.
    // The controller/service layer MUST verify ownership of the report to prevent IDOR.
    reportId: z
      .string({
        required_error: 'Report ID is required',
      })
      .uuid('Invalid Report ID format'),
    modifications: z
      .string({
        required_error: 'Modification instructions are required',
      })
      .min(1, 'Modification instructions cannot be empty')
      .max(5000, 'Modification instructions are too long'),
    sections: z.array(z.enum(Object.values(REPORT_SECTIONS))).optional(),
    conversationId: z.string().uuid('Invalid Conversation ID format').optional(),
  }),
});

/**
 * List reports schema
 */
const listReportsSchema = z.object({
  query: z.object({
    // Pagination parameters 'page' and 'limit' are typically numbers.
    // Using z.coerce.number() to automatically convert string inputs (from query params) to numbers,
    // and ensuring they are integers and at least 1.
    page: z.coerce.number().int().min(1, 'Page must be at least 1').optional(),
    // BUGFIX (DoS): Add a max limit to prevent resource exhaustion attacks via pagination.
    limit: z.coerce
      .number()
      .int()
      .min(1, 'Limit must be at least 1')
      .max(100, 'Limit cannot exceed 100')
      .optional(),
    reportType: z.enum(REPORT_TYPES).optional(),
    sortBy: z.enum(['createdAt', 'title', 'reportType']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
    // INTEGRATION (HIERARCHY): Added authorId to allow privileged roles (admin, manager) to filter reports by user.
    // The authorization middleware/controller MUST ensure that only users with appropriate permissions
    // (e.g., 'admin' or 'manager' of the same workspace/tenant) can use this filter.
    // Regular 'user' roles should not be able to specify an authorId.
    authorId: z.string().uuid('Invalid Author ID format').optional(),
    // HIERARCHY GAP FIX: Added workspaceId to allow platform-level roles (super_admin) to query reports across different workspaces.
    // The authorization middleware/controller MUST verify that the user has the necessary permissions to access the specified workspace.
    // For 'admin', 'manager', and 'user' roles, the query should be automatically scoped to their own workspace, and they should not be allowed to specify a different one.
    workspaceId: z.string().uuid('Invalid Workspace ID format').optional(),
  }),
});

export const ReportValidation = {
  generateUploadUrlSchema,
  conversationalRequestSchema,
  generateReportSchema,
  analyzeFilesSchema,
  exportReportSchema,
  checkStatusSchema,
  getReportSchema,
  modifyReportSchema,
  listReportsSchema,
};