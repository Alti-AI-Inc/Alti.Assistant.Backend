/**
 * @fileoverview Internal routes for the Code Agent microservice.
 * All routes are behind the internalAuth middleware — only the
 * API Gateway can call these endpoints.
 *
 * Routes:
 *   POST /execute  — code generation / debugging / architecture
 *   POST /review   — code review
 *   POST /explain  — code explanation
 *   POST /architect — architecture and implementation planning
 *   GET  /health   — agent-level health check
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import { createLogger } from '../../../../shared/logging/index.js';
import { CodeService } from '../services/codeService.js';

const router = Router();
const { logger } = createLogger('agent-code-routes');
const codeService = new CodeService();

// ── POST /execute — Main code generation / debug endpoint ────────────────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, language, intent, options } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt',
      });
    }

    logger.info('Code execute request', {
      userId: req.user?.userId,
      intent: intent || 'generate',
      language,
    });

    let result;
    if (intent === 'debug') {
      result = await codeService.debugCode(prompt, req.body.error, req.user);
    } else if (intent === 'architect') {
      result = await codeService.architectCode(prompt, req.user, options || {});
    } else {
      result = await codeService.generateCode(prompt, req.user, {
        language,
        ...options,
      });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Execute failed: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /review — Code review endpoint ──────────────────────────────────────
router.post('/review', internalAuth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: code',
      });
    }

    logger.info('Code review request', { userId: req.user?.userId });
    const result = await codeService.reviewCode(code, req.user);

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Review failed: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /explain — Code explanation endpoint ────────────────────────────────
router.post('/explain', internalAuth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: code',
      });
    }

    logger.info('Code explain request', { userId: req.user?.userId });
    const result = await codeService.explainCode(code, req.user);

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Explain failed: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── POST /architect — Architecture planning endpoint ─────────────────────────
router.post('/architect', internalAuth, async (req, res) => {
  try {
    const { prompt, options } = req.body;

    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: prompt',
      });
    }

    logger.info('Code architecture request', { userId: req.user?.userId });
    const result = await codeService.architectCode(
      prompt,
      req.user,
      options || {}
    );

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Architect failed: ${error.message}`, { stack: error.stack });
    res.status(500).json({ success: false, error: error.message });
  }
});

// ── GET /health — Agent-level health ─────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    agent: 'code',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

export default router;
