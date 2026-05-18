import httpStatus from 'http-status';
import mongoose from 'mongoose';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { ideaAnalyzer } from './services/ideaAnalyzer.js';
import { brainstormEngine } from './services/brainstormEngine.js';
import { outputFormatter } from './services/outputFormatter.js';
import {
  BRAINSTORM_CONFIG,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  BRAINSTORM_INTENTS,
  DEFAULT_PARAMS,
  RESPONSE_MESSAGES,
  TECHNIQUES,
  CLARIFICATION_SUGGESTIONS,
} from './brainstorm.constant.js';

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
  return `brainstorm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle brainstorm conversation (create or retrieve)
 */
const handleBrainstormConversation = async (
  userId,
  conversationId,
  userMessage,
  isGuest = false,
  req = null
) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        );
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found, creating new one`
        );
      }
    }

    if (!conversation) {
      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          userId,
          title: `Brainstorm: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            collectedParams: {},
            brainstormData: {},
          },
        },
        newConversationId,
        req
      );

      logger.info(
        `Created new brainstorm conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling brainstorm conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Add message to conversation
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
 * Process conversational brainstorm request
 */
const processConversationalBrainstorm = async (
  userId,
  message,
  conversationId = null,
  req = null
) => {
  try {
    const isGuest = !userId || userId.startsWith('guest_');

    // Handle conversation
    const conversation = await handleBrainstormConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );

    // Add user message
    await addMessage(
      conversation.conversationId,
      userId,
      'user',
      message,
      {},
      req
    );

    // Get conversation history
    const conversationHistory = conversation.messages || [];
    const existingParams = conversation.metadata?.collectedParams || {};

    // Analyze user intent
    const intentAnalysis = await ideaAnalyzer.analyzeIntent(
      message,
      conversationHistory,
      existingParams
    );

    logger.info('Intent analysis:', {
      intent: intentAnalysis.intent,
      confidence: intentAnalysis.confidence,
    });

    // If needs more information, ask clarifying questions with helpful suggestions
    if (intentAnalysis.needsMoreInfo) {
      let clarificationMessage = `${RESPONSE_MESSAGES.NEED_MORE_INFO}\n\n`;
      clarificationMessage += `**Don't worry!** I can start brainstorming now with smart defaults, or you can provide more details for better results.\n\n`;

      // Add specific suggestions based on what's missing
      const missingTypes = {
        technique: false,
        depth: false,
        focusAreas: false,
        constraints: false,
      };

      intentAnalysis.missingInfo.forEach((info) => {
        const lowerInfo = info.toLowerCase();
        if (lowerInfo.includes('technique')) missingTypes.technique = true;
        if (lowerInfo.includes('depth')) missingTypes.depth = true;
        if (lowerInfo.includes('focus')) missingTypes.focusAreas = true;
        if (
          lowerInfo.includes('constraint') ||
          lowerInfo.includes('budget') ||
          lowerInfo.includes('timeline')
        ) {
          missingTypes.constraints = true;
        }
      });

      let hasSuggestions = false;
      Object.keys(missingTypes).forEach((type) => {
        if (missingTypes[type] && CLARIFICATION_SUGGESTIONS[type]) {
          hasSuggestions = true;
          const suggestion = CLARIFICATION_SUGGESTIONS[type];
          clarificationMessage += `### ${suggestion.question}\n`;
          suggestion.suggestions.forEach((s) => {
            clarificationMessage += `${s}\n`;
          });
          clarificationMessage += `\n*${suggestion.example}*\n\n`;
        }
      });

      if (!hasSuggestions) {
        // Generic suggestions
        clarificationMessage += `### Here's what you can specify (all optional):\n`;
        clarificationMessage += `- **Technique**: SCAMPER, SWOT, Mind Map, etc.\n`;
        clarificationMessage += `- **Depth**: Quick, Standard, Deep, or Comprehensive\n`;
        clarificationMessage += `- **Focus**: Innovation, Profitability, Marketability, etc.\n`;
        clarificationMessage += `- **Constraints**: Budget, timeline, target audience, tech stack\n\n`;
      }

      clarificationMessage += `---\n\n`;
      clarificationMessage += `💬 **Just reply with details, or say "continue" and I'll start with smart defaults!**`;

      await addMessage(
        conversation.conversationId,
        userId,
        'assistant',
        clarificationMessage,
        {
          intent: intentAnalysis.intent,
          needsMoreInfo: true,
        },
        req
      );

      return {
        success: true,
        conversationId: conversation.conversationId,
        response: clarificationMessage,
        needsMoreInfo: true,
        missingInfo: intentAnalysis.missingInfo,
        suggestions: missingTypes,
      };
    }

    // Extract or use existing idea
    let idea = intentAnalysis.parameters.idea || existingParams.idea;
    if (!idea && ideaAnalyzer.hasValidIdea(message, existingParams)) {
      idea = await ideaAnalyzer.extractIdea(message);
    }

    if (!idea) {
      const needIdeaMessage = RESPONSE_MESSAGES.NEED_IDEA;
      await addMessage(
        conversation.conversationId,
        userId,
        'assistant',
        needIdeaMessage,
        {
          needsIdea: true,
        },
        req
      );

      return {
        success: true,
        conversationId: conversation.conversationId,
        response: needIdeaMessage,
        needsMoreInfo: true,
        missingInfo: ['The idea or topic you want to brainstorm'],
      };
    }

    // Merge parameters
    const brainstormParams = {
      idea,
      brainstormType:
        intentAnalysis.parameters.brainstormType ||
        existingParams.brainstormType ||
        DEFAULT_PARAMS.brainstormType,
      technique:
        intentAnalysis.parameters.technique ||
        existingParams.technique ||
        DEFAULT_PARAMS.technique,
      perspectives:
        intentAnalysis.parameters.perspectives?.length > 0
          ? intentAnalysis.parameters.perspectives
          : existingParams.perspectives || DEFAULT_PARAMS.perspectives,
      depth:
        intentAnalysis.parameters.depth ||
        existingParams.depth ||
        DEFAULT_PARAMS.depth,
      focusAreas:
        intentAnalysis.parameters.focusAreas || existingParams.focusAreas || [],
      constraints: {
        ...existingParams.constraints,
        ...intentAnalysis.parameters.constraints,
      },
      additionalInstructions:
        intentAnalysis.parameters.additionalInstructions || '',
    };

    // Update conversation metadata with collected params
    await conversationService.updateConversationMetadata(
      conversation.conversationId,
      userId,
      {
        collectedParams: brainstormParams,
      },
      req
    );

    let brainstormData;
    let formattedResponse;

    // Process based on intent
    switch (intentAnalysis.intent) {
      case BRAINSTORM_INTENTS.GENERATE_IDEAS:
      case BRAINSTORM_INTENTS.EXPAND_IDEA:
        brainstormData = await brainstormEngine.generateIdeas(brainstormParams);
        formattedResponse = outputFormatter.formatBrainstormResponse(
          brainstormData,
          brainstormParams
        );
        break;

      case BRAINSTORM_INTENTS.ANALYZE_IDEA: {
        if (brainstormParams.technique === TECHNIQUES.SWOT_ANALYSIS) {
          brainstormData = await brainstormEngine.performSWOT(idea);
          formattedResponse = outputFormatter.formatSWOT(brainstormData);
        } else {
          const perspectiveAnalysis =
            await brainstormEngine.analyzeFromPerspectives(
              idea,
              brainstormParams.perspectives
            );
          brainstormData = perspectiveAnalysis;
          formattedResponse =
            outputFormatter.formatPerspectives(perspectiveAnalysis);
        }
        break;
      }

      case BRAINSTORM_INTENTS.REFINE_IDEA: {
        const refinementData = await brainstormEngine.refineIdea(idea, message);
        brainstormData = refinementData;
        formattedResponse = outputFormatter.formatRefinements(refinementData);
        break;
      }

      default:
        brainstormData = await brainstormEngine.generateIdeas(brainstormParams);
        formattedResponse = outputFormatter.formatBrainstormResponse(
          brainstormData,
          brainstormParams
        );
    }

    // Store brainstorm data in conversation metadata
    await conversationService.updateConversationMetadata(
      conversation.conversationId,
      userId,
      {
        brainstormData: brainstormData,
      },
      req
    );

    // Add assistant response
    await addMessage(
      conversation.conversationId,
      userId,
      'assistant',
      formattedResponse,
      {
        intent: intentAnalysis.intent,
        brainstormParams,
      },
      req
    );

    return {
      success: true,
      conversationId: conversation.conversationId,
      response: formattedResponse,
      brainstormData,
      metadata: outputFormatter.createMetadataSummary(
        brainstormData,
        brainstormParams
      ),
      needsMoreInfo: false,
    };
  } catch (error) {
    logger.error('Error processing conversational brainstorm:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to process brainstorm request'
    );
  }
};

