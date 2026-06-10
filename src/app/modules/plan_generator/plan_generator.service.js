import httpStatus from 'http-status';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import ApiError from '../../../errors/ApiError.js';
import { logger } from '../../../shared/logger.js';
import config from '../../../../config/index.js';
// FIX: Import usage and hierarchy services to handle limits and role-based access control.
import { usageService } from '../../services/usage.service.js';
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
 * Initializes the Google Generative AI client using the API key from configuration.
 * @constant {GoogleGenerativeAI} genAI
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
 * @function handlePlanConversation
 * @param {string} userId - The ID of the user initiating or continuing the conversation. This is used for multi-tenancy to scope the conversation to the user.
 * @param {string | null} conversationId - The ID of an existing conversation, or null if a new one should be created.
 * @param {string} userMessage - The initial message from the user, used for the conversation title if new.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {object | null} [req=null] - The Express request object, containing authenticated user information for multi-tenancy and role checks.
 * @returns {Promise<object>} The conversation object (either newly created or retrieved).
 * @throws {ApiError} If there's an internal server error handling the conversation or usage limits are exceeded.
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
        // FIX: The helper function should internally handle hierarchical access.
        // It should verify that the requester (req.user) is either the owner (`userId`)
        // or a manager/admin with permissions over the owner.
        conversation = await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req,
          true // Use .lean() for performance
        );
        logger.info(`Fetched conversation with ID: ${conversationId}`);
      } catch (error) {
        logger.warn(
          `Conversation ${conversationId} not found or access denied for user ${req?.user?.id}, creating new one for user ${userId}`
        );
      }
    }

    if (!conversation) {
      // FIX: Before creating a new conversation, check if the user/workspace is allowed to create one.
      if (!isGuest) {
        await usageService.checkLimit(req.user, 'conversations');
      }

      const newConversationId = conversationId || generateConversationId();

      conversation = await conversationService.createConversation(
        {
          // FIX: Ensure userId from the request context is used for creation to prevent impersonation.
          userId: isGuest ? userId : req.user.id,
          // FIX: Add tenant context (e.g., workspaceId) to all created resources.
          workspaceId: isGuest ? null : req.user.workspaceId,
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

      // FIX: Log resource creation for usage tracking and propagation to the workspace/platform level.
      if (!isGuest) {
        await usageService.recordUsage(req.user, 'conversation_created', { conversationId: newConversationId });
      }

      logger.info(
        `Created new plan generation conversation ${newConversationId} for user ${userId}`
      );
    }

    return conversation;
  } catch (error) {
    logger.error('Error handling plan generation conversation:', error);
    // FIX: Propagate specific limit-related errors with an appropriate status code.
    if (error.isUsageError) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, error.message);
    }
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
 * @function addMessage
 * @param {string} conversationId - The ID of the conversation to add the message to.
 * @param {string} userId - The ID of the user associated with the conversation. Used for authorization.
 * @param {'user' | 'assistant'} role - The role of the sender ('user' or 'assistant').
 * @param {string} content - The text content of the message.
 * @param {object} [metadata={}] - Optional metadata to associate with the message.
 * @param {object | null} [req=null] - The Express request object, for multi-tenancy or user context.
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
 * @function storeFileInConversation
 * @param {string} conversationId - The ID of the conversation to associate the file with.
 * @param {string} userId - The ID of the user who uploaded the file. Used for authorization.
 * @param {object} fileInfo - An object containing details about the uploaded file.
 * @param {string} fileInfo.path - The temporary local path of the uploaded file.
 * @param {string} fileInfo.originalname - The original name of the file.
 * @param {string} fileInfo.filename - The generated unique filename.
 * @param {number} fileInfo.size - The size of the file in bytes.
 * @param {string} fileInfo.mimetype - The MIME type of the file.
 * @param {object | null} [req=null] - The Express request object, for multi-tenancy or user context.
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
    // FIX: Check storage limits before processing the file.
    // The usage service should handle logic for user, workspace, and platform limits.
    await usageService.checkAndCharge(req.user, 'file_upload', { size: fileInfo.size });

    logger.info('Storing file in conversation', {
      conversationId,
      filename: fileInfo.originalname,
      size: fileInfo.size,
    });

    // 1. Extract text from file
    const extractedText = await fileProcessor.extractTextFromFile(fileInfo);

    if (!extractedText || extractedText.trim().length === 0) {
      // FIX: If extraction fails, we should not charge the user. Revert the charge.
      await usageService.revertCharge(req.user, 'file_upload', { size: fileInfo.size });
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        'Unable to extract text from the file. No usage was charged.'
      );
    }

    // 2. Upload to GCS and get public URL (with metadata)
    const uploadResult = await fileProcessor.uploadToGCS(
      fileInfo.path,
      fileInfo.filename,
      {
        userId: userId,
        // FIX: Add tenant context to GCS metadata for proper data segregation and auditing.
        workspaceId: req.user.workspaceId,
        originalName: fileInfo.originalname,
        documentType: 'plan_generator',
      }
    );

    // 3. Create file data object
    const fileData = {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      originalName: fileInfo.originalname,
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
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      true // Use .lean()
    );

    // FIX: Ensure metadata object exists before trying to access its properties.
    const currentMetadata = conversation.metadata || {};
    const updatedUploadedFiles = currentMetadata.uploadedFiles
      ? [...currentMetadata.uploadedFiles, fileData]
      : [fileData];

    // FIX: Corrected typo from 'updadtePlanMetadata' to 'updateConversationMetadata' for consistency.
    // Also, ensure we preserve existing metadata.
    await conversationService.updateConversationMetadata(
      conversationId,
      userId,
      {
        ...currentMetadata,
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
    // FIX: Propagate specific limit-related errors with an appropriate status code.
    if (error.isUsageError) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, error.message);
    }
    throw error;
  }
};

