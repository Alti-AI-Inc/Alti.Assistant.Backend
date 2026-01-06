import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { presentationService } from './presentation.service.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { conversationService } from '../conversations/conversation.service.js';

/**
 * Conversational presentation assistant endpoint
 * Handles natural language requests for presentation generation
 */
export const conversationalAssistant = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? presentationService.generateGuestUserId()
    : req.user?.userId || req.user?._id;

  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

  logger.info(`Presentation assistant request from ${isGuest ? 'guest' : 'authenticated'} user ${userId}`);

  // Check subscription limits for authenticated users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(conversationId, userId)
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your presentation generation limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

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
      isGuest
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
      message: error.message || 'An error occurred while processing your request',
      data: {
        conversationId,
        error: error.message,
      },
    });
  }
});

/**
 * Direct generation endpoint (non-conversational)
 * For programmatic access with all parameters provided
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
    const { presentonAPIClient } = await import('./services/presentonAPIClient.js');
    const { uploadPresentationToGCS } = await import('./services/gcsUploadService.js');
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
          const fileName = path.default.basename(result.downloadUrl) || `presentation_${result.presentation_id}.pptx`;
          const uploadResult = await uploadPresentationToGCS(
            result.downloadUrl,
            fileName,
            userId,
            conversationId
          );

          result.publicUrl = uploadResult.publicUrl;
          logger.info(`Presentation uploaded to GCS: ${uploadResult.publicUrl}`);
        } catch (uploadError) {
          logger.error('Error uploading presentation to GCS:', uploadError);
          // Continue even if upload fails
        }
      }
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: async ? 'Presentation generation started' : 'Presentation generated successfully',
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
 * Check async task status
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
      const conversation = await conversationHelpers.getConversationById(conversationId, userId);
      taskId = conversation.metadata?.presentation_metadata?.taskId;

      if (!taskId) {
        return sendResponse(res, {
          statusCode: httpStatus.BAD_REQUEST,
          success: false,
          message: 'No task ID found in conversation metadata',
        });
      }

      logger.info(`Retrieved taskId ${taskId} from conversation ${conversationId}`);
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
    const { presentonAPIClient } = await import('./services/presentonAPIClient.js');
    const { uploadPresentationToGCS } = await import('./services/gcsUploadService.js');
    const path = await import('path');

    const result = await presentonAPIClient.checkTaskStatus(taskId);

    // If task is completed and has a presentation, upload to GCS
    let publicUrl = null;
    let uploadResult = null;

    if (result.status === 'completed' && result.data?.path) {
      try {
        const fileName = path.default.basename(result.data.path) || `presentation_${result.data.presentation_id}.pptx`;
        const uploadConversationId = conversationId || `task_${taskId}`;

        uploadResult = await uploadPresentationToGCS(
          result.data.path,
          fileName,
          userId,
          uploadConversationId
        );

        publicUrl = uploadResult.publicUrl;
        logger.info(`Task ${taskId} presentation uploaded to GCS: ${publicUrl}`);

        // Update conversation metadata with completion info if conversationId provided
        if (conversationId) {
          try {
            await conversationService.updateConversationMetadata(conversationId, userId, {
              presentation_metadata: {
                taskId,
                status: 'completed',
                presentationId: result.data.presentation_id,
                publicUrl,
                downloadPath: result.data.path,
                editPath: result.data.edit_path,
                completedAt: new Date().toISOString(),
                uploadResult,
              },
            });
            logger.info(`Updated conversation ${conversationId} with completion metadata`);
          } catch (metadataError) {
            logger.error('Error updating conversation metadata:', metadataError);
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
 * Edit existing presentation
 */
export const editPresentation = catchAsync(async (req, res) => {
  const { presentationId, slides, export_as } = req.body;

  logger.info(`Editing presentation ${presentationId}`);

  try {
    const { presentonAPIClient } = await import('./services/presentonAPIClient.js');
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
 * Derive new presentation from existing one
 */
export const derivePresentation = catchAsync(async (req, res) => {
  const { presentationId, slides, export_as } = req.body;

  logger.info(`Deriving presentation from ${presentationId}`);

  try {
    const { presentonAPIClient } = await import('./services/presentonAPIClient.js');
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
 * Get presentation details
 */
export const getPresentation = catchAsync(async (req, res) => {
  const { presentationId } = req.params;

  logger.info(`Getting presentation ${presentationId}`);

  try {
    const { presentonAPIClient } = await import('./services/presentonAPIClient.js');
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

export const presentationController = {
  conversationalAssistant,
  generatePresentation,
  checkTaskStatus,
  editPresentation,
  derivePresentation,
  getPresentation,
};
