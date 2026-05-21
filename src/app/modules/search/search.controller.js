import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { searchService } from './search.service.js';
import { researchAgentApp } from './search_assistant/workflow.js';
import SubscriptionModel from '../subscription/subscription.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import {
  executeGroundedSearch,
  executeGroundedSearchStream,
} from './services/geminiGroundingService.js';
import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js';
import { detectFinancialIntent } from '../../helpers/massiveTickerDB.js';

export const performSearch = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  console.log('Performing search with request body:', req.user);

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? searchService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const { message, conversationId, deepSearch, timezone, localDate, localTime } = req.body;
  userId = req.body.userId || userId; // Allow overriding userId from request body

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
    // Handle conversation creation/retrieval
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
    let conversationHistory = [];
    if (conversationId && conversation.messages) {
      // Get last 10 messages for context (excluding the current message)
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
    const inputs = {
      query: message,
      conversationContext: conversationHistory,
      conversationId: actualConversationId,
      depth: deepSearch ? deepSearch : 'standard', // Use deepSearch flag to determine search depth
      history: [...conversationHistory, { role: 'user', content: message }],
      timezone: timezone || null,
      localDate: localDate || null,
      localTime: localTime || null,
    };

    const result = await researchAgentApp.invoke(inputs, {
      configurable: { thread_id: actualConversationId },
    });

    logger.info(
      `Research Assistant Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );
    // console.log('Research Assistant Result:', result);

    const answer = result.answer;
    const reference = result.reference || [];
    const citationMetadata = result.citationMetadata || null;

    console.log('References are:', reference);
    console.log('Citation metadata:', citationMetadata);

    const fullResponse = answer;

    // Add assistant response to conversation with enhanced metadata
    const tickerInfo = detectFinancialIntent(message);
    const messageMetadata = {
      reference,
      citationMetadata,
      searchQuery: citationMetadata?.searchQuery || message,
      searchTimestamp:
        citationMetadata?.searchTimestamp || new Date().toISOString(),
      financialTicker: tickerInfo?.symbol || null,
      financialIntent: tickerInfo?.type || null,
      searchMethod: tickerInfo ? 'massive_realtime' : 'intelligent_search',
    };

    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      messageMetadata,
      isGuest,
      req
    );
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
            domain: ref.domain,
          })),
          citationMetadata,
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined, // Include userId for guest users for frontend tracking
      },
    });
  } catch (error) {
    logger.error('Research Assistant Error:', error);

    // Try to save error message to conversation if possible
    const errorConversationId =
      conversationId || searchService.generateSearchConversationId();
    try {
      if (errorConversationId && userId) {
        await searchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your search request.',
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    // Check if headers have already been sent
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({
          error: 'An internal error occurred while processing your search.',
          conversationId: errorConversationId,
          success: false,
          userType: isGuest ? 'guest' : 'authenticated',
        })}\n\n`
      );
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

  const stats = await searchService.getSearchStats(userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Search statistics retrieved successfully',
    data: stats,
  });
});

/**
 * Dedicated code generation endpoint - Always uses Claude Sonnet 4.5
 */
const generateCode = catchAsync(async (req, res) => {
  console.log('Code generation request:', req.user);

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
      message: 'A code generation request is required',
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
    // Handle conversation creation/retrieval
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
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

    // Import code generation function
    const { runCodeGeneration } = await import('./llm.js');

    const inputs = {
      query: message,
      conversationContext: conversationHistory,
      conversationId: actualConversationId,
      currentQuery: message,
    };

    const result = await runCodeGeneration(inputs, false);
    logger.info(
      `Code Generation Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const answer = result.answer;
    const reference = result.reference || [];
    const citationMetadata = result.citationMetadata || {
      model: 'gemini-3.5-flash',
      type: 'code_generation',
      timestamp: new Date().toISOString(),
    };

    // Add assistant response to conversation
    const messageMetadata = {
      reference,
      citationMetadata,
      searchQuery: message,
      searchTimestamp: citationMetadata.timestamp || new Date().toISOString(),
      model: citationMetadata.model || 'gemini-3.5-flash',
      type: 'code_generation',
    };

    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      answer,
      messageMetadata,
      isGuest,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Code generated successfully',
      data: {
        responseMessage: {
          answer: answer,
          reference,
          citations: reference.map((ref, index) => ({
            index: index + 1,
            url: ref.url,
            domain: ref.domain,
          })),
          citationMetadata,
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
        model: citationMetadata.model || 'gemini-3.5-flash',
      },
    });
  } catch (error) {
    logger.error('Code Generation Error:', error);

    const errorConversationId =
      conversationId || searchService.generateSearchConversationId();
    try {
      if (errorConversationId && userId) {
        await searchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while generating code.',
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while generating code',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

/**
 * Dedicated writing endpoint - Uses intelligent routing for writing tasks
 */
const generateWriting = catchAsync(async (req, res) => {
  console.log('Writing generation request:', req.user);

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
      message: 'A writing request is required',
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
    // Handle conversation creation/retrieval
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
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

    // Import intelligent search function
    const { runIntelligentSearch } = await import('./llm.js');

    const inputs = {
      query: message,
      conversationContext: conversationHistory,
      conversationId: actualConversationId,
      currentQuery: message,
    };

    const result = await runIntelligentSearch(inputs);
    logger.info(
      `Writing Generation Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const answer = result.answer;
    const reference = result.reference || [];
    const citationMetadata = result.citationMetadata || {
      model: 'claude-sonnet-4.5',
      type: 'writing',
      timestamp: new Date().toISOString(),
    };

    // Add assistant response to conversation
    const messageMetadata = {
      reference,
      citationMetadata,
      searchQuery: message,
      searchTimestamp: citationMetadata.timestamp || new Date().toISOString(),
      model: citationMetadata.model || 'claude-sonnet-4.5',
      type: 'writing',
    };

    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      answer,
      messageMetadata,
      isGuest,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Writing generated successfully',
      data: {
        responseMessage: {
          answer: answer,
          reference,
          citations: reference.map((ref, index) => ({
            index: index + 1,
            url: ref.url,
            domain: ref.domain,
          })),
          citationMetadata,
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
        model: citationMetadata.model || 'claude-sonnet-4.5',
      },
    });
  } catch (error) {
    logger.error('Writing Generation Error:', error);

    const errorConversationId =
      conversationId || searchService.generateSearchConversationId();
    try {
      if (errorConversationId && userId) {
        await searchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while generating writing.',
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'An internal error occurred while generating writing',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
      },
    });
  }
});

