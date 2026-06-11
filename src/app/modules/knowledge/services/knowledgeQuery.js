/**
 * @module knowledgeQueryService
 * @description Provides services for querying knowledge, handling conversational AI, and performing semantic searches
 * using a RAG (RetrieRetrieval Augmented Generation) system with Google Gemini models.
 * It integrates with a PostgreSQL vector database for document retrieval and manages conversation history.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import httpStatus from 'http-status';
import { RAGSystem } from 'rag-system-pgvector';
import { enableHybridSearch } from '../../../../shared/hybridSearch.js';
import { SafeGoogleGenerativeAIEmbeddings } from '../../../../shared/embeddings.js';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
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
// FIX: Import services for authorization and usage tracking to enforce security and business logic.
import { authorizeKnowledgeAccess } from '../../auth/auth.service.js';
import { usageService } from '../../usage/usage.service.js';

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client with the API key.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * @constant {SafeGoogleGenerativeAIEmbeddings} embeddings - Initializes the embeddings model for RAG.
 * Uses Google Generative AI embeddings with a target dimension of 768.
 */
const embeddings = new SafeGoogleGenerativeAIEmbeddings({
  apiKey: config.gemini_secret_key,
  targetDimension: 768,
});

/**
 * @constant {ChatGoogleGenerativeAI} geminiLLM - Initializes the default Gemini LLM for RAG.
 * Uses the model specified in KNOWLEDGE_CONFIG with a defined temperature.
 */
const geminiLLM = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: KNOWLEDGE_CONFIG.MODEL,
  temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
});

/**
 * @constant {ChatGoogleGenerativeAI} geminiComplexLLM - Initializes a more complex Gemini LLM for RAG.
 * Uses the complex model specified in KNOWLEDGE_CONFIG, typically for more demanding queries.
 */
// FIX: Renamed variable from `claudeLLM` to `geminiComplexLLM` to accurately reflect that it's a Gemini model, not a Claude model. This prevents configuration confusion.
const geminiComplexLLM = new ChatGoogleGenerativeAI({
  apiKey: config.gemini_secret_key,
  model: KNOWLEDGE_CONFIG.COMPLEX_MODEL,
  temperature: KNOWLEDGE_CONFIG.TEMPERATURE,
});

/**
 * @constant {object} ragConfig - Configuration object for the RAGSystem.
 * Specifies database connection details, embeddings model, and the default LLM.
 */
const ragConfig = {
  database: {
    // --- GCP Database Resiliency Configuration ---
    // Standard connection details
    host: RAG_DATABASE_CONFIG.HOST,
    port: RAG_DATABASE_CONFIG.PORT,
    database: RAG_DATABASE_CONFIG.DATABASE,
    user: RAG_DATABASE_CONFIG.USERNAME, // 'user' is the standard property name for node-postgres
    password: RAG_DATABASE_CONFIG.PASSWORD,

    // Connection Pooling: Essential for production to manage connections efficiently and prevent exhaustion.
    max: 20, // Max number of clients in the pool
    min: 2, // Min number of clients in the pool
    idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed

    // Network Resiliency: Optimized for GCP networking (VPC Peering, Cloud SQL Auth Proxy).
    connectionTimeoutMillis: 5000, // Timeout for establishing a connection.
    keepAlive: true, // Enables TCP Keep-Alive to prevent intermediate firewalls/proxies from dropping idle connections.
    keepAliveInitialDelayMillis: 30000, // How long to wait before sending the first keep-alive probe.

    // Query Resiliency: Prevents long-running or hung queries from holding connections indefinitely.
    statement_timeout: 15000, // Aborts any statement that takes more than 15 seconds.
  },
  embeddings: embeddings,
  llm: geminiLLM,
  embeddingDimensions: 768,
};

/**
 * @constant {RAGSystem} rag - Initializes the RAGSystem with the defined configuration.
 * This system is responsible for retrieving relevant documents and generating answers.
 */
const rag = new RAGSystem(ragConfig);
enableHybridSearch(rag);

