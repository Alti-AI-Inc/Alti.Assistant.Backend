import * as zod from 'zod';
const { z } = zod;

const imageGenerationSchema = z.object({
  body: z.object({
    message: z
      .string({
        required_error: 'Image prompt is required',
      })
      .min(3, 'Image prompt must be at least 3 characters')
      .max(2000, 'Image prompt too long'),
    conversationId: z.string().optional(),
    imageSize: z.enum(['small', 'standard', 'large']).optional(),
    imageStyle: z
      .enum(['realistic', 'cartoon', 'abstract', 'photorealistic'])
      .optional(),
    imageModel: z.string().optional(),
  }),
});

const imageAnalysisSchema = z.object({
  body: z.object({
    imageData: z
      .string({
        required_error: 'Image data is required for analysis',
      })
      .min(1, 'Image data cannot be empty'),
    message: z.string().min(1).max(1000).optional(),
    conversationId: z.string().optional(),
    analysisType: z
      .enum([
        'describe',
        'extract_text',
        'detect_objects',
        'identify_style',
        'compare',
      ])
      .optional(),
  }),
});

const imagePreferencesSchema = z.object({
  body: z.object({
    size: z.enum(['small', 'standard', 'large']).optional(),
    style: z
      .enum(['realistic', 'cartoon', 'abstract', 'photorealistic'])
      .optional(),
    aspectRatio: z.enum(['1:1', '3:4', '4:3', '16:9']).optional(),
    quality: z.enum(['standard', 'high']).optional(),
  }),
});

// Schema for guest user rate limiting (future enhancement)
const guestRateLimitSchema = z.object({
  headers: z
    .object({
      'x-guest-id': z.string().optional(),
      'x-forwarded-for': z.string().optional(),
    })
    .optional(),
});

// Schema for image file upload validation
const imageFileSchema = z.object({
  file: z
    .object({
      mimetype: z
        .string()
        .refine(
          (type) =>
            [
              'image/png',
              'image/jpeg',
              'image/jpg',
              'image/gif',
              'image/bmp',
              'image/webp',
            ].includes(type),
          'Invalid image format. Only PNG, JPEG, GIF, BMP, and WebP are allowed.'
        ),
      size: z
        .number()
        .max(10 * 1024 * 1024, 'Image file too large. Maximum size is 10MB.'),
    })
    .optional(),
});

// Schema for conversation management
const conversationSchema = z.object({
  params: z.object({
    conversationId: z.string({
      required_error: 'Conversation ID is required',
    }),
  }),
});

// Schema for guest user conversations
const guestUserSchema = z.object({
  params: z.object({
    guestUserId: z
      .string({
        required_error: 'Guest user ID is required',
      })
      .regex(/^[0-9a-fA-F]{24}$/, 'Invalid guest user ID format'),
  }),
});

export const ImageValidation = {
  imageGenerationSchema,
  imageAnalysisSchema,
  imagePreferencesSchema,
  guestRateLimitSchema,
  imageFileSchema,
  conversationSchema,
  guestUserSchema,
};
