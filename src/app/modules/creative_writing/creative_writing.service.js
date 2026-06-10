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
// BUG & INTEGRATION FIX: Import necessary services for usage tracking and role-based access control.
// These are assumed to exist and provide the necessary business logic for checking limits,
// recording usage, and validating user hierarchy within a workspace/tenant.
import { usageService } from '../usage/usage.service.js';
import { workspaceService } from '../workspaces/workspace.service.js';
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
 * A helper function to fetch a conversation while enforcing role-based access control.
 * It ensures that the requesting user (`req.user`) has the permission to access the
 * conversation, either by being the owner or by having a managerial/administrative role
 * over the conversation's owner within the same workspace.
 *
 * @param {string} conversationId - The ID of the conversation to fetch.
 * @param {string} targetUserId - The ID of the user who owns the conversation.
 * @param {object} req - The Express request object, containing the authenticated user (`req.user`).
 * @returns {Promise<Object|null>} The conversation object if found and authorized, otherwise null.
 * @throws {ApiError} If the user is not authorized (FORBIDDEN).
 */
const _getAuthorizedConversation = async (
  conversationId,
  targetUserId,
  req
) => {
  // BUG & INTEGRATION FIX: Ensure a request object with an authenticated user is present.
  if (!req || !req.user) {
    logger.error('Authorization check failed: req.user is missing.');
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required.');
  }

  const authenticatedUser = req.user;

  // 1. Check if the authenticated user is the owner of the conversation.
  const isOwner = authenticatedUser.id === targetUserId;

  // 2. If not the owner, check for hierarchical permissions (manager, admin, super_admin).
  // This call is assumed to be tenant-aware, ensuring the manager and user are in the same workspace.
  const isAuthorizedManager =
    !isOwner &&
    (await workspaceService.isManagerOf(authenticatedUser, targetUserId));

  // 3. Super Admins have universal access.
  const isSuperAdmin = authenticatedUser.role === 'super_admin';

  if (!isOwner && !isAuthorizedManager && !isSuperAdmin) {
    logger.warn(
      `Authorization failed for user ${authenticatedUser.id} trying to access conversation ${conversationId} belonging to user ${targetUserId}.`
    );
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You are not authorized to access this conversation.'
    );
  }

  // If authorized, attempt to fetch the conversation.
  // The helper is still passed the targetUserId to ensure it fetches the conversation for the correct user.
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      targetUserId, // We still filter by the target user to ensure the conversationId belongs to them.
      req,
      { lean: true }
    );
    return conversation;
  } catch (error) {
    // If the helper throws a "not found" error, we return null to allow the caller to handle it (e.g., create a new conversation).
    // Any other error type should be re-thrown.
    if (error.statusCode === httpStatus.NOT_FOUND) {
      return null;
    }
    throw error;
  }
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
    let currentConversationId = conversationId;

    if (currentConversationId) {
      // For guests, ownership is based on the guest ID. No complex auth needed.
      if (isGuest) {
        try {
          conversation = await conversationHelpers.getConversationById(
            currentConversationId,
            userId,
            req,
            { lean: true }
          );
          logger.info(`Fetched guest conversation with ID: ${currentConversationId}`);
        } catch (error) {
          logger.warn(
            `Guest conversation ${currentConversationId} not found, creating new one.`
          );
          currentConversationId = null;
        }
      } else {
        // BUG & INTEGRATION FIX: Use the centralized authorization helper for authenticated users.
        conversation = await _getAuthorizedConversation(
          currentConversationId,
          userId,
          req
        );
        if (conversation) {
          logger.info(
            `Fetched and authorized conversation with ID: ${currentConversationId} for user ${req.user.id}`
          );
        } else {
          // This case means the conversation was not found for the target user, which is fine.
          // _getAuthorizedConversation would have thrown an error if it was a permission issue.
          // We proceed to create a new conversation.
          logger.warn(
            `Conversation ${currentConversationId} not found for user ${userId}, creating new one.`
          );
          currentConversationId = null;
        }
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
    // BUG & INTEGRATION FIX: Propagate specific errors from authorization helpers.
    if (error instanceof ApiError) {
      throw error;
    }
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
 * @param {string} userId - The ID of the user (guest or authenticated) for whom the action is being taken.
 * @param {string} message - The user's current input message.
 * @param {string|null} conversationId - The ID of the current conversation, or null for a new one.
 * @param {boolean} [isGuest=false] - True if the user is a guest, false otherwise.
 * @param {object} [req=null] - The Express request object, containing the authenticated user (`req.user`).
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
    // BUG & INTEGRATION FIX: For authenticated users, perform authorization and usage checks upfront.
    if (!isGuest) {
      if (!req || !req.user) {
        throw new ApiError(httpStatus.UNAUTHORIZED, 'Authentication required.');
      }
      const authenticatedUser = req.user;

      // 1. Authorization Check: Can the authenticated user act for the target user?
      const isOwner = authenticatedUser.id === userId;
      // isManagerOf should be tenant-aware, checking roles within the same workspace.
      const isAuthorizedManager =
        !isOwner &&
        (await workspaceService.isManagerOf(authenticatedUser, userId));
      const isSuperAdmin = authenticatedUser.role === 'super_admin';

      if (!isOwner && !isAuthorizedManager && !isSuperAdmin) {
        throw new ApiError(
          httpStatus.FORBIDDEN,
          'You are not authorized to perform this action for the specified user.'
        );
      }

      // 2. Usage Limit Check: Does the user's workspace have generation credits remaining?
      // The check is performed against the workspace of the user making the request.
      const hasSufficientUsage = await usageService.checkLimits(
        authenticatedUser.workspaceId,
        'creative_writing' // Specify the feature being used
      );
      if (!hasSufficientUsage) {
        throw new ApiError(
          httpStatus.PAYMENT_REQUIRED,
          'Workspace usage limit exceeded. Please upgrade your plan or contact your administrator.'
        );
      }
    }

    // Handle or create conversation (now with authorization handled)
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

    // BUG & INTEGRATION FIX: Record the usage after a successful generation.
    // Usage is attributed to the authenticated user and their workspace.
    if (!isGuest) {
      await usageService.recordUsage({
        userId: req.user.id,
        workspaceId: req.user.workspaceId,
        feature: 'creative_writing',
        units: 1, // Or could be token-based, e.g., generatedText.length / 4
        metadata: {
          conversationId: actualConversationId,
          writingType: writingParams.writingType,
        },
      });
    }

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
    // BUG & INTEGRATION FIX: Use the centralized authorization helper to enforce role-based access.
    // This prevents IDOR by ensuring the authenticated user (`req.user`) has rights to view
    // the conversation belonging to the target `userId`.
    const conversation = await _getAuthorizedConversation(
      conversationId,
      userId,
      req
    );

    // If conversation is not found, _getAuthorizedConversation will return null.
    // If user is not authorized, it will throw a FORBIDDEN error which is caught below.
    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found.');
    }

    return {
      conversationId: conversation.conversationId,
      title: conversation.title,
      messages: conversation.messages,
      metadata: conversation.metadata,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  } catch (error) {
    // BUG & INTEGRATION FIX: Propagate specific errors from the authorization helper.
    // If it's already an ApiError (like FORBIDDEN), re-throw it. Otherwise, wrap it.
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Error getting conversation history:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to retrieve conversation history'
    );
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