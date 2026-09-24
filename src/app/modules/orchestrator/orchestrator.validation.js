import { z } from 'zod';

/**
 * Input validation schemas for orchestrator endpoints.
 * Prevents malformed, oversized, or missing payloads from reaching the LLM pipeline.
 */

const routePromptSchema = z.object({
  body: z.object({
    message: z.string({ required_error: 'Message is required' }).trim().min(1, 'Message cannot be empty').max(50000, 'Message too long (max 50,000 chars)'),
    prompt: z.string().optional(),
    stream: z.boolean().optional(),
    conversationId: z.string().max(100).optional(),
    knowledgebaseId: z.string().max(100).optional(),
    timezone: z.string().max(100).optional(),
    localDate: z.string().max(200).optional(),
    localTime: z.string().max(100).optional(),
    systemInstruction: z.string().max(10000).optional(),
  }).passthrough(),
});

const classifySchema = z.object({
  body: z.object({
    message: z.string({ required_error: 'Message is required' }).trim().min(1).max(50000),
  }).passthrough(),
});

export const OrchestratorValidation = {
  routePromptSchema,
  classifySchema,
};

export default OrchestratorValidation;
