/**
 * @fileoverview Internal API routes for the Video Agent.
 * All endpoints (except /health) are protected by the shared internalAuth
 * middleware — only the API Gateway can call them.
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import videoService from '../services/videoService.js';
import { runWorkflow } from '../agent/workflow.js';
import { createLogger } from '../../../../shared/logging/index.js';

const router = Router();
const { logger } = createLogger('agent-video-routes');

// ── Health Check (unauthenticated — used by Cloud Run probes) ────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'video' });
});

// ── Execute Video Generation ─────────────────────────────────────────────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, conversationHistory = [], options } = req.body;
    const userContext = req.user;

    logger.info('Video generation request received', {
      userId: userContext.userId,
      promptLength: prompt?.length,
      historyLength: conversationHistory.length,
      tier: options?.tier,
    });

    const finalState = await runWorkflow({ prompt, conversationHistory, ...options });

    if (finalState.state !== 'generate') {
      // Still gathering details
      res.json({
        status: 'gathering_details',
        reply: finalState.reply
      });
    } else {
      // Completed generation
      res.json({
        status: 'completed',
        data: {
          content: finalState.enhancedPrompt,
          videoUrl: finalState.videoUrl,
          metadata: finalState.metadata
        }
      });
    }
  } catch (error) {
    logger.error(`Video generation failed: ${error.message}`);
    res.status(500).json({
      error: 'Video generation failed',
      message: error.message,
    });
  }
});

// ── Check Generation Status (async polling) ──────────────────────────────────
router.post('/status/:taskId', internalAuth, async (req, res) => {
  try {
    const { taskId } = req.params;
    const userContext = req.user;

    logger.info('Status check requested', {
      userId: userContext.userId,
      taskId,
    });

    const result = await videoService.checkStatus(taskId);
    res.json(result);
  } catch (error) {
    logger.error(`Status check failed: ${error.message}`);
    res.status(500).json({
      error: 'Status check failed',
      message: error.message,
    });
  }
});

export default router;
