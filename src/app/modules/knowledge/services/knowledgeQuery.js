import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import httpStatus from 'http-status';
import { RAGSystem } from 'rag-system-pgvector';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  KNOWLEDGE_CONFIG,
  RAG_DATABASE_CONFIG,
  OWNER_TYPES,
  QUERY_MODES,
  COMPLEXITY_INDICATORS,
} from '../knowledge.constant.js';
import config from '../../../../../config/index.js';
import { logger } from '../../../../shared/logger.js';
import ApiError from '../../../../errors/ApiError.js';
import { conversationService } from '../../conversations/conversation.service.js';
import { conversationHelpers } from '../../conversations/conversation.helpers.js';
import KnowledgeFile from '../knowledge.model.js';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

// Initialize Anthropic Claude
const anthropic = new Anthropic({
  apiKey: config.anthropic.anthropic_api_key,
});

// Initialize embeddings and LLM for RAG
const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: config.gemini_secret_key,
  model: KNOWLEDGE_CONFIG.EMBEDDING_MODEL,
});

const geminiLLM = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: KNOWLEDGE_CONFIG.MODEL,
  temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
});

const claudeLLM = new ChatAnthropic({
  apiKey: config.anthropic.anthropic_api_key,
  model: KNOWLEDGE_CONFIG.COMPLEX_MODEL,
  temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
});

// Initialize RAG System with Gemini (default)
const ragConfig = {
  database: {
    host: RAG_DATABASE_CONFIG.HOST,
    port: RAG_DATABASE_CONFIG.PORT,
    database: RAG_DATABASE_CONFIG.DATABASE,
    username: RAG_DATABASE_CONFIG.USERNAME,
    password: RAG_DATABASE_CONFIG.PASSWORD,
  },
  embeddings: embeddings,
  llm: geminiLLM,
  embeddingDimensions: 768,
};

const rag = new RAGSystem(ragConfig);

/**
 * Detect query complexity based on keywords and context
 */
const detectQueryComplexity = (message, conversationHistory = '') => {
  const fullText = `${conversationHistory} ${message}`.toLowerCase();

  let complexityScore = 0;
  let indicators = [];

  // Check for high complexity keywords
  COMPLEXITY_INDICATORS.HIGH_COMPLEXITY_KEYWORDS.forEach(keyword => {
    if (fullText.includes(keyword.toLowerCase())) {
      complexityScore += 0.15;
      indicators.push(keyword);
    }
  });

  // Check for medium complexity keywords
  COMPLEXITY_INDICATORS.MEDIUM_COMPLEXITY_KEYWORDS.forEach(keyword => {
    if (fullText.includes(keyword.toLowerCase())) {
      complexityScore += 0.08;
      indicators.push(keyword);
    }
  });

  // Additional complexity factors
  const wordCount = message.split(' ').length;
  if (wordCount > 30) complexityScore += 0.1; // Long question
  if (message.includes('?') && message.split('?').length > 2) complexityScore += 0.1; // Multiple questions
  if (/\d+/.test(message)) complexityScore += 0.05; // Contains numbers (might be asking for calculations)

  // Conversation depth increases complexity
  if (conversationHistory) {
    const historyLines = conversationHistory.split('\n').length;
    if (historyLines > 10) complexityScore += 0.1;
    else if (historyLines > 5) complexityScore += 0.05;
  }

  const isComplex = complexityScore >= KNOWLEDGE_CONFIG.COMPLEXITY_THRESHOLD;

  logger.info(`[Knowledge] Complexity detection: score=${complexityScore.toFixed(2)}, isComplex=${isComplex}, indicators=[${indicators.slice(0, 3).join(', ')}]`);

  return {
    isComplex,
    score: complexityScore,
    indicators: indicators.slice(0, 5),
  };
};

/**
 * Generate unique conversation ID
 */
