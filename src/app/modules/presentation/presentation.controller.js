import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { presentationService } from './presentation.service.js';
// import SubscriptionModel from '../subscription/subscription.model.js'; // Not used in this file, removed for cleaner code
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationService } from '../conversations/conversation.service.js';

/**
 * @typedef {object} PresentationAssistantRequest
 * @property {string} message - The user's natural language message for presentation generation.
 * @property {string} [conversationId] - Optional ID of an existing conversation to continue.
 * @property {string} [userId] - Optional user ID, primarily for guest users or overriding.
 */

/**
 * @typedef {object} PresentationAssistantResponse
 * @property {string} conversationId - The ID of the conversation.
 * @property {boolean} success - Indicates if the request was processed successfully.
 * @property {boolean} [needsMoreInfo] - True if the assistant requires more information from the user.
 * @property {object} [data] - Additional data related to the assistant's response.
 */

/**
 * Conversational presentation assistant endpoint
 * Handles natural language requests for presentation generation
 * @description This endpoint allows users to interact with a conversational AI to generate presentations.
 * It supports both authenticated users and guests, managing conversation state and generating user IDs for guests.
 * @summary Conversational Presentation Assistant
 * @tags Presentation
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @api {post} /api/v1/presentation/assistant Conversational Presentation Assistant
 * @apiDescription Handles natural language requests for presentation generation, maintaining conversation context.
 * @apiGroup Presentation
 * @apiBody {PresentationAssistantRequest} body - The request body containing the message and optional conversation ID.
 * @apiSuccess {number} statusCode 200 - Request processed successfully.
 * @apiSuccess {boolean} success true - Indicates success.
 * @apiSuccess {string} message 'Request processed successfully'
 * @apiSuccess {PresentationAssistantResponse} data - The response data from the assistant.
 * @apiError {number} statusCode 400 - Message is required.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Message is required'
 * @apiError {number} statusCode 500 - Failed to generate user identifier or an internal server error occurred.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Failed to generate user identifier' | 'An error occurred while processing your request'
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? presentationService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

  logger.info(
    `Presentation assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`
  );

  if (!message) {
    return sendResponse(res, {
      statusCode: httpStatus.BAD_REQUEST,
      success: false,
      message: 'Message is required',
    });
  }

  if (!userId) {
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to generate user identifier',
    });
  }

  try {
    const result = await presentationService.processConversationalRequest(
      userId,
      message,
      conversationId,
      isGuest,
      req
    );

    logger.info('Presentation assistant response:', {
      conversationId: result.conversationId,
      success: result.success,
      needsMoreInfo: result.needsMoreInfo,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Request processed successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error in conversational assistant:', error);

    return sendResponse(res, {
      statusCode: error.statusCode || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
      },
    });
  }
});

/**
 * @typedef {object} GeneratePresentationRequest
 * @property {string} content - The main content or topic for the presentation.
 * @property {number} [n_slides] - Number of slides to generate.
 * @property {string} [language] - Language of the presentation (e.g., 'en', 'es').
 * @property {string} [template] - Presentation template to use.
 * @property {string} [theme] - Visual theme for the presentation.
 * @property {'pptx'|'pdf'} [export_as] - Format to export the presentation.
 * @property {string} [tone] - Tone of the presentation (e.g., 'formal', 'casual').
 * @property {string} [verbosity] - Verbosity level (e.g., 'concise', 'detailed').
 * @property {string} [image_type] - Type of images to include (e.g., 'abstract', 'realistic').
 * @property {boolean} [web_search] - Whether to perform a web search for content.
 * @property {boolean} [include_table_of_contents] - Whether to include a table of contents slide.
 * @property {boolean} [include_title_slide] - Whether to include a title slide.
 * @property {boolean} [async=false] - If true, the generation will be asynchronous, returning a task ID.
 */

/**
 * @typedef {object} GeneratePresentationResponse
 * @property {string} [taskId] - The ID of the asynchronous task if `async` is true.
 * @property {string} [downloadUrl] - Direct download URL for synchronous generation.
 * @property {string} [publicUrl] - Publicly accessible URL after GCS upload for synchronous generation.
 * @property {string} [presentation_id] - ID of the generated presentation.
 * @property {string} message - A descriptive message.
 */

