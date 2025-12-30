import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { Storage } from '@google-cloud/storage';
import path from 'path';
import KnowledgeBankFile from './knowledge_bank.model.js';
import KnowledgeBankFolder from './knowledge_bank_folder.model.js';
import { RAGSystem } from 'rag-system-pgvector';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: config.google?.gcp_project_id,
  keyFilename: 'alti_gcp.json'
});

// GCS Bucket for Knowledge Bank (separate from knowledgebot)
const KNOWLEDGE_BANK_BUCKET = 'alti_assistant_knowledge_bot_files';

// Initialize RAG System for processing files
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: config?.gemini_secret_key,
});

const llm = new ChatGoogleGenerativeAI({
  temperature: 0.2,
  model: 'gemini-3-flash-preview',
  apiKey: config?.gemini_secret_key,
  thinkingConfig: {
    includeThoughts: false,
  }
})

const ragConfig = {
  database: {
    host: '34.135.175.69',
    port: 5432,
    database: 'rag_database',
    username: 'postgres',
    password: 'Em0nd4r0ck@2'
  },
  embeddings: embeddings,
  llm: llm,
  embeddingDimensions: 1536,
};

const rag = new RAGSystem(ragConfig);

/**
 * Knowledge Bank Service
 * Handles file operations for user's knowledge bank
 * Separate from knowledgebot functionality
 */
