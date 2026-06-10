import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
import { conversationService } from '../conversations/conversation.service.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { fileProcessor } from '../document_review/services/fileProcessor.js';
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

/**
 * @constant {GoogleGenerativeAI} genAI - Initializes the Google Generative AI client using the API key from configuration.
 */
const genAI = new GoogleGenerativeAI(config.gemini_secret_key);

/**
 * Generates a unique guest user ID using Mongoose's ObjectId.
 * This ID is used for tracking guest user sessions without requiring authentication.
 *
 * @returns {string} A unique string representation of a Mongoose ObjectId.
 */
const generateGuestUserId = () => {
  return new mongoose.Types.ObjectId().toString();
};

/**
 * Generates a unique conversation ID for plan generation sessions.
 * The ID combines a timestamp and a random string to ensure uniqueness.
 *
 * @returns {string} A unique conversation ID string.
 */
const generateConversationId = () => {
  return `plan_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Handles the creation or retrieval of a plan generation conversation.
 * If a `conversationId` is provided, it attempts to fetch the existing conversation.
 * If no `conversationId` is provided or the existing one is not found, a new conversation is created.
 * The conversation metadata is initialized with relevant plan generation details.
 *
 * @async
 * @param {string} userId - The ID of the user initiating or continuing the conversation.
 * @param {string | null} conversationId - The ID of an existing conversation, or null if a new one should be created.
 * @param {string} userMessage - The initial message from the user, used for the conversation title if new.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {object | null} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} The conversation object (either newly created or retrieved).
 * @throws {ApiError} If there's an internal server error handling the conversation.
 */
const handlePlanConversation = async (
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
        // Optimization: Fetch conversation as a plain JavaScript object if it's only checked for existence
        // and not directly modified before a potential re-fetch or update.
        // Assuming conversationHelpers.getConversationById supports a 'lean' parameter.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req,
          true // Use .lean() for performance if only checking existence
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
        newConversationId,
        req
      );

      logger.info(
        `Created new plan generation conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling plan generation conversation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to handle conversation'
    );
  }
};

/**
 * Adds a new message to an existing conversation.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation.
 * @param {'user' | 'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The text content of the message.
 * @param {object} [metadata={}] - Optional metadata to associate with the message.
 * @param {object | null} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} The updated conversation object after adding the message.
 * @throws {ApiError} If there's an internal server error adding the message.
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
 * Stores an uploaded file's information and extracted text within a conversation's metadata.
 * This involves extracting text from the file, uploading it to Google Cloud Storage (GCS),
 * and updating the conversation's `uploadedFiles` array.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to associate the file with.
 * @param {string} userId - The ID of the user who uploaded the file.
 * @param {object} fileInfo - An object containing details about the uploaded file.
 * @param {string} fileInfo.path - The temporary local path of the uploaded file.
 * @param {string} fileInfo.originalName - The original name of the file.
 * @param {string} fileInfo.filename - The generated unique filename.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {object | null} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} An object containing details of the stored file, including its ID, public URL, and extracted text.
 * @throws {ApiError} If text extraction fails, file upload fails, or there's an error updating the conversation.
 */
const storeFileInConversation = async (
  conversationId,
  userId,
  fileInfo,
  req = null
) => {
  try {
    logger.info('Storing file in conversation', {
      conversationId,
      filename: fileInfo.originalName,
      size: fileInfo.size,
    });

    // 1. Extract text from file
    const extractedText = await fileProcessor.extractTextFromFile(fileInfo);

    if (!extractedText || extractedText.trim().length === 0) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Unable to extract text from the file'
      );
    }

    // 2. Upload to GCS and get public URL (with metadata)
    const uploadResult = await fileProcessor.uploadToGCS(
      fileInfo.path,
      fileInfo.filename,
      {
        userId: userId,
        originalName: fileInfo.originalName,
        documentType: 'plan_generator',
      }
    );

    // 3. Create file data object
    const fileData = {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalName,
      filename: fileInfo.filename,
      publicUrl: uploadResult.publicUrl || uploadResult.localPath,
      gcsPath: uploadResult.gcsPath,
      storageType: uploadResult.storageType,
      extractedText: extractedText,
      textLength: extractedText.length,
      size: fileInfo.size,
      mimetype: fileInfo.mimetype,
      uploadedAt: new Date(),
      extractedAt: new Date(),
    };

    // 4. Update conversation metadata
    // Optimization: Fetch conversation lean, then modify the plain object and update specific fields.
    // This avoids the overhead of Mongoose document tracking if only a part of the document is updated.
    // Assuming conversationHelpers.getConversationById supports a 'lean' parameter.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      true // Use .lean()
    );

    const updatedUploadedFiles = conversation.metadata?.uploadedFiles
      ? [...conversation.metadata.uploadedFiles, fileData]
      : [fileData];

    await conversationService.updadtePlanMetadata(
      conversationId,
      userId,
      {
        uploadedFiles: updatedUploadedFiles,
      },
      req
    );

    logger.info('File stored successfully in conversation', {
      fileId: fileData.id,
      textLength: fileData.textLength,
      publicUrl: fileData.publicUrl,
      storageType: fileData.storageType,
    });

    // 5. Cleanup temporary local file
    await fileProcessor.cleanupFile(fileInfo.path);

    return fileData;
  } catch (error) {
    logger.error('Error storing file in conversation:', error);
    // Try to cleanup file even if upload failed
    try {
      await fileProcessor.cleanupFile(fileInfo.path);
    } catch (cleanupError) {
      logger.warn('Failed to cleanup file after error:', cleanupError);
    }
    throw error;
  }
};