/**
 * The main conversational assistant for plan generation.
 * It manages the conversation flow, including idea analysis, brainstorming, plan generation,
 * and refinement based on user input and conversation stage. It also handles file uploads.
 * This service is available to both authenticated and guest users.
 *
 * @async
 * @function conversationalAssistant
 * @param {string} userId - The ID of the user interacting with the assistant. For guests, this is a generated ID.
 * @param {string} message - The user's current message.
 * @param {string | null} [conversationId=null] - The ID of the current conversation, or null for a new one.
 * @param {boolean} [isGuest=false] - Flag indicating if the user is a guest.
 * @param {object | null} [fileInfo=null] - Optional object containing details about an uploaded file (from multer).
 * @param {object | null} [req=null] - The Express request object, for multi-tenancy or user context.
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
    // FIX: For authenticated users, use the ID from the token (`req.user.id`) to prevent impersonation.
    const effectiveUserId = isGuest ? userId : req.user.id;

    logger.info('Plan generator conversational assistant request:', {
      userId: effectiveUserId,
      messageLength: message.length,
      conversationId,
      isGuest,
      hasFile: !!fileInfo,
    });

    // FIX: Check usage limits before proceeding with expensive AI operations.
    // This call should throw an error if limits are exceeded, which will be caught below.
    if (!isGuest) {
        await usageService.checkAndCharge(req.user, 'plan_generation_message');
    }

    // Get or create conversation
    const conversation = await handlePlanConversation(
      effectiveUserId,
      conversationId,
      message,
      isGuest,
      req
    );
    const currentConversationId = conversation.conversationId;

    // FIX: Bug fix - conversation object stores plan data in 'metadata', not 'plan_metadata'.
    const metadata = conversation.metadata || {};

    // Handle file upload if present
    let fileContent = '';
    let newFileUploaded = false; // FIX: Flag to track if a new file was processed in this turn.
    if (fileInfo) {
      newFileUploaded = true;
      try {
        const fileData = await storeFileInConversation(
          currentConversationId,
          effectiveUserId,
          fileInfo,
          req
        );
        fileContent = fileData.extractedText;
        logger.info('File content extracted successfully', {
          filename: fileData.originalName,
          textLength: fileContent.length,
        });
      } catch (error) {
        logger.error('Failed to process uploaded file:', error);
        // Return a user-friendly error message if file processing fails.
        throw new ApiError(httpStatus.BAD_REQUEST, `Failed to process file: ${error.message}`);
      }
    }

    // Add user message
    await addMessage(currentConversationId, effectiveUserId, 'user', message, {
      fileInfo,
    }, req);

    const planStage = metadata.planStage || PLAN_STAGES.IDEA_ANALYSIS;
    const existingAnalysis = metadata.analysis;
    const existingBrainstorm = metadata.brainstorm;
    const existingPlan = metadata.generatedPlan;

    let assistantResponse = '';
    let updatedMetadata = { ...metadata };

    // Determine conversation flow based on stage
    switch (planStage) {
      case PLAN_STAGES.IDEA_ANALYSIS: {
        // FIX: Bug fix - Prevent re-appending old file content on every message.
        // The full context is built from the stored ideaDescription and the new message.
        // New file content is only appended if a new file was just uploaded.
        let ideaContext = metadata.ideaDescription || '';
        ideaContext += ` ${message}`;
        if (newFileUploaded && fileContent) {
          ideaContext += `\n\n--- Attached Document Content ---\n${fileContent}`;
          logger.info('Appended new file content to idea context', {
            totalLength: ideaContext.length,
          });
        }

        const analysis = await ideaAnalyzer.analyzeIdea(ideaContext, {
          previousMessages: conversation.messages || [],
        });

        updatedMetadata.analysis = analysis;
        // Store the cumulative context.
        updatedMetadata.ideaDescription = ideaContext;

        const messageCount = conversation.messages?.length || 0;
        const isFirstMessage = messageCount <= 1;

        if (isFirstMessage && ideaAnalyzer.needsClarification(analysis)) {
          const questions = ideaAnalyzer.generateClarifyingQuestions(analysis);
          assistantResponse = `I understand you want to create a ${analysis.plan_type.replace(/_/g, ' ')}. To create the best plan for you, I have a few questions:\n\n${questions
            .slice(0, 3)
            .map((q, i) => `${i + 1}. ${q}`)
            .join(
              '\n'
            )}\n\nPlease share what you can, and I'll generate a comprehensive plan for you!`;
          updatedMetadata.askedQuestions = true;
          updatedMetadata.planStage = PLAN_STAGES.IDEA_ANALYSIS;
        } else {
          logger.info('Generating plan directly after user response');
          const brainstorm = await brainstormEngine.generateBrainstorm(
            ideaContext,
            analysis,
            [],
            { constraints: metadata.collectedParams?.constraints }
          );
          updatedMetadata.brainstorm = brainstorm;
          const plan = await planGenerator.generatePlan(
            ideaContext,
            analysis,
            brainstorm,
            DEFAULT_PARAMS.planDepth,
            metadata.collectedParams?.constraints || {}
          );
          updatedMetadata.generatedPlan = plan;
          assistantResponse = `**Your Plan is Ready!** 🎉\n\n` + planGenerator.formatPlanForPresentation(plan, 'summary');
          assistantResponse += `\n\n**Optional: To refine your plan further, you can:**\n- Adjust the timeline or budget constraints?\n- Add more details to specific phases?\n- Explore alternative approaches?\n- Get more information on risks and mitigation strategies?\n\nJust let me know what you'd like to adjust, or ask me anything about the plan!`;
          updatedMetadata.planStage = PLAN_STAGES.REFINEMENT;
        }
        break;
      }

      case PLAN_STAGES.REFINEMENT: {
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
            assistantResponse += `${i + 1}. **${alt.approach}**\n   ✅ Pros: ${alt.pros?.join(', ')}\n   ⚠️ Cons: ${alt.cons?.join(', ')}\n\n`;
          });
          assistantResponse += `\nWould you like me to update your plan with any of these approaches?`;
        } else {
          logger.info('Applying user feedback to refine plan');
          const improvedPlan = await planRefiner.applyFeedback(
            existingPlan,
            message,
            conversation.messages || []
          );
          updatedMetadata.generatedPlan = improvedPlan;
          assistantResponse = `**Plan Updated!** ✅\n\nI've refined your plan based on your feedback. Here are the key updates:\n\n` + planGenerator.formatPlanForPresentation(improvedPlan, 'summary');
          assistantResponse += `\n\n**What else would you like to adjust?**\n- Timeline or budget\n- Specific phases or action items\n- Risk assessment\n- Resource allocation\n\nJust let me know!`;
        }
        break;
      }

      default:
        assistantResponse =
          'I can help you create a comprehensive plan for your idea. Please describe your idea to get started!';
    }

    // Update conversation metadata
    await conversationService.updateConversationMetadata(
      currentConversationId,
      effectiveUserId,
      updatedMetadata,
      req // FIX: Pass request object for tenancy context in updates.
    );

    // Add assistant response
    await addMessage(
      currentConversationId,
      effectiveUserId,
      'assistant',
      assistantResponse,
      {
        planStage: updatedMetadata.planStage,
      },
      req // FIX: Pass request object for tenancy context in updates.
    );

    return {
      success: true,
      conversationId: currentConversationId,
      response: assistantResponse,
      planStage: updatedMetadata.planStage,
      hasAnalysis: !!updatedMetadata.analysis,
      hasBrainstorm: !!updatedMetadata.brainstorm,
      hasPlan: !!updatedMetadata.generatedPlan,
    };
  } catch (error) {
    logger.error('Error in conversational assistant:', error);
    // FIX: Propagate specific limit-related errors with an appropriate status code.
    if (error.isUsageError) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, error.message);
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to process request'
    );
  }
};

/**
 * Generates a plan directly without a conversational interface.
 * This service is available to both authenticated and guest users.
 *
 * @async
 * @function generatePlanDirect
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
 * @param {object | null} [req=null] - The Express request object, for multi-tenancy or user context.
 * @returns {Promise<object>} An object containing the success status, analysis, brainstorm, generated plan, and a message.
 * @throws {ApiError} If there's an internal server error during plan generation.
 */
