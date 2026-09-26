import { Router } from 'express';
import { scraperService } from '../services/scraper.service.js';

const router = Router();

// Developer API Endpoint for Anti-Bot Extraction
router.post('/', async (req, res) => {
  try {
    const { url, jsRender, cssSelector, country } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'Target URL is required.' });
    }

    const result = await scraperService.extractGodMode(url, {
      waitForSelector: jsRender ? 'body' : null,
      cssSelector,
      country
    });

    if (!result.success) {
      return res.status(502).json({ error: 'Extraction failed at the proxy layer.', details: result.error });
    }

    return res.status(200).json({
      success: true,
      html: result.data,
      engine: result.metadata.engine
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
