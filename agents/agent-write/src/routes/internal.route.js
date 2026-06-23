/**
 * @fileoverview Internal routes for the Write Agent.
 * These endpoints are called by the API Gateway, never by clients directly.
 * All mutating routes require internalAuth to validate gateway identity.
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import { WriteService } from '../services/writeService.js';

const router = Router();
const writeService = new WriteService();

// ── POST /execute — Main document generation endpoint ────────────────────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, options = {} } = req.body;

    if (!prompt) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'prompt is required',
      });
    }

    const result = await writeService.generateDocument(prompt, req.user, options);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Document generation failed',
      message: error.message,
    });
  }
});

// ── POST /export — Export document as DOCX/PDF ───────────────────────────────
router.post('/export', internalAuth, async (req, res) => {
  try {
    const { content, format = 'pdf' } = req.body;

    if (!content) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'content is required',
      });
    }

    const allowedFormats = ['pdf', 'docx', 'markdown', 'html'];
    if (!allowedFormats.includes(format)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `format must be one of: ${allowedFormats.join(', ')}`,
      });
    }

    const result = await writeService.exportDocument(content, format);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Document export failed',
      message: error.message,
    });
  }
});

// ── GET /health — Route-level health check ───────────────────────────────────
router.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    agent: 'write',
    timestamp: new Date().toISOString(),
  });
});

export default router;