/**
 * Generate structured brainstorm with explicit parameters
 */
const generateStructuredBrainstorm = async (userId, params, req = null) => {
  try {
    const isGuest = !userId || userId.startsWith('guest_');

    // Analyze the idea first
    const ideaAnalysis = await ideaAnalyzer.analyzeIdea(params.idea);

    // Merge with provided params (user params take priority)
    const brainstormParams = {
      idea: params.idea,
      brainstormType: params.brainstormType || ideaAnalysis.brainstormType,
      technique:
        params.technique ||
        ideaAnalysis.suggestedTechniques[0] ||
        DEFAULT_PARAMS.technique,
      perspectives:
        params.perspective?.length > 0
          ? params.perspective
          : ideaAnalysis.recommendedPerspectives || DEFAULT_PARAMS.perspectives,
      depth:
        params.depth || ideaAnalysis.recommendedDepth || DEFAULT_PARAMS.depth,
      focusAreas: params.focusAreas || [],
      constraints: params.constraints || {},
      additionalInstructions: params.additionalInstructions || '',
    };

    logger.info('Generating structured brainstorm', {
      type: brainstormParams.brainstormType,
      technique: brainstormParams.technique,
    });

    // Generate brainstorm
    const brainstormData =
      await brainstormEngine.generateIdeas(brainstormParams);

    // Format response
    const formattedResponse = outputFormatter.formatBrainstormResponse(
      brainstormData,
      brainstormParams
    );

    // Create conversation to store this brainstorm
    const conversationId = generateConversationId();
    const conversation = await conversationService.createConversation(
      {
        userId,
        title: `Brainstorm: ${params.idea.substring(0, 50)}...`,
        metadata: {
          category: CONVERSATION_CATEGORY,
          model: CONVERSATION_MODEL,
          userType: isGuest ? 'guest' : 'authenticated',
          isGuest,
          collectedParams: brainstormParams,
          brainstormData,
          ideaAnalysis,
        },
      },
      conversationId,
      req
    );

    // Add messages
    await addMessage(
      conversationId,
      userId,
      'user',
      `Brainstorm idea: ${params.idea}`,
      {},
      req
    );
    await addMessage(
      conversationId,
      userId,
      'assistant',
      formattedResponse,
      {
        brainstormParams,
      },
      req
    );

    return {
      success: true,
      conversationId,
      response: formattedResponse,
      brainstormData,
      ideaAnalysis,
      metadata: outputFormatter.createMetadataSummary(
        brainstormData,
        brainstormParams
      ),
    };
  } catch (error) {
    logger.error('Error generating structured brainstorm:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to generate brainstorm'
    );
  }
};

