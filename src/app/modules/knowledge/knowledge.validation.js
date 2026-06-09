/**
 * @file This file defines Zod schemas for validating request payloads and parameters
 *       related to knowledge management operations, including file uploads, processing,
 *       retrieval, deletion, and folder management (creation, retrieval, update, deletion).
 * @module knowledge.validation
 * @author Your Name <your.email@example.com> (Replace with actual author info)
 */

import { z } from 'zod';
import { OWNER_TYPES, FOLDER_COLORS } from './knowledge.constant.js';

/**
 * @typedef {object} UploadFileBody
 * @property {OWNER_TYPES} ownerType - The type of owner for the file (e.g., 'USER', 'BOT').
 * @property {string} [ownerId] - The ID of the owner. Required if ownerType is 'USER' or 'BOT'.
 * @property {string} [folderId] - The ID of the folder where the file should be uploaded.
 * @property {string} [description] - A description for the file.
 * @property {string} [tags] - A JSON string representing an array of tags for the file (e.g., '["tag1", "tag2"]').
 * @property {string} [processImmediately] - A boolean string ('true' or 'false') indicating whether to process the file immediately after upload.
 */
/**
 * Zod schema for validating the request body when uploading a file.
 * Ensures that the `ownerType` is valid and other fields are correctly typed and optional.
 * @type {z.ZodObject<{ body: z.ZodObject<UploadFileBody> }>}
 */
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

/**
 * @typedef {object} ProcessFileParams
 * @property {string} fileId - The unique identifier of the file to be processed.
 */
/**
 * Zod schema for validating the request parameters when processing a file.
 * Ensures that `fileId` is provided and is a non-empty string.
 * @type {z.ZodObject<{ params: z.ZodObject<ProcessFileParams> }>}
 */
export const processFileSchema = z.object({
  params: z.object({
    fileId: z.string().min(1),
  }),
});

/**
 * @typedef {object} GetFilesQuery
 * @property {OWNER_TYPES} ownerType - The type of owner to filter files by (e.g., 'USER', 'BOT').
 * @property {string} [ownerId] - The ID of the owner to filter files by.
 * @property {string} [fileType] - The type of file to filter by (e.g., 'pdf', 'docx').
 * @property {string} [processingStatus] - The processing status to filter by (e.g., 'pending', 'completed', 'failed').
 * @property {string} [isProcessed] - A boolean string ('true' or 'false') to filter by processing status.
 * @property {string} [folderId] - The ID of the folder to filter files within.
 * @property {string} [limit] - The maximum number of files to return.
 * @property {string} [skip] - The number of files to skip for pagination.
 */
/**
 * Zod schema for validating the request query parameters when getting a list of files.
 * Supports filtering by owner, file type, processing status, and pagination.
 * @type {z.ZodObject<{ query: z.ZodObject<GetFilesQuery> }>}
 */
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

/**
 * @typedef {object} GetFileByIdParams
 * @property {string} fileId - The unique identifier of the file to retrieve.
 */
/**
 * @typedef {object} GetFileByIdQuery
 * @property {OWNER_TYPES} ownerType - The type of owner associated with the file (e.g., 'USER', 'BOT').
 * @property {string} [ownerId] - The ID of the owner associated with the file.
 */
/**
 * Zod schema for validating the request parameters and query when getting a file by its ID.
 * Ensures `fileId` is provided and allows filtering by owner.
 * @type {z.ZodObject<{ params: z.ZodObject<GetFileByIdParams>, query: z.ZodObject<GetFileByIdQuery> }>}
 */
export const getFileByIdSchema = z.object({
  params: z.object({
    fileId: z.string().min(1),
  }),
  query: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
  }),
});

/**
 * @typedef {object} DeleteFileParams
 * @property {string} fileId - The unique identifier of the file to delete.
 */
/**
 * @typedef {object} DeleteFileBody
 * @property {OWNER_TYPES} ownerType - The type of owner for the file (e.g., 'USER', 'BOT').
 * @property {string} [ownerId] - The ID of the owner. Required if ownerType is 'USER' or 'BOT'.
 */
/**
 * Zod schema for validating the request parameters and body when deleting a file.
 * Ensures `fileId` is provided and `ownerType` is specified in the body for authorization.
 * @type {z.ZodObject<{ params: z.ZodObject<DeleteFileParams>, body: z.ZodObject<DeleteFileBody> }>}
 */
export const deleteFileSchema = z.object({
  params: z.object({
    fileId: z.string().min(1),
  }),
  body: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
  }),
});

/**
 * @typedef {object} GetStorageStatsQuery
 * @property {OWNER_TYPES} ownerType - The type of owner to retrieve storage statistics for (e.g., 'USER', 'BOT').
 * @property {string} [ownerId] - The ID of the owner to retrieve storage statistics for.
 */
/**
 * Zod schema for validating the request query parameters when getting storage statistics.
 * Requires `ownerType` and optionally `ownerId`.
 * @type {z.ZodObject<{ query: z.ZodObject<GetStorageStatsQuery> }>}
 */
export const getStorageStatsSchema = z.object({
  query: z.object({
    ownerType: z.enum([OWNER_TYPES.USER, OWNER_TYPES.BOT]),
    ownerId: z.string().optional(),
  }),
});