/**
 * Direct generation endpoint (non-conversational)
 * For programmatic access with all parameters provided
 * @description This endpoint allows for direct, programmatic generation of presentations by providing all necessary parameters in the request body.
 * It supports both synchronous and asynchronous generation, with synchronous results being uploaded to GCS.
 * @summary Direct Presentation Generation
 * @tags Presentation
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @api {post} /api/v1/presentation/generate Direct Presentation Generation
 * @apiDescription Generates a presentation directly with specified parameters, supporting synchronous and asynchronous modes.
 * @apiGroup Presentation
 * @apiBody {GeneratePresentationRequest} body - The request body containing all presentation generation parameters.
 * @apiSuccess {number} statusCode 200 - Presentation generation started or completed successfully.
 * @apiSuccess {boolean} success true - Indicates success.
 * @apiSuccess {string} message 'Presentation generation started' | 'Presentation generated successfully'
 * @apiSuccess {GeneratePresentationResponse} data - The response data, including task ID or download URL.
 * @apiError {number} statusCode 500 - An error occurred during presentation generation.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Failed to generate presentation'
 */
export const generatePresentation = catchAsync(async (req, res) => {
  const {
    content,
    n_slides,
    language,
    template,
    theme,
    export_as,
    tone,
    verbosity,
    image_type,
    web_search,
    include_table_of_contents,
    include_title_slide,
    async,
  } = req.body;

  logger.info('Direct presentation generation request');

  const params = {
    content,
    n_slides,
    language,
    template,
    theme,
    export_as,
    tone,
    verbosity,
    image_type,
    web_search,
    include_table_of_contents,
    include_title_slide,
  };

  try {
    const { presentonAPIClient } = await import(
      './services/presentonAPIClient.js'
    );
    const { uploadPresentationToGCS } = await import(
      './services/gcsUploadService.js'
    );
    const path = await import('path');

    let result;
    if (async) {
      result = await presentonAPIClient.generatePresentationAsync(params);
    } else {
      result = await presentonAPIClient.generatePresentation(params);
      console.log('Synchronous generation result:', result);
      // Upload to GCS for sync generation
      if (result.downloadUrl) {
        try {
          const userId = req.user?.userId || req.user?._id || 'direct_api';
          const conversationId = `direct_${Date.now()}`;
          const fileName =
            path.default.basename(result.downloadUrl) ||
            `presentation_${result.presentation_id}.pptx`;
          const uploadResult = await uploadPresentationToGCS(
            result.downloadUrl,
            fileName,
            userId,
            conversationId
          );

          result.publicUrl = uploadResult.publicUrl;
          logger.info(
            `Presentation uploaded to GCS: ${uploadResult.publicUrl}`
          );
        } catch (uploadError) {
          logger.error('Error uploading presentation to GCS:', uploadError);
          // Continue even if upload fails
        }
      }
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: async
        ? 'Presentation generation started'
        : 'Presentation generated successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error generating presentation:', error);

    return sendResponse(res, {
      statusCode: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to generate presentation',
    });
  }
});

/**
 * @typedef {object} TaskStatusResponse
 * @property {string} status - The current status of the task (e.g., 'pending', 'processing', 'completed', 'failed').
 * @property {object} [data] - Data related to the task, such as presentation details if completed.
 * @property {string} [data.path] - Download path of the generated presentation.
 * @property {string} [data.presentation_id] - ID of the generated presentation.
 * @property {string} [data.edit_path] - Path for editing the presentation.
 * @property {string} [publicUrl] - Publicly accessible URL of the uploaded presentation if completed and uploaded to GCS.
 * @property {object} [uploadResult] - Details of the GCS upload operation.
 */

/**
 * Check async task status
 * @description This endpoint allows checking the status of an asynchronously initiated presentation generation task.
 * It can retrieve the task ID either directly from path parameters or from conversation metadata.
 * If the task is completed and a presentation is available, it attempts to upload it to GCS and updates conversation metadata.
 * @summary Check Asynchronous Task Status
 * @tags Presentation
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @api {get} /api/v1/presentation/status/:taskId Check Task Status
 * @apiDescription Checks the status of an asynchronous presentation generation task.
 * @apiGroup Presentation
 * @apiParam {string} [taskId] - The ID of the task to check. Required if `conversationId` is not provided.
 * @apiQuery {string} [conversationId] - Optional. If provided, the `taskId` will be retrieved from the conversation's metadata.
 * @apiQuery {string} [userId] - Optional. User ID for guest users or overriding.
 * @apiSuccess {number} statusCode 200 - Task status retrieved successfully.
 * @apiSuccess {boolean} success true - Indicates success.
 * @apiSuccess {string} message 'Task status retrieved successfully'
 * @apiSuccess {TaskStatusResponse} data - The task status and related data.
 * @apiError {number} statusCode 400 - No task ID found in conversation metadata.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'No task ID found in conversation metadata'
 * @apiError {number} statusCode 404 - Conversation not found if `conversationId` is provided and invalid.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Conversation not found'
 * @apiError {number} statusCode 500 - An error occurred while checking task status.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Failed to check task status'
 */
