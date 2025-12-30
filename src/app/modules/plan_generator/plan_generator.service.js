import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { ideaAnalyzer } from './services/ideaAnalyzer.js';
import { brainstormEngine } from './services/brainstormEngine.js';
import { planGenerator } from './services/planGenerator.js';
import { planRefiner } from './services/planRefiner.js';
import {
  PLAN_GENERATOR_CONFIG,
  SYSTEM_PROMPTS,
  RESPONSE_MESSAGES,
  CONVERSATION_CATEGORY,
  CONVERSATION_MODEL,
  DEFAULT_PARAMS,
  PLAN_STAGES,
} from './plan_generator.constant.js';

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
  return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handle plan generation conversation (create or retrieve)
 */
const handlePlanConversation = async (userId, conversationId, userMessage, isGuest = false) => {
  try {
    let conversation;

    if (conversationId) {
      try {
        conversation = await conversationHelpers.getConversationById(conversationId, userId);
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
          title: `Plan: ${userMessage.substring(0, 50)}...`,
          metadata: {
            category: CONVERSATION_CATEGORY,
            model: CONVERSATION_MODEL,
            userType: isGuest ? 'guest' : 'authenticated',
            isGuest,
            planStage: PLAN_STAGES.IDEA_ANALYSIS,
            collectedParams: {},
            ideaDescription: '',
            analysis: null,
            brainstorm: null,
            generatedPlan: null,
          },
        },
        newConversationId
      );

      logger.info(`Created new plan generation conversation ${newConversationId} for user ${userId}`);
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling plan generation conversation:', error);
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
    logger.error('Error adding message to conversation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to add message');
  }
};

/**
 * Conversational assistant - Main entry point
 */
