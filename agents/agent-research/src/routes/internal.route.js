/**
 * @fileoverview Internal routes for the Research Agent.
 * All routes except /health are protected by the shared internalAuth middleware
 * so only the API Gateway can call them.
 *
 * Endpoints:
 *   POST /execute      — Run the full research pipeline
 *   POST /export/pdf   — Export research results as PDF
 *   POST /export/pptx  — Export research results as PowerPoint
 *   GET  /health       — Agent health check (unauthenticated)
 */

import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import { ResearchService } from '../services/researchService.js';

const router = Router();
const researchService = new ResearchService();

// ── Health Check ────────────────────────────────────────────────────────────
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'research' });
});

// ── Execute Research Pipeline ───────────────────────────────────────────────
router.post('/execute', internalAuth, async (req, res) => {
  try {
    const { prompt, options } = req.body;
    const userContext = req.user;

    const result = await researchService.executeResearch(prompt, userContext, options);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'Research execution failed',
    });
  }
});

// ── Export as PDF ────────────────────────────────────────────────────────────
router.post('/export/pdf', internalAuth, async (req, res) => {
  try {
    const { researchData } = req.body;

    const result = await researchService.exportToPdf(researchData);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'PDF export failed',
    });
  }
});

// ── Export as PowerPoint ────────────────────────────────────────────────────
router.post('/export/pptx', internalAuth, async (req, res) => {
  try {
    const { researchData } = req.body;

    const result = await researchService.exportToPptx(researchData);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message || 'PPTX export failed',
    });
  }
});

export default router;