export const checkTaskStatus = catchAsync(async (req, res) => {
  let { taskId } = req.params;
  const { conversationId } = req.query;
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? presentationService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  userId = req.query.userId || userId;
  // If conversationId is provided, fetch taskId from conversation metadata
  if (conversationId && !taskId) {
    try {
      const conversation = await conversationHelpers.getConversationById(
        conversationId,
        userId,
        req
      );
      // Optimization Note: If 'conversationHelpers.getConversationById' performs a Mongoose query,
      // consider adding '.lean()' to the query for read-only operations to improve performance
      // by returning plain JavaScript objects instead of Mongoose documents.
      // Also, ensure that 'conversationId' and 'userId' fields are indexed in the database
      // if they are frequently used for querying conversations.
      taskId = conversation.metadata?.presentation_metadata?.taskId;

      if (!taskId) {
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'No task ID found in conversation metadata',
        });
      }

      logger.info(
        `Retrieved taskId ${taskId} from conversation ${conversationId}`
      );
    } catch (error) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Conversation not found',
      });
    }
  }

  logger.info(`Checking status for task ${taskId}`);

  try {
    const { presentonAPIClient } = await import(
      './services/presentonAPIClient.js'
    );
    const { uploadPresentationToGCS } = await import(
      './services/gcsUploadService.js'
    );
    const path = await import('path');

    const result = await presentonAPIClient.checkTaskStatus(taskId);

    // If task is completed and has a presentation, upload to GCS
    let publicUrl = null;
    let uploadResult = null;

    if (result.status === 'completed' && result.data?.path) {
      try {
        const fileName =
          path.default.basename(result.data.path) ||
          `presentation_${result.data.presentation_id}.pptx`;
        const uploadConversationId = conversationId || `task_${taskId}`;

        try {
          uploadResult = await uploadPresentationToGCS(
            result.data.path,
            fileName,
            userId,
            uploadConversationId
          );

          publicUrl = uploadResult.publicUrl;
          logger.info(
            `Task ${taskId} presentation uploaded to GCS: ${publicUrl}`
          );
        } catch (uploadError) {
          logger.error(
            'Error uploading task presentation to GCS:',
            uploadError
          );
        }

        // Update conversation metadata with completion info if conversationId provided
        if (conversationId) {
          try {
            console.log(
              'Updating conversation metadata with presentation completion info'
            );
            await conversationService.updatePresentationMetadata(
              conversationId,
              userId,
              {
                taskId,
                status: 'completed',
                presentationId: result.data.presentation_id,
                publicUrl,
                downloadPath: result.data.path,
                editPath: result.data.edit_path,
                completedAt: new Date().toISOString(),
                uploadResult,
              },
              req
            );
            logger.info(
              `Updated conversation ${conversationId} with completion metadata`
            );
          } catch (metadataError) {
            logger.error(
              'Error updating conversation metadata:',
              metadataError
            );
          }
        }
      } catch (uploadError) {
        logger.error('Error uploading task presentation to GCS:', uploadError);
        // Continue even if upload fails
      }
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Task status retrieved successfully',
      data: {
        ...result,
        publicUrl,
        uploadResult,
      },
    });
  } catch (error) {
    logger.error('Error checking task status:', error);

    return sendResponse(res, {
      statusCode: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to check task status',
    });
  }
});

/**
 * @typedef {object} EditPresentationRequest
 * @property {string} presentationId - The ID of the presentation to edit.
 * @property {Array<object>} slides - An array of slide objects with changes.
 * @property {'pptx'|'pdf'} [export_as] - Format to export the edited presentation.
 */

/**
 * @typedef {object} EditPresentationResponse
 * @property {string} presentation_id - The ID of the edited presentation.
 * @property {string} downloadUrl - URL to download the edited presentation.
 * @property {string} editUrl - URL to further edit the presentation.
 */

/**
 * Edit existing presentation
 * @description This endpoint allows for editing an existing presentation by providing its ID and an array of slide modifications.
 * @summary Edit Existing Presentation
 * @tags Presentation
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @api {post} /api/v1/presentation/edit Edit Presentation
 * @apiDescription Edits an existing presentation based on provided slide modifications.
 * @apiGroup Presentation
 * @apiBody {EditPresentationRequest} body - The request body containing presentation ID, slide changes, and export format.
 * @apiSuccess {number} statusCode 200 - Presentation edited successfully.
 * @apiSuccess {boolean} success true - Indicates success.
 * @apiSuccess {string} message 'Presentation edited successfully'
 * @apiSuccess {EditPresentationResponse} data - The response data, including download and edit URLs.
 * @apiError {number} statusCode 500 - An error occurred while editing the presentation.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Failed to edit presentation'
 */
