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
    id: z.string(), // validate URL param like /:userId
  }),
});
