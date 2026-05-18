import express from 'express';
import multer from 'multer';
import { knowledgeBankController } from './knowledge_bank.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage(); // Store in memory

const fileFilter = (req, file, cb) => {
  // Log the file details for debugging
  console.log('[KnowledgeBank] File upload attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    fieldname: file.fieldname,
    size: file.size,
  });

  // Define allowed file types (can be made configurable)
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/csv',
    'application/json',
    'text/xml',
    'application/xml',
    'text/html',
    'text/markdown',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ];

  // Allow all file types for now (can be restricted later)
  cb(null, true);

  // Uncomment to enforce file type restrictions:
  // if (allowedTypes.includes(file.mimetype)) {
  //   cb(null, true);
  // } else {
  //   cb(new Error('Invalid file type. Only documents are allowed.'), false);
  // }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (can be configured)
  },
});

/**
 * Knowledge Bank Routes
 * All routes require authentication
 */

// ==================== FILE ROUTES ====================

// Upload file to knowledge bank (can include folderId in body)
router.post(
  '/upload',
  auth(),
  extractTenantContext,
  checkStorageLimit,
  upload.any(),
  checkRAGFeature,
  knowledgeBankController.uploadFile
);

// Get user's files (can filter by folderId in query)
router.get(
  '/files',
  auth(),
  extractTenantContext,
  knowledgeBankController.getUserFiles
);

// Get file by ID
router.get(
  '/files/:fileId',
  auth(),
  extractTenantContext,
  knowledgeBankController.getFileById
);

// Delete file
router.delete(
  '/files/:fileId',
  auth(),
  extractTenantContext,
  knowledgeBankController.deleteFile
);

// Process file (add to RAG system)
router.post(
  '/files/:fileId/process',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgeBankController.processFile
);

// ==================== FOLDER ROUTES ====================

// Create a new folder
router.post(
  '/folders',
  auth(),
  extractTenantContext,
  checkRAGFeature,
  knowledgeBankController.createFolder
);

// Get user's folders (can filter by parentFolderId in query)
router.get(
  '/folders',
  auth(),
  extractTenantContext,
  knowledgeBankController.getUserFolders
);

// Get folder by ID with ancestors
router.get(
  '/folders/:folderId',
  auth(),
  extractTenantContext,
  knowledgeBankController.getFolderById
);

// Update folder
router.put(
  '/folders/:folderId',
  auth(),
  extractTenantContext,
  knowledgeBankController.updateFolder
);

// Delete folder (add ?recursive=true to delete contents)
router.delete(
  '/folders/:folderId',
  auth(),
  extractTenantContext,
  knowledgeBankController.deleteFolder
);

// Get folder contents (files and subfolders)
router.get(
  '/folders/:folderId/contents',
  auth(),
  extractTenantContext,
  knowledgeBankController.getFolderContents
);

// ==================== STATS ROUTES ====================

// Get user's storage statistics
router.get(
  '/stats',
  auth(),
  extractTenantContext,
  knowledgeBankController.getUserStorageStats
);

export default router;
