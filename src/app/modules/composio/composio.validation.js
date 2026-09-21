import { z } from 'zod';

const createSessionZodSchema = z.object({
  body: z.object({
    mcp: z.boolean().optional(),
    sandbox: z.boolean().optional(),
  }),
});

const executeToolZodSchema = z.object({
  body: z.object({
    params: z.record(z.any()),
    sessionId: z.string().optional(),
  }),
});

const initiateConnectionZodSchema = z.object({
  body: z.object({
    toolkit: z.string({
      required_error: 'Toolkit slug is required',
    }),
  }),
});

const subscribeTriggerZodSchema = z.object({
  body: z.object({
    slug: z.string({
      required_error: 'Trigger slug is required',
    }),
    config: z.record(z.any()).optional(),
  }),
});

export const ComposioValidation = {
  createSessionZodSchema,
  executeToolZodSchema,
  initiateConnectionZodSchema,
  subscribeTriggerZodSchema,
};
