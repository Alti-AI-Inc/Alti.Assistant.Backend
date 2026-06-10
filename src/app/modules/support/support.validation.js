import { z } from 'zod';

export const supportValidationSchema = z.object({
  body: z.object({
    //   // userId: z.string({
    //   //   required_error: 'User ID is required',
    //   // }),
    subject: z.string().min(1, 'Subject is required'),
    message: z.string().min(1, 'Message is required'),
    status: z.enum(['open', 'pending', 'closed']).optional(),
    isRead: z.boolean().optional(),
  }),
  params: z.object({
    // Validate URL parameter 'id' to ensure it's a valid MongoDB ObjectId format.
    // This prevents invalid IDs from reaching the database layer, improving security and error handling.
    id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format'),
  }),
});