/**
 * @typedef {object} CreateFolderBody
 * @property {string} name - The name of the new folder. Must be between 1 and 100 characters.
 * @property {string} [parentFolderId] - The ID of the parent folder if creating a subfolder.
 * @property {string} [description] - A description for the folder. Maximum 500 characters.
 * @property {string} [color] - A color associated with the folder (e.g., 'blue', 'red').
 * @property {string} [icon] - An icon identifier for the folder.
 * @property {string[]} [tags] - An array of tags for the folder.
 */
/**
 * Zod schema for validating the request body when creating a new folder.
 * Ensures `name` is provided and other fields are correctly typed and optional.
 * @type {z.ZodObject<{ body: z.ZodObject<CreateFolderBody> }>}
 */
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

/**
 * @typedef {object} GetFoldersQuery
 * @property {string} [parentFolderId] - The ID of the parent folder to retrieve subfolders from.
 */
/**
 * Zod schema for validating the request query parameters when getting a list of folders.
 * Allows filtering folders by their parent folder.
 * @type {z.ZodObject<{ query: z.ZodObject<GetFoldersQuery> }>}
 */
export const getFoldersSchema = z.object({
  query: z.object({
    parentFolderId: z.string().optional(),
  }),
});

/**
 * @typedef {object} GetFolderByIdParams
 * @property {string} folderId - The unique identifier of the folder to retrieve.
 */
/**
 * Zod schema for validating the request parameters when getting a folder by its ID.
 * Ensures `folderId` is provided and is a non-empty string.
 * @type {z.ZodObject<{ params: z.ZodObject<GetFolderByIdParams> }>}
 */
export const getFolderByIdSchema = z.object({
  params: z.object({
    folderId: z.string().min(1),
  }),
});

/**
 * @typedef {object} UpdateFolderParams
 * @property {string} folderId - The unique identifier of the folder to update.
 */
/**
 * @typedef {object} UpdateFolderBody
 * @property {string} [name] - The new name for the folder. Must be between 1 and 100 characters.
 * @property {string} [description] - The new description for the folder. Maximum 500 characters.
 * @property {string} [color] - The new color for the folder.
 * @property {string} [icon] - The new icon identifier for the folder.
 * @property {string[]} [tags] - The new array of tags for the folder.
 */
/**
 * Zod schema for validating the request parameters and body when updating an existing folder.
 * Ensures `folderId` is provided and allows partial updates to folder properties.
 * @type {z.ZodObject<{ params: z.ZodObject<UpdateFolderParams>, body: z.ZodObject<UpdateFolderBody> }>}
 */
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

/**
 * @typedef {object} DeleteFolderParams
 * @property {string} folderId - The unique identifier of the folder to delete.
 */
/**
 * @typedef {object} DeleteFolderBody
 * @property {string|boolean} [recursive] - A boolean or boolean string ('true' or 'false') indicating whether to delete contents recursively.
 */
/**
 * Zod schema for validating the request parameters and body when deleting a folder.
 * Ensures `folderId` is provided and allows specifying recursive deletion.
 * @type {z.ZodObject<{ params: z.ZodObject<DeleteFolderParams>, body: z.ZodObject<DeleteFolderBody> }>}
 */
export const deleteFolderSchema = z.object({
  params: z.object({
    folderId: z.string().min(1),
  }),
  body: z.object({
    recursive: z.union([z.string(), z.boolean()]).optional(),
  }),
});

/**
 * @typedef {object} GetFolderContentsParams
 * @property {string} folderId - The unique identifier of the folder whose contents are to be retrieved.
 */
/**
 * Zod schema for validating the request parameters when getting the contents of a folder.
 * Ensures `folderId` is provided.
 * @type {z.ZodObject<{ params: z.ZodObject<GetFolderContentsParams> }>}
 */
export const getFolderContentsSchema = z.object({
  params: z.object({
    folderId: z.string(),
  }),
});

/**
 * An object aggregating all Zod validation schemas for knowledge management operations.
 * This provides a single point of access for all validation rules defined in this module.
 * @namespace KnowledgeValidation
 * @property {z.ZodObject} uploadFileSchema - Schema for validating file upload requests.
 * @property {z.ZodObject} processFileSchema - Schema for validating file processing requests.
 * @property {z.ZodObject} getFilesSchema - Schema for validating requests to retrieve multiple files.
 * @property {z.ZodObject} getFileByIdSchema - Schema for validating requests to retrieve a single file by ID.
 * @property {z.ZodObject} deleteFileSchema - Schema for validating file deletion requests.
 * @property {z.ZodObject} getStorageStatsSchema - Schema for validating requests to retrieve storage statistics.
 * @property {z.ZodObject} createFolderSchema - Schema for validating folder creation requests.
 * @property {z.ZodObject} getFoldersSchema - Schema for validating requests to retrieve multiple folders.
 * @property {z.ZodObject} getFolderByIdSchema - Schema for validating requests to retrieve a single folder by ID.
 * @property {z.ZodObject} updateFolderSchema - Schema for validating folder update requests.
 * @property {z.ZodObject} deleteFolderSchema - Schema for validating folder deletion requests.
 * @property {z.ZodObject} getFolderContentsSchema - Schema for validating requests to retrieve folder contents.
 */
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