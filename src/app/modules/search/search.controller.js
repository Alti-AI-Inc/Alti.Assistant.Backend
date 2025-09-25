import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { searchService } from './search.service.js';
import { researchAgentApp } from "./search_assistant/workflow.js";
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

export const performSearch = catchAsync(async (req, res) => {
    // Handle both authenticated and guest users
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? searchService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    const { message, conversationId, deepSearch } = req.body;
    userId = req.body.userId || userId; // Allow overriding userId from request body
    // Skip subscription check for guest users
    if (!isGuest) {
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
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to generate user identifier',
        });
    }

    const thread_id = conversationId || searchService.generateSearchConversationId();

    try {
        // Handle conversation creation/retrieval
        const conversation = await searchService.handleSearchConversation(userId, conversationId, message, isGuest);
        const actualConversationId = conversation.conversationId || thread_id;

        // Get conversation history for context-aware processing
        let conversationHistory = [];
        if (conversationId && conversation.messages) {
            // Get last 10 messages for context (excluding the current message)
            conversationHistory = conversation.messages
                .slice(-10)
                .map(msg => ({
                    role: msg.role,
                    content: msg.content
                }));
        }

        // Add user message to conversation
        await searchService.addSearchQueryMessage(actualConversationId, userId, message, isGuest);

        const inputs = {
            query: message,
            conversationContext: conversationHistory,
            depth: deepSearch ? deepSearch : 'standard', // Use deepSearch flag to determine search depth
            history: [...conversationHistory, { role: 'user', content: message }],
        };

        const result = await researchAgentApp.invoke(inputs, { configurable: { thread_id: actualConversationId } });
        logger.info(`Research Assistant Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`);
        console.log('Research Assistant Result:', result);


        const stream = result.answer;
        const reference = result.reference || [];
        const citationMetadata = result.citationMetadata || null;

        console.log('References are:', reference);
        console.log('Citation metadata:', citationMetadata);

        let fullResponse = "";

        if (typeof stream === 'string') {
            // If the stream is a string, send it directly as a JSON response
            fullResponse = stream;

            // Add assistant response to conversation with enhanced metadata
            const messageMetadata = {
                reference,
                citationMetadata,
                searchQuery: citationMetadata?.searchQuery || message,
                searchTimestamp: citationMetadata?.searchTimestamp || new Date().toISOString()
            };

            await searchService.addSearchResultMessage(actualConversationId, userId, fullResponse, messageMetadata, isGuest);
            console.log('Full response:', fullResponse);

            return sendResponse(res, {
                statusCode: httpStatus.OK,
                success: true,
                message: 'Search completed successfully',
                data: {
                    responseMessage: {
                        answer: fullResponse,
                        reference,
                        citations: reference.map((ref, index) => ({
                            index: index + 1,
                            url: ref.url,
                            domain: ref.domain
                        })),
                        citationMetadata
                    },
                    conversationId: actualConversationId,
                    messageCount: conversation.messageCount + 2,
                    userType: isGuest ? 'guest' : 'authenticated',
                    userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
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
                    res.write(`data: ${JSON.stringify({
                        chunk,
                        conversationId: actualConversationId,
                        userType: isGuest ? 'guest' : 'authenticated'
                    })}\n\n`);
                }
            }

            // Add assistant response to conversation after streaming is complete
            const messageMetadata = {
                reference,
                citationMetadata,
                searchQuery: citationMetadata?.searchQuery || message,
                searchTimestamp: citationMetadata?.searchTimestamp || new Date().toISOString(),
                streamed: true
            };

            await searchService.addSearchResultMessage(
                actualConversationId,
                userId,
                fullResponse,
                messageMetadata,
                isGuest
            );

            // Send final message with complete response and citations
            res.write(`data: ${JSON.stringify({
                complete: true,
                fullResponse,
                conversationId: actualConversationId,
                success: true,
                message: 'Search completed successfully',
                userType: isGuest ? 'guest' : 'authenticated',
                userId: isGuest ? userId : undefined,
                reference,
                citations: reference.map((ref, index) => ({
                    index: index + 1,
                    url: ref.url,
                    domain: ref.domain
                })),
                citationMetadata
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
                    error,
                    isGuest
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
                success: false,
                userType: isGuest ? 'guest' : 'authenticated'
            })}\n\n`);
            res.end();
        } else {
            return sendResponse(res, {
                statusCode: httpStatus.INTERNAL_SERVER_ERROR,
                success: false,
                message: 'An internal error occurred while processing your search',
                data: {
                    conversationId: errorConversationId,
                    userType: isGuest ? 'guest' : 'authenticated',
                },
            });
        }
    }
});

/**
 * Get search statistics for the user (authenticated users only)
 */
const getSearchStats = catchAsync(async (req, res) => {
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

