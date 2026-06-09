import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { searchService } from '../search/search.service.js';
import { SwarmService } from './swarm.service.js';
import { userMemoryService } from '../conversations/userMemory.service.js';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';

/**
 * @swagger
 * /api/v1/swarm/stream-search:
 *   post:
 *     summary: Perform a streaming search using the Swarm agent.
 *     description: Initiates a conversational search process using the Swarm agent, streaming responses back to the client via Server-Sent Events (SSE).
 *                  This endpoint handles both authenticated and guest users, managing conversation state and user-specific data.
 *                  It supports dynamic agent routing and provides real-time updates on the search progress.
 *     tags:
 *       - Swarm
 *       - Search
 *       - Streaming
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: The user's search query or message.
 *                 example: "What is the capital of France?"
 *               conversationId:
 *                 type: string
 *                 description: Optional. The ID of an existing conversation to continue. If not provided, a new conversation will be started.
 *                 example: "conv_12345"
 *               userId:
 *                 type: string
 *                 description: Optional. For guest users, a guest-prefixed user ID (e.g., 'guest_abc123'). Authenticated user IDs are derived from the token.
 *                 example: "guest_xyz789"
 *               requireSearch:
 *                 type: boolean
 *                 description: Optional. If set to false, the Swarm agent might skip direct search and rely more on its internal knowledge or conversation history. Defaults to true.
 *                 example: false
 *     responses:
 *       200:
 *         description: Server-Sent Events stream of the Swarm agent's response.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   description: Type of event (e.g., 'connected', 'text', 'metadata', 'done', 'error').
 *                 content:
 *                   type: string
 *                   description: Text content of the response chunk (for 'text' events).
 *                 conversationId:
 *                   type: string
 *                   description: The ID of the current conversation.
 *                 timestamp:
 *                   type: number
 *                   description: Unix timestamp of the event.
 *                 error:
 *                   type: string
 *                   description: Error message (for 'error' events).
 *                 reference:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title: { type: string }
 *                       url: { type: string }
 *                   description: Array of references (for 'metadata' events).
 *                 citations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       index: { type: number }
 *                       start: { type: number }
 *                       end: { type: number }
 *                       text: { type: string }
 *                   description: Array of citations (for 'metadata' events).
 *       400:
 *         description: Bad Request - A search query is required.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error - Failed to generate user identifier or an unhandled error occurred during streaming.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const performSwarmStreamingSearch = catchAsync(async (req, res) => {
  const isGuest = req.isGuest === undefined ? (!req.user) : req.isGuest;
  
  let userId;
  if (!isGuest) {
    // SECURE: Strictly load authenticated user ID from verified token, ignoring request body inputs
    userId = req.user?.userId || req.user?._id;
  } else {
    // SECURE: Only accept body userId if it strictly conforms to a guest-prefixed format
    const providedUserId = req.body.userId;
    const isGuestPattern = providedUserId && typeof providedUserId === 'string' && providedUserId.startsWith('guest_');
    
    if (providedUserId && isGuestPattern) {
      userId = providedUserId;
    } else {
      userId = searchService.generateGuestUserId();
    }
  }

  const { message, conversationId } = req.body;

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

    const requireSearch = req.body.requireSearch !== undefined ? req.body.requireSearch : true;
    let fullText = '';
    let finalReferences = []; // To store references for the final message metadata and SSE
    let finalCitations = [];  // To store citations for the final message metadata and SSE

    // Stream the dynamic Swarm response
    for await (const chunk of SwarmService.executeSwarmStream(
      message,
      conversationHistory,
      userId,
      { requireSearch }
    )) {
      if (chunk.type === 'agent_start') {
        // Silent - don't send agent routing details to the user
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
        // BUG FIX: Capture references and citations from the chunk if provided by SwarmService.
        // Previously, these were discarded, leading to loss of valuable metadata for the client and database.
        finalReferences = chunk.reference || [];
        finalCitations = chunk.citations || [];

        res.write(
          `data: ${JSON.stringify({
            type: 'metadata',
            reference: finalReferences, // Use actual references from chunk
            citations: finalCitations,   // Use actual citations from chunk
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      }
    }

    // Save the complete response and citations to conversation database
    const messageMetadata = {
      reference: finalReferences, // Use the captured finalReferences
      // Assuming citationMetadata structure is an object with a 'citations' array
      citationMetadata: finalCitations.length > 0 ? { citations: finalCitations } : null,
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

    // 5. ASYNCHRONOUS CROSS-THREAD MEMORY FACT EXTRACTION (Hermes-style)
    if (userId && !isGuest && fullText) {
      userMemoryService.asyncExtractFacts(userId, message, fullText);
    }

    // Send completion event
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        conversationId: actualConversationId,
        // messageCount assumes 2 messages (user query + agent response) were added.
        // This might be brittle; consider retrieving actual count from conversation object if available.
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

/**
 * @swagger
 * /api/v1/swarm/prewarm-sandbox:
 *   post:
 *     summary: Asynchronously pre-warm a user's Docker sandbox environment.
 *     description: Triggers the pre-warming of a user's dedicated Docker workspace in the background.
 *                  This helps reduce latency for subsequent operations that require a sandbox environment.
 *                  The response is immediate, indicating that the pre-warming process has been initiated.
 *     tags:
 *       - Swarm
 *       - Docker
 *       - Sandbox
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: Optional. For guest users, a guest-prefixed user ID (e.g., 'guest_abc123'). Authenticated user IDs are derived from the token.
 *                 example: "guest_xyz789"
 *     responses:
 *       200:
 *         description: Sandbox container pre-warming initiated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Sandbox container pre-warming initiated successfully"
 *       500:
 *         description: Internal Server Error - An unexpected error occurred during the initiation of pre-warming.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const prewarmUserSandbox = catchAsync(async (req, res) => {
  const isGuest = req.isGuest === undefined ? (!req.user) : req.isGuest;
  
  let userId;
  if (!isGuest) {
    userId = req.user?.userId || req.user?._id;
  } else {
    // SECURE: Only accept body userId if it strictly conforms to a guest-prefixed format
    const providedUserId = req.body.userId;
    const isGuestPattern = providedUserId && typeof providedUserId === 'string' && providedUserId.startsWith('guest_');
    if (providedUserId && isGuestPattern) {
      userId = providedUserId;
    }
    // If a guest userId is not provided or does not conform to the pattern,
    // userId remains undefined, and prewarming will not be attempted due to the 'if (userId)' check.
  }

  if (userId) {
    logger.info(`[DOCKER PREWARM] Asynchronously pre-warming sandbox container for user: ${userId}`);
    // Trigger in the background asynchronously so it does not block Express response
    dockerWorkspaceService.prewarmWorkspace(userId).catch((err) => {
      logger.error(`[DOCKER PREWARM ERROR] Failed to prewarm container for user ${userId}: ${err.message}`);
    });
  }

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Sandbox container pre-warming initiated successfully',
  });
});

/**
 * @typedef {object} SwarmController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} performSwarmStreamingSearch - Handles streaming search requests using the Swarm agent.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} prewarmUserSandbox - Initiates the pre-warming of a user's Docker sandbox environment.
 */
/**
 * SwarmController provides a collection of controller functions for managing Swarm agent interactions,
 * including streaming search capabilities and Docker sandbox pre-warming.
 * These functions are designed to integrate with an Express.js application.
 */
export const SwarmController = {
  performSwarmStreamingSearch,
  prewarmUserSandbox,
};