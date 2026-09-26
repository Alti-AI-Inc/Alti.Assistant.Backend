import { Router } from 'express';
import { DeepResearchService } from '../services/research.service.js';

const router = Router();

router.post('/invoke', async (req, res) => {
  try {
    const { query, composioAction, composioEntityId, channel } = req.body;
    
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter.' });
    }

    // Run deep research engine
    const result = await DeepResearchService.runDeepResearch(query, {
      composioAction,
      composioEntityId,
      channel
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[ResearchRoute] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;