export const editPresentation = catchAsync(async (req, res) => {
  const { presentationId, slides, export_as } = req.body;

  logger.info(`Editing presentation ${presentationId}`);

  try {
    const { presentonAPIClient } = await import(
      './services/presentonAPIClient.js'
    );
    const result = await presentonAPIClient.editPresentation({
      presentationId,
      slides,
      export_as,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Presentation edited successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error editing presentation:', error);

    return sendResponse(res, {
      statusCode: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to edit presentation',
    });
  }
});

/**
 * @typedef {object} DerivePresentationRequest
 * @property {string} presentationId - The ID of the source presentation to derive from.
 * @property {Array<object>} slides - An array of slide objects for the new presentation.
 * @property {'pptx'|'pdf'} [export_as] - Format to export the new presentation.
 */

/**
 * @typedef {object} DerivePresentationResponse
 * @property {string} presentation_id - The ID of the newly derived presentation.
 * @property {string} downloadUrl - URL to download the new presentation.
 * @property {string} editUrl - URL to further edit the new presentation.
 */

/**
 * Derive new presentation from existing one
 * @description This endpoint allows creating a new presentation based on an existing one, potentially with modifications to slides.
 * @summary Derive New Presentation
 * @tags Presentation
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @api {post} /api/v1/presentation/derive Derive Presentation
 * @apiDescription Creates a new presentation by deriving content from an existing one.
 * @apiGroup Presentation
 * @apiBody {DerivePresentationRequest} body - The request body containing the source presentation ID, new slide content, and export format.
 * @apiSuccess {number} statusCode 200 - New presentation created successfully.
 * @apiSuccess {boolean} success true - Indicates success.
 * @apiSuccess {string} message 'New presentation created successfully'
 * @apiSuccess {DerivePresentationResponse} data - The response data, including download and edit URLs for the new presentation.
 * @apiError {number} statusCode 500 - An error occurred while deriving the presentation.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Failed to create new presentation'
 */
export const derivePresentation = catchAsync(async (req, res) => {
  const { presentationId, slides, export_as } = req.body;

  logger.info(`Deriving presentation from ${presentationId}`);

  try {
    const { presentonAPIClient } = await import(
      './services/presentonAPIClient.js'
    );
    const result = await presentonAPIClient.derivePresentation({
      presentationId,
      slides,
      export_as,
    });

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'New presentation created successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error deriving presentation:', error);

    return sendResponse(res, {
      statusCode: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to create new presentation',
    });
  }
});

/**
 * @typedef {object} GetPresentationResponse
 * @property {string} presentation_id - The ID of the presentation.
 * @property {string} downloadUrl - URL to download the presentation.
 * @property {string} editUrl - URL to edit the presentation.
 * @property {Array<object>} slides - An array of slide objects representing the presentation content.
 * @property {object} metadata - Additional metadata about the presentation.
 */

/**
 * Get presentation details
 * @description This endpoint retrieves the full details of a specific presentation using its ID.
 * @summary Get Presentation Details
 * @tags Presentation
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @api {get} /api/v1/presentation/:presentationId Get Presentation
 * @apiDescription Retrieves the details of a specific presentation.
 * @apiGroup Presentation
 * @apiParam {string} presentationId - The ID of the presentation to retrieve.
 * @apiSuccess {number} statusCode 200 - Presentation retrieved successfully.
 * @apiSuccess {boolean} success true - Indicates success.
 * @apiSuccess {string} message 'Presentation retrieved successfully'
 * @apiSuccess {GetPresentationResponse} data - The presentation details.
 * @apiError {number} statusCode 500 - An error occurred while retrieving the presentation.
 * @apiError {boolean} success false - Indicates failure.
 * @apiError {string} message 'Failed to retrieve presentation'
 */
export const getPresentation = catchAsync(async (req, res) => {
  const { presentationId } = req.params;

  logger.info(`Getting presentation ${presentationId}`);

  try {
    const { presentonAPIClient } = await import(
      './services/presentonAPIClient.js'
    );
    const result = await presentonAPIClient.getPresentation(presentationId);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Presentation retrieved successfully',
      data: result,
    });
  } catch (error) {
    logger.error('Error getting presentation:', error);

    return sendResponse(res, {
      statusCode: error.status || httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: error.message || 'Failed to retrieve presentation',
    });
  }
});

/**
 * @namespace presentationController
 * @description Controller for handling presentation-related operations.
 * This object aggregates all presentation endpoint handlers.
 */
export const presentationController = {
  conversationalAssistant,
  generatePresentation,
  checkTaskStatus,
  editPresentation,
  derivePresentation,
  getPresentation,
};