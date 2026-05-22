import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { RAGSystem } from 'rag-system-pgvector';
import { enableHybridSearch } from '../../../shared/hybridSearch.js';
import path from 'path';
import KnowledgeBase from './knowledgebase.model.js';
import KnowledgebaseFile from './knowledgebase.files.model.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { SafeGoogleGenerativeAIEmbeddings } from '../../../shared/embeddings.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Storage } from '@google-cloud/storage';
import {
  withTenantContext,
  withTenantFilter,
} from '../../helpers/tenantQuery.js';
const embeddings = new SafeGoogleGenerativeAIEmbeddings({
  apiKey: config.gemini_secret_key,
  targetDimension: 768,
});

const llm = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  modelName: 'gemini-3.5-flash',
  temperature: 0.7,
});
const ragConfig = {
  // Database configuration (required)
  database: {
    host: '34.135.175.69',
    port: 5432,
    database: 'rag_database',
    username: 'postgres',
    password: 'Em0nd4r0ck@2',
  },

  embeddings: embeddings,
  llm: llm,
  embeddingDimensions: 768,
};
const rag = new RAGSystem(ragConfig);
enableHybridSearch(rag);

// Initialize Google Generative AI for token counting and summarization
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

// Initialize Google Cloud Storage
const storage = new Storage({
  projectId: config.google?.gcp_project_id,
  keyFilename: 'alti_gcp.json',
});

const BUCKET_NAME = 'alti_assistant_knowledge_bot_files';

/**
 * Estimate token count for text (rough approximation)
 * @param {string} text - Text to count tokens for
 * @returns {number} - Estimated token count
 */
const estimateTokenCount = (text) => {
  // Rough approximation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
};

/**
 * Service for handling knowledge base operations
 */
class KnowledgebaseService {
  /**
   * Summarize conversation context using LLM
   * @param {string} contextString - Long conversation context
   * @returns {Promise<string>} - Summarized context
   */
  async summarizeContext(contextString) {
    try {
      logger.info('Summarizing conversation context due to token limit');

      const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
      const prompt = `System: You are a helpful assistant that summarizes conversation history. Preserve the key context and important details while making it concise. Focus on maintaining the flow of the conversation and any important information that might be relevant for future responses.
      
User: Please summarize the following conversation history, keeping it under 2500 tokens while preserving important context and details:\n\n${contextString}`;

      const result = await model.generateContent(prompt);
      const summarizedContext = result?.response?.text() || 'No summary generated';

      logger.info(
        `Context summarized: ${estimateTokenCount(contextString)} tokens -> ${estimateTokenCount(summarizedContext)} tokens`
      );

      return summarizedContext;
    } catch (error) {
      logger.error('Error summarizing context:', error);
      // Fallback: truncate to approximate 2500 tokens (10000 characters)
      return contextString.substring(0, 10000);
    }
  }

  /**
   * Format conversation history to string and manage token size
   * @param {Array} conversationHistory - Array of message objects
   * @returns {Promise<string>} - Formatted context string
   */
  async formatConversationContext(conversationHistory) {
    try {
      // Convert messages to string format
      let contextString = conversationHistory
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n');

      // Check token count
      const tokenCount = estimateTokenCount(contextString);

      if (tokenCount > 4000) {
        logger.info(
          `Context exceeds 4000 tokens (${tokenCount}), summarizing...`
        );
        contextString = await this.summarizeContext(contextString);
      }

      return contextString;
    } catch (error) {
      logger.error('Error formatting conversation context:', error);
      return '';
    }
  }

