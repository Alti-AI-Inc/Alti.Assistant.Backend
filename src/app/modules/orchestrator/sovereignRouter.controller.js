import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { SovereignRouterService } from './sovereignRouter.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Controller for the Sovereign Unified Prompt Engine.
 * Handles both SSE streaming and standard JSON responses.
 */
export const SovereignRouterController = {
  /**
   * Universal prompt endpoint:
   * Handles POST /api/v1/orchestrator/route-prompt
   * Handles POST /api/v1/search/stream
   * Handles POST /api/v1/chat/get-response
   * Handles POST /api/v1/gemini/4nano/get-response
   */
  routePrompt: catchAsync(async (req, res) => {
    const prompt = req.body.prompt || req.body.message;
    const sessionId = req.body.sessionId || req.body.conversationId;
    const userId = req.user?.userId || req.user?._id;

    if (!prompt) {
      return sendResponse(res, {
        statusCode: httpStatus.BAD_REQUEST,
        success: false,
        message: 'Prompt or message is required.',
      });
    }

    const userContext = {
      timezone: req.body.timezone || 'America/New_York',
      localDate: req.body.localDate,
      localTime: req.body.localTime,
      category: req.body.category,
      metadata: req.body.metadata,
    };

    // Determine if streaming is requested or required by endpoint
    const isStreamEndpoint = req.path.includes('stream') || req.path.includes('route-prompt') || req.body.stream === true;

    if (isStreamEndpoint) {
      return SovereignRouterService.handlePromptStream({
        prompt: req.body.knowledgebaseId ? `[Context: Actively analyzing knowledgebase collection ID: ${req.body.knowledgebaseId}]\n\n${prompt}` : prompt,
        sessionId,
        userId,
        userContext,
        req,
        res,
      });
    }

    // Otherwise JSON response
    const result = await SovereignRouterService.handlePromptJson({
      prompt: req.body.knowledgebaseId ? `[Context: Actively analyzing knowledgebase collection ID: ${req.body.knowledgebaseId}]\n\n${prompt}` : prompt,
      sessionId,
      userId,
      userContext,
    });

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Response processed successfully.',
      data: result,
    });
  }),
};

export default SovereignRouterController;
