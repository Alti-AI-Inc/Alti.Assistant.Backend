import { z } from 'zod';
import {
  MONITOR_STATUS,
  MONITOR_TRIGGER_PERIOD_REGEX,
  MONITOR_TRIGGER_TYPE,
} from './monitor.constant.js';

const searchConfigZodSchema = z.object({
  query: z.string({ required_error: 'Search query is required' }).min(1),
  numResults: z.number().int().min(1).max(100).optional(),
  contents: z.record(z.any()).optional(),
});

const triggerZodSchema = z
  .object({
    type: z.enum(MONITOR_TRIGGER_TYPE),
    period: z
      .string()
      .regex(MONITOR_TRIGGER_PERIOD_REGEX, 'Period must look like "1h" or "7d"'),
  })
  .nullable();

const webhookZodSchema = z.object({
  url: z
    .string({ required_error: 'Webhook url is required' })
    .url()
    .refine((v) => v.startsWith('https://'), 'Webhook url must use https'),
  events: z.array(z.string()).optional(),
});

// Persists a Monitor object that was already created on Exa — this
// module intentionally does not call the Exa API itself, matching the
// search/contents modules' pattern.
const createMonitorZodSchema = z.object({
  body: z.object({
    exaMonitorId: z.string({ required_error: 'exaMonitorId is required' }),
    name: z.string().optional(),
    status: z.enum(MONITOR_STATUS).optional(),
    search: searchConfigZodSchema,
    trigger: triggerZodSchema.optional(),
    outputSchema: z.record(z.any()).nullable().optional(),
    metadata: z.record(z.any()).nullable().optional(),
    webhook: webhookZodSchema,
    // Only present in the payload immediately after creation — Exa
    // never returns it again after the initial create response.
    webhookSecret: z.string().optional(),
    nextRunAt: z.coerce.date().nullable().optional(),
    exaCreatedAt: z.coerce.date().optional(),
    exaUpdatedAt: z.coerce.date().optional(),
  }),
});

const updateMonitorZodSchema = z.object({
  body: z
    .object({
      name: z.string().optional(),
      status: z.enum(MONITOR_STATUS).optional(),
      search: searchConfigZodSchema.partial().optional(),
      trigger: triggerZodSchema.optional(),
      outputSchema: z.record(z.any()).nullable().optional(),
      metadata: z.record(z.any()).nullable().optional(),
      webhook: webhookZodSchema.partial().optional(),
      nextRunAt: z.coerce.date().nullable().optional(),
      exaUpdatedAt: z.coerce.date().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required to update',
    }),
});

export const MonitorValidation = {
  createMonitorZodSchema,
  updateMonitorZodSchema,
};