/**
 * Detects the complexity of a user query based on keywords and conversation history.
 * A higher complexity score suggests the need for a more capable LLM.
 *
 * @param {string} message - The user's current message.
 * @param {string} [conversationHistory=''] - The formatted history of the conversation, used for additional context.
 * @returns {{isComplex: boolean, score: number, indicators: string[]}} An object indicating:
 *   - `isComplex`: A boolean indicating if the query is considered complex.
 *   - `score`: The calculated complexity score.
 *   - `indicators`: An array of keywords or factors that contributed to the complexity.
 */
const detectQueryComplexity = (message, conversationHistory = '') => {
  const fullText = `${conversationHistory} ${message}`.toLowerCase();

  let complexityScore = 0;
  let indicators = [];

  // Check for high complexity keywords
  COMPLEXITY_INDICATORS.HIGH_COMPLEXITY_KEYWORDS.forEach((keyword) => {
    if (fullText.includes(keyword.toLowerCase())) {
      complexityScore += 0.15;
      indicators.push(keyword);
    }
  });

  // Check for medium complexity keywords
  COMPLEXITY_INDICATORS.MEDIUM_COMPLEXITY_KEYWORDS.forEach((keyword) => {
    if (fullText.includes(keyword.toLowerCase())) {
      complexityScore += 0.08;
      indicators.push(keyword);
    }
  });

  // Additional complexity factors
  const wordCount = message.split(' ').length;
  if (wordCount > 30) complexityScore += 0.1; // Long question
  if (message.includes('?') && message.split('?').length > 2)
    complexityScore += 0.1; // Multiple questions
  if (/\d+/.test(message)) complexityScore += 0.05; // Contains numbers (might be asking for calculations)

  // Conversation depth increases complexity
  if (conversationHistory) {
    const historyLines = conversationHistory.split('\n').length;
    if (historyLines > 10) complexityScore += 0.1;
    else if (historyLines > 5) complexityScore += 0.05;
  }

  const isComplex = complexityScore >= KNOWLEDGE_CONFIG.COMPLEXITY_THRESHOLD;

  logger.info(
    `[Knowledge] Complexity detection: score=${complexityScore.toFixed(2)}, isComplex=${isComplex}, indicators=[${indicators.slice(0, 3).join(', ')}]`
  );

  return {
    isComplex,
    score: complexityScore,
    indicators: indicators.slice(0, 5),
  };
};

/**
 * Generates a unique conversation ID.
 *
 * @returns {string} A unique string identifier for a new conversation.
 */
