import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { deepResearchService } from './deep_research.service.js';
import { runDeepResearchAgent } from "./deep_research_assistant/workflow.js";
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';

export const performDeepResearch = catchAsync(async (req, res) => {
    // Handle both authenticated and guest users
    const isGuest = req.isGuest || !req.user;
    let userId = isGuest ? deepResearchService.generateGuestUserId() : (req.user?.userId || req.user?._id);
    const { query, generatePdf = false, conversationId, maxDepth = 3 } = req.body;
    userId = req.body.userId || userId; // Allow overriding userId from request body

    // Skip subscription check for guest users
    if (!isGuest) {
        const userSubscription = await SubscriptionModel.findOne({ userId }).sort({ createdAt: -1 });
        const promptUsage = userSubscription ? userSubscription.usage : 0;
        const totalConversationWithConvId = conversationId ? await conversationHelpers.getConversationById(conversationId, userId) : 0;

        if (promptUsage <= totalConversationWithConvId) {
            return sendResponse(res, {
                statusCode: httpStatus.FORBIDDEN,
                success: false,
                message: 'You have reached your deep research limit for this month. Please upgrade your plan to continue.',
            });
        }
    }

    if (!query) {
        return sendResponse(res, {
            statusCode: httpStatus.BAD_REQUEST,
            success: false,
            message: 'A research query is required',
        });
    }

    if (!userId) {
        return sendResponse(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'Failed to generate user identifier',
        });
    }

    const thread_id = conversationId || deepResearchService.generateDeepResearchConversationId();

    try {
        // Handle conversation creation/retrieval
        const conversation = await deepResearchService.handleDeepResearchConversation(userId, conversationId, query, isGuest);
        const actualConversationId = conversation.conversationId || thread_id;

        // Get conversation history for context-aware processing
        let conversationHistory = [];
        if (conversationId && conversation.messages) {
            // Get last 5 messages for context (excluding the current message)
            conversationHistory = conversation.messages
                .slice(-5)
                .map(msg => ({
                    role: msg.role,
                    content: msg.content
                }));
        }

        // Add user message to conversation
        await deepResearchService.addDeepResearchQueryMessage(actualConversationId, userId, query, isGuest);

        console.log(`Starting deep research for query: "${query}"`);

        // Run the deep research agent
        const result = await runDeepResearchAgent(query, {
            generatePdf,
            conversationId: actualConversationId,
            maxDepth,
            history: conversationHistory
        });

        if (!result.success) {
            return sendResponse(res, {
                statusCode: httpStatus.INTERNAL_SERVER_ERROR,
                success: false,
                message: result.error || 'Deep research failed',
            });
        }

        // Add assistant response to conversation with enhanced metadata
        const messageMetadata = {
            sources: result.sources,
            promisingLeads: result.promisingLeads,
            deepDiveResults: result.deepDiveResults,
            qualityMetrics: result.qualityMetrics,
            knowledgeGraph: result.knowledgeGraph,
            researchProgress: result.researchProgress,
            classification: result.classification,
            researchType: 'recursive_deep',
            searchTimestamp: new Date().toISOString()
        };

        await deepResearchService.addDeepResearchResultMessage(actualConversationId, userId, result.answer, messageMetadata, isGuest);

        // Prepare response
        const response = {
            success: true,
            query: result.query,
            answer: result.answer,
            classification: result.classification,
            sources: result.sources,
            promisingLeads: result.promisingLeads,
            deepDiveResults: result.deepDiveResults,
            qualityMetrics: result.qualityMetrics,
            knowledgeGraph: result.knowledgeGraph,
            metadata: result.metadata,
            conversationId: actualConversationId,
            researchProgress: result.researchProgress,
            messageCount: conversation.messageCount + 2,
            userType: isGuest ? 'guest' : 'authenticated',
            userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
        };

        // Handle PDF data if generated
        if (result.pdfData && !result.pdfData.error) {
            response.pdf = {
                filename: result.pdfData.filename,
                size: result.pdfData.size,
                downloadUrl: `/api/deep-research/download-pdf/${result.metadata.savedId}`
            };
        }

        return sendResponse(res, {
            statusCode: httpStatus.OK,
            success: true,
            message: 'Deep research completed successfully',
            data: response,
        });

    } catch (error) {
        logger.error("Deep Research API Error:", error);
        
        // Try to save error message to conversation if possible
        const errorConversationId = conversationId || deepResearchService.generateDeepResearchConversationId();
        try {
            if (errorConversationId && userId) {
                await deepResearchService.addErrorMessage(
                    errorConversationId,
                    userId,
                    'I apologize, but an error occurred while processing your deep research request.',
                    error,
                    isGuest
                );
            }
        } catch (convError) {
            logger.error("Failed to save error to conversation:", convError);
        }
        
        return sendResponse(res, {
            statusCode: httpStatus.INTERNAL_SERVER_ERROR,
            success: false,
            message: 'An internal error occurred while processing your deep research',
            data: { 
                conversationId: errorConversationId,
                userType: isGuest ? 'guest' : 'authenticated',
            },
        });
    }
});

/**
 * Get deep research statistics for the user (authenticated users only)
 */
const getDeepResearchStats = catchAsync(async (req, res) => {
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

    const stats = await deepResearchService.getDeepResearchStats(userId);

    sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Deep research statistics retrieved successfully',
        data: stats,
    });
});

/**
 * Download PDF file (supports both authenticated and guest users)
 */
const downloadPDF = catchAsync(async (req, res) => {
    const { savedId } = req.params;

    // TODO: Implement PDF download logic
    // This should retrieve the PDF from storage using the savedId
    // For now, return a placeholder response
    
    return sendResponse(res, {
        statusCode: httpStatus.NOT_IMPLEMENTED,
        success: false,
        message: 'PDF download feature not yet implemented',
        data: { savedId },
    });
});

export const deepResearchController = {
    performDeepResearch,
    getDeepResearchStats,
    downloadPDF,
};