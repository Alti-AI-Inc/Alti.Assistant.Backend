import { z } from 'zod';
import { OWNER_TYPES, FOLDER_COLORS } from './knowledge.constant.js';

// Upload file validation
export const uploadFileSchema = z.object({
  body: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
    folderId: z.string().optional(),
    description: z.string().optional(),
    tags: z.string().optional(), // JSON string
    processImmediately: z.string().optional(),
  }),
});

// Process file validation
export const processFileSchema = z.object({
  params: z.object({
    fileId: z.string().min(1),
  }),
});

// Get files validation
export const getFilesSchema = z.object({
  query: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
    fileType: z.string().optional(),
    processingStatus: z.string().optional(),
    isProcessed: z.string().optional(),
    folderId: z.string().optional(),
    limit: z.string().optional(),
    skip: z.string().optional(),
  }),
});

// Get file by ID validation
export const getFileByIdSchema = z.object({
  params: z.object({
    fileId: z.string().min(1),
  }),
  query: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
  }),
});

// Delete file validation
export const deleteFileSchema = z.object({
  params: z.object({
    fileId: z.string().min(1),
  }),
  body: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
  }),
});

// Get storage stats validation
export const getStorageStatsSchema = z.object({
  query: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
  }),
});

// Create folder validation
export const createFolderSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    parentFolderId: z.string().optional(),
    description: z.string().max(500).optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

// Get folders validation
export const getFoldersSchema = z.object({
  query: z.object({
    parentFolderId: z.string().optional(),
  }),
});

// Get folder by ID validation
export const getFolderByIdSchema = z.object({
  params: z.object({
    folderId: z.string().min(1),
  }),
});

// Update folder validation
export const updateFolderSchema = z.object({
  params: z.object({
    folderId: z.string().min(1),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    color: z.string().optional(),
    icon: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

// Delete folder validation
export const deleteFolderSchema = z.object({
  params: z.object({
    folderId: z.string().min(1),
  }),
  body: z.object({
    recursive: z.union([z.string(), z.boolean()]).optional(),
  }),
});

// Get folder contents validation
export const getFolderContentsSchema = z.object({
  params: z.object({
    folderId: z.string(),
  }),
});

export const KnowledgeValidation = {
  uploadFileSchema,
  processFileSchema,
  getFilesSchema,
  getFileByIdSchema,
  deleteFileSchema,
  getStorageStatsSchema,
  createFolderSchema,
  getFoldersSchema,
  getFolderByIdSchema,
  updateFolderSchema,
  deleteFolderSchema,
  getFolderContentsSchema,
};