const generateConversationId = () => {
  return `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle knowledge conversation
 */
const handleKnowledgeConversation = async (userId, ownerType, ownerId, conversationId, userMessage) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId);
        logger.info(`[Knowledge] Fetched conversation: ${conversationId}`);
      } catch (error) {
        logger.warn(`[Knowledge] Conversation ${conversationId} not found, creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Knowledge Query: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: 'knowledge',
            model: KNOWLEDGE_CONFIG.MODEL,
            ownerType,
            ownerId,
            fileIds: [],
          },
        },
        newConversationId
      );

      logger.info(`[Knowledge] Created new conversation ${newConversationId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('[Knowledge] Error handling conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(conversationId, userId, message);
  } catch (error) {
    logger.error('[Knowledge] Error adding message:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Format conversation history
 */
const formatConversationHistory = (messages) => {
  return messages.length > 0 ? messages
    .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
    .join('\n\n') : '';
};

/**
 * Query knowledge using RAG
 */
export const queryKnowledge = async (query, ownerType, ownerId, options = {}) => {
  try {
    logger.info(`[Knowledge] Querying knowledge for ${ownerType}: ${ownerId}`);

    // Get processed files for this owner
    const processedFiles = await KnowledgeFile.find({
      ownerType,
      ownerId,
      isProcessed: true,
      isActive: true,
    });

    if (processedFiles.length === 0) {
      return {
        success: false,
        message: 'No processed files found. Please upload and process files first.',
        answer: 'I don\'t have any documents to search through yet. Please upload some files first.',
        sources: [],
      };
    }

    // Initialize RAG system
    await rag.initialize();

    // Get file IDs to filter by
    const documentIds = processedFiles.map((f) => f.documentId).filter(Boolean);

    // Query the RAG system
    const ragResponse = await rag.query(query, {
      filter: {
        ownerType,
        ownerId,
      },
      topK: options.topK || 5,
    });

    logger.info(`[Knowledge] RAG query complete: ${ragResponse.sources?.length || 0} sources found`);

    return {
      success: true,
      answer: ragResponse.answer,
      sources: ragResponse.sources || [],
      relevantFiles: processedFiles.length,
      query,
    };
  } catch (error) {
    logger.error('[Knowledge] Error querying knowledge:', error);
    throw error;
  }
};

/**
 * Conversational query with context
 */
export const conversationalQuery = async (
  userId,
  ownerType,
  ownerId,
  message,
  conversationId,
  options = {}
) => {
  try {
    logger.info(`[Knowledge] Conversational query for ${ownerType}: ${ownerId}`);

    // Handle conversation
    const conversation = await handleKnowledgeConversation(
      userId,
      ownerType,
      ownerId,
      conversationId,
      message
    );

    // Add user message
    await addMessage(conversation.conversationId, userId, 'user', message);

    // Get conversation history
    const messages = await conversationHelpers.getConversationMessages(
      conversation.conversationId,
      userId
    ) || [];

    // Format history for context
    const conversationHistory = formatConversationHistory(messages); // Last 10 messages

    // Detect query complexity
    const complexityAnalysis = detectQueryComplexity(message, conversationHistory);
    const selectedModel = complexityAnalysis.isComplex ? KNOWLEDGE_CONFIG.COMPLEX_MODEL : KNOWLEDGE_CONFIG.MODEL;

    logger.info(`[Knowledge] 🤖 Model Selection - Complexity: ${complexityAnalysis.isComplex ? 'HIGH' : 'LOW'} (score: ${complexityAnalysis.score.toFixed(2)})`);
    logger.info(`[Knowledge] 📊 Using Model: ${selectedModel} - Indicators: [${complexityAnalysis.indicators.join(', ')}]`);

    // Check if there are processed files
    const processedFiles = await KnowledgeFile.find({
      ownerType,
      ownerId,
      isProcessed: true,
      isActive: true,
    });

    let answer;
    let sources = [];
    let modelUsed = selectedModel;

    if (processedFiles.length === 0) {
      answer =
        "I don't have any documents to search through yet. Please upload and process some files first, then I can help answer questions about them.";
    } else {
      // Initialize RAG with appropriate model
      const dynamicLLM = complexityAnalysis.isComplex ? claudeLLM : geminiLLM;
      logger.info(`[Knowledge] 🔧 Initializing RAG with ${complexityAnalysis.isComplex ? 'Claude Opus 4.5' : 'Gemini 2.5 Flash'}`);


      // Update RAG config with selected model
      rag.llm = dynamicLLM;
      await rag.initialize();

      const enrichedQuery = conversationHistory
        ? `Previous conversation:\n${conversationHistory}\n\nCurrent question: ${message}`
        : message;

      const ragResponse = await rag.query(enrichedQuery, {
        filter: {
          ownerType,
          ownerId,
        },
        topK: options.topK || 5,
      });

      answer = ragResponse.answer;
      sources = ragResponse.sources || [];
      logger.info(`✅ Query complete using ${modelUsed}: ${sources.length} sources found, ${answer.length} chars generated`);

      logger.info(`[Knowledge] Query complete using ${modelUsed}: ${sources.length} sources found`);
    }

    // Add assistant message
    await addMessage(conversation.conversationId, userId, 'assistant', answer, {
      sources: sources.map((s) => ({
        documentId: s.documentId,
        content: s.content?.substring(0, 200),
        score: s.score,
      })),
      modelUsed,
      complexityScore: complexityAnalysis.score,
    });

    return {
      success: true,
      conversationId: conversation.conversationId,
      answer,
      sources,
      relevantFiles: processedFiles.length,
      hasProcessedFiles: processedFiles.length > 0,
      modelUsed,
      complexity: {
        isComplex: complexityAnalysis.isComplex,
        score: complexityAnalysis.score,
        indicators: complexityAnalysis.indicators,
      },
    };
  } catch (error) {
    logger.error('[Knowledge] Error in conversational query:', error);
    throw error;
  }
};

/**
 * Search files semantically
 */
export const semanticSearch = async (query, ownerType, ownerId, options = {}) => {
  try {
    logger.info(`[Knowledge] Semantic search for ${ownerType}: ${ownerId}`);

    // Get processed files
    const processedFiles = await KnowledgeFile.find({
      ownerType,
      ownerId,
      isProcessed: true,
      isActive: true,
    });

    if (processedFiles.length === 0) {
      return {
        success: false,
        message: 'No processed files found',
        results: [],
      };
    }

    // Initialize RAG and search
    await rag.initialize();

    const searchResults = await rag.search(query, {
      filter: {
        ownerType,
        ownerId,
      },
      topK: options.limit || 10,
    });

    // Map results to file information
    const results = searchResults.map((result) => {
      const file = processedFiles.find((f) => f.documentId === result.documentId);
      return {
        ...result,
        fileName: file?.originalName,
        fileType: file?.fileType,
        fileId: file?._id?.toString(),
      };
    });

    return {
      success: true,
      results,
      totalResults: results.length,
      query,
    };
  } catch (error) {
    logger.error('[Knowledge] Error in semantic search:', error);
    throw error;
  }
};

/**
 * Get conversation history
 */
export const getConversationHistory = async (conversationId, userId) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);
    const messages = await conversationHelpers.getConversationMessages(conversationId, userId);

    return {
      conversation,
      messages,
    };
  } catch (error) {
    logger.error('[Knowledge] Error getting conversation history:', error);
    throw error;
  }
};

export const knowledgeQueryService = {
  queryKnowledge,
  conversationalQuery,
  semanticSearch,
  getConversationHistory,
};
