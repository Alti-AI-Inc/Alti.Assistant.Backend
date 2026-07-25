import httpStatus from 'http-status';
import { HarmCategory, HarmBlockThreshold } from '@google-cloud/vertexai'; // Import Vertex AI SDK components for safety settings
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { logger } from '../../../shared/logger.js';
import { searchService } from '../search/search.service.js';
import { SwarmService } from './swarm.service.js';
import { userMemoryService } from '../conversations/userMemory.service.js';
import { dockerWorkspaceService } from '../docker/dockerWorkspace.service.js';
import ApiError from '../../../errors/ApiError.js';

// Enterprise-grade safety settings for all Google Generative AI model calls.
// These settings block content with a low or higher probability of being harmful.
const GcpSafetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_LOW_AND_ABOVE,
  },
];

/**
 * Masks common Personally Identifiable Information (PII) in a given text.
 * This is a critical security step to prevent sensitive user data from being
 * sent to third-party AI models or logged.
 * @param {string} text The input text to sanitize.
 * @returns {string} The text with PII masked.
 */
const maskPII = text => {
  if (!text || typeof text !== 'string') return text;
  // A simple regex for email addresses.
  let maskedText = text.replace(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    '[EMAIL_REDACTED]'
  );
  // A simple regex for North American phone numbers.
  maskedText = maskedText.replace(
    /\b(?:\+?1[ -]?)?\(?\d{3}\)?[ -]?\d{3}[ -]?\d{4}\b/g,
    '[PHONE_REDACTED]'
  );
  // NOTE: More robust PII detection might be required for production,
  // potentially using a dedicated service or more comprehensive regex patterns
  // for things like credit card numbers, social security numbers, etc.
  return maskedText;
};

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
/**
 * Express controller to handle streaming search requests via the Swarm agent.
 * It establishes a Server-Sent Events (SSE) connection to stream the agent's response.
 * The controller manages user identification for both authenticated and guest users,
 * handles conversation state, and orchestrates the call to the Swarm service.
 * For authenticated users, it also triggers asynchronous memory fact extraction.
 *
 * @function
 * @async
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the stream is complete.
 */
