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

/**
 * @swagger
 * /api/deep-research/perform:
 *   post:
 *     summary: Initiate a deep research query
 *     description: |
 *       Performs a comprehensive deep research based on the provided message,
 *       leveraging AI agents and various data sources. Supports both authenticated
 *       and guest users. Includes options for PDF generation, conversation context,
 *       research depth, and persona-based consensus.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
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
 *                 description: The research query or topic.
 *                 example: "What are the key trends in AI ethics and governance for 2024?"
 *               generatePdf:
 *                 type: boolean
 *                 description: Whether to generate a PDF report of the research results.
 *                 default: false
 *               conversationId:
 *                 type: string
 *                 description: Optional ID of an existing conversation to provide context.
 *                 nullable: true
 *                 example: "65e8a2b0f1d4e5c6b7a8d9e0"
 *               maxDepth:
 *                 type: number
 *                 description: Maximum depth for recursive research (overrides 'depth' if provided).
 *                 minimum: 1
 *                 maximum: 5
 *                 nullable: true
 *                 example: 3
 *               depth:
 *                 type: string
 *                 description: Pre-defined research depth level. 'fast' (depth 2) or 'thorough' (depth 4).
 *                 enum: [fast, thorough]
 *                 default: thorough
 *               boardPersonas:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: List of personas to simulate for consensus building during research.
 *                 default: ["McKinsey Strategy Partner", "Gartner Research Director", "YC Technical Architect"]
 *                 example: ["Tech Lead", "Product Manager"]
 *               consensusLevel:
 *                 type: string
 *                 description: Level of consensus required among personas.
 *                 enum: [majority, unanimous, simple]
 *                 default: majority
 *               userId:
 *                 type: string
 *                 description: (For guest users or specific overrides) A temporary or explicit user ID.
 *                 nullable: true
 *                 readOnly: true
 *     responses:
 *       200:
 *         description: Deep research completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Deep research completed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     responseMessage:
 *                       type: object
 *                       properties:
 *                         answer:
 *                           type: string
 *                           description: The main answer or summary of the research.
 *                         reference:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               title:
 *                                 type: string
 *                               url:
 *                                 type: string
 *                           description: List of sources and references used.
 *                     qualityMetrics:
 *                       type: object
 *                       description: Metrics related to the quality and depth of the research.
 *                     knowledgeGraph:
 *                       type: object
 *                       description: Structured data representing key entities and relationships.
 *                     metadata:
 *                       type: object
 *                       description: Additional metadata about the research process.
 *                     conversationId:
 *                       type: string
 *                       description: The ID of the conversation where this research is stored.
 *                     researchProgress:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           step:
 *                             type: string
 *                           status:
 *                             type: string
 *                           details:
 *                             type: string
 *                       description: A log of the research steps taken.
 *                     messageCount:
 *                       type: number
 *                       description: Total number of messages in the conversation after this research.
 *                     userType:
 *                       type: string
 *                       enum: [guest, authenticated]
 *                       description: Type of user who initiated the research.
 *                     userId:
 *                       type: string
 *                       description: The ID of the user (only included for guest users).
 *                       nullable: true
 *                     pdf:
 *                       type: object
 *                       properties:
 *                         filename:
 *                           type: string
 *                         size:
 *                           type: number
 *                         downloadUrl:
 *                           type: string
 *                       description: Details for downloading the generated PDF report, if requested.
 *       400:
 *         description: Bad Request - Missing research query or invalid parameters.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized - User not authenticated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - User has reached their deep research limit.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error - An unexpected error occurred during research.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
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
  // SECURITY FIX: Removed potential IDOR vulnerability. userId should be derived from authentication context
  // or securely generated for guests, not from user input in the request body.
  // userId = req.body.userId || userId; // Removed this line

  // Skip subscription check for guest users
  if (!isGuest) {
    // Optimization: Use .lean() for read-only queries to improve performance by returning plain JavaScript objects instead of Mongoose documents.
    // Recommendation: Ensure an index exists on `userId` and `createdAt` fields in the SubscriptionModel for efficient lookups and sorting.
    const userSubscription = await SubscriptionModel.findOne({ userId }).sort({
      createdAt: -1,
    }).lean(); // Added .lean()

    // BUG FIX: Corrected subscription limit check logic.
    // Assuming `userSubscription.usage` represents the *remaining* deep research credits for the user.
    // If no subscription or usage is not defined, default to 0 credits.
    const remainingDeepResearchCredits = userSubscription ? userSubscription.usage : 0;

    if (remainingDeepResearchCredits <= 0) {
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
    // Optimization: If `deepResearchService.handleDeepResearchConversation` performs a Mongoose query for read-only data,
    // consider adding `.lean()` within that service function for performance.
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
    // Note: `runDeepResearchAgent` is an external AI workflow, its internal performance
    // is outside the scope of this file's direct database/CPU optimizations.
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

    // BUG FIX: Decrement remaining deep research credits after successful research for authenticated users.
    if (!isGuest) {
      // Re-fetch the subscription to ensure we have the latest state, or pass the Mongoose document if available.
      // For simplicity, we'll re-fetch and update.
      const userSubscriptionToUpdate = await SubscriptionModel.findOne({ userId });
      if (userSubscriptionToUpdate && userSubscriptionToUpdate.usage > 0) {
        userSubscriptionToUpdate.usage -= 1;
        await userSubscriptionToUpdate.save();
      } else if (userSubscriptionToUpdate) {
        // Log a warning if usage was already 0 but research was allowed (shouldn't happen with the check above)
        logger.warn(`User ${userId} performed deep research but usage was already 0 or less. No decrement applied.`);
      }
    }

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
 * @swagger
 * /api/deep-research/stats:
 *   get:
 *     summary: Get deep research statistics for the authenticated user
 *     description: Retrieves usage statistics and historical data related to deep research for the current authenticated user.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Deep research statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Deep research statistics retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalResearches:
 *                       type: number
 *                       description: Total number of deep researches performed by the user.
 *                       example: 15
 *                     lastResearchDate:
 *                       type: string
 *                       format: date-time
 *                       description: Timestamp of the last deep research performed.
 *                       example: "2024-03-15T10:30:00Z"
 *                     averageDepth:
 *                       type: number
 *                       description: Average depth of researches performed.
 *                       example: 3.5
 *                     topTopics:
 *                       type: array
 *                       items:
 *                         type: string
 *                       description: List of frequently researched topics.
 *                       example: ["AI Ethics", "Market Trends", "Blockchain"]
 *       401:
 *         description: Unauthorized - User not authenticated or statistics not available for guest users.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error - An unexpected error occurred.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
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

  // Optimization: If `deepResearchService.getDeepResearchStats` performs Mongoose queries for read-only data,
  // consider adding `.lean()` within that service function for performance.
  const stats = await deepResearchService.getDeepResearchStats(userId, req);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Deep research statistics retrieved successfully',
    data: stats,
  });
});

/**
 * @swagger
 * /api/deep-research/download-pdf/{savedId}:
 *   get:
 *     summary: Download a deep research report as a PDF
 *     description: |
 *       Retrieves a previously saved deep research result by its ID and generates a PDF report on the fly.
 *       This endpoint supports both authenticated and guest users, provided they have the correct `savedId`.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: savedId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the saved deep research result.
 *         example: "65e8a2b0f1d4e5c6b7a8d9e0"
 *     responses:
 *       200:
 *         description: PDF report generated and downloaded successfully.
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Research result not found or has expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error - Failed to compile or download the PDF.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const downloadPDF = catchAsync(async (req, res) => {
  const { savedId } = req.params;
  const isGuest = req.isGuest || !req.user;
  // For authenticated users, get their userId. For guests, userId is not used for ownership check here,
  // as guest access is typically based on the savedId itself being a unique, unguessable token.
  const userId = isGuest ? null : req.user?.userId || req.user?._id;

  logger.info(`Deep research PDF download requested for savedId: ${savedId}`);

  try {
    // Optimization: If `getResearchResultById` performs a Mongoose query for read-only data,
    // consider adding `.lean()` within that service function for performance.
    // Recommendation: Ensure an index exists on the field used for `savedId` lookup (e.g., `_id` or a custom `savedId` field)
    // in the underlying research result model for efficient retrieval.
    const researchResult = await getResearchResultById(savedId);

    if (!researchResult) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Research result not found or has expired',
      });
    }

    // SECURITY FIX: IDOR vulnerability. Ensure the research result belongs to the authenticated user.
    // Guest users are implicitly allowed if they have the savedId, assuming savedId acts as an access token for guests.
    // If guest users have a persistent userId associated with their research, an additional check would be needed here.
    if (!isGuest && researchResult.userId !== userId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You do not have permission to access this research result',
      });
    }

    // Compile PDF on the fly using stateless pdfService.js
    // Note: PDF generation is a CPU-intensive task, but it's handled asynchronously
    // by an external service. Optimizations here would involve the `generatePDFReport`
    // implementation itself, which is outside the scope of this file.
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
 * @swagger
 * /api/deep-research/download-pptx/{savedId}:
 *   get:
 *     summary: Download a deep research report as a PowerPoint (PPTX) presentation
 *     description: |
 *       Retrieves a previously saved deep research result by its ID and generates a PPTX slide deck on the fly.
 *       This endpoint supports both authenticated and guest users, provided they have the correct `savedId`.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: savedId
 *         schema:
 *           type: string
 *         required: true
 *         description: The unique identifier of the saved deep research result.
 *         example: "65e8a2b0f1d4e5c6b7a8d9e0"
 *     responses:
 *       200:
 *         description: PPTX presentation generated and downloaded successfully.
 *         content:
 *           application/vnd.openxmlformats-officedocument.presentationml.presentation:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Research result not found or has expired.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal Server Error - Failed to compile or download the PPTX.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const downloadPPTX = catchAsync(async (req, res) => {
  const { savedId } = req.params;
  const isGuest = req.isGuest || !req.user;
  // For authenticated users, get their userId. For guests, userId is not used for ownership check here,
  // as guest access is typically based on the savedId itself being a unique, unguessable token.
  const userId = isGuest ? null : req.user?.userId || req.user?._id;

  logger.info(`Deep research PPTX download requested for savedId: ${savedId}`);

  try {
    // Optimization: If `getResearchResultById` performs a Mongoose query for read-only data,
    // consider adding `.lean()` within that service function for performance.
    // Recommendation: Ensure an index exists on the field used for `savedId` lookup (e.g., `_id` or a custom `savedId` field)
    // in the underlying research result model for efficient retrieval.
    const researchResult = await getResearchResultById(savedId);

    if (!researchResult) {
      return sendResponse(res, {
        statusCode: httpStatus.NOT_FOUND,
        success: false,
        message: 'Research result not found or has expired',
      });
    }

    // SECURITY FIX: IDOR vulnerability. Ensure the research result belongs to the authenticated user.
    // Guest users are implicitly allowed if they have the savedId, assuming savedId acts as an access token for guests.
    // If guest users have a persistent userId associated with their research, an additional check would be needed here.
    if (!isGuest && researchResult.userId !== userId) {
      return sendResponse(res, {
        statusCode: httpStatus.FORBIDDEN,
        success: false,
        message: 'You do not have permission to access this research result',
      });
    }

    // Compile PPTX on the fly using stateless pptxService.js
    // Note: PPTX generation is a CPU-intensive task, but it's handled asynchronously
    // by an external service. Optimizations here would involve the `generatePPTXReport`
    // implementation itself, which is outside the scope of this file.
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
 * @swagger
 * /api/deep-research/telemetry:
 *   get:
 *     summary: Real-time Server-Sent Events (SSE) stream for deep research progress
 *     description: |
 *       Establishes an SSE connection to stream real-time progress updates for a deep research task.
 *       Clients can subscribe to this endpoint using a `conversationId` to receive updates
 *       on the research steps, status, and percentage completion.
 *     tags:
 *       - Deep Research
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: conversationId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the conversation for which to stream telemetry updates.
 *         example: "65e8a2b0f1d4e5c6b7a8d9e0"
 *     responses:
 *       200:
 *         description: An active SSE stream providing real-time research progress.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *               example: |
 *                 data: {"step":"connection_established","message":"SSE connection active.","percentage":0}
 *                 data: {"step":"initial_search","status":"in_progress","message":"Searching for initial data...","percentage":10}
 *                 data: {"step":"data_synthesis","status":"completed","message":"Synthesizing findings.","percentage":50}
 *       400:
 *         description: Bad Request - `conversationId` query parameter is missing.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
const telemetryStream = catchAsync(async (req, res) => {
  const { conversationId } = req.query;
  const isGuest = req.isGuest || !req.user;
  const userId = isGuest ? null : req.user?.userId || req.user?._id;

  if (!conversationId) {
    return res.status(httpStatus.BAD_REQUEST).json({
      success: false,
      message: 'conversationId query parameter is required',
    });
  }

  // SECURITY FIX: IDOR vulnerability. Verify that the conversationId belongs to the current user.
  // Using conversationHelpers.getConversationById to verify ownership.
  // This helper is assumed to return null or throw if the user does not own the conversation.
  // For guest users, if `userId` is null, the helper should handle guest-specific ownership (e.g., if conversationId is a guest-specific token).
  const conversation = await conversationHelpers.getConversationById(conversationId, userId, req);

  if (!conversation) {
    return res.status(httpStatus.FORBIDDEN).json({
      success: false,
      message: 'You do not have permission to access this conversation\'s telemetry stream',
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

/**
 * @typedef {object} DeepResearchController
 * @property {function(import('express').Request, import('express').Response): Promise<void>} performDeepResearch - Handles initiating a deep research query.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} getDeepResearchStats - Retrieves deep research statistics for the user.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} downloadPDF - Handles downloading a deep research report as a PDF.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} downloadPPTX - Handles downloading a deep research report as a PPTX.
 * @property {function(import('express').Request, import('express').Response): Promise<void>} telemetryStream - Provides a real-time SSE stream for deep research progress.
 */
/**
 * DeepResearchController object containing all controller methods for deep research operations.
 * @type {DeepResearchController}
 */
export const deepResearchController = {
  performDeepResearch,
  getDeepResearchStats,
  downloadPDF,
  downloadPPTX,
  telemetryStream,
};