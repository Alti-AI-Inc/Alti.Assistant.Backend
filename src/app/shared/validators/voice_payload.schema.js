import { z } from 'zod';

export const VoicePlatformPayloadSchema = z.object({
  callId: z.string().uuid({ message: "callId must be a valid UUID" }),
  callerId: z.string().min(1, { message: "callerId is required" }),
  transcribedIntent: z.string().min(1, { message: "transcribedIntent cannot be empty" }),
  confidenceScore: z.number().min(0).max(1).optional(),
  timestamp: z.string().datetime().optional()
}).strict();
