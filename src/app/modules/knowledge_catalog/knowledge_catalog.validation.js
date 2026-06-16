import { z } from 'zod';
import { CONCEPT_TYPES, SOURCE_TYPES, OWNER_TYPES } from './knowledge_catalog.constant.js';

export const createBundleSchema = z.object({
  body: z.object({
    bundleId: z.string().min(1, 'Bundle ID must be a non-empty string'),
    title: z.string().min(1, 'Title must be a non-empty string'),
    description: z.string().optional(),
    ownerType: z.enum(Object.values(OWNER_TYPES)).optional(),
    ownerId: z.string().optional(),
    sourceType: z.enum(Object.values(SOURCE_TYPES)).optional(),
    sourceRef: z.string().optional(),
  }),
});

export const updateBundleSchema = z.object({
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    ownerType: z.enum(Object.values(OWNER_TYPES)).optional(),
    ownerId: z.string().optional(),
  }),
});

export const createConceptSchema = z.object({
  body: z.object({
    conceptId: z.string().min(1, 'Concept ID must be a non-empty string'),
    type: z.enum(Object.values(CONCEPT_TYPES)),
    title: z.string().min(1, 'Title must be a non-empty string'),
    description: z.string().optional(),
    resource: z.string().optional(),
    tags: z.array(z.string()).optional(),
    frontmatter: z.record(z.any()).optional(),
    body: z.string().optional(),
    links: z.array(z.string()).optional(),
  }),
});

export const searchCatalogSchema = z.object({
  body: z.object({
    query: z.string().min(1, 'Search query must be a non-empty string'),
    type: z.enum(Object.values(CONCEPT_TYPES)).optional(),
    tags: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),
});

export default {
  createBundleSchema,
  updateBundleSchema,
  createConceptSchema,
  searchCatalogSchema,
};