/**
 * The main conversational assistant for plan generation.
 * It manages the conversation flow, including idea analysis, brainstorming, plan generation,
 * and refinement based on user input and conversation stage. It also handles file uploads.
 *
 * @async
 * @param {string} userId - The ID of the user interacting with the assistant.
 * @param {string} message - The user's current message.
 * @param {string | null} [conversationId=null] - The ID of the current conversation, or null for a new one.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {object | null} [fileInfo=null] - Optional object containing details about an uploaded file.
 * @param {object | null} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} An object containing the success status, conversation ID, assistant's response,
 *   current plan stage, and flags indicating the presence of analysis, brainstorm, and plan.
 * @throws {ApiError} If there's an internal server error during the conversational process.
 */
const conversationalAssistant = async (
  userId,
  message,
  conversationId = null,
  isGuest = false,
  fileInfo = null,
  req = null
) => {
  try {
    logger.info('Plan generator conversational assistant request:', {
      userId,
      messageLength: message.length,
      conversationId,
      isGuest,
      fileInfo,
    });

    // Get or create conversation
    const conversation = await handlePlanConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );

    // Get conversation metadata
    const metadata = conversation.plan_metadata || {};

    // Handle file upload if present - extract text content
    let fileContent = '';
    if (fileInfo) {
      try {
        const fileData = await storeFileInConversation(
          conversation.conversationId,
          userId,
          fileInfo,
          req
        );
        fileContent = fileData.extractedText;
        logger.info('File content extracted successfully', {
          filename: fileData.originalName,
          textLength: fileContent.length,
        });
      } catch (error) {
        logger.error('Failed to extract file content:', error);
        // Continue without file content, but log the error
        fileContent = '';
      }
    } else if (metadata.uploadedFiles && metadata.uploadedFiles.length > 0) {
      // Retrieve previously uploaded file content from conversation metadata
      const latestFile =
        metadata.uploadedFiles[metadata.uploadedFiles.length - 1];
      fileContent = latestFile.extractedText || '';
      logger.info('Using cached file content from previous upload', {
        filename: latestFile.originalName,
        textLength: fileContent.length,
      });
    }

    // Add user message
    await addMessage(conversation.conversationId, userId, 'user', message, {
      fileInfo,
    });
    const planStage = metadata.planStage || PLAN_STAGES.IDEA_ANALYSIS;
    const existingAnalysis = metadata.analysis;
    const existingBrainstorm = metadata.brainstorm;
    const existingPlan = metadata.generatedPlan;

    let assistantResponse = '';
    let updatedMetadata = { ...metadata };

    // Determine conversation flow based on stage
    switch (planStage) {
      case PLAN_STAGES.IDEA_ANALYSIS: {
        // Analyze the idea - include file content if available
        let ideaText = metadata.ideaDescription
          ? `${metadata.ideaDescription} ${message}`
          : message;

        // Append extracted file content to idea text
        if (fileContent) {
          ideaText += `\n\n--- Attached Document Content ---\n${fileContent}`;
          logger.info('Appended file content to idea text', {
            totalLength: ideaText.length,
          });
        }
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
          assistantResponse = `I understand you want to create a ${analysis.plan_type.replace(/_/g, ' ')}. To create the best plan for you, I have a few questions:\n\n${questions
            .slice(0, 3)
            .map((q, i) => `${i + 1}. ${q}`)
            .join(
              '\n'
            )}\n\nPlease share what you can, and I'll generate a comprehensive plan for you!`;

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
            '- Get more information on risks and mitigation strategies?',
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
          const alternatives = await planRefiner.addAlternatives(
            existingPlan,
            metadata.ideaDescription
          );
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
        assistantResponse =
          'I can help you create a comprehensive plan for your idea. Please describe your idea to get started!';
    }

    // Update conversation metadata
    await conversationService.updateConversationMetadata(
      conversation.conversationId,
      userId,
      updatedMetadata
    );

    // Add assistant response
    await addMessage(
      conversation.conversationId,
      userId,
      'assistant',
      assistantResponse,
      {
        planStage: updatedMetadata.planStage,
      }
    );

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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to process request'
    );
  }
};

