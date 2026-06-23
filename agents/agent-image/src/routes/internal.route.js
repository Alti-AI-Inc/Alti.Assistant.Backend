/**
 * @fileoverview Internal API routes for the Image Agent.
 * All endpoints (except /health) are protected by the shared internalAuth
 * middleware — only the API Gateway can call them.
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import { ImageService } from '../services/imageService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const router = Router();
const imageService = new ImageService();
const { logger } = createLogger('agent-image-routes');

// ── Health Check (unauthenticated — used by Cloud Run probes) ────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'image' });
});

// ── Execute — Image Generation ───────────────────────────────────────────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, options } = req.body;
    const userContext = req.user;

    logger.info('Image generation request received', {
      userId: userContext.userId,
      promptLength: prompt?.length,
    });

    const result = await imageService.generateImage(prompt, userContext, options);
    res.json(result);
  } catch (error) {
    logger.error(`Image generation failed: ${error.message}`);
    res.status(500).json({
      error: 'Image generation failed',
      message: error.message,
    });
  }
});

// ── Edit — Image Editing ─────────────────────────────────────────────────────
router.post('/edit', internalAuth, async (req, res) => {
  try {
    const { imageUrl, editPrompt } = req.body;
    const userContext = req.user;

    logger.info('Image edit request received', {
      userId: userContext.userId,
      hasImageUrl: !!imageUrl,
      editPromptLength: editPrompt?.length,
    });

    const result = await imageService.editImage(imageUrl, editPrompt, userContext);
    res.json(result);
  } catch (error) {
    logger.error(`Image edit failed: ${error.message}`);
    res.status(500).json({
      error: 'Image edit failed',
      message: error.message,
    });
  }
});

export default router;
