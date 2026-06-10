import * as zod from 'zod';
const { z } = zod;

const analyzeRequestSchema = z.object({
  body: z.object({
    // Message is the core input for the analysis. It is required and has size limits
    // to ensure prompt quality and prevent abuse.
    message: z
      .string({
        required_error: 'A message for analysis is required.',
      })
      .min(1, 'Message cannot be empty.')
      .max(10000, 'Message too long (max 10000 characters)'),

    // conversationId is optional. If not provided, a new conversation will be created.
    // If provided, it must be a valid UUID to continue an existing chat session.
    conversationId: z.string().uuid('Invalid Conversation ID format.').optional(),

    // CRITICAL: The userId must NOT be passed in the request body.
    // It must be extracted from the authenticated user's session/token (e.g., req.user.id)
    // by an authentication middleware. This is essential for data isolation and security,
    // preventing one user from accessing or affecting another user's data or usage metrics.
    // userId: z.string().optional(), // REMOVED FOR SECURITY

    // analysisType allows the user to specify the type of analysis.
    // It's optional to allow for a default 'general' analysis.
    analysisType: z
      .enum([
        'general',
        'sentiment',
        'summary',
        'key_points',
        'entity_extraction',
        'topic_classification',
        'language_detection',
      ])
      .optional(),

    // outputFormat allows the user to choose the response structure.
    // It's optional to allow for a default system format.
    outputFormat: z.enum(['structured', 'narrative']).optional(),
  }),
  // Note: File upload validation (e.g., for req.file) is not handled here.
  // It should be performed by a dedicated middleware (like multer) before this validation step
  // to manage personal file storage and associate files with the authenticated user.
});

const getConversationHistorySchema = z.object({
  params: z.object({
    // conversationId is required in the URL path to fetch a specific chat session's history.
    // Validating it as a UUID ensures data integrity and prevents invalid requests to the database.
    conversationId: z
      .string({
        required_error: 'Conversation ID is required.',
      })
      .uuid('Invalid Conversation ID format.'),
  }),
});

export const DocumentAnalysisValidation = {
  analyzeRequestSchema,
  getConversationHistorySchema,
};