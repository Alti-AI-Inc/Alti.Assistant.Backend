import * as zod from 'zod';
const { z } = zod;

/**
 * Defines the validation schema for incoming conversational document drafting requests.
 * This schema validates the body of a request sent to the conversational endpoint.
 *
 * @const
 * @type {z.ZodObject<{body: z.ZodObject<{message: z.ZodString, conversationId: z.ZodOptional<z.ZodString>, userId: z.ZodOptional<z.ZodString>}>}>}
 * @property {object} body - The request body.
 * @property {string} body.message - The user's message or prompt for the AI. Must be between 1 and 10000 characters.
 * @property {string} [body.conversationId] - Optional ID to maintain the context of a conversation.
 * @property {string} [body.userId] - Optional ID for guest users to track their sessions.
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
 * Defines the validation schema for requests to generate a document directly.
 * This schema validates the body of a request containing all parameters for document creation.
 *
 * @const
 * @type {z.ZodObject<any>}
 * @property {object} body - The request body.
 * @property {string} body.content - The core content, topic, or detailed prompt for the document. Must be between 10 and 50000 characters.
 * @property {('letter'|'essay'|'article'|'blog_post'|'report'|'proposal'|'memo'|'email'|'contract'|'resume'|'cover_letter'|'research_paper'|'white_paper'|'business_plan'|'technical_doc'|'general')} [body.documentType] - The specific type of document to generate.
 * @property {('pdf'|'docx'|'doc'|'txt'|'html'|'md')} [body.outputFormat] - The desired file format for the output document.
 * @property {('professional'|'casual'|'formal'|'friendly'|'academic'|'creative'|'persuasive'|'technical')} [body.tone] - The desired writing tone for the document.
 * @property {('short'|'medium'|'long'|'custom')} [body.length] - A general indicator of the desired document length.
 * @property {number} [body.wordCount] - A specific target word count, typically used when length is 'custom'. Must be between 50 and 10000.
 * @property {boolean} [body.includeTitle] - Whether to automatically generate and include a title.
 * @property {boolean} [body.includeDate] - Whether to automatically include the current date.
 * @property {string} [body.language] - The language of the document (e.g., 'en-US', 'es-ES').
 * @property {('business_letter'|'formal_report'|'academic_paper'|'creative_writing'|'technical_documentation'|'standard')} [body.template] - A predefined template or structure to use.
 * @property {string} [body.additionalInstructions] - Any other specific instructions or constraints for the generation process. Max 2000 characters.
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
    outputFormat: z
      .enum(['pdf', 'docx', 'doc', 'txt', 'html', 'md'])
      .optional(),
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
 * Defines the validation schema for requests to edit or refine an existing document.
 *
 * @const
 * @type {z.ZodObject<{body: z.ZodObject<{documentId: z.ZodString, editInstructions: z.ZodString, outputFormat: z.ZodOptional<z.ZodEnum<['pdf', 'docx', 'doc', 'txt', 'html', 'md']>>}>}>}
 * @property {object} body - The request body.
 * @property {string} body.documentId - The unique identifier of the document to be edited.
 * @property {string} body.editInstructions - The user's instructions on how to modify the document. Must be between 5 and 5000 characters.
 * @property {('pdf'|'docx'|'doc'|'txt'|'html'|'md')} [body.outputFormat] - The desired file format for the edited document. If not provided, the original format may be used.
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
    outputFormat: z
      .enum(['pdf', 'docx', 'doc', 'txt', 'html', 'md'])
      .optional(),
  }),
});

/**
 * Defines the validation schema for requests to export an existing document into a different format.
 *
 * @const
 * @type {z.ZodObject<{body: z.ZodObject<{documentId: z.ZodString, outputFormat: z.ZodEnum<['pdf', 'docx', 'doc', 'txt', 'html', 'md']>}>}>}
 * @property {object} body - The request body.
 * @property {string} body.documentId - The unique identifier of the document to be exported.
 * @property {('pdf'|'docx'|'doc'|'txt'|'html'|'md')} body.outputFormat - The target file format for the export.
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
 * Defines the validation schema for requests to retrieve the details of a specific document.
 * This schema validates the URL parameters.
 *
 * @const
 * @type {z.ZodObject<{params: z.ZodObject<{documentId: z.ZodString}>}>}
 * @property {object} params - The URL parameters.
 * @property {string} params.documentId - The unique identifier of the document to retrieve.
 */
const getDocumentSchema = z.object({
  params: z.object({
    documentId: z.string({
      required_error: 'Document ID is required',
    }),
  }),
});

/**
 * Defines the validation schema for requests to check the status of an asynchronous task.
 * This is used for long-running operations like document generation or editing.
 * This schema validates the URL parameters.
 *
 * @const
 * @type {z.ZodObject<{params: z.ZodObject<{taskId: z.ZodString}>}>}
 * @property {object} params - The URL parameters.
 * @property {string} params.taskId - The unique identifier of the asynchronous task to check.
 */
const checkStatusSchema = z.object({
  params: z.object({
    taskId: z.string({
      required_error: 'Task ID is required',
    }),
  }),
});

/**
 * An object containing all validation schemas for the document drafting module.
 * These schemas are used by middleware to validate incoming request data before it reaches the controller logic.
 * @namespace DocumentValidation
 */
export const DocumentValidation = {
  conversationalRequestSchema,
  generateDocumentSchema,
  editDocumentSchema,
  exportDocumentSchema,
  getDocumentSchema,
  checkStatusSchema,
};