/**
 * Test endpoint - Native grounding only (no smart routing)
 * This endpoint uses only Google's native grounding search for testing purposes
 */
const performNativeGroundingSearch = catchAsync(async (req, res) => {
  console.log('Performing native grounding search:', req.user);

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
    // Handle conversation creation/retrieval
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req
    );
    const actualConversationId = conversation.conversationId || thread_id;

    // Get conversation history for context-aware processing
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

    console.log(`🔍 Using NATIVE GROUNDING ONLY (Test Mode)`);

    // Use native grounding search directly
    const result = await executeGroundedSearch(message, conversationHistory);

    logger.info(
      `Native Grounding Search Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    let answer = result.answer;
    // console.log(answer)
    const isJson = isValidJSON(answer);
    console.log('Is valid json', isJson, answer);
    if (isJson) {
      const parsedAnswer = JSON.parse(answer);
      answer = parsedAnswer.responseMessage.answer;
    }
    const reference = result.reference || [];
    const citations = result.citations || [];
    const citationMetadata = result.citationMetadata || null;

    console.log('Native Grounding - References:', reference);
    console.log('Native Grounding - Citation metadata:', citationMetadata);

    // Add assistant response to conversation with enhanced metadata
    const tickerInfo2 = detectFinancialIntent(message);
    const messageMetadata = {
      reference,
      citationMetadata,
      searchQuery: message,
      searchTimestamp:
        citationMetadata?.searchTimestamp || new Date().toISOString(),
      financialTicker: tickerInfo2?.symbol || null,
      financialIntent: tickerInfo2?.type || null,
      searchMethod: tickerInfo2 ? 'massive_realtime' : 'native_grounding_only',
    };

    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      answer,
      messageMetadata,
      isGuest,
      req
    );

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Native grounding search completed successfully',
      data: {
        responseMessage: {
          answer: answer,
          reference,
          citations,
          citationMetadata: {
            ...citationMetadata,
            searchMethod: 'native_grounding_only',
            testMode: true,
          },
        },
        conversationId: actualConversationId,
        messageCount: conversation.messageCount + 2,
        userType: isGuest ? 'guest' : 'authenticated',
        userId: isGuest ? userId : undefined,
        model: citationMetadata?.model || 'gemini-3.5-flash',
        searchMethod: 'native_grounding_only',
      },
    });
  } catch (error) {
    logger.error('Native Grounding Search Error:', error);

    const errorConversationId =
      conversationId || searchService.generateSearchConversationId();
    try {
      if (errorConversationId && userId) {
        await searchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your search request with native grounding.',
          error,
          isGuest,
          req
        );
      }
    } catch (convError) {
      logger.error('Failed to save error to conversation:', convError);
    }

    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message:
        'An internal error occurred while processing your native grounding search',
      data: {
        conversationId: errorConversationId,
        userType: isGuest ? 'guest' : 'authenticated',
        error: error.message,
      },
    });
  }
});

function isValidJSON(str) {
  // First, check if the input is actually a string
  try {
    // Attempt to parse the string
    const json = JSON.parse(str);
    console.log('Json Parsed');
    // Handle non-exception-throwing cases:
    // JSON.parse(null) returns null, which is not an object or array (common usage)
    // If you want to accept all valid JSON primitives (like "1", "true", "null"),
    // you can simply return true after the try block
    if (json && typeof json === 'object') {
      return true;
    } else {
      return false;
    }
  } catch (e) {
    // An error was thrown, so the string is not valid JSON
    return false;
  }
}

/**
 * Streaming grounded search endpoint - streams thinking and response in real-time
 */
const performStreamingSearch = catchAsync(async (req, res) => {
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
    let metadata = null;

    // Stream the response
    for await (const chunk of executeGroundedSearchStream(
      message,
      conversationHistory
    )) {
      if (chunk.type === 'thinking') {
        // Stream thinking chunks
        res.write(
          `data: ${JSON.stringify({
            type: 'thinking',
            content: chunk.content,
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      } else if (chunk.type === 'text') {
        // Stream text chunks
        fullText += chunk.content;
        res.write(
          `data: ${JSON.stringify({
            type: 'text',
            content: chunk.content,
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      } else if (chunk.type === 'metadata') {
        // Final metadata with references
        metadata = chunk;
        res.write(
          `data: ${JSON.stringify({
            type: 'metadata',
            reference: chunk.reference,
            citations: chunk.citations,
            citationMetadata: chunk.citationMetadata,
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      }
    }

    // Save the complete response to conversation
    const messageMetadata = {
      reference: metadata?.reference || [],
      citationMetadata: metadata?.citationMetadata || null,
      searchQuery: message,
      searchTimestamp: new Date().toISOString(),
      streamingMode: true,
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
    logger.error('Streaming Search Error:', error);

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

export const searchController = {
  performSearch,
  getSearchStats,
  generateCode,
  generateWriting,
  performNativeGroundingSearch,
  performStreamingSearch,
};
