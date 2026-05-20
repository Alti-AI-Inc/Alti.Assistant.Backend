import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { searchService } from '../search/search.service.js';
import { SwarmService } from './swarm.service.js';

const performSwarmStreamingSearch = catchAsync(async (req, res) => {
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? searchService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const { message, conversationId } = req.body;
  userId = req.body.userId || userId;

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

  const thread_id =
    conversationId || searchService.generateSearchConversationId();

  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

    // Handle conversation creation/retrieval
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      conversationHistory = conversation.messages.slice(-10).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Add user message to conversation
    await searchService.addSearchQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    // Send initial connection event
    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        conversationId: actualConversationId,
        timestamp: Date.now(),
      })}\n\n`
    );

    let fullText = '';
    let finalReferences = [];

    // Stream the dynamic Swarm response
    for await (const chunk of SwarmService.executeSwarmStream(
      message,
      conversationHistory
    )) {
      if (chunk.type === 'agent_start') {
        res.write(
          `data: ${JSON.stringify({
            type: 'thinking',
            content: `[Recruiting Swarm Specialist: ${chunk.agent.name}...]\n`,
            timestamp: Date.now(),
          })}\n\n`
        );
      } else if (chunk.type === 'text') {
        fullText += chunk.content;
        res.write(
          `data: ${JSON.stringify({
            type: 'text',
            content: chunk.content,
            timestamp: Date.now(),
          })}\n\n`
        );
      } else if (chunk.type === 'metadata') {
        finalReferences = chunk.reference;
        res.write(
          `data: ${JSON.stringify({
            type: 'metadata',
            reference: chunk.reference,
            citations: chunk.citations,
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      }
    }

    // Save the complete response and citations to conversation database
    const messageMetadata = {
      reference: finalReferences || [],
      citationMetadata: null,
      searchQuery: message,
      searchTimestamp: new Date().toISOString(),
      streamingMode: true,
      mode: 'agent_swarm'
    };

    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      fullText,
      messageMetadata,
      isGuest,
      req
    );

    // Send completion event
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        timestamp: Date.now(),
      })}\n\n`
    );

    res.end();
  } catch (error) {
    logger.error('📡 Swarm Controller: Streaming Search Error:', error);

    const errorConversationId =
      conversationId || searchService.generateSearchConversationId();

    try {
      if (errorConversationId && userId) {
        await searchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your streaming search request.',
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: error.message || 'An internal error occurred',
        conversationId: errorConversationId,
        timestamp: Date.now(),
      })}\n\n`
    );

    res.end();
  }
});

export const SwarmController = {
  performSwarmStreamingSearch,
};
