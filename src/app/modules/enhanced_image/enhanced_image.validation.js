import * as zod from 'zod';
const { z } = zod;

const generateImageSchema = z.object({
  body: z.object({
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
    conversationId: z.string().optional(),
    aspectRatio: z.string().optional(),
    negativePrompt: z.string().optional(),
    userId: z.string().optional(),
  }),
});

const editImageSchema = z.object({
  body: z.object({
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
    imageBase64: z
      .string({
        required_error: 'Image base64 is required',
      })
      .min(1, 'Image base64 cannot be empty'),
    conversationId: z.string().optional(),
    aspectRatio: z.string().optional(),
    userId: z.string().optional(),
  }),
});

const analyzeIntentSchema = z.object({
  body: z.object({
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
  }),
});

const analyzeImageIntentSchema = z.object({
  body: z
    .object({
      request: z.string().optional(),
      userMessage: z.string().optional(),
      hasImage: z.boolean().optional(),
      sessionId: z.string().optional(),
      conversationId: z.string().optional(),
    })
    .refine((data) => data.request || data.userMessage, {
      message: 'Either request or userMessage is required',
    }),
});

const evaluatePromptSchema = z.object({
  body: z.object({
    prompt: z
      .string({
        required_error: 'Prompt is required',
      })
      .min(1, 'Prompt cannot be empty')
      .max(2000, 'Prompt too long'),
    conversationId: z.string().optional(),
  }),
});

const addDetailSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
    detail: z
      .string({
        required_error: 'Detail is required',
      })
      .min(1, 'Detail cannot be empty')
      .max(2000, 'Detail too long'),
  }),
});

const buildEnhancedPromptSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
  }),
});

const finalizePromptSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
  }),
});

const generateFromConversationSchema = z.object({
  body: z.object({
    conversationId: z.string({
      required_error: 'ConversationId is required',
    }),
    aspectRatio: z.string().optional(),
    negativePrompt: z.string().optional(),
    userId: z.string().optional(),
  }),
});

export const EnhancedImageValidation = {
  generateImageSchema,
  editImageSchema,
  analyzeIntentSchema,
  analyzeImageIntentSchema,
  evaluatePromptSchema,
  addDetailSchema,
  finalizePromptSchema,
  buildEnhancedPromptSchema,
  generateFromConversationSchema,
};
