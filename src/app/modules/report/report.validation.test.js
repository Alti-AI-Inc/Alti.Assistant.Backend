import { describe, it, expect, vi } from 'vitest';
import { ReportValidation } from './report.validation.js';
import { v4 as uuidv4 } from 'uuid';

const {
  mockConstants
} = vi.hoisted(() => {
  // Mock the constants used by the validation schemas
  const mockConstants = {
    SUPPORTED_OUTPUT_FORMATS: ['pdf', 'docx', 'json'],
    REPORT_TYPES: ['financial', 'technical', 'summary'],
    REPORT_TONES: ['formal', 'neutral', 'casual'],
    REPORT_SECTIONS: {
      INTRODUCTION: 'introduction',
      ANALYSIS: 'analysis',
      CONCLUSION: 'conclusion',
    },
  };

  return {
    mockConstants
  };
});

vi.mock('./report.constant.js', () => ({
  SUPPORTED_OUTPUT_FORMATS: mockConstants.SUPPORTED_OUTPUT_FORMATS,
  REPORT_TYPES: mockConstants.REPORT_TYPES,
  REPORT_TONES: mockConstants.REPORT_TONES,
  REPORT_SECTIONS: mockConstants.REPORT_SECTIONS,
}));

// Helper to extract Zod error messages for easier assertion
const getErrorMessages = (result) => {
  if (result.success) return [];
  return result.error.issues.map((issue) => issue.message);
};