/**
 * Get conversation history
 */
const getConversationHistory = async (conversationId, userId, req = null) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    return {
      success: true,
      conversation: {
        conversationId: conversation.conversationId,
        title: conversation.title,
        messages: conversation.messages,
        metadata: conversation.metadata,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      },
    };
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    throw error;
  }
};

/**
 * Export brainstorm session
 */
const exportBrainstormSession = async (
  conversationId,
  userId,
  format = 'markdown',
  includeHistory = true,
  req = null
) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    const brainstormData = conversation.metadata?.brainstormData || {};

    let exportedContent;

    switch (format) {
      case 'markdown':
        exportedContent = outputFormatter.exportToMarkdown(
          conversation,
          brainstormData
        );
        break;

      case 'json':
        exportedContent = JSON.stringify(
          {
            conversationId: conversation.conversationId,
            title: conversation.title,
            brainstormData,
            messages: includeHistory ? conversation.messages : [],
            metadata: conversation.metadata,
            exportedAt: new Date().toISOString(),
          },
          null,
          2
        );
        break;

      default:
        exportedContent = outputFormatter.exportToMarkdown(
          conversation,
          brainstormData
        );
    }

    return {
      success: true,
      format,
      content: exportedContent,
      filename: `brainstorm_${conversationId}_${Date.now()}.${format === 'json' ? 'json' : 'md'}`,
    };
  } catch (error) {
    logger.error('Error exporting brainstorm session:', error);
    throw error;
  }
};

/**
 * Refine existing brainstorm
 */
const refineBrainstorm = async (
  conversationId,
  userId,
  message,
  focusOn = [],
  req = null
) => {
  try {
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req
    );

    if (!conversation) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
    }

    const existingParams = conversation.metadata?.collectedParams || {};
    const originalIdea = existingParams.idea;

    if (!originalIdea) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'No original idea found in this conversation'
      );
    }

    // Add user refinement message
    await addMessage(conversationId, userId, 'user', message, {}, req);

    // Generate refinement
    const refinementData = await brainstormEngine.refineIdea(
      originalIdea,
      message,
      focusOn
    );
    const formattedResponse = outputFormatter.formatRefinements(refinementData);

    // Add assistant response
    await addMessage(
      conversationId,
      userId,
      'assistant',
      formattedResponse,
      {
        intent: BRAINSTORM_INTENTS.REFINE_IDEA,
        focusOn,
      },
      req
    );

    return {
      success: true,
      conversationId,
      response: formattedResponse,
      refinementData,
    };
  } catch (error) {
    logger.error('Error refining brainstorm:', error);
    throw error;
  }
};

export const brainstormService = {
  generateGuestUserId,
  processConversationalBrainstorm,
  generateStructuredBrainstorm,
  getConversationHistory,
  exportBrainstormSession,
  refineBrainstorm,
};
