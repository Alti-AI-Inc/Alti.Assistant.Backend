import { z } from 'zod';

const emailToolsValidation = z.object({
  connectedAccountId: z.string().min(1, 'connectedAccountId is required'),
  to: z.string().email('Invalid email format'),
  subject: z.string().min(1, 'Subject is required'),
  body: z.string().min(1, 'Body is required'),
});
export const linkedinPostSchema = z.object({
  connectedAccountId: z.string().min(1, 'connectedAccountId is required'),
  content: z.string().min(1, 'Content is required'),
});
export const composioValidation = {
  emailToolsValidation,
  linkedinPostSchema,
};
