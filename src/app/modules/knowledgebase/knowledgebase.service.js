import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { RAGSystem } from 'rag-system-pgvector';
import path from 'path';

const ragConfig = {
  // Database configuration (required)
  database: {
    host: 'localhost',
    port: 5432,
    database: 'rag_database',
    username: 'postgres',
    password: 'postgres'
  },

  // OpenAI configuration (required)
  openai: {
    apiKey: config.openai_secret_key,              // OpenAI API key
    modelName: 'gpt-4o-mini',                 // Chat model (optional)
    embeddingModel: 'text-embedding-ada-002'    // Embedding model (optional)
  },

  // Vector store configuration (optional)
  vectorStore: {
    tableName: 'documents',           // Table name for documents
    vectorColumnName: 'embedding',    // Column for vector embeddings
    contentColumnName: 'content',     // Column for document content
    metadataColumnName: 'metadata'    // Column for metadata
  }
};
const rag = new RAGSystem(ragConfig)
/**
 * Service for handling knowledge base operations
 */
class KnowledgebaseService {
  /**
   * Process uploaded file
   * @param {Object} file - The uploaded file object
   * @param {string} userId - The user ID
   * @returns {Promise<Object>} - Processing result
   */
  async processUploadedFile(file, userId) {
    try {
      // Extract file extension from filename
      const fileExtension = path.extname(file.originalname).toLowerCase().substring(1); // Remove the dot and convert to lowercase

      logger.info(`Processing file upload for user: ${userId}, file: ${file.originalname}, type: ${fileExtension}, size: ${file.size} bytes`);

      // Placeholder for file processing logic
      // You can add actual processing here later (e.g., save to database, cloud storage, etc.)
      await rag.initialize();
      const processedDocs = await rag.processor.processDocumentFromBuffer(file.buffer, fileExtension, {
        title: file.originalname,
        filename: file.originalname,
        metadata: { userId }
      });
      console.log('Processed documents:', processedDocs.metadata);

      // await rag.documentStore.addDocumentChunks(processedDocs);

      return {
        success: true,
        fileName: file.originalname,
        fileType: fileExtension,
        fileSize: file.size,
        uploadedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error processing uploaded file:', error);
      throw error;
    }
  }

  /**
   * Get user's uploaded files
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} - List of user's files
   */
  async getUserFiles(userId) {
    try {
      logger.info(`Retrieving files for user: ${userId}`);

      // Placeholder for getting user files
      // You can implement database queries here later

      return [];
    } catch (error) {
      logger.error('Error retrieving user files:', error);
      throw error;
    }
  }

  /**
   * Delete user file
   * @param {string} fileId - The file ID
   * @param {string} userId - The user ID
   * @returns {Promise<boolean>} - Deletion result
   */
  async deleteUserFile(fileId, userId) {
    try {
      logger.info(`Deleting file ${fileId} for user: ${userId}`);

      // Placeholder for file deletion logic
      // You can implement the actual deletion here later

      return true;
    } catch (error) {
      logger.error('Error deleting user file:', error);
      throw error;
    }
  }
}

export const knowledgebaseService = new KnowledgebaseService();