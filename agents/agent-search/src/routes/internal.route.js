/**
 * @fileoverview Internal API routes for the Search Agent.
 * All endpoints (except /health) are protected by shared internalAuth
 * middleware — only the API Gateway can call them.
 *
 * POST /execute  — full search (returns JSON)
 * POST /stream   — streaming search (returns SSE)
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import { runWorkflow, runStreamingWorkflow } from '../agent/workflow.js';
import { createLogger } from '../../../../shared/logging/index.js';

const router = Router();
const { logger } = createLogger('agent-search-routes');

// ── Health Check (unauthenticated — used by Cloud Run probes) ────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'search' });
});

// ── Execute Search (non-streaming) ──────────────────────────────────────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, conversationHistory = [], options = {} } = req.body;
    const userContext = req.user;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'prompt is required and must be a non-empty string',
      });
    }

    logger.info('POST /execute', {
      userId: userContext.userId,
      promptLength: prompt.length,
      historyLength: conversationHistory.length,
    });

    const result = await runWorkflow({
      query: prompt,
      conversationHistory,
      userContext,
      ...options,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Search execution failed: ${error.message}`, {
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: 'Search execution failed',
      message:
        process.env.NODE_ENV === 'production'
          ? 'An internal error occurred'
          : error.message,
    });
  }
});

// ── Streaming Search (SSE) ──────────────────────────────────────────────────
router.post('/stream', internalAuth, async (req, res) => {
  try {
    const { prompt, conversationHistory = [], options = {} } = req.body;
    const userContext = req.user;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Bad Request',
        message: 'prompt is required and must be a non-empty string',
      });
    }

    logger.info('POST /stream', {
      userId: userContext.userId,
      promptLength: prompt.length,
      historyLength: conversationHistory.length,
    });

    // ── SSE headers ───────────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    // Handle client disconnect
    let clientDisconnected = false;
    req.on('close', () => {
      clientDisconnected = true;
      logger.info('Client disconnected from SSE stream');
    });

    const stream = runStreamingWorkflow({
      query: prompt,
      conversationHistory,
      userContext,
      ...options,
    });

    for await (const chunk of stream) {
      if (clientDisconnected) break;

      // Send each chunk as an SSE event
      const eventType = chunk.type || 'message';
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }

    // Signal stream end
    if (!clientDisconnected) {
      res.write('event: done\n');
      res.write(`data: ${JSON.stringify({ type: 'done', timestamp: Date.now() })}\n\n`);
      res.end();
    }
  } catch (error) {
    logger.error(`Streaming search failed: ${error.message}`, {
      stack: error.stack,
    });

    // If headers already sent (SSE started), send error event
    if (res.headersSent) {
      res.write(`event: error\n`);
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          error: process.env.NODE_ENV === 'production' ? 'Internal error' : error.message,
          timestamp: Date.now(),
        })}\n\n`,
      );
      res.end();
    } else {
      res.status(500).json({
        success: false,
        error: 'Streaming search failed',
        message:
          process.env.NODE_ENV === 'production'
            ? 'An internal error occurred'
            : error.message,
      });
    }
  }
});

export default router;