  /**
   * Upload file to Google Cloud Storage
   * @param {Buffer} buffer - File buffer
   * @param {string} fileName - Original file name
   * @param {string} knowledgebotId - The knowledgebot ID
   * @returns {Promise<string>} - Public URL of uploaded file
   */
  async uploadToGCS(buffer, fileName, knowledgebotId) {
    try {
      // Create a unique file path: knowledgebotId/timestamp_originalname
      const timestamp = Date.now();
      const gcsFileName = `${knowledgebotId}/${timestamp}_${fileName}`;

      logger.info(`Uploading file to GCS: ${BUCKET_NAME}/${gcsFileName}`);

      const bucket = storage.bucket(BUCKET_NAME);
      const file = bucket.file(gcsFileName);

      // Determine content type based on file extension
      const fileExtension = path.extname(fileName).toLowerCase();
      const contentTypeMap = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx':
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.xml': 'application/xml',
        '.html': 'text/html',
        '.md': 'text/markdown',
      };
      const contentType =
        contentTypeMap[fileExtension] || 'application/octet-stream';

      // Upload the buffer
      await file.save(buffer, {
        metadata: {
          contentType: contentType,
          metadata: {
            knowledgebotId: knowledgebotId,
            originalName: fileName,
            uploadedAt: new Date().toISOString(),
          },
        },
        resumable: false,
      });

      // Generate public URL
      const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${gcsFileName}`;
      logger.info(`File uploaded successfully to GCS: ${publicUrl}`);

      return publicUrl;
    } catch (error) {
      logger.error('Error uploading file to GCS:', error);
      throw new Error(`Failed to upload file to GCS: ${error.message}`);
    }
  }

  /**
   * Process uploaded file or file path
   * @param {Object|string} file - The uploaded file object (with buffer) or file path string
   * @param {string} knowledgebotId - The knowledgebot ID
   * @param {string} userId - The user ID
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<Object>} - Processing result
   */
  async processUploadedFile(file, knowledgebotId, userId, req = null) {
    try {
      // Initialize RAG system
      await rag.initialize();

      let result;
      let gcsUrl = null;
      let gcsFileName = null;

      if (typeof file === 'string') {
        // It's a file path - read the file and upload to GCS, then use addDocuments
        const fs = await import('fs/promises');
        const fileName = path.basename(file);
        const fileStats = await fs.stat(file);
        const fileExtension = path.extname(file).toLowerCase().substring(1);

        logger.info(
          `Processing file from path for knowledgebot: ${knowledgebotId}, file: ${fileName}`
        );

        // Read file buffer and upload to GCS
        const fileBuffer = await fs.readFile(file);
        const timestamp = Date.now();
        gcsFileName = `${knowledgebotId}/${timestamp}_${fileName}`;
        gcsUrl = await this.uploadToGCS(fileBuffer, fileName, knowledgebotId);
        logger.info(`File uploaded to GCS: ${gcsUrl}`);

        // Process with RAG system
        result = await rag.addDocuments(file, {
          knowledgebotId: knowledgebotId,
          gcsUrl: gcsUrl,
        });

        logger.info(
          `Successfully processed and stored document from path: ${fileName}, documentId: ${result.documentId}, chunks: ${result.chunkCount}`
        );

        // Save file information to MongoDB
        const fileData = {
          fileName: `${timestamp}_${fileName}`,
          originalName: fileName,
          fileType: fileExtension,
          fileSize: fileStats.size,
          gcsUrl: gcsUrl,
          gcsPath: gcsFileName,
          documentId: result.documentId,
          knowledgebotId: knowledgebotId,
          userId: userId,
          title: result.title,
          chunkCount: result.chunkCount,
          isActive: true,
        };

        const fileRecord = new KnowledgebaseFile(
          req ? withTenantContext(req, fileData) : fileData
        );

        await fileRecord.save();
        logger.info(`File record saved to database: ${fileRecord._id}`);

        return {
          success: result.success,
          fileName: fileName,
          filePath: file,
          fileType: fileExtension,
          documentId: result.documentId,
          title: result.title,
          chunkCount: result.chunkCount,
          gcsUrl: gcsUrl,
          fileId: fileRecord._id.toString(),
          uploadedAt: new Date().toISOString(),
        };
      } else if (file.buffer) {
        // It's a buffer from file upload - upload to GCS first, then process
        const fileExtension = path
          .extname(file.originalname)
          .toLowerCase()
          .substring(1);
        logger.info(
          `Processing file upload from buffer for knowledgebot: ${knowledgebotId}, file: ${file.originalname}, type: ${fileExtension}, size: ${file.size} bytes`
        );

        // Upload to Google Cloud Storage
        const timestamp = Date.now();
        gcsFileName = `${knowledgebotId}/${timestamp}_${file.originalname}`;
        gcsUrl = await this.uploadToGCS(
          file.buffer,
          file.originalname,
          knowledgebotId
        );
        logger.info(`File uploaded to GCS: ${gcsUrl}`);

        // Process the file with RAG system
        result = await rag.addDocumentFromBuffer(
          file.buffer,
          file.originalname,
          fileExtension,
          {
            knowledgebotId: knowledgebotId,
            gcsUrl: gcsUrl, // Store GCS URL in metadata
          }
        );

        logger.info(
          `Successfully processed and stored document from buffer: ${file.originalname}, documentId: ${result.documentId}, chunks: ${result.chunkCount}`
        );

        // Save file information to MongoDB
        const fileRecord = new KnowledgebaseFile({
          fileName: `${timestamp}_${file.originalname}`,
          originalName: file.originalname,
          fileType: fileExtension,
          fileSize: file.size,
          gcsUrl: gcsUrl,
          gcsPath: gcsFileName,
          documentId: result.documentId,
          knowledgebotId: knowledgebotId,
          userId: userId,
          title: result.title,
          chunkCount: result.chunkCount,
          isActive: true,
        });

        await fileRecord.save();
        logger.info(`File record saved to database: ${fileRecord._id}`);

        return {
          success: result.success,
          fileName: result.fileName,
          fileType: fileExtension,
          fileSize: file.size,
          documentId: result.documentId,
          title: result.title,
          chunkCount: result.chunkCount,
          gcsUrl: gcsUrl,
          fileId: fileRecord._id.toString(),
          uploadedAt: new Date().toISOString(),
        };
      } else {
        throw new Error(
          'Invalid file input: must be either a file path string or a file object with buffer'
        );
      }
    } catch (error) {
      logger.error('Error processing uploaded file:', error);
      throw error;
    }
  }

  async invokeRagSystem(
    query = 'What are the core features does E-Commerce Platform have?',
    knowledgebotId = '111',
    contextString = ''
  ) {
    await rag.initialize();
    const response = await rag.query(query, {
      filter: { knowledgebotId: knowledgebotId },
    });
    console.log('RAG Response:', response);
    return response;
  }
  /**
   * Get user's uploaded files
   * @param {string} userId - The user ID
   * @param {string} knowledgebotId - Optional knowledgebot ID filter
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<Array>} - List of user's files
   */
  async getUserFiles(userId, knowledgebotId = null, req = null) {
    try {
      logger.info(
        `Retrieving files for user: ${userId}${knowledgebotId ? `, knowledgebot: ${knowledgebotId}` : ''}`
      );

      const query = {
        userId: userId,
        isActive: true,
        ...(knowledgebotId && { knowledgebotId }),
      };

      const files = await KnowledgebaseFile.find(
        req ? withTenantFilter(req, query) : query
      );

      return files.map((file) => ({
        id: file._id,
        fileName: file.originalName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        formattedFileSize: file.formattedFileSize,
        gcsUrl: file.gcsUrl,
        documentId: file.documentId,
        knowledgebotId: file.knowledgebotId,
        title: file.title,
        chunkCount: file.chunkCount,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }));
    } catch (error) {
      logger.error('Error retrieving user files:', error);
      throw error;
    }
  }

  /**
   * Get files by knowledgebot ID
   * @param {string} knowledgebotId - The knowledgebot ID
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<Array>} - List of knowledgebot's files
   */
  async getKnowledgebotFiles(knowledgebotId, req = null) {
    try {
      logger.info(`Retrieving files for knowledgebot: ${knowledgebotId}`);

      const query = {
        knowledgebotId: knowledgebotId,
        isActive: true,
      };
      const files = await KnowledgebaseFile.find(
        req ? withTenantFilter(req, query) : query
      );

      return files.map((file) => ({
        id: file._id,
        fileName: file.originalName,
        fileType: file.fileType,
        fileSize: file.fileSize,
        formattedFileSize: file.formattedFileSize,
        gcsUrl: file.gcsUrl,
        documentId: file.documentId,
        knowledgebotId: file.knowledgebotId,
        userId: file.userId,
        title: file.title,
        chunkCount: file.chunkCount,
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
      }));
    } catch (error) {
      logger.error('Error retrieving knowledgebot files:', error);
      throw error;
    }
  }

  /**
   * Get user's knowledge bases
   * @param {string} userId - The user ID
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<Array>} - List of user's knowledge bases
   */
  async getUserKnowledgeBases(userId, req = null) {
    try {
      logger.info(`Retrieving knowledge bases for user: ${userId}`);

      const query = {
        userId: userId,
        isActive: true,
      };
      const knowledgeBases = await KnowledgeBase.find(
        req ? withTenantFilter(req, query) : query
      );

      return knowledgeBases.map((kb) => ({
        id: kb._id,
        name: kb.name,
        description: kb.description,
        isActive: kb.isActive,
        documentsCount: kb.documentsCount,
        totalFileSize: kb.totalFileSize,
        formattedFileSize: kb.formattedFileSize,
        settings: kb.settings,
        createdAt: kb.createdAt,
        updatedAt: kb.updatedAt,
      }));
    } catch (error) {
      logger.error('Error retrieving user knowledge bases:', error);
      throw error;
    }
  }

  /**
   * Create a new knowledge base
   * @param {string} name - The name of the knowledge base
   * @param {string} userId - The user ID
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<Object>} - Created knowledge base information
   */
  async createKnowledgeBase(payload, userId, req = null) {
    try {
      const { name, description } = payload;
      logger.info(`Creating knowledge base: ${name} for user: ${userId}`);

      // Check if knowledge base with same name already exists for user
      const query = { userId, name, isActive: true };
      const existingKB = await KnowledgeBase.findOne(
        req ? withTenantFilter(req, query) : query
      );
      if (existingKB) {
        throw new Error('Knowledge base with this name already exists');
      }

      // Create new knowledge base in database
      const kbData = {
        name: name,
        userId: userId,
        description: description || '', // Can be added later
        isActive: true,
        documentsCount: 0,
        totalFileSize: 0,
      };

      const knowledgeBase = new KnowledgeBase(
        req ? withTenantContext(req, kbData) : kbData
      );

      const savedKB = await knowledgeBase.save();

      logger.info(`Knowledge base created successfully: ${savedKB._id}`);

      return {
        id: savedKB._id,
        name: savedKB.name,
        userId: savedKB.userId,
        description: savedKB.description,
        isActive: savedKB.isActive,
        documentsCount: savedKB.documentsCount,
        totalFileSize: savedKB.totalFileSize,
        formattedFileSize: savedKB.formattedFileSize,
        createdAt: savedKB.createdAt,
        updatedAt: savedKB.updatedAt,
      };
    } catch (error) {
      logger.error('Error creating knowledge base:', error);
      throw error;
    }
  }

  /**
   * Get knowledge base by ID
   * @param {string} knowledgebaseId - The knowledge base ID
   * @param {string} userId - The user ID
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<Object|null>} - Knowledge base information
   */
  async getKnowledgeBaseById(knowledgebaseId, userId, req = null) {
    try {
      logger.info(
        `Retrieving knowledge base: ${knowledgebaseId} for user: ${userId}`
      );

      const query = {
        _id: knowledgebaseId,
        userId: userId,
        isActive: true,
      };
      const knowledgeBase = await KnowledgeBase.findOne(
        req ? withTenantFilter(req, query) : query
      );

      if (!knowledgeBase) {
        return null;
      }

      return {
        id: knowledgeBase._id,
        name: knowledgeBase.name,
        description: knowledgeBase.description,
        isActive: knowledgeBase.isActive,
        documentsCount: knowledgeBase.documentsCount,
        totalFileSize: knowledgeBase.totalFileSize,
        formattedFileSize: knowledgeBase.formattedFileSize,
        settings: knowledgeBase.settings,
        createdAt: knowledgeBase.createdAt,
        updatedAt: knowledgeBase.updatedAt,
      };
    } catch (error) {
      logger.error('Error retrieving knowledge base:', error);
      throw error;
    }
  }

  /**
   * Chat with knowledge base using RAG
   * @param {string} message - User message
   * @param {string} knowledgebaseId - Knowledge base ID
   * @param {string} conversationId - Conversation/Session ID
   * @param {Array} conversationHistory - Previous messages for context
   * @returns {Promise<Object>} - RAG response
   */
  async chatWithKnowledgeBase(
    message,
    knowledgebaseId,
    conversationId,
    conversationHistory = []
  ) {
    try {
      logger.info(
        `Processing chat message for knowledge base: ${knowledgebaseId}, conversation: ${conversationId}`
      );

      // Initialize RAG system
      await rag.initialize();

      // Use RAG system's query method with session management
      const ragResponse = await rag.query(message, {
        filter: { knowledgebotId: knowledgebaseId },
        chatHistory: conversationHistory,
        sessionId: conversationId,
        persistSession: true,
        knowledgebotId: knowledgebaseId,
        limit: 10,
        threshold: 0.1,
      });

      logger.info(
        `RAG response generated for knowledge base: ${knowledgebaseId}`
      );

      return {
        answer:
          ragResponse.answer ||
          "I apologize, but I couldn't find relevant information in the knowledge base to answer your question.",
        sources: ragResponse.sources || [],
        confidence: ragResponse.confidence || 0.8,
        model: ragResponse.model || 'gemini-3.5-flash',
        tokensUsed: ragResponse.tokensUsed || ragResponse.token_usage || 0,
        chatHistory: ragResponse.chatHistory || conversationHistory,
        sessionId: ragResponse.sessionId || conversationId,
      };
    } catch (error) {
      logger.error('Error in chat with knowledge base:', error);
      throw error;
    }
  }

  async deleteKnowledgeBase(knowledgebaseId, userId, req = null) {
    try {
      logger.info(
        `Deleting knowledge base: ${knowledgebaseId} for user: ${userId}`
      );
      const query = {
        _id: knowledgebaseId,
        userId: userId,
      };
      const knowledgeBase = await KnowledgeBase.findOne(
        req ? withTenantFilter(req, query) : query
      );
      if (!knowledgeBase) {
        throw new Error('Knowledge base not found');
      }
      knowledgeBase.isActive = false;
      await knowledgeBase.save();
      logger.info(`Knowledge base deleted successfully: ${knowledgebaseId}`);
      return true;
    } catch (error) {
      logger.error('Error deleting knowledge base:', error);
      throw error;
    }
  }

  /**
   * Delete user file
   * @param {string} fileId - The file ID
   * @param {string} userId - The user ID
   * @param {Object} req - Request object for tenant context
   * @returns {Promise<boolean>} - Deletion result
   */
  async deleteUserFile(fileId, userId, req = null) {
    try {
      logger.info(`Deleting file ${fileId} for user: ${userId}`);

      const query = { _id: fileId };
      const file = await KnowledgebaseFile.findOne(
        req ? withTenantFilter(req, query) : query
      );

      if (!file) {
        return false;
      }

      const fileSize = file.fileSize || 0;

      await KnowledgebaseFile.deleteOne(
        req ? withTenantFilter(req, query) : query
      );

      logger.info(`File ${fileId} deleted successfully for user: ${userId}`);
      return { deleted: true, fileSize };
    } catch (error) {
      logger.error('Error deleting user file:', error);
      throw error;
    }
  }
}

export const knowledgebaseService = new KnowledgebaseService();