const generatePlanDirect = async (params, userId = null, isGuest = false, req = null) => {
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

    // FIX: For authenticated users, check limits before generation.
    if (!isGuest && req && req.user) {
        await usageService.checkAndCharge(req.user, 'direct_plan_generation', { complexity });
    }

    logger.info('Direct plan generation request:', {
      userId: req?.user?.id || userId,
      isGuest,
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
    // FIX: Propagate specific limit-related errors with an appropriate status code.
    if (error.isUsageError) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, error.message);
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      error.message || 'Failed to generate plan'
    );
  }
};

/**
 * Retrieves the full conversation history for a given conversation ID and user.
 * Access is restricted to the user who owns the conversation or their authorized manager/admin.
 *
 * @async
 * @function getConversationHistory
 * @param {string} conversationId - The ID of the conversation to retrieve.
 * @param {string} userId - The ID of the user who owns the conversation. This enforces data privacy and multi-tenancy.
 * @param {object | null} [req=null] - The Express request object, containing the requester's context for permission checks.
 * @returns {Promise<object>} An object containing the success status and the full conversation object.
 * @throws {ApiError} If the conversation is not found or the requester lacks permission.
 */
const getConversationHistory = async (conversationId, userId, req = null) => {
  try {
    // FIX: Implement hierarchical access control.
    // The helper is responsible for checking if the requester (req.user) has permission
    // to view the conversation belonging to `userId`. This prevents IDOR across different
    // tenants and respects the user hierarchy (e.g., manager viewing a subordinate's conversation).
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId, // The target user whose conversation is being requested
      req,    // The requester's context (req.user) for permission checks
      true    // Use .lean()
    );

    return {
      success: true,
      conversation,
    };
  } catch (error) {
    logger.error('Error getting conversation history:', error);
    // FIX: Provide a more accurate error message. The helper should throw a specific error for not found vs. forbidden.
    if (error.statusCode === 403) {
        throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to view this conversation.');
    }
    throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found or access denied.');
  }
};