describe('ReportValidation Schemas', () => {
  const validUUID = uuidv4();

  describe('generateUploadUrlSchema', () => {
    const validData = {
      body: {
        fileName: 'test-file.csv',
        contentType: 'text/csv',
        conversationId: validUUID,
      },
    };

    it('should pass with valid data including optional fields', () => {
      const result = ReportValidation.generateUploadUrlSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should pass with minimal valid data (optional fields omitted)', () => {
      const minimalData = {
        body: {
          fileName: 'test-file.pdf',
          contentType: 'application/pdf',
        },
      };
      const result = ReportValidation.generateUploadUrlSchema.safeParse(minimalData);
      expect(result.success).toBe(true);
    });

    it('should fail if fileName is missing', () => {
      const invalidData = { body: { ...validData.body, fileName: undefined } };
      const result = ReportValidation.generateUploadUrlSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('File name is required');
    });

    it('should fail if contentType is missing', () => {
      const invalidData = { body: { ...validData.body, contentType: undefined } };
      const result = ReportValidation.generateUploadUrlSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Content type is required');
    });

    it('should fail if contentType has an invalid format', () => {
      const invalidData = { body: { ...validData.body, contentType: 'invalid-format' } };
      const result = ReportValidation.generateUploadUrlSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid content type format');
    });

    it('should fail if conversationId is not a valid UUID', () => {
      const invalidData = { body: { ...validData.body, conversationId: 'not-a-uuid' } };
      const result = ReportValidation.generateUploadUrlSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Conversation ID format');
    });
  });

  describe('conversationalRequestSchema', () => {
    it('should pass with a valid message', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: { message: 'Hello, assistant!' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with a valid gcsObjectName', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: { gcsObjectName: 'uploads/file123.pdf' },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with both message and gcsObjectName', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: {
          message: 'Analyze this file.',
          gcsObjectName: 'uploads/file123.pdf',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid optional fields', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: {
          message: 'Generate a report.',
          conversationId: validUUID,
          outputFormat: 'pdf',
          reportType: 'financial',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if both message and gcsObjectName are missing', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Either a message or a gcsObjectName must be provided.');
    });

    it('should fail if conversationId is not a UUID', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: { message: 'test', conversationId: 'invalid-uuid' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Conversation ID format');
    });

    it('should fail if outputFormat is not in the supported enum', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: { message: 'test', outputFormat: 'invalid-format' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)[0]).toContain("Invalid enum value.");
    });

    it('should fail if reportType is not in the supported enum', () => {
      const result = ReportValidation.conversationalRequestSchema.safeParse({
        body: { message: 'test', reportType: 'invalid-type' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)[0]).toContain("Invalid enum value.");
    });
  });

  describe('generateReportSchema', () => {
    const validData = {
      body: {
        content: 'This is the report content.',
        title: 'My Report',
        reportType: 'summary',
        outputFormat: 'docx',
        tone: 'formal',
        sections: ['introduction', 'analysis'],
        includeTitlePage: true,
        includeTableOfContents: false,
        includeExecutiveSummary: true,
        includeCharts: false,
        customInstructions: 'Focus on Q3 data.',
        metadata: { client: 'ACME Corp' },
      },
    };

    it('should pass with full valid data', () => {
      const result = ReportValidation.generateReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should pass with minimal valid data (content only)', () => {
      const result = ReportValidation.generateReportSchema.safeParse({
        body: { content: 'Minimal content.' },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if content is missing', () => {
      const result = ReportValidation.generateReportSchema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Content is required');
    });

    it('should fail if content is too large', () => {
      const result = ReportValidation.generateReportSchema.safeParse({
        body: { content: 'a'.repeat(50001) },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Content too large');
    });

    it('should fail if an invalid reportType is provided', () => {
      const result = ReportValidation.generateReportSchema.safeParse({
        body: { content: 'test', reportType: 'invalid' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)[0]).toContain("Invalid enum value.");
    });

    it('should fail if an invalid section is provided', () => {
      const result = ReportValidation.generateReportSchema.safeParse({
        body: { content: 'test', sections: ['introduction', 'invalid-section'] },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)[0]).toContain("Invalid enum value.");
    });
  });

  describe('analyzeFilesSchema', () => {
    const validData = {
      body: {
        gcsObjectNames: ['file1.pdf', 'data/file2.csv'],
        analysisType: 'summary',
        instructions: 'Summarize these files.',
        conversationId: validUUID,
      },
    };

    it('should pass with full valid data', () => {
      const result = ReportValidation.analyzeFilesSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should pass with minimal valid data', () => {
      const result = ReportValidation.analyzeFilesSchema.safeParse({
        body: { gcsObjectNames: ['file1.pdf'] },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if gcsObjectNames is missing', () => {
      const result = ReportValidation.analyzeFilesSchema.safeParse({ body: {} });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Required');
    });

    it('should fail if gcsObjectNames is an empty array', () => {
      const result = ReportValidation.analyzeFilesSchema.safeParse({
        body: { gcsObjectNames: [] },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('At least one file must be provided for analysis');
    });

    it('should fail if conversationId is not a UUID', () => {
      const result = ReportValidation.analyzeFilesSchema.safeParse({
        body: { gcsObjectNames: ['file1.pdf'], conversationId: 'invalid' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Conversation ID format');
    });
  });

  describe('exportReportSchema', () => {
    const validData = {
      body: {
        reportId: validUUID,
        outputFormat: 'pdf',
      },
    };

    it('should pass with valid data', () => {
      const result = ReportValidation.exportReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should fail if reportId is missing', () => {
      const result = ReportValidation.exportReportSchema.safeParse({
        body: { outputFormat: 'pdf' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Report ID is required');
    });

    it('should fail if reportId is not a UUID', () => {
      const result = ReportValidation.exportReportSchema.safeParse({
        body: { reportId: 'invalid-id', outputFormat: 'pdf' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Report ID format');
    });

    it('should fail if outputFormat is missing', () => {
      const result = ReportValidation.exportReportSchema.safeParse({
        body: { reportId: validUUID },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Valid output format is required');
    });

    it('should fail if outputFormat is invalid', () => {
      const result = ReportValidation.exportReportSchema.safeParse({
        body: { reportId: validUUID, outputFormat: 'invalid' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)[0]).toContain("Invalid enum value.");
    });
  });

  describe('checkStatusSchema', () => {
    it('should pass with a valid UUID taskId', () => {
      const result = ReportValidation.checkStatusSchema.safeParse({
        params: { taskId: validUUID },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if taskId is missing', () => {
      const result = ReportValidation.checkStatusSchema.safeParse({ params: {} });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Task ID is required');
    });

    it('should fail if taskId is not a UUID', () => {
      const result = ReportValidation.checkStatusSchema.safeParse({
        params: { taskId: 'invalid-id' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Task ID format');
    });
  });

  describe('getReportSchema', () => {
    it('should pass with a valid UUID reportId', () => {
      const result = ReportValidation.getReportSchema.safeParse({
        params: { reportId: validUUID },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if reportId is missing', () => {
      const result = ReportValidation.getReportSchema.safeParse({ params: {} });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Report ID is required');
    });

    it('should fail if reportId is not a UUID', () => {
      const result = ReportValidation.getReportSchema.safeParse({
        params: { reportId: 'invalid-id' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Report ID format');
    });
  });

  describe('modifyReportSchema', () => {
    const validData = {
      body: {
        reportId: validUUID,
        modifications: 'Please update the conclusion.',
        sections: ['conclusion'],
        conversationId: validUUID,
      },
    };

    it('should pass with full valid data', () => {
      const result = ReportValidation.modifyReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should pass with minimal valid data', () => {
      const result = ReportValidation.modifyReportSchema.safeParse({
        body: {
          reportId: validUUID,
          modifications: 'Update.',
        },
      });
      expect(result.success).toBe(true);
    });

    it('should fail if reportId is missing', () => {
      const result = ReportValidation.modifyReportSchema.safeParse({
        body: { modifications: 'Update.' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Report ID is required');
    });

    it('should fail if modifications are missing', () => {
      const result = ReportValidation.modifyReportSchema.safeParse({
        body: { reportId: validUUID },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Modification instructions are required');
    });

    it('should fail if modifications are empty', () => {
      const result = ReportValidation.modifyReportSchema.safeParse({
        body: { reportId: validUUID, modifications: '' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Modification instructions cannot be empty');
    });

    it('should fail if conversationId is not a UUID', () => {
      const result = ReportValidation.modifyReportSchema.safeParse({
        body: {
          reportId: validUUID,
          modifications: 'Update.',
          conversationId: 'invalid-uuid',
        },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Conversation ID format');
    });
  });

  describe('listReportsSchema', () => {
    it('should pass with an empty query', () => {
      const result = ReportValidation.listReportsSchema.safeParse({ query: {} });
      expect(result.success).toBe(true);
    });

    it('should pass with all valid query parameters and coerce strings to numbers', () => {
      const result = ReportValidation.listReportsSchema.safeParse({
        query: {
          page: '2',
          limit: '50',
          reportType: 'technical',
          sortBy: 'createdAt',
          sortOrder: 'desc',
          authorId: validUUID,
        },
      });
      expect(result.success).toBe(true);
      expect(result.data.query.page).toBe(2);
      expect(result.data.query.limit).toBe(50);
    });

    it('should fail if page is less than 1', () => {
      const result = ReportValidation.listReportsSchema.safeParse({ query: { page: 0 } });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Page must be at least 1');
    });

    it('should fail if limit is greater than 100', () => {
      const result = ReportValidation.listReportsSchema.safeParse({ query: { limit: 101 } });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Limit cannot exceed 100');
    });

    it('should fail if sortBy is invalid', () => {
      const result = ReportValidation.listReportsSchema.safeParse({
        query: { sortBy: 'invalid-field' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)[0]).toContain("Invalid enum value.");
    });

    it('should fail if authorId is not a UUID', () => {
      const result = ReportValidation.listReportsSchema.safeParse({
        query: { authorId: 'invalid-uuid' },
      });
      expect(result.success).toBe(false);
      expect(getErrorMessages(result)).toContain('Invalid Author ID format');
    });
  });
});