const conversationalAssistant = async (userId, message, conversationId = null, isGuest = false, fileInfo = null) => {
  try {
    logger.info('Plan generator conversational assistant request:', {
      userId,
      messageLength: message.length,
      conversationId,
      isGuest,
    });

    // Get or create conversation
    const conversation = await handlePlanConversation(userId, conversationId, message, isGuest);

    // Add user message
    await addMessage(conversation.conversationId, userId, 'user', message, { fileInfo });

    // Get conversation metadata
    const metadata = conversation.metadata || {};
    const planStage = metadata.planStage || PLAN_STAGES.IDEA_ANALYSIS;
    const existingAnalysis = metadata.analysis;
    const existingBrainstorm = metadata.brainstorm;
    const existingPlan = metadata.generatedPlan;

    let assistantResponse = '';
    let updatedMetadata = { ...metadata };

    // Determine conversation flow based on stage
    switch (planStage) {
      case PLAN_STAGES.IDEA_ANALYSIS: {
        // Analyze the idea
        const ideaText = metadata.ideaDescription ? `${metadata.ideaDescription} ${message}` : message;
        const analysis = await ideaAnalyzer.analyzeIdea(ideaText, {
          previousMessages: conversation.messages || [],
        });

        updatedMetadata.analysis = analysis;
        updatedMetadata.ideaDescription = ideaText;

        // Check if this is the first message (initial idea)
        const messageCount = conversation.messages?.length || 0;
        const isFirstMessage = messageCount <= 1;

        if (isFirstMessage && ideaAnalyzer.needsClarification(analysis)) {
          // First message - ask clarifying questions ONCE
          const questions = ideaAnalyzer.generateClarifyingQuestions(analysis);
          assistantResponse = `I understand you want to create a ${analysis.plan_type.replace(/_/g, ' ')}. To create the best plan for you, I have a few questions:\n\n${questions.slice(0, 3).map((q, i) => `${i + 1}. ${q}`).join('\n')}\n\nPlease share what you can, and I'll generate a comprehensive plan for you!`;

          // Mark that we asked questions, next response will generate plan
          updatedMetadata.askedQuestions = true;
          updatedMetadata.planStage = PLAN_STAGES.IDEA_ANALYSIS;
        } else {
          // User has responded OR idea is clear enough - generate plan directly
          logger.info('Generating plan directly after user response');

          // Generate brainstorm
          const brainstorm = await brainstormEngine.generateBrainstorm(
            ideaText,
            analysis,
            [],
            { constraints: metadata.collectedParams?.constraints }
          );

          updatedMetadata.brainstorm = brainstorm;

          // Generate the plan
          const plan = await planGenerator.generatePlan(
            ideaText,
            analysis,
            brainstorm,
            DEFAULT_PARAMS.planDepth,
            metadata.collectedParams?.constraints || {}
          );

          updatedMetadata.generatedPlan = plan;

          // Format plan with follow-up questions
          assistantResponse = `**Your Plan is Ready!** 🎉\n\n`;
          assistantResponse += `# ${plan.title}\n\n`;
          assistantResponse += `## Executive Summary\n${plan.executive_summary}\n\n`;
          assistantResponse += `## Key Objectives\n`;
          plan.objectives?.slice(0, 3).forEach((obj, i) => {
            assistantResponse += `${i + 1}. **${obj.objective}** (${obj.priority} priority)\n`;
            assistantResponse += `   ${obj.description}\n\n`;
          });
          assistantResponse += `## Implementation Phases\n`;
          plan.phases?.forEach((phase, i) => {
            assistantResponse += `**${phase.name}** (${phase.duration})\n`;
            assistantResponse += `- ${phase.deliverables?.slice(0, 2).join('\n- ')}\n\n`;
          });
          assistantResponse += `## Immediate Next Steps\n`;
          plan.next_steps?.slice(0, 5).forEach((step, i) => {
            assistantResponse += `${i + 1}. ${step}\n`;
          });

          // Add optional follow-up questions
          assistantResponse += `\n\n**Optional: To refine your plan further, you can:**\n`;
          const refinementQuestions = [
            '- Adjust the timeline or budget constraints?',
            '- Add more details to specific phases?',
            '- Explore alternative approaches?',
            '- Get more information on risks and mitigation strategies?'
          ];
          assistantResponse += refinementQuestions.join('\n');
          assistantResponse += `\n\nJust let me know what you'd like to adjust, or ask me anything about the plan!`;

          updatedMetadata.planStage = PLAN_STAGES.REFINEMENT;
        }
        break;
      }

      case PLAN_STAGES.REFINEMENT: {
        // Handle refinement requests - update the plan based on user feedback
        const lowerMessage = message.toLowerCase();

        if (lowerMessage.includes('export')) {
          assistantResponse = `To export your plan, please use the export endpoint or let me know your preferred format (PDF, DOCX, Markdown, JSON).`;
        } else if (lowerMessage.includes('alternative')) {
          const alternatives = await planRefiner.addAlternatives(existingPlan, metadata.ideaDescription);
          updatedMetadata.generatedPlan = { ...existingPlan, alternatives };

          assistantResponse = `**Alternative Approaches:**\n\n`;
          alternatives?.forEach((alt, i) => {
            assistantResponse += `${i + 1}. **${alt.approach}**\n`;
            assistantResponse += `   ✅ Pros: ${alt.pros?.join(', ')}\n`;
            assistantResponse += `   ⚠️ Cons: ${alt.cons?.join(', ')}\n\n`;
          });
          assistantResponse += `\nWould you like me to update your plan with any of these approaches?`;
        } else {
          // General refinement using feedback
          logger.info('Applying user feedback to refine plan');

          const improvedPlan = await planRefiner.applyFeedback(
            existingPlan,
            message,
            conversation.messages || []
          );

          updatedMetadata.generatedPlan = improvedPlan;

          assistantResponse = `**Plan Updated!** ✅\n\n`;
          assistantResponse += `I've refined your plan based on your feedback. Here are the key updates:\n\n`;

          // Show what changed
          assistantResponse += `## Updated Plan Summary\n`;
          assistantResponse += `**Title:** ${improvedPlan.title}\n\n`;

          if (improvedPlan.executive_summary) {
            assistantResponse += `**Executive Summary:**\n${improvedPlan.executive_summary.substring(0, 200)}...\n\n`;
          }

          assistantResponse += `**Key Highlights:**\n`;
          assistantResponse += `- Objectives: ${improvedPlan.objectives?.length || 0} defined\n`;
          assistantResponse += `- Phases: ${improvedPlan.phases?.length || 0} implementation phases\n`;
          assistantResponse += `- Action Items: ${improvedPlan.action_items?.length || 0} tasks\n\n`;

          assistantResponse += `**What else would you like to adjust?**\n`;
          assistantResponse += `- Timeline or budget\n`;
          assistantResponse += `- Specific phases or action items\n`;
          assistantResponse += `- Risk assessment\n`;
          assistantResponse += `- Resource allocation\n\n`;
          assistantResponse += `Just let me know!`;
        }
        break;
      }

      default:
        assistantResponse = 'I can help you create a comprehensive plan for your idea. Please describe your idea to get started!';
    }

    // Update conversation metadata
    await conversationService.updateConversationMetadata(conversation.conversationId, userId, updatedMetadata);

    // Add assistant response
    await addMessage(conversation.conversationId, userId, 'assistant', assistantResponse, {
      planStage: updatedMetadata.planStage,
    });

    return {
      success: true,
      conversationId: conversation.conversationId,
      response: assistantResponse,
      planStage: updatedMetadata.planStage,
      hasAnalysis: !!updatedMetadata.analysis,
      hasBrainstorm: !!updatedMetadata.brainstorm,
      hasPlan: !!updatedMetadata.generatedPlan,
    };
  } catch (error) {
    logger.error('Error in conversational assistant:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to process request');
  }
};