class KnowledgeBankService {
  /**
   * Upload file to GCS and save metadata to database
   * @param {Object} file - Uploaded file object with buffer
   * @param {string} userId - User ID
   * @param {Object} options - Additional options (description, tags, folderId, etc.)
   * @returns {Promise<Object>} - Upload result with file info
   */
  async uploadFile(file, userId, options = {}) {
    try {
      logger.info(`[KnowledgeBank] Uploading file for user: ${userId}, file: ${file.originalname}`);

      // Validate file
      if (!file || !file.buffer) {
        throw new Error('Invalid file: buffer is required');
      }

      // Validate folder if provided
      if (options.folderId) {
        const folder = await KnowledgeBankFolder.findOne({
          _id: options.folderId,
          userId: userId,
          isActive: true
        });
        if (!folder) {
          throw new Error('Folder not found or does not belong to user');
        }
      }

      // Extract file details
      const fileExtension = path.extname(file.originalname).toLowerCase().substring(1);
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.originalname}`;

      // Include folder path in GCS path if file is in a folder
      let gcsPath;
      if (options.folderId) {
        gcsPath = `users/${userId}/folders/${options.folderId}/${fileName}`;
      } else {
        gcsPath = `users/${userId}/${fileName}`;
      }

      // Upload to GCS
      const gcsUrl = await this.uploadToGCS(
        file.buffer,
        gcsPath,
        file.originalname,
        fileExtension
      );

      logger.info(`[KnowledgeBank] File uploaded to GCS: ${gcsUrl}`);

      // Save file record to database
      const fileRecord = new KnowledgeBankFile({
        fileName: fileName,
        originalName: file.originalname,
        fileType: fileExtension,
        fileSize: file.size,
        gcsUrl: gcsUrl,
        gcsPath: gcsPath,
        gcsBucket: KNOWLEDGE_BANK_BUCKET,
        userId: userId,
        folderId: options.folderId || null,
        description: options.description || '',
        tags: options.tags || [],
        uploadSource: options.uploadSource || 'web',
        ipAddress: options.ipAddress,
        isActive: true,
        processingStatus: 'pending',
        metadata: options.metadata || {},
      });

      await fileRecord.save();
      logger.info(`[KnowledgeBank] File record saved to database: ${fileRecord._id}`);

      // Update folder statistics if file is in a folder
      if (options.folderId) {
        const folder = await KnowledgeBankFolder.findById(options.folderId);
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
        uploadedAt: fileRecord.createdAt,
        processingStatus: fileRecord.processingStatus,
      };
    } catch (error) {
      logger.error('[KnowledgeBank] Error uploading file:', error);
      throw error;
    }
  }

  /**
   * Upload buffer to Google Cloud Storage
   * @param {Buffer} buffer - File buffer
   * @param {string} gcsPath - Path in GCS bucket
   * @param {string} originalName - Original file name
   * @param {string} fileExtension - File extension
   * @returns {Promise<string>} - Public URL
   */
  async uploadToGCS(buffer, gcsPath, originalName, fileExtension) {
    try {
      const bucket = storage.bucket(KNOWLEDGE_BANK_BUCKET);
      const file = bucket.file(gcsPath);

      // Determine content type
      const contentTypeMap = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'txt': 'text/plain',
        'csv': 'text/csv',
        'json': 'application/json',
        'xml': 'application/xml',
        'html': 'text/html',
        'md': 'text/markdown',
        'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'xls': 'application/vnd.ms-excel',
        'ppt': 'application/vnd.ms-powerpoint',
        'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
      const contentType = contentTypeMap[fileExtension] || 'application/octet-stream';

      // Upload
      await file.save(buffer, {
        metadata: {
          contentType: contentType,
          metadata: {
            originalName: originalName,
            uploadedAt: new Date().toISOString(),
          }
        },
        resumable: false,
      });

      // Make file publicly readable (optional - adjust based on security requirements)
      // await file.makePublic();

      // Return GCS URL
      const publicUrl = `https://storage.googleapis.com/${KNOWLEDGE_BANK_BUCKET}/${gcsPath}`;
      return publicUrl;
    } catch (error) {
      logger.error('[KnowledgeBank] Error uploading to GCS:', error);
      throw new Error(`Failed to upload to GCS: ${error.message}`);
    }
  }

  /**
   * Process uploaded file using RAG system
   * @param {string} fileId - File ID from database
   * @returns {Promise<Object>} - Processing result
   */
  async processUploadedFile(fileId) {
    try {
      logger.info(`[KnowledgeBank] Processing file: ${fileId}`);

      // Get file record from database
      const fileRecord = await KnowledgeBankFile.findById(fileId);
      if (!fileRecord) {
        throw new Error('File not found');
      }

      // Update status to processing
      fileRecord.processingStatus = 'processing';
      await fileRecord.save();

      // Initialize RAG system
      await rag.initialize();

      // Download file from GCS
      const bucket = storage.bucket(KNOWLEDGE_BANK_BUCKET);
      const file = bucket.file(fileRecord.gcsPath);
      const [buffer] = await file.download();

      logger.info(`[KnowledgeBank] Downloaded file from GCS: ${fileRecord.gcsPath}`);

      // Process with RAG system
      const ragResult = await rag.addDocumentFromBuffer(
        buffer,
        fileRecord.originalName,
        fileRecord.fileType,
        {
          userId: fileRecord.userId.toString(),
          fileId: fileRecord._id.toString(),
          gcsUrl: fileRecord.gcsUrl,
          knowledgeBank: true, // Flag to identify knowledge bank documents
        }
      );

      logger.info(`[KnowledgeBank] RAG processing complete: documentId=${ragResult.documentId}, chunks=${ragResult.chunkCount}`);

      // Update file record with processing results
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
        processingStatus: 'completed',
        processedAt: new Date(),
      };
    } catch (error) {
      logger.error('[KnowledgeBank] Error processing file:', error);

      // Mark as failed if file exists
      try {
        const fileRecord = await KnowledgeBankFile.findById(fileId);
        if (fileRecord) {
          await fileRecord.markProcessingFailed(error);
        }
      } catch (updateError) {
        logger.error('[KnowledgeBank] Error updating failed status:', updateError);
      }

      throw error;
    }
  }

  /**
   * Get user's files from knowledge bank
   * @param {string} userId - User ID
   * @param {Object} filters - Optional filters (fileType, processingStatus, etc.)
   * @returns {Promise<Array>} - List of files
   */
  async getUserFiles(userId, filters = {}) {
    try {
      logger.info(`[KnowledgeBank] Retrieving files for user: ${userId}`);

      const options = {
        fileType: filters.fileType,
        processingStatus: filters.processingStatus,
        isProcessed: filters.isProcessed,
        limit: filters.limit || 100,
        skip: filters.skip || 0,
      };

      const files = await KnowledgeBankFile.findByUserId(userId, options);

      return files.map(file => ({
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
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }));
    } catch (error) {
      logger.error('[KnowledgeBank] Error retrieving user files:', error);
      throw error;
    }
  }

  /**
   * Get file by ID
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<Object|null>} - File details
   */
  async getFileById(fileId, userId) {
    try {
      logger.info(`[KnowledgeBank] Retrieving file: ${fileId} for user: ${userId}`);

      const file = await KnowledgeBankFile.findOne({
        _id: fileId,
        userId: userId,
        isActive: true
      });

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
        metadata: file.metadata,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      };
    } catch (error) {
      logger.error('[KnowledgeBank] Error retrieving file:', error);
      throw error;
    }
  }

  /**
   * Delete file from knowledge bank
   * @param {string} fileId - File ID
   * @param {string} userId - User ID (for authorization)
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFile(fileId, userId) {
    try {
      logger.info(`[KnowledgeBank] Deleting file: ${fileId} for user: ${userId}`);

      // Find file
      const file = await KnowledgeBankFile.findOne({
        _id: fileId,
        userId: userId,
        isActive: true
      });

      if (!file) {
        logger.warn(`[KnowledgeBank] File not found: ${fileId}`);
        return false;
      }

      // Soft delete in database
      await file.softDelete();

      // Optional: Delete from GCS (uncomment if you want to permanently remove files)
      /*
      try {
        const bucket = storage.bucket(KNOWLEDGE_BANK_BUCKET);
        const gcsFile = bucket.file(file.gcsPath);
        await gcsFile.delete();
        logger.info(`[KnowledgeBank] File deleted from GCS: ${file.gcsPath}`);
      } catch (gcsError) {
        logger.error('[KnowledgeBank] Error deleting from GCS:', gcsError);
        // Continue even if GCS deletion fails
      }
      */

      // Optional: Delete from RAG system (if processed)
      if (file.isProcessed && file.documentId) {
        try {
          await rag.initialize();
          await rag.deleteDocument(file.documentId);
          logger.info(`[KnowledgeBank] Document deleted from RAG: ${file.documentId}`);
        } catch (ragError) {
          logger.error('[KnowledgeBank] Error deleting from RAG:', ragError);
          // Continue even if RAG deletion fails
        }
      }

      logger.info(`[KnowledgeBank] File deleted successfully: ${fileId}`);
      return true;
    } catch (error) {
      logger.error('[KnowledgeBank] Error deleting file:', error);
      throw error;
    }
  }

  /**
   * Get user's storage statistics
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Storage stats
   */
  async getUserStorageStats(userId) {
    try {
      logger.info(`[KnowledgeBank] Getting storage stats for user: ${userId}`);

      const totalFiles = await KnowledgeBankFile.countByUserId(userId, true);
      const totalStorage = await KnowledgeBankFile.getTotalStorageByUserId(userId, true);

      const processedFiles = await KnowledgeBankFile.countDocuments({
        userId: userId,
        isActive: true,
        isProcessed: true
      });

      const pendingFiles = await KnowledgeBankFile.countDocuments({
        userId: userId,
        isActive: true,
        processingStatus: 'pending'
      });

      const totalFolders = await KnowledgeBankFolder.countDocuments({
        userId: userId,
        isActive: true
      });

      // Format total storage
      const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
      };

      return {
        totalFiles,
        processedFiles,
        pendingFiles,
        totalFolders,
        totalStorage,
        formattedStorage: formatBytes(totalStorage),
      };
    } catch (error) {
      logger.error('[KnowledgeBank] Error getting storage stats:', error);
      throw error;
    }
  }

  // ==================== FOLDER METHODS ====================

  /**
   * Create a new folder
   * @param {string} userId - User ID
   * @param {Object} folderData - Folder data (name, description, parentFolderId, etc.)
   * @returns {Promise<Object>} - Created folder
   */
  async createFolder(userId, folderData) {
    try {
      logger.info(`[KnowledgeBank] Creating folder for user: ${userId}, name: ${folderData.name}`);

      // Validate parent folder if provided
      if (folderData.parentFolderId) {
        const parentFolder = await KnowledgeBankFolder.findOne({
          _id: folderData.parentFolderId,
          userId: userId,
          isActive: true
        });
        if (!parentFolder) {
          throw new Error('Parent folder not found or does not belong to user');
        }
      }

      // Check if folder name already exists in parent
      const nameExists = await KnowledgeBankFolder.nameExistsInParent(
        userId,
        folderData.name,
        folderData.parentFolderId
      );

      if (nameExists) {
        throw new Error('A folder with this name already exists in this location');
      }

      // Create folder
      const folder = new KnowledgeBankFolder({
        name: folderData.name,
        userId: userId,
        parentFolderId: folderData.parentFolderId || null,
        description: folderData.description || '',
        color: folderData.color || '#1890ff',
        icon: folderData.icon || 'folder',
        tags: folderData.tags || [],
        metadata: folderData.metadata || {},
        isActive: true,
      });

      await folder.save();
      logger.info(`[KnowledgeBank] Folder created: ${folder._id}`);

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
      logger.error('[KnowledgeBank] Error creating folder:', error);
      throw error;
    }
  }

  /**
   * Get user's folders
   * @param {string} userId - User ID
   * @param {Object} options - Options (parentFolderId filter, etc.)
   * @returns {Promise<Array>} - List of folders
   */
  async getUserFolders(userId, options = {}) {
    try {
      logger.info(`[KnowledgeBank] Getting folders for user: ${userId}`);

      let folders;

      if (options.parentFolderId === null || options.parentFolderId === 'root') {
        // Get root folders
        folders = await KnowledgeBankFolder.findRootFolders(userId);
      } else if (options.parentFolderId) {
        // Get subfolders of specific parent
        folders = await KnowledgeBankFolder.findSubfolders(options.parentFolderId, userId);
      } else {
        // Get all folders
        folders = await KnowledgeBankFolder.findByUserId(userId, options);
      }

      return folders.map(folder => ({
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
      logger.error('[KnowledgeBank] Error getting folders:', error);
      throw error;
    }
  }

  /**
   * Get folder by ID with ancestors
   * @param {string} folderId - Folder ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} - Folder with ancestors
   */
  async getFolderById(folderId, userId) {
    try {
      logger.info(`[KnowledgeBank] Getting folder: ${folderId} for user: ${userId}`);

      const result = await KnowledgeBankFolder.getFolderWithAncestors(folderId, userId);

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
        ancestors: result.ancestors.map(a => ({
          id: a._id.toString(),
          name: a.name,
          path: a.path
        })),
        createdAt: result.folder.createdAt,
        updatedAt: result.folder.updatedAt,
      };
    } catch (error) {
      logger.error('[KnowledgeBank] Error getting folder:', error);
      throw error;
    }
  }

  /**
   * Update folder
   * @param {string} folderId - Folder ID
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} - Updated folder
   */
  async updateFolder(folderId, userId, updateData) {
    try {
      logger.info(`[KnowledgeBank] Updating folder: ${folderId} for user: ${userId}`);

      const folder = await KnowledgeBankFolder.findOne({
        _id: folderId,
        userId: userId,
        isActive: true
      });

      if (!folder) {
        throw new Error('Folder not found');
      }

      // Check if name is being changed and if it conflicts
      if (updateData.name && updateData.name !== folder.name) {
        const nameExists = await KnowledgeBankFolder.nameExistsInParent(
          userId,
          updateData.name,
          folder.parentFolderId
        );

        if (nameExists) {
          throw new Error('A folder with this name already exists in this location');
        }

        folder.name = updateData.name;
      }

      // Update other fields
      if (updateData.description !== undefined) folder.description = updateData.description;
      if (updateData.color) folder.color = updateData.color;
      if (updateData.icon) folder.icon = updateData.icon;
      if (updateData.tags) folder.tags = updateData.tags;

      await folder.save();
      logger.info(`[KnowledgeBank] Folder updated: ${folderId}`);

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
      logger.error('[KnowledgeBank] Error updating folder:', error);
      throw error;
    }
  }

  /**
   * Delete folder
   * @param {string} folderId - Folder ID
   * @param {string} userId - User ID
   * @param {boolean} recursive - Delete subfolders and files
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFolder(folderId, userId, recursive = false) {
    try {
      logger.info(`[KnowledgeBank] Deleting folder: ${folderId} for user: ${userId}, recursive: ${recursive}`);

      const folder = await KnowledgeBankFolder.findOne({
        _id: folderId,
        userId: userId,
        isActive: true
      });

      if (!folder) {
        return false;
      }

      // Check if folder has files or subfolders
      const hasFiles = await KnowledgeBankFile.exists({
        folderId: folderId,
        isActive: true
      });

      const hasSubfolders = await KnowledgeBankFolder.exists({
        parentFolderId: folderId,
        isActive: true
      });

      if (!recursive && (hasFiles || hasSubfolders)) {
        throw new Error('Folder is not empty. Use recursive delete to remove all contents.');
      }

      if (recursive) {
        // Delete all files in folder
        const files = await KnowledgeBankFile.find({
          folderId: folderId,
          isActive: true
        });

        for (const file of files) {
          await file.softDelete();
        }

        // Delete all subfolders recursively
        const subfolders = await KnowledgeBankFolder.find({
          parentFolderId: folderId,
          isActive: true
        });

        for (const subfolder of subfolders) {
          await this.deleteFolder(subfolder._id.toString(), userId, true);
        }
      }

      // Soft delete the folder
      await folder.softDelete();
      logger.info(`[KnowledgeBank] Folder deleted: ${folderId}`);

      return true;
    } catch (error) {
      logger.error('[KnowledgeBank] Error deleting folder:', error);
      throw error;
    }
  }

  /**
   * Get folder contents (files and subfolders)
   * @param {string} folderId - Folder ID (null for root)
   * @param {string} userId - User ID
   * @returns {Promise<Object>} - Folder contents
   */
  async getFolderContents(folderId, userId) {
    try {
      logger.info(`[KnowledgeBank] Getting folder contents: ${folderId || 'root'} for user: ${userId}`);

      // Get subfolders
      let subfolders;
      if (folderId) {
        subfolders = await KnowledgeBankFolder.findSubfolders(folderId, userId);
      } else {
        subfolders = await KnowledgeBankFolder.findRootFolders(userId);
      }

      // Get files in folder
      const files = await KnowledgeBankFile.find({
        userId: userId,
        folderId: folderId || null,
        isActive: true
      }).sort({ createdAt: -1 });

      // Get folder details if not root
      let folderDetails = null;
      if (folderId) {
        const folder = await this.getFolderById(folderId, userId);
        folderDetails = folder;
      }

      return {
        folder: folderDetails,
        subfolders: subfolders.map(f => ({
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
        files: files.map(file => ({
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
      logger.error('[KnowledgeBank] Error getting folder contents:', error);
      throw error;
    }
  }
}

export const knowledgeBankService = new KnowledgeBankService();
