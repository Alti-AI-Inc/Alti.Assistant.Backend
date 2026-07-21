import { Router } from 'express';
import { internalAuth } from '../../../../shared/auth/index.js';
import { createLogger } from '../../../../shared/logging/index.js';
import { ReviewService } from '../services/reviewService.js';

const router = Router();
const { logger } = createLogger('agent-review-routes');
const reviewService = new ReviewService();

router.post('/execute', internalAuth, async (req, res) => {
  try {
    const {
      content,
      reviewType = 'general',
      context = '',
      rubric = [],
      options = {},
    } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
    }

    const result = await reviewService.reviewContent(
      {
        content,
        reviewType,
        context,
        rubric,
      },
      req.user,
      options
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Review execute failed: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/compare', internalAuth, async (req, res) => {
  try {
    const {
      original,
      revised,
      reviewType = 'general',
      options = {},
    } = req.body;

    if (!original || !revised) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: original and revised',
      });
    }

    const result = await reviewService.compareRevisions(
      { original, revised, reviewType },
      req.user,
      options
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Review compare failed: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/checklist', internalAuth, async (req, res) => {
  try {
    const {
      content,
      checklist = [],
      reviewType = 'general',
      options = {},
    } = req.body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: content',
      });
    }

    if (!Array.isArray(checklist) || checklist.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: checklist (non-empty array)',
      });
    }

    const result = await reviewService.evaluateChecklist(
      { content, checklist, reviewType },
      req.user,
      options
    );

    return res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Review checklist failed: ${error.message}`, {
      stack: error.stack,
    });
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    agent: 'review',
    status: 'operational',
    timestamp: new Date().toISOString(),
  });
});

export default router;
