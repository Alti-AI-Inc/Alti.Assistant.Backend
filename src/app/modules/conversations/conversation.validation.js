import * as zod from 'zod';
const { z } = zod;

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system'], {
    required_error: 'Message role is required',
    invalid_type_error: 'Role must be user, assistant, or system',
  }),
  content: z.string({
    required_error: 'Message content is required',
  }).min(1, 'Message content cannot be empty'),
  metadata: z.record(z.any()).optional(),
});

const createConversationSchema = z.object({
  body: z.object({
    title: z.string().max(255, 'Title must be less than 255 characters').optional(),
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }).min(1, 'Conversation ID cannot be empty'),
    initialMessage: messageSchema.optional(),
    metadata: z.object({
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().positive().optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      customData: z.record(z.any()).optional(),
    }).optional(),
    is_deep_search: z.boolean().optional(),
  }),
});

const addMessageSchema = z.object({
  body: messageSchema,
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const updateTitleSchema = z.object({
  body: z.object({
    title: z.string({
      required_error: 'Title is required',
    }).min(1, 'Title cannot be empty').max(255, 'Title must be less than 255 characters'),
  }),
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const updateMetadataSchema = z.object({
  body: z.object({
    metadata: z.object({
      model: z.string().optional(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().positive().optional(),
      tags: z.array(z.string()).optional(),
      category: z.string().optional(),
      customData: z.record(z.any()).optional(),
    }),
  }),
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const conversationParamsSchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const getUserConversationsSchema = z.object({
  query: z.object({
    page: z.string().regex(/^\d+$/, 'Page must be a number').optional(),
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
    status: z.enum(['active', 'archived', 'deleted']).optional(),
    sortBy: z.string().optional(),
    sortOrder: z.string().regex(/^(-1|1)$/, 'Sort order must be 1 or -1').optional(),
    search: z.string().optional(),
    category: z.string().optional(),
    is_deep_search: z.string().regex(/^(true|false)$/, 'is_deep_search must be true or false').optional(),
  }),
});

const getConversationMessagesSchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
  query: z.object({
    page: z.string().regex(/^\d+$/, 'Page must be a number').optional(),
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
    beforeDate: z.string().datetime().optional(),
  }),
});

const searchConversationsSchema = z.object({
  query: z.object({
    q: z.string({
      required_error: 'Search term is required',
    }).min(1, 'Search term cannot be empty'),
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
    category: z.string().optional(),
  }),
});

const bulkOperationSchema = z.object({
  body: z.object({
    conversationIds: z.array(z.string({
      required_error: 'Conversation ID is required',
    })).min(1, 'At least one conversation ID is required'),
  }),
});

const addTagsSchema = z.object({
  body: z.object({
    tags: z.array(z.string().min(1, 'Tag cannot be empty')).min(1, 'At least one tag is required'),
  }),
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

const getCategoryConversationsSchema = z.object({
  params: z.object({
    category: z.string({
      required_error: 'Category is required',
    }),
  }),
  query: z.object({
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
    sortBy: z.string().optional(),
    sortOrder: z.string().regex(/^(-1|1)$/, 'Sort order must be 1 or -1').optional(),
  }),
});

const getRecentConversationsSchema = z.object({
  query: z.object({
    limit: z.string().regex(/^\d+$/, 'Limit must be a number').optional(),
  }),
});

export const ConversationValidation = {
  createConversationSchema,
  addMessageSchema,
  updateTitleSchema,
  updateMetadataSchema,
  conversationParamsSchema,
  getUserConversationsSchema,
  getConversationMessagesSchema,
  searchConversationsSchema,
  bulkOperationSchema,
  addTagsSchema,
  getCategoryConversationsSchema,
  getRecentConversationsSchema,
};
