/**
 * @file This service handles all business logic related to creative writing generation and conversation management.
 * It interacts with the Google Generative AI (Gemini) model and manages conversation history in the database.
 */

import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import {
  CREATIVE_WRITING_CONFIG,
  WRITING_TYPES,
  WRITING_INTENTS,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  INTENT_KEYWORDS,
  TYPE_KEYWORDS,
} from './creative_writing.constant.js';

// Optimization Recommendation:
// For the 'Conversation' model (used by conversationService and conversationHelpers),
// consider adding the following indexes to improve query performance:
// 1. db.collection('conversations').createIndex({ conversationId: 1 }, { unique: true });
//    - 'conversationId' is frequently used for direct lookups and should be unique.
// 2. db.collection('conversations').createIndex({ userId: 1 });
//    - 'userId' is used to filter conversations by user.
// 3. db.collection('conversations').createIndex({ 'metadata.category': 1 });
//    - If conversations are often queried or filtered by category.

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client with the API key.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates a unique guest user ID using Mongoose's ObjectId.
 * This is used for unauthenticated users to maintain conversation state.
 *
 * @returns {string} A unique string representation of a Mongoose ObjectId.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for creative writing sessions.
 * The ID is prefixed with 'creative_' and includes a timestamp and a random string.
 *
 * @returns {string} A unique conversation ID.
 */
