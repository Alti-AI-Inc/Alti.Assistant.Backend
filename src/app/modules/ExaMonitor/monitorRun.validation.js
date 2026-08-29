import { z } from 'zod';
import {
  MONITOR_RUN_FAIL_REASON,
  MONITOR_RUN_STATUS,
} from './monitorRun.constant.js';

const citationZodSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
});

const outputZodSchema = z.object({
  results: z.array(z.record(z.any())).optional(),
  content: z.any().optional(),
  grounding: z
    .array(
      z.object({
        field: z.string().min(1),
        citations: z.array(citationZodSchema).optional(),
        confidence: z.enum(['low', 'medium', 'high']).optional(),
      })
    )
    .optional(),
});

const monitorRunFields = {
  exaRunId: z.string().min(1).optional(),
  status: z.enum(MONITOR_RUN_STATUS).optional(),
  output: outputZodSchema.nullable().optional(),
  failReason: z.enum(MONITOR_RUN_FAIL_REASON).optional(),
  startedAt: z.coerce.date().optional(),
  completedAt: z.coerce.date().optional(),
  failedAt: z.coerce.date().optional(),
  cancelledAt: z.coerce.date().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  exaCreatedAt: z.coerce.date().optional(),
  exaUpdatedAt: z.coerce.date().optional(),
};

const createMonitorRunZodSchema = z.object({
  body: z.object({
    ...monitorRunFields,
    exaRunId: z.string({ required_error: 'exaRunId is required' }).min(1),
  }),
});

const updateMonitorRunZodSchema = z.object({
  body: z
    .object(monitorRunFields)
    .omit({ exaRunId: true })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one field is required to update',
    }),
});

export const MonitorRunValidation = {
  createMonitorRunZodSchema,
  updateMonitorRunZodSchema,
};
