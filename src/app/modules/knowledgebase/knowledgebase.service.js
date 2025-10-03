import config from '../../../../config/index.js';
import { logger } from '../../../shared/logger.js';
import { RAGSystem } from 'rag-system-pgvector';
import path from 'path';
import KnowledgeBase from './knowledgebase.model.js';
import { OpenAI } from 'openai';

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
const rag = new RAGSystem(ragConfig);

// Initialize OpenAI for token counting and summarization
const openai = new OpenAI({
  apiKey: config.openai_secret_key,
});

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

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that summarizes conversation history. Preserve the key context and important details while making it concise. Focus on maintaining the flow of the conversation and any important information that might be relevant for future responses.'
          },
          {
            role: 'user',
            content: `Please summarize the following conversation history, keeping it under 2500 tokens while preserving important context and details:\n\n${contextString}`
          }
        ],
        max_tokens: 2500,
        temperature: 0.3
      });

      const summarizedContext = response.choices[0].message.content;
      logger.info(`Context summarized: ${estimateTokenCount(contextString)} tokens -> ${estimateTokenCount(summarizedContext)} tokens`);

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
      let contextString = conversationHistory.map(msg =>
        `${msg.role.toUpperCase()}: ${msg.content}`
      ).join('\n\n');

      // Check token count
      const tokenCount = estimateTokenCount(contextString);

      if (tokenCount > 4000) {
        logger.info(`Context exceeds 4000 tokens (${tokenCount}), summarizing...`);
        contextString = await this.summarizeContext(contextString);
      }

      return contextString;
    } catch (error) {
      logger.error('Error formatting conversation context:', error);
      return '';
    }
  }

  /**
   * Process uploaded file
   * @param {Object} file - The uploaded file object
   * @param {string} kbId - The user ID
   * @returns {Promise<Object>} - Processing result
   */
  async processUploadedFile(file, knowledgebotId) {
    try {
      // Extract file extension from filename
      const fileExtension = path.extname(file.originalname).toLowerCase().substring(1); // Remove the dot and convert to lowercase

      logger.info(`Processing file upload for user: ${knowledgebotId}, file: ${file.originalname}, type: ${fileExtension}, size: ${file.size} bytes`);

      // Placeholder for file processing logic
      // You can add actual processing here later (e.g., save to database, cloud storage, etc.)
      await rag.initialize();
      const processedDocs = await rag.processor.processDocumentFromBuffer(file.buffer, fileExtension, {
        title: file.originalname,
        filename: file.originalname,
        metadata: { knowledgebotId: knowledgebotId }
      });
      console.log('Processed documents:', processedDocs.metadata);

      await rag.documentStore.addDocumentChunks(processedDocs);

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


  async invokeRagSystem(query = "What are the core features does E-Commerce Platform have?", knowledgebotId = "111", contextString = "") {
    await rag.initialize();
    const response = await rag.workflow.workflow.invoke({
      query: query,
      messages: contextString, // Now expects a string instead of array
      metadata: {
        knowledgebotId: knowledgebotId
      }
    });
    console.log("RAG Response:", response);
    return response;
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
   * Get user's knowledge bases
   * @param {string} userId - The user ID
   * @returns {Promise<Array>} - List of user's knowledge bases
   */
  async getUserKnowledgeBases(userId) {
    try {
      logger.info(`Retrieving knowledge bases for user: ${userId}`);

      const knowledgeBases = await KnowledgeBase.findByUserId(userId, true);

      return knowledgeBases.map(kb => ({
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
   * @returns {Promise<Object>} - Created knowledge base information
   */
  async createKnowledgeBase(name, userId) {
    try {
      logger.info(`Creating knowledge base: ${name} for user: ${userId}`);

      // Check if knowledge base with same name already exists for user
      const existingKB = await KnowledgeBase.findOne({ userId, name, isActive: true });
      if (existingKB) {
        throw new Error('Knowledge base with this name already exists');
      }

      // Create new knowledge base in database
      const knowledgeBase = new KnowledgeBase({
        name: name,
        userId: userId,
        description: '', // Can be added later
        isActive: true,
        documentsCount: 0,
        totalFileSize: 0,
      });

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
   * @returns {Promise<Object|null>} - Knowledge base information
   */
  async getKnowledgeBaseById(knowledgebaseId, userId) {
    try {
      logger.info(`Retrieving knowledge base: ${knowledgebaseId} for user: ${userId}`);

      const knowledgeBase = await KnowledgeBase.findOne({
        _id: knowledgebaseId,
        userId: userId,
        isActive: true
      });

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
   * @param {Array} conversationHistory - Previous messages for context
   * @returns {Promise<Object>} - RAG response
   */
  async chatWithKnowledgeBase(message, knowledgebaseId, conversationHistory = []) {
    try {
      logger.info(`Processing chat message for knowledge base: ${knowledgebaseId}`);

      // Format conversation history to string and manage token size
      const contextString = await this.formatConversationContext(conversationHistory);

      // Use the existing invokeRagSystem method with string context
      const ragResponse = await this.invokeRagSystem(message, knowledgebaseId, contextString);

      logger.info(`RAG response generated for knowledge base: ${knowledgebaseId}`);

      return {
        answer: ragResponse.answer || ragResponse.response || 'I apologize, but I couldn\'t find relevant information in the knowledge base to answer your question.',
        sources: ragResponse.sources || ragResponse.source_nodes || [],
        confidence: ragResponse.confidence || 0.8,
        model: ragResponse.model || 'gpt-4o-mini',
        tokensUsed: ragResponse.tokensUsed || ragResponse.token_usage || 0,
        contextTokens: estimateTokenCount(contextString), // Add context token info
      };
    } catch (error) {
      logger.error('Error in chat with knowledge base:', error);
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