const generateConversationId = () => {
  return `creative_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Analyzes a user's message to detect their intent, desired writing type,
 * word count, and style preferences. It uses predefined keywords and
 * considers conversation history for context.
 *
 * @param {string} message - The user's input message.
 * @param {Array<Object>} [conversationHistory=[]] - An array of previous messages in the conversation,
 *                                                 each with `role` and `content` properties.
 * @returns {Object} An object containing the detected intent, writing type, word count, style, and the original message.
 * @returns {string} return.intent - The detected intent (e.g., 'CREATE_NEW', 'CONTINUE_STORY').
 * @returns {string|null} return.writingType - The detected writing type (e.g., 'POEM', 'SHORT_STORY'), or null if not detected.
 * @returns {number|null} return.wordCount - The detected word count, or null if not specified.
 * @returns {string|null} return.style - The detected writing style (e.g., 'dramatic', 'romantic'), or null if not detected.
 * @returns {string} return.originalMessage - The original user message.
 */
const analyzeUserMessage = (message, conversationHistory = []) => {
  const lowerMessage = message.toLowerCase();

  // Detect intent
  let detectedIntent = WRITING_INTENTS.UNKNOWN;
  let maxMatches = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const matches = keywords.filter(keyword =>
      lowerMessage.includes(keyword.toLowerCase())
    ).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedIntent = intent;
    }
  }

  // Default to CREATE_NEW if no intent detected and no conversation history
  if (
    detectedIntent === WRITING_INTENTS.UNKNOWN &&
    conversationHistory.length === 0
  ) {
    detectedIntent = WRITING_INTENTS.CREATE_NEW;
  }

  // Detect writing type
  let detectedType = null;
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (
      keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))
    ) {
      detectedType = type;
      break;
    }
  }

  // Extract word count if mentioned
  const wordCountMatch = lowerMessage.match(/(\d+)\s*words?/);
  const wordCount = wordCountMatch ? parseInt(wordCountMatch[1]) : null;

  // Detect style preferences
  let detectedStyle = null;
  const styleKeywords = {
    dramatic: ['dramatic', 'drama'],
    romantic: ['romantic', 'romance', 'love'],
    comedic: ['funny', 'comedy', 'comedic', 'humorous'],
    tragic: ['tragic', 'tragedy', 'sad'],
    suspenseful: ['suspense', 'thriller', 'suspenseful'],
    mysterious: ['mystery', 'mysterious'],
    dark: ['dark', 'grim', 'gritty'],
    whimsical: ['whimsical', 'playful', 'fantastical'],
  };

  for (const [style, keywords] of Object.entries(styleKeywords)) {
    // Keywords are already lowercase in styleKeywords, so no need for .toLowerCase() here.
    if (keywords.some(keyword => lowerMessage.includes(keyword))) {
      detectedStyle = style;
      break;
    }
  }

  return {
    intent: detectedIntent,
    writingType: detectedType,
    wordCount,
    style: detectedStyle,
    originalMessage: message,
  };
};

/**
 * Handles the retrieval or creation of a creative writing conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no ID is provided, or if the provided ID is not found/unauthorized, a new conversation is created.
 *
 * @param {string} userId - The ID of the user (guest or authenticated).
 * @param {string|null} conversationId - The ID of an existing conversation, or null if starting a new one.
 * @param {string} userMessage - The initial user message for the conversation, used for title generation.
 * @param {boolean} [isGuest=false] - True if the user is a guest, false otherwise.
 * @param {object} [req=null] - The Express request object, potentially containing user information for logging/context.
 * @returns {Promise<Object>} The conversation object (Mongoose document).
 * @throws {ApiError} If there's an internal server error during conversation handling.
 */
const handleCreativeWritingConversation = async (
  userId,
  conversationId,
  userMessage,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;
    let currentConversationId = conversationId; // Use a mutable variable for the ID

    if (currentConversationId) {
      try {
        // Optimization: Add .lean() to avoid Mongoose document overhead
        // as the conversation object is primarily read from and not directly saved
        // or modified via Mongoose document methods within this flow.
        // Updates are handled by conversationService.updateConversationMetadata
        // which takes the ID and new data, not the document itself.
        conversation = await conversationHelpers.getConversationById(
          currentConversationId,
          userId,
          req,
          { lean: true } // Assuming conversationHelpers.getConversationById supports a lean option
        );
        logger.info(`Fetched conversation with ID: ${currentConversationId}`);
      } catch (error) {
        logger.warn(
          `Conversation ${currentConversationId} not found or unauthorized, creating new one`
        );
        // If the provided conversationId was not found or unauthorized,
        // we should proceed to create a new conversation with a *newly generated* ID.
        // Clear currentConversationId so a new one is generated below.
        currentConversationId = null;
      }
    }

    if (!conversation) {
      // If no conversation was found/fetched, or no ID was provided initially, generate a new one.
      const newGeneratedConversationId = generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Creative Writing: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            writingHistory: [],
          },
        },
        newGeneratedConversationId, // Always use a newly generated ID for new conversations
        req
      );

      logger.info(
        `Created new creative writing conversation ${newGeneratedConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling creative writing conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Adds a new message (user or assistant) to a specified conversation.
 *
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user'|'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The content of the message.
 * @param {Object} [metadata={}] - Optional metadata to store with the message.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<Object>} The updated conversation object after adding the message.
 * @throws {ApiError} If there's an internal server error during message addition.
 */
const addMessage = async (
  conversationId,
  userId,
  role,
  content,
  metadata = {},
  req = null
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
      message,
      req
    );
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to add message'
    );
  }
};

/**
 * Constructs a detailed prompt for the AI model based on user request,
 * detected parameters, and conversation history.
 *
 * @param {string} userMessage - The current user's request.
 * @param {Object} params - An object containing detected writing parameters.
 * @param {string} params.writingType - The type of writing requested (e.g., 'POEM', 'SHORT_STORY').
 * @param {string} [params.style] - The desired writing style (e.g., 'dramatic', 'romantic').
 * @param {string} [params.tone] - The desired writing tone.
 * @param {number} [params.wordCount] - The target word count.
 * @param {string} params.intent - The detected intent (e.g., 'CREATE_NEW', 'CONTINUE_STORY').
 * @param {Array<Object>} [conversationHistory=[]] - An array of previous messages in the conversation,
 *                                                 each with `role` and `content` properties.
 * @returns {string} The fully constructed prompt for the AI model.
 */