/**
 * Exports the generated plan from a conversation in a specified format.
 * Supported formats include 'markdown', 'json', and 'html'.
 * Access is restricted to the user who owns the conversation or their authorized manager/admin.
 *
 * @async
 * @function exportPlan
 * @param {string} conversationId - The ID of the conversation containing the plan.
 * @param {string} userId - The ID of the user who owns the conversation. This enforces data privacy and multi-tenancy.
 * @param {'markdown' | 'json' | 'html'} [format='markdown'] - The desired export format.
 * @param {object | null} [req=null] - The Express request object, for multi-tenancy or user context.
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
    // FIX: Implement hierarchical access control, same as getConversationHistory.
    // The helper ensures the requester (req.user) can access the conversation of `userId`.
    const conversation = await conversationHelpers.getConversationById(
      conversationId,
      userId,
      req,
      true // Use .lean()
    );

    // FIX: Bug fix - data is in 'metadata', not directly on the conversation object.
    const plan = conversation.metadata?.generatedPlan;

    if (!plan) {
      throw new ApiError(
        httpStatus.NOT_FOUND,
        'No plan found in this conversation'
      );
    }

    // FIX: Before exporting, check usage as it can be a billable event.
    if (req && req.user) {
        await usageService.checkAndCharge(req.user, 'plan_export', { format });
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
    // FIX: Propagate specific limit-related or permission errors with appropriate status codes.
    if (error.isUsageError) {
        throw new ApiError(httpStatus.PAYMENT_REQUIRED, error.message);
    }
    if (error.statusCode === 403) {
        throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to export this plan.');
    }
    if (error.statusCode === 404) {
        throw new ApiError(httpStatus.NOT_FOUND, 'Conversation not found or access denied.');
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to export plan'
    );
  }
};

/**
 * @namespace planGeneratorService
 * @description Provides services for generating and managing business or project plans.
 * This includes a conversational assistant for iterative plan development, a direct generation
 * endpoint for quick plans, conversation history management, and plan exporting capabilities.
 * The services are designed to work for both authenticated and guest users, with data access
 * scoped by `userId` and `workspaceId` to ensure multi-tenancy and respect role hierarchies.
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
// and another on 'workspaceId' to optimize lookups.
// Example: conversationSchema.index({ conversationId: 1, userId: 1 });
// Example: conversationSchema.index({ workspaceId: 1, createdAt: -1 });