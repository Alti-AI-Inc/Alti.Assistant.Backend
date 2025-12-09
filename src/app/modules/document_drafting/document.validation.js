import * as zod from 'zod';
const { z } = zod;

/**
 * Validation schema for conversational document drafting requests
 */
const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(10000, 'Message too long'),
    conversationId: z.string().optional(),
    userId: z.string().optional(), // For guest users
  }),
});

/**
 * Validation schema for direct document generation
 */
const generateDocumentSchema = z.object({
  body: z.object({
    content: z
      .string({
        required_error: 'Content or topic is required',
      })
      .min(10, 'Content is too short')
      .max(50000, 'Content is too long'),
    documentType: z
      .enum([
        'letter',
        'essay',
        'article',
        'blog_post',
        'report',
        'proposal',
        'memo',
        'email',
        'contract',
        'resume',
        'cover_letter',
        'research_paper',
        'white_paper',
        'business_plan',
        'technical_doc',
        'general',
      ])
      .optional(),
    outputFormat: z.enum(['pdf', 'docx', 'doc', 'txt', 'html', 'md']).optional(),
    tone: z
      .enum([
        'professional',
        'casual',
        'formal',
        'friendly',
        'academic',
        'creative',
        'persuasive',
        'technical',
      ])
      .optional(),
    length: z.enum(['short', 'medium', 'long', 'custom']).optional(),
    wordCount: z.number().min(50).max(10000).optional(),
    includeTitle: z.boolean().optional(),
    includeDate: z.boolean().optional(),
    language: z.string().optional(),
    template: z
      .enum([
        'business_letter',
        'formal_report',
        'academic_paper',
        'creative_writing',
        'technical_documentation',
        'standard',
      ])
      .optional(),
    additionalInstructions: z.string().max(2000).optional(),
  }),
});

/**
 * Validation schema for document editing/refinement
 */
const editDocumentSchema = z.object({
  body: z.object({
    documentId: z.string({
      required_error: 'Document ID is required',
    }),
    editInstructions: z
      .string({
        required_error: 'Edit instructions are required',
      })
      .min(5, 'Instructions are too short')
      .max(5000, 'Instructions are too long'),
    outputFormat: z.enum(['pdf', 'docx', 'doc', 'txt', 'html', 'md']).optional(),
  }),
});

/**
 * Validation schema for exporting existing document to different format
 */
const exportDocumentSchema = z.object({
  body: z.object({
    documentId: z.string({
      required_error: 'Document ID is required',
    }),
    outputFormat: z.enum(['pdf', 'docx', 'doc', 'txt', 'html', 'md'], {
      required_error: 'Output format is required',
    }),
  }),
});

/**
 * Validation schema for getting document details
 */
const getDocumentSchema = z.object({
  params: z.object({
    documentId: z.string({
      required_error: 'Document ID is required',
    }),
  }),
});

/**
 * Validation schema for document task status check
 */
const checkStatusSchema = z.object({
  params: z.object({
    taskId: z.string({
      required_error: 'Task ID is required',
    }),
  }),
});

export const DocumentValidation = {
  conversationalRequestSchema,
  generateDocumentSchema,
  editDocumentSchema,
  exportDocumentSchema,
  getDocumentSchema,
  checkStatusSchema,
};
