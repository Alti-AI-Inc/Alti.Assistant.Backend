import * as zod from 'zod';
const { z } = zod;

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
    articleType: z
      .enum([
        'blog_post',
        'news_article',
        'technical_article',
        'opinion_piece',
        'how_to_guide',
        'listicle',
        'case_study',
        'research_article',
        'general',
      ])
      .optional(),
    tone: z
      .enum([
        'professional',
        'casual',
        'formal',
        'conversational',
        'persuasive',
        'informative',
        'entertaining',
        'academic',
      ])
      .optional(),
    length: z.enum(['short', 'medium', 'long', 'comprehensive']).optional(),
  }),
});

const writeArticleSchema = z.object({
  body: z.object({
    topic: z.string().optional(),
    content: z.string().optional(),
    articleType: z
      .enum([
        'blog_post',
        'news_article',
        'technical_article',
        'opinion_piece',
        'how_to_guide',
        'listicle',
        'case_study',
        'research_article',
        'general',
      ])
      .optional(),
    tone: z
      .enum([
        'professional',
        'casual',
        'formal',
        'conversational',
        'persuasive',
        'informative',
        'entertaining',
        'academic',
      ])
      .optional(),
    length: z.enum(['short', 'medium', 'long', 'comprehensive']).optional(),
    userId: z.string().optional(), // For guest users
  }),
});

const getConversationHistorySchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

export const ArticleWriterValidation = {
  conversationalRequestSchema,
  writeArticleSchema,
  getConversationHistorySchema,
};
