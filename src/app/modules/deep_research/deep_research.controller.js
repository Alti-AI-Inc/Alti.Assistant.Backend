import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import { logger } from '../../../shared/logger.js';
import sendResponse from '../../../shared/sendResponse.js';
import { deepResearchService } from './deep_research.service.js';
import { runDeepResearchAgent } from './deep_research_assistant/workflow.js';
import SubscriptionModel from '../payment/payment.model.js';
import { conversationHelpers } from '../conversations/conversation.helpers.js';
import { getResearchResultById } from './services/researchStorageService.js';
import { generatePDFReport } from './services/pdfService.js';
import { generatePPTXReport } from './services/pptxService.js';
import { telemetryEmitter } from './services/telemetryService.js';

export const performDeepResearch = catchAsync(async (req, res) => {
  // Handle both authenticated and guest users
  const isGuest = req.isGuest || !req.user;
  let userId = isGuest
    ? deepResearchService.generateGuestUserId()
    : req.user?.userId || req.user?._id;
  const {
    message,
    generatePdf = false,
    conversationId,
    maxDepth = 3,
    depth = 'thorough',
    boardPersonas = ['McKinsey Strategy Partner', 'Gartner Research Director', 'YC Technical Architect'],
    consensusLevel = 'majority',
  } = req.body;

  // Determine actual maxDepth based on pre-flight depth choice
  const calculatedDepth = depth === 'fast' ? 2 : 4;
  const finalMaxDepth = req.body.maxDepth ? maxDepth : calculatedDepth;
  userId = req.body.userId || userId; // Allow overriding userId from request body

  // Skip subscription check for guest users
  if (!isGuest) {
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    });
    const promptUsage = userSubscription ? userSubscription.usage : 0;
    const totalConversationWithConvId = conversationId
      ? await conversationHelpers.getConversationById(
          conversationId,
          userId,
          req
        )
      : 0;

    if (promptUsage <= totalConversationWithConvId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message:
          'You have reached your deep research limit for this month. Please upgrade your plan to continue.',
      });
    }
  }

  if (!message) {
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

  const thread_id =
    conversationId || deepResearchService.generateDeepResearchConversationId();

  try {
    // Handle conversation creation/retrieval
    const conversation =
      await deepResearchService.handleDeepResearchConversation(
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
      // Get last 5 messages for context (excluding the current message)
      conversationHistory = conversation.messages.slice(-5).map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    }

    // Add user message to conversation
    await deepResearchService.addDeepResearchQueryMessage(
      actualConversationId,
      userId,
      message,
      isGuest,
      req
    );

    console.log(`Starting deep research for query: "${message}"`);

    // Run the deep research agent
    const result = await runDeepResearchAgent(message, {
      generatePdf,
      conversationId: actualConversationId,
      maxDepth: finalMaxDepth,
      history: conversationHistory,
      boardPersonas,
      consensusLevel,
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
      reference: result.sources,
      // promisingLeads: result.promisingLeads,
      // deepDiveResults: result.deepDiveResults,
      qualityMetrics: result.qualityMetrics,
      knowledgeGraph: result.knowledgeGraph,
      researchProgress: result.researchProgress,
      classification: result.classification,
      researchType: 'recursive_deep',
      searchTimestamp: new Date().toISOString(),
    };

    await deepResearchService.addDeepResearchResultMessage(
      actualConversationId,
      userId,
      result.answer,
      messageMetadata,
      isGuest,
      req
    );

    // Prepare response
    const response = {
      success: true,
      // query: result.query,

      // classification: result.classification,

      responseMessage: {
        answer: result.answer,
        reference: result.sources,
      },
      // promisingLeads: result.promisingLeads,
      // deepDiveResults: result.deepDiveResults,
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
        downloadUrl: `/api/deep-research/download-pdf/${result.metadata.savedId}`,
      };
    }

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Deep research completed successfully',
      data: response,
    });
  } catch (error) {
    logger.error('Deep Research API Error:', error);

    // Try to save error message to conversation if possible
    const errorConversationId =
      conversationId ||
      deepResearchService.generateDeepResearchConversationId();
    try {
      if (errorConversationId && userId) {
        await deepResearchService.addErrorMessage(
          errorConversationId,
          userId,
          'I apologize, but an error occurred while processing your deep research request.',
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

  const stats = await deepResearchService.getDeepResearchStats(userId, req);

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

  logger.info(`Deep research PDF download requested for savedId: ${savedId}`);

  try {
    const researchResult = await getResearchResultById(savedId);

    if (!researchResult) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Research result not found or has expired',
      });
    }

    // Compile PDF on the fly using stateless pdfService.js
    const pdfReport = await generatePDFReport({
      title: researchResult.title || 'AI Research Report',
      query: researchResult.query,
      answer: researchResult.answer,
      sources: researchResult.sources,
      quantitativeFacts: researchResult.quantitativeFacts || [],
      metadata: researchResult.metadata,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pdfReport.filename || `research_report_${savedId}.pdf`}"`
    );

    return res.send(pdfReport.buffer);
  } catch (error) {
    logger.error('Error generating deep research PDF:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to compile or download research PDF',
    });
  }
});

/**
 * Download PowerPoint (PPTX) slide deck (supports both authenticated and guest users)
 */
const downloadPPTX = catchAsync(async (req, res) => {
  const { savedId } = req.params;

  logger.info(`Deep research PPTX download requested for savedId: ${savedId}`);

  try {
    const researchResult = await getResearchResultById(savedId);

    if (!researchResult) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Research result not found or has expired',
      });
    }

    // Compile PPTX on the fly using stateless pptxService.js
    const pptxDeck = await generatePPTXReport({
      title: researchResult.title || 'AI Research Briefing',
      query: researchResult.query,
      answer: researchResult.answer,
      sources: researchResult.sources,
      quantitativeFacts: researchResult.quantitativeFacts || [],
      metadata: researchResult.metadata,
    });

    res.setHeader('Content-Type', pptxDeck.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pptxDeck.filename || `research_deck_${savedId}.pptx`}"`
    );

    return res.send(pptxDeck.buffer);
  } catch (error) {
    logger.error('Error generating deep research PPTX:', error);
    return sendResponse(res, {
      statusCode: httpStatus.INTERNAL_SERVER_ERROR,
      success: false,
      message: 'Failed to compile or download research PowerPoint presentation',
    });
  }
});

/**
 * Real-time SSE telemetry stream for deep research execution
 */
const telemetryStream = catchAsync(async (req, res) => {
  const { conversationId } = req.query;

  if (!conversationId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'conversationId query parameter is required',
    });
  }

  // Set Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  logger.info(`SSE client connected for conversationId: ${conversationId}`);

  // Send initial ping to establish connection
  res.write(`data: ${JSON.stringify({ step: 'connection_established', message: 'SSE connection active.', percentage: 0 })}\n\n`);

  // Define listener
  const progressListener = (event) => {
    if (event.conversationId === conversationId) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  };

  // Bind listener
  telemetryEmitter.on('progress', progressListener);

  // Keep connection alive with periodic pings (every 15 seconds) to avoid timeouts
  const keepAliveInterval = setInterval(() => {
    res.write(': ping\n\n');
  }, 15000);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(keepAliveInterval);
    telemetryEmitter.off('progress', progressListener);
    logger.info(`SSE client disconnected for conversationId: ${conversationId}`);
  });
});

export const deepResearchController = {
  performDeepResearch,
  getDeepResearchStats,
  downloadPDF,
  downloadPPTX,
  telemetryStream,
};
