import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { OrchestratorService } from './orchestrator.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * POST /orchestrate — Full intelligent orchestration (classify + execute).
 */
const orchestrate = catchAsync(async (req, res) => {
  const { message, conversationHistory, systemPrompt } = req.body;

  if (!message) {
    return sendResponse(res, {
      success: false,
      statusCode: httpStatus.BAD_REQUEST,
      message: 'message is required',
    });
  }

  const result = await OrchestratorService.orchestrate(message, {
    userId: req.user?.userId || req.user?._id,
    conversationHistory,
    systemPrompt,
  });

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Routed to ${result.route} (confidence: ${result.confidence})`,
    data: result,
  });
});

/**
 * POST /stream — SSE streaming orchestration.
 */
const streamOrchestrate = catchAsync(async (req, res) => {
  const { message, conversationHistory, systemPrompt } = req.body;

  if (!message) {
    return sendResponse(res, {
      success: false,
      statusCode: httpStatus.BAD_REQUEST,
      message: 'message is required',
    });
  }

  const orchestrationResult = await OrchestratorService.orchestrateStream(message, {
    userId: req.user?.userId || req.user?._id,
    conversationHistory,
    systemPrompt,
  });

  if (orchestrationResult.isStreaming && orchestrationResult.stream) {
    // SSE streaming response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Route', orchestrationResult.classification.route);
    res.setHeader('X-Confidence', String(orchestrationResult.classification.confidence));
    res.flushHeaders();

    // Send classification metadata first
    res.write(`data: ${JSON.stringify({
      type: 'classification',
      route: orchestrationResult.classification.route,
      confidence: orchestrationResult.classification.confidence,
    })}\n\n`);

    try {
      for await (const chunk of orchestrationResult.stream) {
        const delta = chunk.choices?.[0]?.delta?.content;
        if (delta) {
          res.write(`data: ${JSON.stringify({ type: 'content', content: delta })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (err) {
      logger.error(`[Orchestrator Stream] Error: ${err.message}`);
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
    }

    res.end();
  } else {
    // Non-streaming route — return full result
    sendResponse(res, {
      success: true,
      statusCode: httpStatus.OK,
      message: `Routed to ${orchestrationResult.result.route}`,
      data: orchestrationResult.result,
    });
  }
});

/**
 * POST /classify — Classification only (no execution).
 */
const classify = catchAsync(async (req, res) => {
  const { message, conversationHistory } = req.body;

  if (!message) {
    return sendResponse(res, {
      success: false,
      statusCode: httpStatus.BAD_REQUEST,
      message: 'message is required',
    });
  }

  const classification = await OrchestratorService.classifyOnly(message, {
    conversationHistory,
  });

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Classified as ${classification.route}`,
    data: classification,
  });
});

/**
 * POST /execute — Force-execute a specific route (bypass classifier).
 */
const executeRoute = catchAsync(async (req, res) => {
  const { route, params } = req.body;

  if (!route) {
    return sendResponse(res, {
      success: false,
      statusCode: httpStatus.BAD_REQUEST,
      message: 'route is required',
    });
  }

  const result = await OrchestratorService.executeRoute(route, params || {}, {
    userId: req.user?.userId || req.user?._id,
  });

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: `Executed route ${route}`,
    data: result,
  });
});

/**
 * GET /routes — Available route catalog.
 */
const listRoutes = catchAsync(async (req, res) => {
  const catalog = OrchestratorService.getRouteCatalog();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Route catalog retrieved',
    data: catalog,
  });
});

/**
 * GET /telemetry — Recent routing telemetry and performance metrics.
 */
const getTelemetry = catchAsync(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const telemetry = OrchestratorService.getTelemetry(limit);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Telemetry retrieved',
    data: telemetry,
  });
});

export const OrchestratorController = {
  orchestrate,
  streamOrchestrate,
  classify,
  executeRoute,
  listRoutes,
  getTelemetry,
};

export default OrchestratorController;
