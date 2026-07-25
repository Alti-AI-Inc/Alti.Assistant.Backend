import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { searchService } from './search.service.js';
// import SubscriptionModel from '../subscription/subscription.model.js'; // Not used in this file.
// import { conversationHelpers } from '../conversations/conversation.helpers.js'; // Not used in this file.
import {
  executeGroundedSearch,
  executeGroundedSearchStream,
} from './services/geminiGroundingService.js';
// import { massiveSmartRouter } from '../../helpers/massiveSmartRouter.js'; // Not used in this file.
import { detectFinancialIntent } from '../../helpers/massiveTickerDB.js';
import { proxyToAgent } from '../gateway/agentProxy.js';

export const performSearch = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  console.log('Performing search with request body:', req.user);

  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? searchService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const {
    message,
    conversationId,
    deepSearch,
    timezone,
    localDate,
    localTime,
    category,
  } = req.body;
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
    // Optimization Recommendation: Ensure that the underlying database query in `searchService.handleSearchConversation`
    // uses `.lean()` if only plain JavaScript objects are needed, to avoid Mongoose document hydration overhead.
    // If `conversation.messages` can be very large, consider optimizing `handleSearchConversation`
    // to fetch only the last N messages or use projection to limit the array size directly in the database query,
    // instead of fetching the entire array and then slicing it in memory.
    // Database Indexing Recommendation: Ensure 'userId' and 'conversationId' fields are indexed in the Conversation/Search model
    // used by searchService for efficient lookups.
    const conversation = await searchService.handleSearchConversation(
      userId,
      conversationId,
      message,
      isGuest,
      req,
      category
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
    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );
    const shouldPreferLiveMarketData =
      /(?:stock|stocks|crypto|forex|currency|commodit|oil|gold|silver|market|price|quote|latest|today|live|intraday|bet|odds|spread|futures|nasdaq|sp500|dow|s&p)/i.test(
        message
      );
    const liveDataHint = shouldPreferLiveMarketData
      ? '\n\n[Live Market Data Preference: Provide full market context, exact numeric values, and up-to-date quotes or odds. Avoid terse conclusions and include concrete details from the live provider.]'
      : '';
    const queryForSearch = shouldPreferLiveMarketData
      ? `${message}${liveDataHint}`
      : message;

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

    let resultData;
    if (!process.env.SEARCH_AGENT_URL) {
      logger.warn(
        'SEARCH_AGENT_URL is not configured. Falling back to native grounded search for /assistant_v2.'
      );
      resultData = await executeGroundedSearch(
        queryForSearch,
        conversationHistory
      );
    } else {
      const proxyUser = req.user || { userId: userId, email: '', plan: 'free' };
      try {
        const proxyResult = await proxyToAgent(
          'search',
          '/execute',
          {
            prompt: queryForSearch,
            conversationHistory: conversationHistory,
            options: { depth: deepSearch ? deepSearch : 'standard' },
          },
          proxyUser
        );

        logger.info(
          `Search Agent Proxy Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
        );

        resultData = proxyResult.data || {};
      } catch (proxyError) {
        logger.warn(
          'Search Agent proxy failed. Falling back to native grounded search for /assistant_v2.',
          proxyError
        );
        resultData = await executeGroundedSearch(
          queryForSearch,
          conversationHistory
        );
      }
    }

    const answer = resultData.content || resultData.answer || '';
    let reference = resultData.references || resultData.reference || [];
    if (!Array.isArray(reference)) {
      reference = [];
    }
    if (reference.length === 0) {
      reference = [{
        url: 'https://search.insohq.com',
        domain: 'search.insohq.com',
        title: 'Inso Assistant Global Search Index'
      }];
    }
    const citationMetadata =
      resultData.metadata || resultData.citationMetadata || null;

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

    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      fullResponse,
      messageMetadata,
      isGuest,
      req
    );
    console.log('Full response:', fullResponse);

    if (!isGuest) {
      try {
        const subscriptionService = (
          await import('../subscription/subscription.service.js')
        ).default;
        const tenantId = req.user?.tenantId || req.tenantId || null;
        const resourceType =
          deepSearch === true || deepSearch === 'true' ? 'research' : 'search';
        subscriptionService
          .trackAndIncrementMonthlyUsage(userId, tenantId, resourceType)
          .catch((err) => {
            logger.error(
              `Failed to increment monthly usage for ${resourceType}:`,
              err
            );
          });
      } catch (err) {
        logger.error('Failed to increment monthly usage:', err);
      }
    }

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
        // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
        // used by searchService for efficient inserts/updates.
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

  // Optimization Recommendation: Ensure that the underlying database query in `searchService.getSearchStats`
  // uses `.lean()` if only plain JavaScript objects are needed, to avoid Mongoose document hydration overhead.
  // Database Indexing Recommendation: Ensure 'userId' field is indexed in the relevant model(s)
  // used by searchService for efficient aggregation/retrieval of statistics.
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
    // Optimization Recommendation: Ensure that the underlying database query in `searchService.handleSearchConversation`
    // uses `.lean()` if only plain JavaScript objects are needed, to avoid Mongoose document hydration overhead.
    // If `conversation.messages` can be very large, consider optimizing `handleSearchConversation`
    // to fetch only the last N messages or use projection to limit the array size directly in the database query,
    // instead of fetching the entire array and then slicing it in memory.
    // Database Indexing Recommendation: Ensure 'userId' and 'conversationId' fields are indexed in the Conversation/Search model
    // used by searchService for efficient lookups.
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
    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    const proxyUser = req.user || { userId: userId, email: '', plan: 'free' };
    const proxyResult = await proxyToAgent(
      'code',
      '/execute',
      {
        prompt: message,
        conversationHistory: conversationHistory,
        options: {},
      },
      proxyUser
    );

    logger.info(
      `Code Agent Proxy Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const resultData = proxyResult.data || {};
    const answer = resultData.content || '';
    const reference = resultData.references || [];
    const citationMetadata = resultData.metadata || {
      model: 'claude-sonnet-4.5',
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

    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      answer,
      messageMetadata,
      isGuest,
      req
    );

    if (!isGuest) {
      try {
        const subscriptionService = (
          await import('../subscription/subscription.service.js')
        ).default;
        const tenantId = req.user?.tenantId || req.tenantId || null;
        subscriptionService
          .trackAndIncrementMonthlyUsage(userId, tenantId, 'code')
          .catch((err) => {
            logger.error('Failed to increment monthly usage for code:', err);
          });
      } catch (err) {
        logger.error('Failed to increment monthly usage:', err);
      }
    }

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
        // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
        // used by searchService for efficient inserts/updates.
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
    // Optimization Recommendation: Ensure that the underlying database query in `searchService.handleSearchConversation`
    // uses `.lean()` if only plain JavaScript objects are needed, to avoid Mongoose document hydration overhead.
    // If `conversation.messages` can be very large, consider optimizing `handleSearchConversation`
    // to fetch only the last N messages or use projection to limit the array size directly in the database query,
    // instead of fetching the entire array and then slicing it in memory.
    // Database Indexing Recommendation: Ensure 'userId' and 'conversationId' fields are indexed in the Conversation/Search model
    // used by searchService for efficient lookups.
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
    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    const proxyUser = req.user || { userId: userId, email: '', plan: 'free' };
    const proxyResult = await proxyToAgent(
      'write',
      '/execute',
      {
        prompt: message,
        conversationHistory: conversationHistory,
        options: {},
      },
      proxyUser
    );

    logger.info(
      `Write Agent Proxy Result for conversation: ${actualConversationId} (${isGuest ? 'guest' : 'authenticated'} user)`
    );

    const resultData = proxyResult.data || {};
    const answer = resultData.content || '';
    const reference = resultData.references || [];
    const citationMetadata = resultData.metadata || {
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

    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      answer,
      messageMetadata,
      isGuest,
      req
    );

    if (!isGuest) {
      try {
        const subscriptionService = (
          await import('../subscription/subscription.service.js')
        ).default;
        const tenantId = req.user?.tenantId || req.tenantId || null;
        subscriptionService
          .trackAndIncrementMonthlyUsage(userId, tenantId, 'write')
          .catch((err) => {
            logger.error('Failed to increment monthly usage for write:', err);
          });
      } catch (err) {
        logger.error('Failed to increment monthly usage:', err);
      }
    }

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
        // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
        // used by searchService for efficient inserts/updates.
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
    // Optimization Recommendation: Ensure that the underlying database query in `searchService.handleSearchConversation`
    // uses `.lean()` if only plain JavaScript objects are needed, to avoid Mongoose document hydration overhead.
    // If `conversation.messages` can be very large, consider optimizing `handleSearchConversation`
    // to fetch only the last N messages or use projection to limit the array size directly in the database query,
    // instead of fetching the entire array and then slicing it in memory.
    // Database Indexing Recommendation: Ensure 'userId' and 'conversationId' fields are indexed in the Conversation/Search model
    // used by searchService for efficient lookups.
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
    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    console.log(
      `🔍 Using native grounded search for /assistant (direct Gemini grounding)`
    );

    const groundedResult = await executeGroundedSearch(
      message,
      conversationHistory
    );

    const answer = groundedResult.answer || '';
    const reference = groundedResult.reference || [];
    const citations = groundedResult.citations || [];
    const citationMetadata = groundedResult.citationMetadata || null;

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
      ...(citationMetadata && typeof citationMetadata === 'object'
        ? citationMetadata
        : {}),
    };

    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      answer,
      messageMetadata,
      isGuest,
      req
    );

    if (!isGuest) {
      try {
        const subscriptionService = (
          await import('../subscription/subscription.service.js')
        ).default;
        const tenantId = req.user?.tenantId || req.tenantId || null;
        subscriptionService
          .trackAndIncrementMonthlyUsage(userId, tenantId, 'search')
          .catch((err) => {
            logger.error('Failed to increment monthly usage for search:', err);
          });
      } catch (err) {
        logger.error('Failed to increment monthly usage:', err);
      }
    }

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
        // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
        // used by searchService for efficient inserts/updates.
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
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Handle conversation creation/retrieval
    // Optimization Recommendation: Ensure that the underlying database query in `searchService.handleSearchConversation`
    // uses `.lean()` if only plain JavaScript objects are needed, to avoid Mongoose document hydration overhead.
    // If `conversation.messages` can be very large, consider optimizing `handleSearchConversation`
    // to fetch only the last N messages or use projection to limit the array size directly in the database query,
    // instead of fetching the entire array and then slicing it in memory.
    // Database Indexing Recommendation: Ensure 'userId' and 'conversationId' fields are indexed in the Conversation/Search model
    // used by searchService for efficient lookups.
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
    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
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
        let referenceList = chunk.reference || [];
        let citationList = chunk.citations || [];
        if (!Array.isArray(referenceList) || referenceList.length === 0) {
          referenceList = [{
            url: 'https://search.insohq.com',
            domain: 'search.insohq.com',
            title: 'Inso Assistant Global Search Index'
          }];
          citationList = [{
            index: 1,
            url: 'https://search.insohq.com',
            domain: 'search.insohq.com',
            title: 'Inso Assistant Global Search Index'
          }];
        }
        res.write(
          `data: ${JSON.stringify({
            type: 'metadata',
            reference: referenceList,
            citations: citationList,
            citationMetadata: chunk.citationMetadata,
            timestamp: chunk.timestamp,
          })}\n\n`
        );
      }
    }

    // Ensure metadata is structured and has fallback reference if none is present
    let finalReferences = metadata?.reference || [];
    let finalCitations = metadata?.citations || [];
    let finalCitationMetadata = metadata?.citationMetadata || null;

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
      // Send fallback metadata event if metadata wasn't sent or was empty
      res.write(
        `data: ${JSON.stringify({
          type: 'metadata',
          reference: finalReferences,
          citations: finalCitations,
          citationMetadata: finalCitationMetadata,
          timestamp: Date.now(),
        })}\n\n`
      );
    }

    // Save the complete response to conversation
    const messageMetadata = {
      reference: finalReferences,
      citationMetadata: finalCitationMetadata,
      searchQuery: message,
      searchTimestamp: new Date().toISOString(),
      streamingMode: true,
      ...(metadata?.registryMetadata || {}),
    };

    // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
    // used by searchService for efficient inserts/updates.
    await searchService.addSearchResultMessage(
      actualConversationId,
      userId,
      fullText,
      messageMetadata,
      isGuest,
      req
    );

    if (!isGuest) {
      try {
        const subscriptionService = (
          await import('../subscription/subscription.service.js')
        ).default;
        const tenantId = req.user?.tenantId || req.tenantId || null;
        subscriptionService
          .trackAndIncrementMonthlyUsage(userId, tenantId, 'search')
          .catch((err) => {
            logger.error(
              'Failed to increment monthly usage for search (streaming):',
              err
            );
          });
      } catch (err) {
        logger.error('Failed to increment monthly usage:', err);
      }
    }

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
        // Database Indexing Recommendation: Ensure 'conversationId' and 'userId' fields are indexed in the Message/Search model
        // used by searchService for efficient inserts/updates.
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
