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

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generate unique guest user ID
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generate unique conversation ID
 */
const generateConversationId = () => {
  return `creative_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Analyze user message to detect intent and extract parameters
 */
const analyzeUserMessage = (message, conversationHistory = []) => {
  const lowerMessage = message.toLowerCase();

  // Detect intent
  let detectedIntent = WRITING_INTENTS.UNKNOWN;
  let maxMatches = 0;

  for (const [intent, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const matches = keywords.filter(keyword => lowerMessage.includes(keyword.toLowerCase())).length;
    if (matches > maxMatches) {
      maxMatches = matches;
      detectedIntent = intent;
    }
  }

  // Default to CREATE_NEW if no intent detected and no conversation history
  if (detectedIntent === WRITING_INTENTS.UNKNOWN && conversationHistory.length === 0) {
    detectedIntent = WRITING_INTENTS.CREATE_NEW;
  }

  // Detect writing type
  let detectedType = null;
  for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
    if (keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()))) {
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
 * Handle creative writing conversation (create or retrieve)
 */
const handleCreativeWritingConversation = async (userId, conversationId, userMessage, isGuest = false, req = null) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId, req);
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        logger.warn(`Conversation ${conversationId} not found, creating new one`);
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

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
        newConversationId,
        req
      );

      logger.info(`Created new creative writing conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling creative writing conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to handle conversation');
  }
};

/**
 * Add message to conversation
 */
const addMessage = async (conversationId, userId, role, content, metadata = {}, req = null) => {
  try {
    const message = {
      role,
      content,
      timestamp: new Date(),
      metadata,
    };

    return await conversationService.addMessageToConversation(conversationId, userId, message, req);
  } catch (error) {
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Build writing prompt based on parameters and user request
 */
const buildWritingPrompt = (userMessage, params, conversationHistory = []) => {
  const { writingType, style, tone, wordCount, intent } = params;

  // Get system prompt based on writing type
  const systemPrompt = SYSTEM_PROMPTS[writingType] || SYSTEM_PROMPTS[WRITING_TYPES.GENERAL];

  // Build context from conversation history
  let contextPrompt = '';
  if (conversationHistory.length > 0) {
    const recentMessages = conversationHistory.slice(-4);
    contextPrompt = '\n\nPrevious conversation context:\n' +
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

  const constraintsText = constraints.length > 0
    ? `\n\nConstraints:\n- ${constraints.join('\n- ')}\n`
    : '';

  // Handle different intents
  let intentInstruction = '';
  switch (intent) {
    case WRITING_INTENTS.CONTINUE_STORY:
      intentInstruction = 'Continue the following story naturally, maintaining the same style, characters, and narrative thread:';
      break;
    case WRITING_INTENTS.REVISE:
      intentInstruction = 'Revise and improve the following text based on the user\'s feedback:';
      break;
    case WRITING_INTENTS.EXPAND:
      intentInstruction = 'Expand on the following text, adding more detail, depth, and development:';
      break;
    case WRITING_INTENTS.CHANGE_STYLE:
      intentInstruction = 'Rewrite the following text in a different style as requested:';
      break;
    case WRITING_INTENTS.ADD_DETAILS:
      intentInstruction = 'Add more vivid details and descriptive elements to the following:';
      break;
    case WRITING_INTENTS.SHORTEN:
      intentInstruction = 'Condense the following text while preserving its essential meaning and impact:';
      break;
    case WRITING_INTENTS.GET_IDEAS:
      intentInstruction = 'Provide creative ideas and suggestions based on the following request:';
      break;
    case WRITING_INTENTS.BRAINSTORM:
      intentInstruction = 'Brainstorm multiple creative ideas and possibilities for:';
      break;
    case WRITING_INTENTS.CREATE_NEW:
    default:
      intentInstruction = 'Create original creative writing based on the following request:';
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
 * Generate creative writing using AI
 */
const generateCreativeWriting = async (prompt, temperature = CREATIVE_WRITING_CONFIG.TEMPERATURE) => {
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
 * Store writing in conversation history
 */
const storeWritingInConversation = async (conversationId, userId, writingData, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

    if (!conversation.metadata.writingHistory) {
      conversation.metadata.writingHistory = [];
    }

    conversation.metadata.writingHistory.push({
      ...writingData,
      timestamp: new Date(),
    });

    await conversationService.updateConversationMetadata(conversationId, userId, {
      writingHistory: conversation.metadata.writingHistory,
      lastWritingType: writingData.writingType,
    }, req);

    logger.info('Writing stored in conversation history', {
      conversationId,
      writingType: writingData.writingType,
    });
  } catch (error) {
    logger.warn('Error storing writing in conversation:', error);
  }
};

/**
 * Determine if user needs clarification
 */
const needsClarification = (analysis, conversationHistory) => {
  // If it's the first message and very vague
  if (conversationHistory.length === 0) {
    const vaguePhrases = ['write something', 'help me write', 'create', 'make something'];
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
 * Generate clarification question
 */
const generateClarificationQuestion = (analysis) => {
  if (!analysis.writingType) {
    return "I'd love to help you with creative writing! What type of writing would you like to create? For example: a poem, short story, song lyrics, script, or something else?";
  }

  return RESPONSE_MESSAGES.CLARIFICATION_NEEDED;
};

/**
 * Main function to process conversational creative writing request
 */
const processConversationalRequest = async (userId, message, conversationId, isGuest = false, req = null) => {
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

      await addMessage(actualConversationId, userId, 'assistant', clarificationMessage, {
        needsClarification: true,
      }, req);

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
    const prompt = buildWritingPrompt(message, writingParams, conversationHistory);

    logger.info('Generating creative writing', {
      conversationId: actualConversationId,
      writingType: writingParams.writingType,
      intent: writingParams.intent,
    });

    // Generate creative writing
    const generatedText = await generateCreativeWriting(prompt, writingParams.temperature);

    // Store the writing
    await storeWritingInConversation(actualConversationId, userId, {
      userRequest: message,
      generatedText,
      writingType: writingParams.writingType,
      style: writingParams.style,
      wordCount: writingParams.wordCount,
      intent: writingParams.intent,
    }, req);

    // Add assistant response to conversation
    await addMessage(actualConversationId, userId, 'assistant', generatedText, {
      writingType: writingParams.writingType,
      style: writingParams.style,
      intent: writingParams.intent,
    }, req);

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
    logger.error('Error processing conversational creative writing request:', error);
    throw error;
  }
};

/**
 * Get conversation history
 */
const getConversationHistory = async (conversationId, userId, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

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

export const creativeWritingService = {
  generateGuestUserId,
  processConversationalRequest,
  getConversationHistory,
};