/**
 * Generates a plan directly without a conversational interface.
 * It takes an idea and optional parameters to analyze, brainstorm, and generate a comprehensive plan.
 *
 * @async
 * @param {object} params - Parameters for plan generation.
 * @param {string} params.idea - The core idea or description for which to generate a plan.
 * @param {string} [params.planType] - Optional, specific type of plan (e.g., "marketing_plan", "project_plan").
 * @param {string} [params.complexity] - Optional, desired complexity of the plan (e.g., "simple", "detailed").
 * @param {number} [params.planDepth=DEFAULT_PARAMS.planDepth] - The depth or level of detail for the plan.
 * @param {string[]} [params.domains=[]] - Optional, specific domains or industries relevant to the plan.
 * @param {object} [params.constraints={}] - Optional, additional constraints or requirements for the plan.
 * @param {string[]} [params.brainstormAspects=[]] - Optional, specific aspects to focus on during brainstorming.
 * @param {string | null} [userId=null] - The ID of the user requesting the plan (optional, for logging/tracking).
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest (optional).
 * @returns {Promise<object>} An object containing the success status, analysis, brainstorm, generated plan, and a message.
 * @throws {ApiError} If there's an internal server error during plan generation.
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

    logger.info('Direct plan generation request:', {
      planType,
      complexity,
      planDepth,
    });

    // Step 1: Analyze idea
    const analysis = await ideaAnalyzer.analyzeIdea(idea);

    // Override with user-specified params if provided
    if (planType) analysis.plan_type = planType;
    if (complexity) analysis.complexity = complexity;
    if (domains.length > 0) analysis.domains = domains;

    // Step 2: Generate brainstorm
    const brainstorm = await brainstormEngine.generateBrainstorm(
      idea,
      analysis,
      brainstormAspects,
      {
        constraints,
      }
    );

    // Step 3: Generate plan
    const plan = await planGenerator.generatePlan(
      idea,
      analysis,
      brainstorm,
      planDepth,
      constraints
    );

    return {
      success: true,
      analysis,
      brainstorm,
      plan,
      message: RESPONSE_MESSAGES.PLAN_GENERATED,
    };
  } catch (error) {
    logger.error('Error in direct plan generation:', error);
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to generate plan'
    );
  }
};

/**
 * Retrieves the full conversation history for a given conversation ID and user.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {object | null} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} An object containing the success status and the full conversation object.
 * @throws {ApiError} If the conversation is not found or an internal server error occurs.
 */
const getConversationHistory = async (conversationId, userId, req = null) => {
  try {
    // Optimization: Fetch conversation as a plain JavaScript object as it's only read and returned.
    // Assuming conversationHelpers.getConversationById supports a 'lean' parameter.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      true // Use .lean()
    );

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
 * Exports the generated plan from a conversation in a specified format.
 * Supported formats include 'markdown', 'json', and 'html'.
 *
 * @async
 * @param {string} conversationId - The ID of the conversation containing the plan.
 * @param {string} userId - The ID of the user who owns the conversation.
 * @param {'markdown' | 'json' | 'html'} [format='markdown'] - The desired export format.
 * @param {object | null} [req=null] - The Express request object, potentially containing user information or context.
 * @returns {Promise<object>} An object containing the success status, format, exported content, the raw plan object, and a message.
 * @throws {ApiError} If no plan is found in the conversation or an internal server error occurs during export.
 */
const exportPlan = async (
  conversationId,
  userId,
  format = 'markdown',
  req = null
) => {
  try {
    // Optimization: Fetch conversation as a plain JavaScript object as only its metadata is accessed.
    // Assuming conversationHelpers.getConversationById supports a 'lean' parameter.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      true // Use .lean()
    );
    const plan = conversation.metadata?.generatedPlan;

    if (!plan) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'No plan found in this conversation'
      );
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
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to export plan'
    );
  }
};

/**
 * @namespace planGeneratorService
 * @description Provides services for generating and managing plans, including conversational interaction,
 * direct plan generation, conversation history retrieval, and plan export.
 */
export const planGeneratorService = {
  generateGuestUserId,
  generateConversationId,
  conversationalAssistant,
  generatePlanDirect,
  getConversationHistory,
  exportPlan,
};

// Database Indexing Recommendation:
// For the 'Conversation' collection, consider adding a compound index on 'conversationId' and 'userId'
// to optimize lookups performed by `conversationHelpers.getConversationById`.
// Example: conversationSchema.index({ conversationId: 1, userId: 1 });