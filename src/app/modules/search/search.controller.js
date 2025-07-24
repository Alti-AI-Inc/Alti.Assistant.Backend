import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { searchService } from './search.service.js';
import { researchAgentApp } from "./search_assistant/workflow.js";
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

export const performSearch = catchAsync(async (req, res) => {
    const userId = req.user?.userId || req.user?._id;
    const { message, conversationId, deepSearch } = req.body;
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
    const prompotUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId) : 0;

    if (prompotUsage <= totalConversationWithConvId) {
        return sendResponse(res, {
            statusCode: httpStatus.FORBIDDEN,
            success: false,
            message: 'You have reached your search limit for this month. Please upgrade your plan to continue.',
        });
    }
    if (!message) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'A search query is required',
        });
    }

    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: 'User authentication required',
        });
    }

    const thread_id = conversationId || searchService.generateSearchConversationId();

    try {
        // Handle conversation creation/retrieval
        const conversation = await searchService.handleSearchConversation(userId, conversationId, message);
        const actualConversationId = conversation.conversationId || thread_id;

        // Add user message to conversation
        await searchService.addSearchQueryMessage(actualConversationId, userId, message);

        const inputs = { 
            query: message,
            depth: deepSearch ? deepSearch : 'standard', // Use deepSearch flag to determine search depth
            history: [{ role: 'user', content: message }],
        };
        
        const result = await researchAgentApp.invoke(inputs, { configurable: { thread_id: actualConversationId } });
        logger.info(`Research Assistant Result for conversation: ${actualConversationId}`);
        
        const stream = result.answer;
        let fullResponse = "";

        if (typeof stream === 'string') {
            // If the stream is a string, send it directly as a JSON response
            fullResponse = stream;
            
            // Add assistant response to conversation
            await searchService.addSearchResultMessage(actualConversationId, userId, fullResponse);

            return sendResponse(res, {
                statusCode: httpStatus.OK,
                success: true,
                message: 'Search completed successfully',
                data: {
                    responseMessage: fullResponse.startsWith("{") && fullResponse.endsWith("}") ? JSON.parse(fullResponse) : fullResponse,
                    conversationId: actualConversationId,
                    messageCount: conversation.messageCount + 2,
                },
            });
        } else {
            // Set up SSE headers only when streaming
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
                    const chunk = event.delta.text;
                    fullResponse += chunk;
                    res.write(`data: ${JSON.stringify({ chunk, conversationId: actualConversationId })}\n\n`);
                }
            }
            
            // Add assistant response to conversation after streaming is complete
            await searchService.addSearchResultMessage(
                actualConversationId, 
                userId, 
                fullResponse, 
                { streamed: true }
            );

            // Send final message with complete response
            res.write(`data: ${JSON.stringify({ 
                complete: true, 
                fullResponse,
                conversationId: actualConversationId,
                success: true,
                message: 'Search completed successfully'
            })}\n\n`);
            res.end();
        }
    } catch (error) {
        logger.error("Research Assistant Error:", error);
        
        // Try to save error message to conversation if possible
        const errorConversationId = conversationId || searchService.generateSearchConversationId();
        try {
            if (errorConversationId && userId) {
                await searchService.addErrorMessage(
                    errorConversationId,
                    userId,
                    'I apologize, but an error occurred while processing your search request.',
                    error
                );
            }
        } catch (convError) {
            logger.error("Failed to save error to conversation:", convError);
        }
        
        // Check if headers have already been sent
        if (res.headersSent) {
            res.write(`data: ${JSON.stringify({ 
                error: "An internal error occurred while processing your search.",
                conversationId: errorConversationId,
                success: false
            })}\n\n`);
            res.end();
        } else {
            return sendResponse(res, {
                statusCode: httpStatus.INTERNAL_SERVER_ERROR,
                success: false,
                message: 'An internal error occurred while processing your search',
                data: { conversationId: errorConversationId },
            });
        }
    }
});

/**
 * Get search statistics for the user
 */
const getSearchStats = catchAsync(async (req, res) => {
    const userId = req.user?.userId || req.user?._id;

    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.UNAUTHORIZED,
            success: false,
            message: 'User authentication required',
        });
    }

    const stats = await searchService.getSearchStats(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Search statistics retrieved successfully',
        data: stats,
    });
});

export const searchController = {
    performSearch,
    getSearchStats,
};