const buildWritingPrompt = (userMessage, params, conversationHistory = []) => {
  const { writingType, style, tone, wordCount, intent } = params;

  // Get system prompt based on writing type
  const systemPrompt =
    SYSTEM_PROMPTS[writingType] || SYSTEM_PROMPTS[WRITING_TYPES.GENERAL];

  // Build context from conversation history
  let contextPrompt = '';
  if (conversationHistory.length > 0) {
    const recentMessages = conversationHistory.slice(-4);
    contextPrompt =
      '\n\nPrevious conversation context:\n' +
      recentMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n') +
      '\n';
  }

  // Build constraints
  let constraints = [];
  if (wordCount) {
    constraints.push(`Target length: approximately ${wordCount} words`);
  }
  if (style) {
    constraints.push(`Style: ${style}`);
  }
  if (tone) {
    constraints.push(`Tone: ${tone}`);
  }

  const constraintsText =
    constraints.length > 0
      ? `\n\nConstraints:\n- ${constraints.join('\n- ')}\n`
      : '';

  // Handle different intents
  let intentInstruction = '';
  switch (intent) {
    case WRITING_INTENTS.CONTINUE_STORY:
      intentInstruction =
        'Continue the following story naturally, maintaining the same style, characters, and narrative thread:';
      break;
    case WRITING_INTENTS.REVISE:
      intentInstruction =
        "Revise and improve the following text based on the user's feedback:";
      break;
    case WRITING_INTENTS.EXPAND:
      intentInstruction =
        'Expand on the following text, adding more detail, depth, and development:';
      break;
    case WRITING_INTENTS.CHANGE_STYLE:
      intentInstruction =
        'Rewrite the following text in a different style as requested:';
      break;
    case WRITING_INTENTS.ADD_DETAILS:
      intentInstruction =
        'Add more vivid details and descriptive elements to the following:';
      break;
    case WRITING_INTENTS.SHORTEN:
      intentInstruction =
        'Condense the following text while preserving its essential meaning and impact:';
      break;
    case WRITING_INTENTS.GET_IDEAS:
      intentInstruction =
        'Provide creative ideas and suggestions based on the following request:';
      break;
    case WRITING_INTENTS.BRAINSTORM:
      intentInstruction =
        'Brainstorm multiple creative ideas and possibilities for:';
      break;
    case WRITING_INTENTS.CREATE_NEW:
    default:
      intentInstruction =
        'Create original creative writing based on the following request:';
      break;
  }

  // Construct full prompt
  const fullPrompt = `${systemPrompt}

${contextPrompt}${constraintsText}

${intentInstruction}

User Request: ${userMessage}

Please create engaging, original creative writing that fulfills this request. Be creative, expressive, and true to the requested form and style.`;

  return fullPrompt;
};

/**
 * Generates creative writing content using the configured Google Generative AI model.
 *
 * @param {string} prompt - The detailed prompt to send to the AI model.
 * @param {number} [temperature=CREATIVE_WRITING_CONFIG.TEMPERATURE] - The creativity temperature for the AI model (0.0 to 1.0).
 * @returns {Promise<string>} The generated creative writing text.
 * @throws {ApiError} If there's an error during AI content generation.
 */
const generateCreativeWriting = async (
  prompt,
  temperature = CREATIVE_WRITING_CONFIG.TEMPERATURE
) => {
  try {
    const model = genAI.getGenerativeModel({
      model: CREATIVE_WRITING_CONFIG.MODEL,
      generationConfig: {
        temperature,
        maxOutputTokens: CREATIVE_WRITING_CONFIG.MAX_OUTPUT_TOKENS,
      },
    });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    return text;
  } catch (error) {
    logger.error('Error generating creative writing:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `Failed to generate creative writing: ${error.message}`
    );
  }
};

/**
 * Stores the generated creative writing and associated metadata into the conversation's history.
 * This updates the `metadata.writingHistory` and `metadata.lastWritingType` fields of the conversation.
 *
 * @param {object} conversation - The conversation object (Mongoose document or lean object).
 * @param {string} userId - The ID of the user.
 * @param {object} writingData - The data about the generated writing.
 * @param {string} writingData.userRequest - The user's original request that led to this writing.
 * @param {string} writingData.generatedText - The AI-generated creative writing text.
 * @param {string} writingData.writingType - The type of writing generated.
 * @param {string} [writingData.style] - The style of writing generated.
 * @param {number} [writingData.wordCount] - The target word count for the generated writing.
 * @param {string} writingData.intent - The intent detected for this writing.
 * @param {object} [req=null] - The Express request object (optional).
 * @returns {Promise<void>}
 */
