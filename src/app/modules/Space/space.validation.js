import { z } from 'zod';

const createSpaceZodSchema = z.object({
  body: z.object({
    name: z.string({ required_error: 'Space name is required' }).trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    isPrivate: z.boolean().optional(),
  }),
});

const updateSpaceZodSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    isPrivate: z.boolean().optional(),
    status: z.enum(['active', 'archived']).optional(),
  }).refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required to update',
  }),
});

const addMemberZodSchema = z.object({
  body: z.object({
    user: z.string({ required_error: 'User id is required' }),
    role: z.enum(['editor', 'viewer']).default('viewer'),
  }),
});

export const SpaceValidation = { createSpaceZodSchema, updateSpaceZodSchema, addMemberZodSchema };