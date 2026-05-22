import { SafeGoogleGenerativeAIEmbeddings } from '../../../shared/embeddings.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { RAGSystem } from 'rag-system-pgvector';
import { Storage } from '@google-cloud/storage';
import httpStatus from 'http-status';
import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import ApiError from '../../../errors/ApiError.js';
import KnowledgeFile from './knowledge.model.js';
import KnowledgeFolder from './knowledge_folder.model.js';
import { fileProcessor } from './services/fileProcessor.js';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';
import {
  KNOWLEDGE_CONFIG,
  RAG_DATABASE_CONFIG,
  OWNER_TYPES,
  PROCESSING_STATUS,
  SEARCH_TYPES,
  QUERY_MODES,
  STORAGE_CONFIG,
} from './knowledge.constant.js';

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: config.google?.gcp_project_id,
  keyFilename: 'alti_gcp.json',
});

// Initialize Gemini embeddings
const embeddings = new SafeGoogleGenerativeAIEmbeddings({
  apiKey: config.gemini_secret_key,
  targetDimension: 768,
});

// Initialize Gemini LLM
const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: KNOWLEDGE_CONFIG.MODEL,
  temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
});

// Initialize RAG System
const ragConfig = {
  database: {
    host: RAG_DATABASE_CONFIG.HOST,
    port: RAG_DATABASE_CONFIG.PORT,
    database: RAG_DATABASE_CONFIG.DATABASE,
    username: RAG_DATABASE_CONFIG.USERNAME,
    password: RAG_DATABASE_CONFIG.PASSWORD,
  },
  embeddings: embeddings,
  llm: llm,
  embeddingDimensions: 768, // Gemini text-embedding-004 dimensions
};

export const rag = new RAGSystem(ragConfig);

/**
 * Unified Knowledge Service
 * Handles both user files (Knowledge Bank) and bot files (Knowledge Base)
 */