const generateConversationId = () => {
  return `knowledge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the lifecycle of a knowledge conversation, either fetching an existing one
 * or creating a new one if `conversationId` is not provided or not found.
 *
 * @param {string} userId - The ID of the user initiating or participating in the conversation.
 * @param {OWNER_TYPES} ownerType - The type of owner associated with the knowledge base (e.g., 'user', 'organization').
 * @param {string} ownerId - The ID of the specific owner.
 * @param {string} [conversationId] - An optional existing conversation ID. If provided and valid, the conversation is fetched.
 * @param {string} userMessage - The initial message from the user, used for generating a title if a new conversation is created.
 * @returns {Promise<object>} The conversation object, either newly created or fetched.
 * @throws {ApiError} If there's an internal server error while handling the conversation.
 */
const handleKnowledgeConversation = async (
  userId,
  ownerType,
  ownerId,
  conversationId,
  userMessage
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId
        );
        logger.info(`[Knowledge] Fetched conversation: ${conversationId}`);
      } catch (error) {
        logger.warn(
          `[Knowledge] Conversation ${conversationId} not found for user ${userId}, creating new one`
        );
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Adds a new message to an existing conversation.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user' | 'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The textual content of the message.
 * @param {object} [metadata={}] - Optional metadata to store with the message (e.g., sources, model used).
 * @returns {Promise<object>} The updated conversation object after adding the message.
 * @throws {ApiError} If there's an internal server error while adding the message.
 */
const addMessage = async (
  conversationId,
  userId,
  role,
  content,
  metadata = {}
) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(
      conversationId,
      userId,
      message
    );
  } catch (error) {
    logger.error('[Knowledge] Error adding message:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add message'
    );
  }
};

/**
 * Formats an array of message objects into a single string, suitable for use as conversation history context.
 * Each message is prefixed with its role (e.g., "USER: ", "ASSISTANT: ").
 *
 * @param {Array<object>} messages - An array of message objects, each expected to have `role` and `content` properties.
 * @returns {string} A newline-separated string of formatted messages, or an empty string if no messages are provided.
 */
const formatConversationHistory = (messages) => {
  return messages.length > 0
    ? messages
        .map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
        .join('\n\n')
    : '';
};

/**
 * Queries the knowledge base using the RAG system to find an answer to a given query.
 * It retrieves relevant documents based on the `ownerType` and `ownerId` and then generates an answer.
 *
 * This service is multi-tenant aware, filtering knowledge based on the provided `ownerType` and `ownerId`.
 * Access is restricted, and the user's permission to query the specified knowledge base is verified before execution.
 * Usage limits for the owner are also checked and enforced.
 *
 * @param {string} userId - The ID of the user making the query, for authorization.
 * @param {string} query - The user's query string.
 * @param {OWNER_TYPES} ownerType - The type of owner (e.g., 'user', 'organization') to filter knowledge files.
 * @param {string} ownerId - The ID of the specific owner to filter knowledge files.
 * @param {object} [options={}] - Optional query parameters.
 * @param {number} [options.topK=5] - The number of top relevant documents to retrieve from the RAG system.
 * @returns {Promise<{success: boolean, message?: string, answer: string, sources: Array<object>, relevantFiles: number, query: string}>} An object containing:
 *   - `success`: Boolean indicating if the query was successful.
 *   - `message`: An optional message, e.g., if no files are processed.
 *   - `answer`: The generated answer from the RAG system.
 *   - `sources`: An array of source documents used to generate the answer.
 *   - `relevantFiles`: The total number of processed files found for the owner.
 *   - `query`: The original query.
 * @throws {Error} If an error occurs during the knowledge query process, including authorization or usage limit failures.
 */
export const queryKnowledge = async (
  userId,
  query,
  ownerType,
  ownerId,
  options = {}
) => {
  try {
    // SECURITY: Authorize that the user has rights to query this knowledge base, preventing IDOR.
    await authorizeKnowledgeAccess(userId, ownerType, ownerId);

    // INTEGRATION: Check if usage limits are exceeded before proceeding.
    await usageService.checkQueryLimits(ownerId, ownerType);

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
        message:
          'No processed files found. Please upload and process files first.',
        answer:
          "I don't have any documents to search through yet. Please upload some files first.",
        sources: [],
      };
    }

    // Initialize RAG system
    await rag.initialize();

    // Query the RAG system
    const ragResponse = await rag.query(query, {
      filter: {
        ownerType,
        ownerId,
      },
      topK: options.topK || 5,
    });

    logger.info(
      `[Knowledge] RAG query complete: ${ragResponse.sources?.length || 0} sources found`
    );

    // INTEGRATION: Record the query usage after a successful response.
    await usageService.recordQueryUsage({
      userId,
      ownerId,
      ownerType,
      model: KNOWLEDGE_CONFIG.MODEL, // Simple query uses the default model
      type: 'knowledge_query',
    });

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
 * Handles a conversational query, maintaining context and dynamically selecting an LLM
 * based on query complexity. It integrates with the RAG system for knowledge retrieval.
 *
 * This service is multi-tenant aware, filtering knowledge based on the provided `ownerType` and `ownerId`.
 * Access is restricted, and the user's permission to query the specified knowledge base is verified before execution.
 * Usage limits for the owner are also checked and enforced.
 *
 * @param {string} userId - The ID of the user making the query.
 * @param {OWNER_TYPES} ownerType - The type of owner (e.g., 'user', 'organization') for the knowledge base.
 * @param {string} ownerId - The ID of the specific owner.
 * @param {string} message - The user's current message in the conversation.
 * @param {string} [conversationId] - The ID of the ongoing conversation. If not provided, a new one is created.
 * @param {object} [options={}] - Optional query parameters.
 * @param {number} [options.topK=5] - The number of top relevant documents to retrieve for RAG.
 * @returns {Promise<{success: boolean, conversationId: string, answer: string, sources: Array<object>, relevantFiles: number, hasProcessedFiles: boolean, modelUsed: string, complexity: {isComplex: boolean, score: number, indicators: string[]}}>} An object containing:
 *   - `success`: Boolean indicating if the query was successful.
 *   - `conversationId`: The ID of the conversation.
 *   - `answer`: The generated answer from the LLM.
 *   - `sources`: An array of source documents used for the answer.
 *   - `relevantFiles`: The total number of processed files found for the owner.
 *   - `hasProcessedFiles`: Boolean indicating if any processed files exist.
 *   - `modelUsed`: The name of the LLM model used for the query.
 *   - `complexity`: An object detailing the complexity analysis (`isComplex`, `score`, `indicators`).
 * @throws {Error} If an error occurs during the conversational query process, including authorization or usage limit failures.
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
    // SECURITY: Authorize that the user has rights to query this knowledge base, preventing IDOR.
    await authorizeKnowledgeAccess(userId, ownerType, ownerId);

    // INTEGRATION: Check if usage limits are exceeded before proceeding.
    await usageService.checkQueryLimits(ownerId, ownerType);

    logger.info(
      `[Knowledge] Conversational query for ${ownerType}: ${ownerId}`
    );

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
    const messages =
      (await conversationHelpers.getConversationMessages(
        conversation.conversationId,
        userId
      )) || [];

    // Format history for context
    const conversationHistory = formatConversationHistory(messages);

    // Detect query complexity
    const complexityAnalysis = detectQueryComplexity(
      message,
      conversationHistory
    );
    const selectedModel = complexityAnalysis.isComplex
      ? KNOWLEDGE_CONFIG.COMPLEX_MODEL
      : KNOWLEDGE_CONFIG.MODEL;

    logger.info(
      `[Knowledge] 🤖 Model Selection - Complexity: ${complexityAnalysis.isComplex ? 'HIGH' : 'LOW'} (score: ${complexityAnalysis.score.toFixed(2)})`
    );
    logger.info(
      `[Knowledge] 📊 Using Model: ${selectedModel} - Indicators: [${complexityAnalysis.indicators.join(', ')}]`
    );

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
      // FIX: Use the correctly named variable for the complex model.
      const dynamicLLM = complexityAnalysis.isComplex
        ? geminiComplexLLM
        : geminiLLM;
      // FIX: Log the actual model name from config instead of a hardcoded string.
      logger.info(`[Knowledge] 🔧 Initializing RAG with ${selectedModel}`);

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
      // FIX: Removed redundant log message.
      logger.info(
        `✅ Query complete using ${modelUsed}: ${sources.length} sources found, ${answer.length} chars generated`
      );
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

    // INTEGRATION: Record the query usage after a successful response.
    await usageService.recordQueryUsage({
      userId,
      ownerId,
      ownerType,
      model: modelUsed,
      type: 'conversational_query',
      complexityScore: complexityAnalysis.score,
      conversationId: conversation.conversationId,
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
 * Performs a semantic search on the knowledge base to find documents relevant to a given query.
 * It uses the RAG system's search capabilities to retrieve chunks of text.
 *
 * This service is multi-tenant aware, filtering knowledge based on the provided `ownerType` and `ownerId`.
 * Access is restricted, and the user's permission to search the specified knowledge base is verified before execution.
 * Usage limits for search actions are also checked and enforced.
 *
 * @param {string} userId - The ID of the user making the query, for authorization.
 * @param {string} query - The search query string.
 * @param {OWNER_TYPES} ownerType - The type of owner (e.g., 'user', 'organization') to filter knowledge files.
 * @param {string} ownerId - The ID of the specific owner to filter knowledge files.
 * @param {object} [options={}] - Optional search parameters.
 * @param {number} [options.limit=10] - The maximum number of search results to return.
 * @returns {Promise<{success: boolean, message?: string, results: Array<object>, totalResults: number, query: string}>} An object containing:
 *   - `success`: Boolean indicating if the search was successful.
 *   - `message`: An optional message, e.g., if no files are processed.
 *   - `results`: An array of search results, each including document content, score, and associated file metadata.
 *   - `totalResults`: The total number of results found.
 *   - `query`: The original search query.
 * @throws {Error} If an error occurs during the semantic search process, including authorization or usage limit failures.
 */
export const semanticSearch = async (
  userId,
  query,
  ownerType,
  ownerId,
  options = {}
) => {
  try {
    // SECURITY: Authorize that the user has rights to search this knowledge base, preventing IDOR.
    await authorizeKnowledgeAccess(userId, ownerType, ownerId);

    // INTEGRATION: Check if usage limits are exceeded before proceeding.
    // Note: Semantic search might have a different or 'free' usage tier.
    await usageService.checkQueryLimits(ownerId, ownerType, 'search');

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
      const file = processedFiles.find(
        (f) => f.documentId === result.documentId
      );
      return {
        ...result,
        fileName: file?.originalName,
        fileType: file?.fileType,
        fileId: file?._id?.toString(),
      };
    });

    // INTEGRATION: Record usage for the search action.
    await usageService.recordQueryUsage({
      userId,
      ownerId,
      ownerType,
      type: 'semantic_search',
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
 * Retrieves the full conversation history for a given conversation ID and user.
 *
 * Security is a key consideration. This function performs a two-step authorization check:
 * 1. It verifies that the requesting user is a participant in the specified conversation.
 * 2. It re-validates that the user *still* has access to the underlying knowledge base
 *    (defined by `ownerType` and `ownerId` in the conversation's metadata). This prevents
 *    a user from accessing conversation data after their permissions to the associated
 *    knowledge resource have been revoked.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @returns {Promise<{conversation: object, messages: Array<object>}>} An object containing:
 *   - `conversation`: The conversation metadata object.
 *   - `messages`: An array of message objects within the conversation.
 * @throws {Error} Throws an error if the conversation is not found or if the user fails
 * either of the authorization checks.
 */
export const getConversationHistory = async (conversationId, userId) => {
  try {
    // First, verify the user is a participant in the conversation.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId
    );

    // SECURITY: Second, verify the user STILL has access to the underlying knowledge base.
    // This prevents a security gap where a user could access conversation data about a resource
    // (e.g., an organization's knowledge) after their permissions for that resource were revoked.
    const { ownerType, ownerId } = conversation.metadata;
    if (ownerType && ownerId) {
      await authorizeKnowledgeAccess(userId, ownerType, ownerId);
    } else {
      logger.warn(
        `[Knowledge] Conversation ${conversationId} is missing owner metadata for a full authorization check.`
      );
    }

    const messages = await conversationHelpers.getConversationMessages(
      conversationId,
      userId
    );

    return {
      conversation,
      messages,
    };
  } catch (error) {
    logger.error('[Knowledge] Error getting conversation history:', error);
    throw error;
  }
};

/**
 * @typedef {object} KnowledgeQueryService
 * @property {function(string, string, OWNER_TYPES, string, object): Promise<object>} queryKnowledge - Function to query knowledge using RAG.
 * @property {function(string, OWNER_TYPES, string, string, string, object): Promise<object>} conversationalQuery - Function to handle conversational queries with context.
 * @property {function(string, string, OWNER_TYPES, string, object): Promise<object>} semanticSearch - Function to perform semantic search on knowledge base.
 * @property {function(string, string): Promise<object>} getConversationHistory - Function to retrieve a conversation's history.
 */

/**
 * @constant {KnowledgeQueryService} knowledgeQueryService - An object bundling all knowledge query related services.
 */
export const knowledgeQueryService = {
  queryKnowledge,
  conversationalQuery,
  semanticSearch,
  getConversationHistory,
};