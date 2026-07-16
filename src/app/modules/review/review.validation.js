import * as zod from 'zod';
const { z } = zod;

const conversationalRequestSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Message is required',
      })
      .min(1, 'Message cannot be empty')
      .max(5000, 'Message too long'),
    conversationId: z.string().optional(),
    // userId should not be provided by the client for security reasons.
    // The server should derive the user's identity from authentication context
    // (e.g., JWT, session) or generate a guest ID internally.
    // Allowing client-provided userId can lead to impersonation or IDOR if not handled carefully server-side.
    // userId: z.string().optional(), // Removed due to security vulnerability
    textContent: z.string().optional(), // Direct text to rewrite
  }),
});

const rewriteContentSchema = z.object({
  body: z.object({
    textContent: z.string().optional(), // Text to rewrite (if not uploading a file)
    intent: z
      .enum([
        'general_rewrite',
        'formal',
        'casual',
        'professional',
        'academic',
        'creative',
        'simplify',
        'expand',
        'shorten',
        'improve_clarity',
        'change_tone',
        'fix_grammar',
        'paraphrase',
      ])
      .optional(),
    style: z
      .enum([
        'formal',
        'casual',
        'professional',
        'academic',
        'creative',
        'technical',
        'conversational',
        'persuasive',
      ])
      .optional(),
    mode: z
      .enum([
        'preserve_meaning',
        'improve_clarity',
        'simplify',
        'expand',
        'shorten',
        'paraphrase',
      ])
      .optional(),
    targetAudience: z.string().max(200).optional(),
    additionalInstructions: z.string().max(1000).optional(),
    outputFormat: z.enum(['text', 'file', 'both']).optional(),
    // userId should not be provided by the client for security reasons.
    // The server should derive the user's identity from authentication context
    // (e.g., JWT, session) or generate a guest ID internally.
    // Allowing client-provided userId can lead to impersonation or IDOR if not handled carefully server-side.
    // userId: z.string().optional(), // Removed due to security vulnerability
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const RewriteValidation = {
  conversationalRequestSchema,
  rewriteContentSchema,
  getConversationHistorySchema,
};