const storeWritingInConversation = async (
  conversation, // Optimization: Changed to accept the conversation object directly to avoid redundant fetch
  userId,
  writingData,
  req = null
) => {
  try {
    // The conversation object is now passed directly, avoiding a redundant database fetch.
    const conversationId = conversation.conversationId; // Extract ID from the passed object

    // Ensure writingHistory exists and is an array
    const currentWritingHistory = conversation.metadata.writingHistory || [];

    // Create a new array with the added writing data
    const updatedWritingHistory = [
      ...currentWritingHistory,
      {
        ...writingData,
        timestamp: new Date(),
      },
    ];

    await conversationService.updateConversationMetadata(
      conversationId,
      userId,
      {
        writingHistory: updatedWritingHistory,
        lastWritingType: writingData.writingType,
      },
      req
    );

    logger.info('Writing stored in conversation history', {
      conversationId,
      writingType: writingData.writingType,
    });
  } catch (error) {
    logger.warn('Error storing writing in conversation:', error);
  }
};

/**
 * Determines if the user's request needs clarification based on initial vagueness
 * and lack of detected writing type, especially for the first message.
 *
 * @param {Object} analysis - The result of `analyzeUserMessage`.
 * @param {string} analysis.originalMessage - The original user message.
 * @param {string|null} analysis.writingType - The detected writing type.
 * @param {Array<Object>} conversationHistory - The full conversation history.
 * @returns {boolean} True if clarification is needed, false otherwise.
 */
const needsClarification = (analysis, conversationHistory) => {
  // If it's the first message and very vague
  if (conversationHistory.length === 0) {
    const vaguePhrases = [
      'write something',
      'help me write',
      'create',
      'make something',
    ];
    const isVague = vaguePhrases.some(phrase =>
      analysis.originalMessage.toLowerCase().includes(phrase)
    );

    if (isVague && !analysis.writingType) {
      return true;
    }
  }

  return false;
};

/**
 * Generates a clarification question for the user based on what information is missing.
 *
 * @param {Object} analysis - The result of `analyzeUserMessage`.
 * @param {string|null} analysis.writingType - The detected writing type.
 * @returns {string} A clarification question or a generic clarification message.
 */
const generateClarificationQuestion = analysis => {
  if (!analysis.writingType) {
    return "I'd love to help you with creative writing! What type of writing would you like to create? For example: a poem, short story, song lyrics, script, or something else?";
  }

  return RESPONSE_MESSAGES.CLARIFICATION_NEEDED;
};

/**
 * The main function to process a conversational creative writing request.
 * It orchestrates conversation handling, message analysis, prompt building,
 * AI generation, and storing results.
 *
 * @param {string} userId - The ID of the user (guest or authenticated).
 * @param {string} message - The user's current input message.
 * @param {string|null} conversationId - The ID of the current conversation, or null for a new one.
 * @param {boolean} [isGuest=false] - True if the user is a guest, false otherwise.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<Object>} An object containing the success status, conversation ID, AI response,
 *                            detected writing parameters, and analysis.
 * @returns {boolean} return.success - True if the request was processed successfully.
 * @returns {string} return.conversationId - The ID of the conversation.
 * @returns {string} return.response - The AI's response (generated text or clarification question).
 * @returns {boolean} [return.needsClarification] - True if the AI is asking for clarification.
 * @returns {Object} return.writingParams - The parameters used for writing generation.
 * @returns {Object} return.analysis - The detailed analysis of the user's message.
 * @throws {ApiError} If any underlying operation fails.
 */