/**
 * Direct plan generation (non-conversational)
 */
const generatePlanDirect = async (params, userId = null, isGuest = false) => {
  try {
    const {
      idea,
      planType,
      complexity,
      planDepth = DEFAULT_PARAMS.planDepth,
      domains = [],
      constraints = {},
      brainstormAspects = [],
    } = params;

    logger.info('Direct plan generation request:', { planType, complexity, planDepth });

    // Step 1: Analyze idea
    const analysis = await ideaAnalyzer.analyzeIdea(idea);

    // Override with user-specified params if provided
    if (planType) analysis.plan_type = planType;
    if (complexity) analysis.complexity = complexity;
    if (domains.length > 0) analysis.domains = domains;

    // Step 2: Generate brainstorm
    const brainstorm = await brainstormEngine.generateBrainstorm(idea, analysis, brainstormAspects, {
      constraints,
    });

    // Step 3: Generate plan
    const plan = await planGenerator.generatePlan(idea, analysis, brainstorm, planDepth, constraints);

    return {
      success: true,
      analysis,
      brainstorm,
      plan,
      message: RESPONSE_MESSAGES.PLAN_GENERATED,
    };
  } catch (error) {
    logger.error('Error in direct plan generation:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, error.message || 'Failed to generate plan');
  }
};

/**
 * Get conversation history
 */
const getConversationHistory = async (conversationId, userId) => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);

    return {
      success: true,
      conversation,
    };
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found');
  }
};

/**
 * Export plan in various formats
 */
const exportPlan = async (conversationId, userId, format = 'markdown') => {
  try {
    const conversation = await conversationHelpers.getConversationById(conversationId, userId);
    const plan = conversation.metadata?.generatedPlan;

    if (!plan) {
      throw new ApiError(httpStatus.NOT_FOUND, 'No plan found in this conversation');
    }

    let exportedContent = '';

    switch (format) {
      case 'markdown':
        exportedContent = planGenerator.formatPlanForPresentation(plan);
        break;
      case 'json':
        exportedContent = JSON.stringify(plan, null, 2);
        break;
      case 'html':
        // Convert markdown to HTML (basic)
        exportedContent = `<html><body>${planGenerator.formatPlanForPresentation(plan).replace(/\n/g, '<br>')}</body></html>`;
        break;
      default:
        exportedContent = JSON.stringify(plan, null, 2);
    }

    return {
      success: true,
      format,
      content: exportedContent,
      plan,
      message: RESPONSE_MESSAGES.EXPORT_READY,
    };
  } catch (error) {
    logger.error('Error exporting plan:', error);
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to export plan');
  }
};

export const planGeneratorService = {
  generateGuestUserId,
  generateConversationId,
  conversationalAssistant,
  generatePlanDirect,
  getConversationHistory,
  exportPlan,
};