class KnowledgeService {
  /**
   * Upload file to knowledge system
   * @param {Object} file - Uploaded file object
   * @param {string} ownerType - 'user' or 'bot'
   * @param {string} ownerId - userId or botId
   * @param {Object} options - Additional options
   * @param {Object} req - Request object for tenant context
   */
  async uploadFile(file, ownerType, ownerId, options = {}, req = null) {
    try {
      logger.info(
        `[Knowledge] Uploading file for ${ownerType}: ${ownerId}, file: ${file.originalname}`
      );

      // Validate file
      if (!file || !file.buffer) {
        throw new Error('Invalid file: buffer is required');
      }

      // Validate owner type
      if (!Object.values(OWNER_TYPES).includes(ownerType)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Invalid owner type: ${ownerType}`
        );
      }

      // Validate folder for user files
      if (ownerType === OWNER_TYPES.USER && options.folderId) {
        const folderQuery = {
          _id: options.folderId,
          userId: ownerId,
          isActive: true,
        };
        const folder = await KnowledgeFolder.findOne(
          req ? withTenantFilter(req, folderQuery) : folderQuery
        );
        if (!folder) {
          throw new ApiError(
            httpStatus.NOT_FOUND,
            'Folder not found or does not belong to user'
          );
        }
      }

      // Extract file details
      const fileExtension = file.originalname.split('.').pop().toLowerCase();
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.originalname}`;

      // Upload to GCS
      const uploadResult = await fileProcessor.uploadToGCS(
        file.buffer,
        fileName,
        {
          ownerType,
          ownerId,
          folderId: options.folderId,
          originalName: file.originalname,
        }
      );

      logger.info(
        `[Knowledge] File uploaded to GCS: ${uploadResult.publicUrl}`
      );

      // Save file record
      const fileData = {
        fileName: fileName,
        originalName: file.originalname,
        fileType: fileExtension,
        fileSize: file.size,
        gcsUrl: uploadResult.publicUrl,
        gcsPath: uploadResult.gcsPath,
        gcsBucket: uploadResult.bucket,
        ownerType: ownerType,
        ownerId: ownerId,
        folderId: options.folderId || null,
        description: options.description || '',
        tags: options.tags || [],
        uploadSource: options.uploadSource || 'web',
        ipAddress: options.ipAddress,
        visibility: options.visibility || 'private',
        isActive: true,
        processingStatus: PROCESSING_STATUS.PENDING,
        metadata: options.metadata || {},
      };

      const fileRecord = new KnowledgeFile(
        req ? withTenantContext(req, fileData) : fileData
      );

      await fileRecord.save();
      logger.info(`[Knowledge] File record saved: ${fileRecord._id}`);

      // Update folder stats for user files
      if (ownerType === OWNER_TYPES.USER && options.folderId) {
        const folder = await KnowledgeFolder.findById(options.folderId);
        if (folder) {
          await folder.updateStats(1, file.size);
        }
      }

      return {
        success: true,
        fileId: fileRecord._id.toString(),
        fileName: fileRecord.originalName,
        fileType: fileRecord.fileType,
        fileSize: fileRecord.fileSize,
        formattedFileSize: fileRecord.formattedFileSize,
        gcsUrl: fileRecord.gcsUrl,
        folderId: fileRecord.folderId,
        ownerType: fileRecord.ownerType,
        uploadedAt: fileRecord.createdAt,
        processingStatus: fileRecord.processingStatus,
      };
    } catch (error) {
      logger.error('[Knowledge] Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Process file using RAG system
   * @param {string} fileId - File ID from database
   */
  async processFile(fileId) {
    try {
      logger.info(`[Knowledge] Processing file: ${fileId}`);

      // Get file record
      const fileRecord = await KnowledgeFile.findById(fileId);
      if (!fileRecord) {
        throw new ApiError(httpStatus.NOT_FOUND, 'File not found');
      }

      // Update status to processing
      fileRecord.processingStatus = PROCESSING_STATUS.PROCESSING;
      await fileRecord.save();

      // Initialize RAG system
      await rag.initialize();

      // Download file from GCS
      const bucket = storage.bucket(STORAGE_CONFIG.GCS_BUCKET);
      const file = bucket.file(fileRecord.gcsPath);
      const [buffer] = await file.download();

      logger.info(
        `[Knowledge] Downloaded file from GCS: ${fileRecord.gcsPath}`
      );

      // Process with RAG system
      const ragResult = await rag.addDocumentFromBuffer(
        buffer,
        fileRecord.originalName,
        fileRecord.fileType,
        {
          ownerType: fileRecord.ownerType,
          ownerId: fileRecord.ownerId,
          fileId: fileRecord._id.toString(),
          gcsUrl: fileRecord.gcsUrl,
        }
      );

      logger.info(
        `[Knowledge] RAG processing complete: documentId=${ragResult.documentId}, chunks=${ragResult.chunkCount}`
      );

      // Update file record
      await fileRecord.markAsProcessed(
        ragResult.documentId,
        ragResult.chunkCount,
        ragResult.title || fileRecord.originalName
      );

      return {
        success: true,
        fileId: fileRecord._id.toString(),
        documentId: ragResult.documentId,
        title: ragResult.title,
        chunkCount: ragResult.chunkCount,
        processingStatus: PROCESSING_STATUS.COMPLETED,
        processedAt: new Date(),
      };
    } catch (error) {
      logger.error('[Knowledge] Error processing file:', error);

      // Mark as failed
      try {
        const fileRecord = await KnowledgeFile.findById(fileId);
        if (fileRecord) {
          await fileRecord.markProcessingFailed(error);
        }
      } catch (updateError) {
        logger.error('[Knowledge] Error updating failed status:', updateError);
      }

      throw error;
    }
  }

  /**
   * Get files by owner
   * @param {string} ownerType - 'user' or 'bot'
   * @param {string} ownerId - userId or botId
   * @param {Object} filters - Optional filters
   * @param {Object} req - Request object for tenant context
   */
  async getFiles(ownerType, ownerId, filters = {}, req = null) {
    try {
      logger.info(`[Knowledge] Retrieving files for ${ownerType}: ${ownerId}`);

      const files = await KnowledgeFile.findByOwner(ownerType, ownerId, {
        fileType: filters.fileType,
        processingStatus: filters.processingStatus,
        isProcessed: filters.isProcessed,
        folderId: filters.folderId,
        limit: filters.limit || 100,
        skip: filters.skip || 0,
      });

      return files.map((file) => ({
        id: file._id.toString(),
        fileName: file.originalName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        formattedFileSize: file.formattedFileSize,
        gcsUrl: file.gcsUrl,
        documentId: file.documentId,
        title: file.title,
        description: file.description,
        tags: file.tags,
        chunkCount: file.chunkCount,
        isProcessed: file.isProcessed,
        processingStatus: file.processingStatus,
        processingError: file.processingError,
        processedAt: file.processedAt,
        folderId: file.folderId,
        visibility: file.visibility,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }));
    } catch (error) {
      logger.error('[Knowledge] Error retrieving files:', error);
      throw error;
    }
  }

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @param {string} ownerType - Owner type for verification
   * @param {string} ownerId - Owner ID for verification
   * @param {Object} req - Request object for tenant context
   */
  async getFileById(fileId, ownerType, ownerId, req = null) {
    try {
      logger.info(`[Knowledge] Retrieving file: ${fileId}`);

      const query = {
        _id: fileId,
        ownerType: ownerType,
        ownerId: ownerId,
        isActive: true,
      };

      const file = await KnowledgeFile.findOne(
        req ? withTenantFilter(req, query) : query
      );

      if (!file) {
        return null;
      }

      return {
        id: file._id.toString(),
        fileName: file.originalName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        formattedFileSize: file.formattedFileSize,
        gcsUrl: file.gcsUrl,
        gcsPath: file.gcsPath,
        documentId: file.documentId,
        title: file.title,
        description: file.description,
        tags: file.tags,
        chunkCount: file.chunkCount,
        isProcessed: file.isProcessed,
        processingStatus: file.processingStatus,
        processingError: file.processingError,
        processedAt: file.processedAt,
        folderId: file.folderId,
        visibility: file.visibility,
        metadata: file.metadata,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    } catch (error) {
      logger.error('[Knowledge] Error retrieving file:', error);
      throw error;
    }
  }

  /**
   * Delete file
   * @param {string} fileId - File ID
   * @param {string} ownerType - Owner type
   * @param {string} ownerId - Owner ID
   * @param {Object} req - Request object for tenant context
   */
  async deleteFile(fileId, ownerType, ownerId, req = null) {
    try {
      logger.info(`[Knowledge] Deleting file: ${fileId}`);

      const query = {
        _id: fileId,
        ownerType: ownerType,
        ownerId: ownerId,
        isActive: true,
      };

      const file = await KnowledgeFile.findOne(
        req ? withTenantFilter(req, query) : query
      );

      if (!file) {
        return false;
      }

      // Soft delete in database
      await file.softDelete();

      // Update folder stats if applicable
      if (file.ownerType === OWNER_TYPES.USER && file.folderId) {
        const folder = await KnowledgeFolder.findById(file.folderId);
        if (folder) {
          await folder.updateStats(-1, -file.fileSize);
        }
      }

      // Optional: Delete from RAG system
      if (file.isProcessed && file.documentId) {
        try {
          await rag.initialize();
          await rag.deleteDocument(file.documentId);
          logger.info(
            `[Knowledge] Document deleted from RAG: ${file.documentId}`
          );
        } catch (ragError) {
          logger.error('[Knowledge] Error deleting from RAG:', ragError);
        }
      }

      logger.info(`[Knowledge] File deleted successfully: ${fileId}`);
      return true;
    } catch (error) {
      logger.error('[Knowledge] Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   * @param {string} ownerType - Owner type
   * @param {string} ownerId - Owner ID
   * @param {Object} req - Request object for tenant context
   */
  async getStorageStats(ownerType, ownerId, req = null) {
    try {
      logger.info(
        `[Knowledge] Getting storage stats for ${ownerType}: ${ownerId}`
      );

      const totalFiles = await KnowledgeFile.countByOwner(
        ownerType,
        ownerId,
        true
      );
      const totalStorage = await KnowledgeFile.getTotalStorageByOwner(
        ownerType,
        ownerId,
        true
      );

      const query1 = {
        ownerType,
        ownerId,
        isActive: true,
        isProcessed: true,
      };
      const processedFiles = await KnowledgeFile.countDocuments(
        req ? withTenantFilter(req, query1) : query1
      );

      const query2 = {
        ownerType,
        ownerId,
        isActive: true,
        processingStatus: PROCESSING_STATUS.PENDING,
      };
      const pendingFiles = await KnowledgeFile.countDocuments(
        req ? withTenantFilter(req, query2) : query2
      );

      let totalFolders = 0;
      if (ownerType === OWNER_TYPES.USER) {
        const folderQuery = {
          userId: ownerId,
          isActive: true,
        };
        totalFolders = await KnowledgeFolder.countDocuments(
          req ? withTenantFilter(req, folderQuery) : folderQuery
        );
      }

      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (
          Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
        );
      };

      return {
        totalFiles,
        processedFiles,
        pendingFiles,
        totalFolders: ownerType === OWNER_TYPES.USER ? totalFolders : 0,
        totalStorage,
        formattedStorage: formatBytes(totalStorage),
      };
    } catch (error) {
      logger.error('[Knowledge] Error getting storage stats:', error);
      throw error;
    }
  }

  // ==================== FOLDER METHODS (for user files only) ====================

  /**
   * Create folder
   * @param {string} userId - User ID
   * @param {Object} folderData - Folder data
   * @param {Object} req - Request object for tenant context
   */
  async createFolder(userId, folderData, req = null) {
    try {
      logger.info(
        `[Knowledge] Creating folder for user: ${userId}, name: ${folderData.name}`
      );

      // Validate parent folder
      if (folderData.parentFolderId) {
        const parentQuery = {
          _id: folderData.parentFolderId,
          userId: userId,
          isActive: true,
        };
        const parentFolder = await KnowledgeFolder.findOne(
          req ? withTenantFilter(req, parentQuery) : parentQuery
        );
        if (!parentFolder) {
          throw new ApiError(httpStatus.NOT_FOUND, 'Parent folder not found');
        }
      }

      // Check name uniqueness
      const nameExists = await KnowledgeFolder.nameExistsInParent(
        userId,
        folderData.name,
        folderData.parentFolderId
      );

      if (nameExists) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'A folder with this name already exists in this location'
        );
      }

      // Create folder
      const folderPayload = {
        name: folderData.name,
        userId: userId,
        parentFolderId: folderData.parentFolderId || null,
        description: folderData.description || '',
        color: folderData.color,
        icon: folderData.icon || 'folder',
        tags: folderData.tags || [],
        metadata: folderData.metadata || {},
        isActive: true,
      };

      const folder = new KnowledgeFolder(
        req ? withTenantContext(req, folderPayload) : folderPayload
      );

      await folder.save();
      logger.info(`[Knowledge] Folder created: ${folder._id}`);

      return {
        id: folder._id.toString(),
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        path: folder.path,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        tags: folder.tags,
        fileCount: folder.fileCount,
        subfolderCount: folder.subfolderCount,
        totalSize: folder.totalSize,
        formattedTotalSize: folder.formattedTotalSize,
        depth: folder.depth,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      };
    } catch (error) {
      logger.error('[Knowledge] Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Get folders
   * @param {string} userId - User ID
   * @param {Object} options - Options
   * @param {Object} req - Request object for tenant context
   */
  async getFolders(userId, options = {}, req = null) {
    try {
      logger.info(`[Knowledge] Getting folders for user: ${userId}`);

      let folders;

      if (
        options.parentFolderId === null ||
        options.parentFolderId === 'root'
      ) {
        folders = await KnowledgeFolder.findRootFolders(userId);
      } else if (options.parentFolderId) {
        folders = await KnowledgeFolder.findSubfolders(
          options.parentFolderId,
          userId
        );
      } else {
        folders = await KnowledgeFolder.findByUserId(userId, options);
      }

      return folders.map((folder) => ({
        id: folder._id.toString(),
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        path: folder.path,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        tags: folder.tags,
        fileCount: folder.fileCount,
        subfolderCount: folder.subfolderCount,
        totalSize: folder.totalSize,
        formattedTotalSize: folder.formattedTotalSize,
        depth: folder.depth,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt,
      }));
    } catch (error) {
      logger.error('[Knowledge] Error getting folders:', error);
      throw error;
    }
  }

  /**
   * Get folder by ID
   * @param {string} folderId - Folder ID
   * @param {string} userId - User ID
   * @param {Object} req - Request object for tenant context
   */
  async getFolderById(folderId, userId, req = null) {
    try {
      const result = await KnowledgeFolder.getFolderWithAncestors(
        folderId,
        userId
      );

      if (!result) {
        return null;
      }

      return {
        id: result.folder._id.toString(),
        name: result.folder.name,
        parentFolderId: result.folder.parentFolderId,
        path: result.folder.path,
        description: result.folder.description,
        color: result.folder.color,
        icon: result.folder.icon,
        tags: result.folder.tags,
        fileCount: result.folder.fileCount,
        subfolderCount: result.folder.subfolderCount,
        totalSize: result.folder.totalSize,
        formattedTotalSize: result.folder.formattedTotalSize,
        depth: result.folder.depth,
        breadcrumb: result.breadcrumb,
        ancestors: result.ancestors.map((a) => ({
          id: a._id.toString(),
          name: a.name,
          path: a.path,
        })),
        createdAt: result.folder.createdAt,
        updatedAt: result.folder.updatedAt,
      };
    } catch (error) {
      logger.error('[Knowledge] Error getting folder:', error);
      throw error;
    }
  }

  /**
   * Update folder
   * @param {string} folderId - Folder ID
   * @param {string} userId - User ID
   * @param {Object} updateData - Update data
   * @param {Object} req - Request object for tenant context
   */
  async updateFolder(folderId, userId, updateData, req = null) {
    try {
      const folderQuery = {
        _id: folderId,
        userId: userId,
        isActive: true,
      };
      const folder = await KnowledgeFolder.findOne(
        req ? withTenantFilter(req, folderQuery) : folderQuery
      );

      if (!folder) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Folder not found');
      }

      // Check name uniqueness if name changed
      if (updateData.name && updateData.name !== folder.name) {
        const nameExists = await KnowledgeFolder.nameExistsInParent(
          userId,
          updateData.name,
          folder.parentFolderId
        );

        if (nameExists) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            'A folder with this name already exists in this location'
          );
        }

        folder.name = updateData.name;
      }

      // Update other fields
      if (updateData.description !== undefined)
        folder.description = updateData.description;
      if (updateData.color) folder.color = updateData.color;
      if (updateData.icon) folder.icon = updateData.icon;
      if (updateData.tags) folder.tags = updateData.tags;

      await folder.save();
      logger.info(`[Knowledge] Folder updated: ${folderId}`);

      return {
        id: folder._id.toString(),
        name: folder.name,
        parentFolderId: folder.parentFolderId,
        path: folder.path,
        description: folder.description,
        color: folder.color,
        icon: folder.icon,
        tags: folder.tags,
        fileCount: folder.fileCount,
        subfolderCount: folder.subfolderCount,
        totalSize: folder.totalSize,
        formattedTotalSize: folder.formattedTotalSize,
        updatedAt: folder.updatedAt,
      };
    } catch (error) {
      logger.error('[Knowledge] Error updating folder:', error);
      throw error;
    }
  }

  /**
   * Delete folder
   * @param {string} folderId - Folder ID
   * @param {string} userId - User ID
   * @param {boolean} recursive - Delete contents
   * @param {Object} req - Request object for tenant context
   */
  async deleteFolder(folderId, userId, recursive = false, req = null) {
    try {
      const folderQuery = {
        _id: folderId,
        userId: userId,
        isActive: true,
      };
      const folder = await KnowledgeFolder.findOne(
        req ? withTenantFilter(req, folderQuery) : folderQuery
      );

      if (!folder) {
        return false;
      }

      // Check if folder has contents
      const hasFiles = await KnowledgeFile.exists({
        folderId: folderId,
        isActive: true,
      });

      const hasSubfolders = await KnowledgeFolder.exists({
        parentFolderId: folderId,
        isActive: true,
      });

      if (!recursive && (hasFiles || hasSubfolders)) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'Folder is not empty. Use recursive delete to remove all contents.'
        );
      }

      if (recursive) {
        // Delete all files
        const files = await KnowledgeFile.find({
          folderId: folderId,
          isActive: true,
        });

        for (const file of files) {
          await file.softDelete();
        }

        // Delete all subfolders
        const subfolders = await KnowledgeFolder.find({
          parentFolderId: folderId,
          isActive: true,
        });

        for (const subfolder of subfolders) {
          await this.deleteFolder(subfolder._id.toString(), userId, true);
        }
      }

      // Delete the folder
      await folder.softDelete();
      logger.info(`[Knowledge] Folder deleted: ${folderId}`);

      return true;
    } catch (error) {
      logger.error('[Knowledge] Error deleting folder:', error);
      throw error;
    }
  }

  /**
   * Get folder contents
   * @param {string} folderId - Folder ID (null for root)
   * @param {string} userId - User ID
   * @param {Object} req - Request object for tenant context
   */
  async getFolderContents(folderId, userId, req = null) {
    try {
      logger.info(`[Knowledge] Getting folder contents: ${folderId || 'root'}`);

      // Get subfolders
      let subfolders;
      if (folderId) {
        subfolders = await KnowledgeFolder.findSubfolders(folderId, userId);
      } else {
        subfolders = await KnowledgeFolder.findRootFolders(userId);
      }

      // Get files
      const files = await KnowledgeFile.find({
        ownerType: OWNER_TYPES.USER,
        ownerId: userId,
        folderId: folderId || null,
        isActive: true,
      }).sort({ createdAt: -1 });

      // Get folder details if not root
      let folderDetails = null;
      if (folderId) {
        folderDetails = await this.getFolderById(folderId, userId);
      }

      return {
        folder: folderDetails,
        subfolders: subfolders.map((f) => ({
          id: f._id.toString(),
          name: f.name,
          path: f.path,
          color: f.color,
          icon: f.icon,
          fileCount: f.fileCount,
          subfolderCount: f.subfolderCount,
          totalSize: f.totalSize,
          formattedTotalSize: f.formattedTotalSize,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        })),
        files: files.map((file) => ({
          id: file._id.toString(),
          fileName: file.originalName,
          fileType: file.fileType,
          fileSize: file.fileSize,
          formattedFileSize: file.formattedFileSize,
          gcsUrl: file.gcsUrl,
          documentId: file.documentId,
          title: file.title,
          isProcessed: file.isProcessed,
          processingStatus: file.processingStatus,
          createdAt: file.createdAt,
          updatedAt: file.updatedAt,
        })),
      };
    } catch (error) {
      logger.error('[Knowledge] Error getting folder contents:', error);
      throw error;
    }
  }
}

export const knowledgeService = new KnowledgeService();