const processConversationalRequest = async (
  userId,
  message,
  conversationId,
  isGuest = false,
  req = null
) => {
  try {
    // Handle or create conversation
    const conversation = await handleCreativeWritingConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );

    const actualConversationId = conversation.conversationId;

    // Add user message to conversation
    await addMessage(actualConversationId, userId, 'user', message, {}, req);

    // Get conversation history
    // If conversation is a lean object, conversation.messages will be a plain array.
    // If it's a Mongoose document, it will be a Mongoose array. Both are iterable.
    const conversationHistory = conversation.messages || [];

    // Analyze user message
    const analysis = analyzeUserMessage(message, conversationHistory);

    logger.info('Message analysis:', {
      conversationId: actualConversationId,
      intent: analysis.intent,
      writingType: analysis.writingType,
      style: analysis.style,
      wordCount: analysis.wordCount,
    });

    // Check if we need clarification
    if (needsClarification(analysis, conversationHistory)) {
      const clarificationMessage = generateClarificationQuestion(analysis);

      await addMessage(
        actualConversationId,
        userId,
        'assistant',
        clarificationMessage,
        {
          needsClarification: true,
        },
        req
      );

      return {
        success: true,
        conversationId: actualConversationId,
        response: clarificationMessage,
        needsClarification: true,
        analysis,
      };
    }

    // Merge detected parameters with defaults
    const writingParams = {
      ...DEFAULT_PARAMS,
      writingType: analysis.writingType || DEFAULT_PARAMS.writingType,
      style: analysis.style,
      wordCount: analysis.wordCount,
      intent: analysis.intent,
    };

    // Build writing prompt
    const prompt = buildWritingPrompt(
      message,
      writingParams,
      conversationHistory
    );

    logger.info('Generating creative writing', {
      conversationId: actualConversationId,
      writingType: writingParams.writingType,
      intent: writingParams.intent,
    });

    // Generate creative writing
    const generatedText = await generateCreativeWriting(
      prompt,
      writingParams.temperature
    );

    // Optimization: Pass the 'conversation' object directly to avoid a redundant database fetch.
    await storeWritingInConversation(
      conversation, // Pass the conversation object
      userId,
      {
        userRequest: message,
        generatedText,
        writingType: writingParams.writingType,
        style: writingParams.style,
        wordCount: writingParams.wordCount,
        intent: writingParams.intent,
      },
      req
    );

    // Add assistant response to conversation
    await addMessage(
      actualConversationId,
      userId,
      'assistant',
      generatedText,
      {
        writingType: writingParams.writingType,
        style: writingParams.style,
        intent: writingParams.intent,
      },
      req
    );

    logger.info('Creative writing generated successfully', {
      conversationId: actualConversationId,
      textLength: generatedText.length,
    });

    return {
      success: true,
      conversationId: actualConversationId,
      response: generatedText,
      writingParams,
      analysis,
    };
  } catch (error) {
    logger.error(
      'Error processing conversational creative writing request:',
      error
    );
    throw error;
  }
};

/**
 * Retrieves the full conversation history for a given conversation ID and user.
 *
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {object} [req=null] - The Express request object.
 * @returns {Promise<Object>} An object containing the conversation details and messages.
 * @returns {string} return.conversationId - The ID of the conversation.
 * @returns {string} return.title - The title of the conversation.
 * @returns {Array<Object>} return.messages - An array of message objects in the conversation.
 * @returns {Object} return.metadata - Additional metadata associated with the conversation.
 * @returns {Date} return.createdAt - The creation timestamp of the conversation.
 * @returns {Date} return.updatedAt - The last update timestamp of the conversation.
 * @throws {ApiError} If the conversation is not found or unauthorized.
 */
const getConversationHistory = async (conversationId, userId, req = null) => {
  try {
    // Optimization: Add .lean() to avoid Mongoose document overhead
    // as this function is purely for retrieving and returning data,
    // and no Mongoose document methods are used on the fetched object.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      { lean: true } // Assuming conversationHelpers.getConversationById supports a lean option
    );

    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      messages: conversation.messages,
      metadata: conversation.metadata,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  }
};

/**
 * @constant {Object} creativeWritingService - An object exporting all creative writing related service functions.
 * @property {function(): string} generateGuestUserId - Generates a unique ID for guest users.
 * @property {function(string, string, string, boolean, object): Promise<Object>} processConversationalRequest - Processes a user's creative writing request conversationally.
 * @property {function(string, string, object): Promise<Object>} getConversationHistory - Retrieves the full history of a creative writing conversation.
 */
export const creativeWritingService = {
  generateGuestUserId,
  processConversationalRequest,
  getConversationHistory,
};