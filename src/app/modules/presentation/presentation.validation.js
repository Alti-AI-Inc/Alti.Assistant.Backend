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
    userId: z.string().optional(), // For guest users
  }),
});

const generatePresentationSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Content is required'),
    n_slides: z.number().min(1).max(50).optional(),
    language: z.string().optional(),
    template: z.string().optional(),
    theme: z.string().optional(),
    export_as: z.enum(['pptx', 'pdf']).optional(),
    tone: z.string().optional(),
    verbosity: z.string().optional(),
    image_type: z.string().optional(),
    web_search: z.boolean().optional(),
    include_table_of_contents: z.boolean().optional(),
    include_title_slide: z.boolean().optional(),
    async: z.boolean().optional(),
  }),
});

const checkStatusSchema = z.object({
  params: z.object({
    taskId: z.string({
      required_error: 'Task ID is required',
    }),
  }),
  query: z.object({
    conversationId: z.string().optional(),
  }).optional(),
});

const editPresentationSchema = z.object({
  body: z.object({
    presentationId: z.string({
      required_error: 'Presentation ID is required',
    }),
    slides: z
      .array(
        z.object({
          index: z.number().min(0),
          content: z.record(z.any()),
        })
      )
      .min(1, 'At least one slide edit is required'),
    export_as: z.enum(['pptx', 'pdf']).optional(),
  }),
});

const getPresentationSchema = z.object({
  params: z.object({
    presentationId: z.string({
      required_error: 'Presentation ID is required',
    }),
  }),
});

export const PresentationValidation = {
  conversationalRequestSchema,
  generatePresentationSchema,
  checkStatusSchema,
  editPresentationSchema,
  getPresentationSchema,
};
