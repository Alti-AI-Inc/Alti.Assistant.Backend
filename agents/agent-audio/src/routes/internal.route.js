/**
 * @fileoverview Internal API routes for the Audio Agent.
 * All endpoints (except /health) are protected by the shared internalAuth
 * middleware — only the API Gateway can call them.
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import audioService from '../services/audioService.js';
import { runWorkflow } from '../agent/workflow.js';
import { createLogger } from '../../../../shared/logging/index.js';

const router = Router();
const { logger } = createLogger('agent-audio-routes');

// ── Health Check (unauthenticated — used by Cloud Run probes) ────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'audio' });
});

// ── Execute Audio Generation (full pipeline: script + voice/music) ───────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, options } = req.body;
    const userContext = req.user;

    logger.info('Execute audio request received', {
      userId: userContext.userId,
      promptLength: prompt?.length,
    });

    const result = await runWorkflow({ prompt, ...options });
    res.json({
      success: true,
      data: {
        content: result.script,
        audioBase64: result.audioBase64,
        metadata: result.metadata
      }
    });
  } catch (error) {
    logger.error(`Audio execution failed: ${error.message}`);
    res.status(500).json({
      error: 'Audio execution failed',
      message: error.message,
    });
  }
});

// ── Direct TTS Synthesis ─────────────────────────────────────────────────────
router.post('/synthesize', internalAuth, async (req, res) => {
  try {
    const { text, voiceConfig } = req.body;
    const userContext = req.user;

    logger.info('Synthesize speech request received', {
      userId: userContext.userId,
      textLength: text?.length,
    });

    const result = await audioService.synthesizeSpeech(text, voiceConfig);
    res.json(result);
  } catch (error) {
    logger.error(`Speech synthesis failed: ${error.message}`);
    res.status(500).json({
      error: 'Speech synthesis failed',
      message: error.message,
    });
  }
});

// ── Music Generation ─────────────────────────────────────────────────────────
router.post('/music', internalAuth, async (req, res) => {
  try {
    const { prompt, options } = req.body;
    const userContext = req.user;

    logger.info('Music generation request received', {
      userId: userContext.userId,
      promptLength: prompt?.length,
    });

    const result = await audioService.generateMusic(prompt, options);
    res.json(result);
  } catch (error) {
    logger.error(`Music generation failed: ${error.message}`);
    res.status(500).json({
      error: 'Music generation failed',
      message: error.message,
    });
  }
});

export default router;