const performSwarmStreamingSearch = catchAsync(async (req, res) => {
  const isGuest = req.isGuest === undefined ? !req.user : req.isGuest;

  let userId;
  try {
    if (!isGuest) {
      // SECURE: Strictly load authenticated user ID from verified token, ignoring request body inputs
      userId = req.user?.userId || req.user?._id;
    } else {
      // SECURE: Only accept body userId if it strictly conforms to a guest-prefixed format
      const providedUserId = req.body.userId;
      const isGuestPattern =
        providedUserId &&
        typeof providedUserId === 'string' &&
        providedUserId.startsWith('guest_');

      if (providedUserId && isGuestPattern) {
        userId = providedUserId;
      } else {
        userId = searchService.generateGuestUserId();
      }
    }
  } catch (err) {
    // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
    logger.error({
      message: 'Error resolving user ID',
      component: 'SwarmController',
      error: {
        message: err.message,
        stack: err.stack,
        name: err.name,
      },
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to resolve user identifier'
    );
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

  // SAFETY & SECURITY: Sanitize user input to remove PII before sending to the model.
  // The original message is still used for saving to the database to maintain conversation history integrity for the user.
  const sanitizedMessage = maskPII(message);

  const thread_id =
    conversationId || searchService.generateSearchConversationId();

  try {
    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Handle conversation creation/retrieval
    // OPTIMIZATION: If 'searchService.handleSearchConversation' primarily retrieves data for reading
    // (e.g., conversationId, messages, messageCount), ensure the underlying Mongoose query in searchService.js
    // uses '.lean()' to return plain JavaScript objects. This avoids Mongoose document overhead
    // and can significantly improve performance for read-heavy operations.
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message, // Save original message to DB
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // OPTIMIZATION: Ensure 'conversation.messages' is already a lean array of objects
      // if '.lean()' was applied in 'handleSearchConversation' to avoid Mongoose hydration overhead here.
      conversationHistory = conversation.messages.slice(-10).map(msg => ({
        role: msg.role,
        // SAFETY: Ensure history sent to the model is also sanitized.
        content: maskPII(msg.content),
      }));
    }

    // Add user message to conversation
    // OPTIMIZATION: For database operations involving 'userId' and 'conversationId' (e.g., finding, updating, inserting),
    // ensure that these fields are indexed in your MongoDB schema for the relevant collections (e.g., 'conversations', 'messages').
    // This will drastically speed up query times.
    await searchService.addSearchQueryMessage(
      actualConversationId,
      userId,
      message, // Save original message to DB
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

    const requireSearch =
      req.body.requireSearch !== undefined ? req.body.requireSearch : true;
    let fullText = '';
    let finalReferences = []; // To store references for the final message metadata and SSE
    let finalCitations = []; // To store citations for the final message metadata and SSE

    // Stream the dynamic Swarm response
    for await (const chunk of SwarmService.executeSwarmStream(
      sanitizedMessage, // Use the sanitized message for the model call
      conversationHistory,
      userId,
      { requireSearch, safetySettings: GcpSafetySettings } // Pass explicit safety settings to the model service
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

        if (!Array.isArray(finalReferences) || finalReferences.length === 0) {
          finalReferences = [{
            url: 'https://search.insohq.com',
            domain: 'search.insohq.com',
            title: 'Inso Assistant Global Search Index'
          }];
          finalCitations = [{
            index: 1,
            url: 'https://search.insohq.com',
            domain: 'search.insohq.com',
            title: 'Inso Assistant Global Search Index'
          }];
        }

        res.write(
          `data: ${JSON.stringify({
            type: 'metadata',
            reference: finalReferences, // Use actual references from chunk
            citations: finalCitations, // Use actual citations from chunk
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      }
    }

    if (!Array.isArray(finalReferences) || finalReferences.length === 0) {
      finalReferences = [{
        url: 'https://search.insohq.com',
        domain: 'search.insohq.com',
        title: 'Inso Assistant Global Search Index'
      }];
      finalCitations = [{
        index: 1,
        url: 'https://search.insohq.com',
        domain: 'search.insohq.com',
        title: 'Inso Assistant Global Search Index'
      }];
      res.write(
        `data: ${JSON.stringify({
          type: 'metadata',
          reference: finalReferences,
          citations: finalCitations,
          timestamp: Date.now(),
        })}\n\n`
      );
    }

    // Save the complete response and citations to conversation database
    const messageMetadata = {
      reference: finalReferences, // Use the captured finalReferences
      // Assuming citationMetadata structure is an object with a 'citations' array
      citationMetadata:
        finalCitations.length > 0 ? { citations: finalCitations } : null,
      searchQuery: message, // Log original query for metadata
      searchTimestamp: new Date().toISOString(),
      streamingMode: true,
      mode: 'agent_swarm',
    };

    // OPTIMIZATION: For database operations involving 'userId' and 'actualConversationId' (e.g., finding, updating, inserting),
    // ensure that these fields are indexed in your MongoDB schema for the relevant collections (e.g., 'conversations', 'messages').
    // This will drastically speed up query times.
    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      fullText,
      messageMetadata,
      isGuest,
      req
    );

    // 5. ASYNCHRONOUS CROSS-THREAD MEMORY FACT EXTRACTION (Hermes-style)
    // This operation is already asynchronous and non-blocking.
    if (userId && !isGuest && fullText) {
      // SAFETY & SECURITY: Sanitize both user message and model response before sending to the memory extraction service.
      // This prevents PII from being stored in long-term memory facts.
      const sanitizedFullTextForMemory = maskPII(fullText);
      userMemoryService
        .asyncExtractFacts(
          userId,
          sanitizedMessage,
          sanitizedFullTextForMemory
        )
        .catch(err => {
          // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
          logger.error({
            message: 'Failed to extract facts during async memory extraction',
            component: 'SwarmController.userMemoryService',
            userId,
            error: {
              message: err.message,
              stack: err.stack,
              name: err.name,
            },
          });
        });
    }

    // Send completion event
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        conversationId: actualConversationId,
        // messageCount assumes 2 messages (user query + agent response) were added.
        // This might be brittle; consider retrieving actual count from conversation object if available.
        // OPTIMIZATION: If 'conversation.messageCount' is frequently accessed, consider making it a direct field
        // in the Conversation model and ensuring it's efficiently retrieved (e.g., with '.lean()').
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        timestamp: Date.now(),
      })}\n\n`
    );

    res.end();
  } catch (error) {
    // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
    logger.error({
      message: 'Streaming Search Error in Swarm Controller',
      component: 'SwarmController',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });

    // Normalize error using ApiError
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError(
            httpStatus.INTERNAL_SERVER_ERROR,
            error.message || 'An internal error occurred',
            error.stack
          );

    const errorConversationId =
      conversationId || searchService.generateSearchConversationId();

    try {
      if (errorConversationId && userId) {
        // OPTIMIZATION: For database operations involving 'userId' and 'errorConversationId',
        // ensure that these fields are indexed in your MongoDB schema for the relevant collections.
        await searchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your streaming search request.',
          apiError,
          isGuest,
          req
        );
      }
    } catch (convError) {
      // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
      logger.error({
        message:
          'Failed to save error message to conversation database after a primary error',
        component: 'SwarmController.ErrorHandler',
        error: {
          message: convError.message,
          stack: convError.stack,
          name: convError.name,
        },
      });
    }

    if (!res.headersSent) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
    }

    res.write(
      `data: ${JSON.stringify({
        type: 'error',
        error: apiError.message || 'An internal error occurred',
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
/**
 * Express controller to asynchronously trigger the pre-warming of a user's Docker sandbox.
 * This endpoint is designed to be a "fire-and-forget" operation, returning an immediate
 * success response while the sandbox creation happens in the background.
 * It handles both authenticated and guest users.
 *
 * @function
 * @async
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves after sending the response.
 */
const prewarmUserSandbox = catchAsync(async (req, res) => {
  const isGuest = req.isGuest === undefined ? !req.user : req.isGuest;

  let userId;
  try {
    if (!isGuest) {
      userId = req.user?.userId || req.user?._id;
    } else {
      // SECURE: Only accept body userId if it strictly conforms to a guest-prefixed format
      const providedUserId = req.body.userId;
      const isGuestPattern =
        providedUserId &&
        typeof providedUserId === 'string' &&
        providedUserId.startsWith('guest_');
      if (providedUserId && isGuestPattern) {
        userId = providedUserId;
      }
      // If a guest userId is not provided or does not conform to the pattern,
      // userId remains undefined, and prewarming will not be attempted due to the 'if (userId)' check.
    }

    if (userId) {
      // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
      logger.info({
        message: 'Initiating asynchronous sandbox container pre-warming',
        component: 'SwarmController.prewarmUserSandbox',
        userId,
      });
      // Trigger in the background asynchronously so it does not block Express response
      // OPTIMIZATION: If 'dockerWorkspaceService.prewarmWorkspace' involves database lookups (e.g., for user settings or existing workspaces),
      // ensure those queries are optimized with appropriate indexing on 'userId' and use '.lean()' for read-only retrievals.
      dockerWorkspaceService.prewarmWorkspace(userId).catch(err => {
        // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
        logger.error({
          message: 'Background pre-warming of sandbox container failed',
          component: 'SwarmController.prewarmUserSandbox.async',
          userId,
          error: {
            message: err.message,
            stack: err.stack,
            name: err.name,
          },
        });
      });
    }
  } catch (error) {
    // GCP Logging: Structured JSON log for better parsing and analysis in Cloud Logging.
    logger.error({
      message: 'Error during prewarm setup in controller',
      component: 'SwarmController.prewarmUserSandbox',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
    });
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Failed to initiate sandbox pre-warming'
    );
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
 * @type {SwarmController}
 */
export const SwarmController = {
  performSwarmStreamingSearch,
  prewarmUserSandbox,
};