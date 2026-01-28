import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { codeService } from './code.service.js';
import { codeAssistantApp } from "./code_assistant/workflow.js";
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { codeHelpers } from './code.helper.js';

export const performCodeTask = catchAsync(async (req, res) => {
    // Handle both authenticated and guest users
    const isGuest = req.isGuest || !req.user;
    const userId = isGuest ? codeService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    const { message, conversationId } = req.body;

    // Skip subscription check for guest users
    if (!isGuest) {
        const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
        const promptUsage = userSubscription ? userSubscription.usage : 0;
        const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId, req) : 0;

        if (promptUsage <= totalConversationWithConvId) {
            return sendResponse(res, {
                statusCode: httpStatus.FORBIDDEN,
                success: false,
                message: 'You have reached your code assistance limit for this month. Please upgrade your plan to continue.',
            });
        }
    }

    if (!message) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'A code query is required',
        });
    }

    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to generate user identifier',
        });
    }

    const thread_id = conversationId || codeService.generateCodeConversationId();

    try {
        // Handle conversation creation/retrieval
        const conversation = await codeService.handleCodeConversation(userId, conversationId, message, isGuest, req);
        const actualConversationId = conversation.conversationId || thread_id;

        // Add user message to conversation
        await codeService.addCodeQueryMessage(actualConversationId, userId, message, isGuest, req);

        const inputs = {
            userInput: message, // The user's latest message
            history: [{ role: 'user', content: message }], // Add current message to history
        };

        const result = await codeAssistantApp.invoke(inputs, { configurable: { thread_id: actualConversationId } });
        logger.info(`Code Assistant Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`);

        const fullResponse = result.response;

        // Add assistant response to conversation
        await codeService.addCodeResultMessage(actualConversationId, userId, fullResponse, {}, isGuest, req);

        return sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Code task completed successfully',
            data: {
                ...codeHelpers.formatCodeResponse(
                    fullResponse,
                    actualConversationId,
                    conversation.messageCount + 2
                ),
                userType: isGuest ? 'guest' : 'authenticated',
                userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
            },
        });

    } catch (error) {
        logger.error("Code Assistant Error:", error);

        // Try to save error message to conversation if possible
        const errorConversationId = conversationId || codeService.generateCodeConversationId();
        try {
            if (errorConversationId && userId) {
                await codeService.addErrorMessage(
                    errorConversationId,
                    userId,
                    codeHelpers.formatErrorMessage(error, message),
                    error,
                    req
                );
            }
        } catch (convError) {
            logger.error("Failed to save error to conversation:", convError);
        }

        return sendResponse(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'An internal error occurred while processing your code request',
            data: {
                conversationId: errorConversationId,
                userType: isGuest ? 'guest' : 'authenticated',
            },
        });
    }
});

/**
 * Get code statistics for the user (authenticated users only)
 */
const getCodeStats = catchAsync(async (req, res) => {
    const isGuest = req.isGuest || !req.user;

    if (isGuest) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: 'Statistics are only available for authenticated users',
        });
    }

    const userId = req.user?.userId || req.user?._id;

    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: 'User authentication required',
        });
    }

    const stats = await codeService.getCodeStats(userId, req);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Code statistics retrieved successfully',
        data: stats,
    });
});

export const codeController = {
    performCodeTask,
    getCodeStats,
};
