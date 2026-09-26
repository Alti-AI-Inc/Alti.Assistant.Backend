import { Router } from 'express';
import { AphuraDeepResearchAgent } from '../services/research.service.js';

const router = Router();

// Standard blocking REST call
router.post('/invoke', async (req, res) => {
  try {
    const { query, composioAction, composioEntityId, channel } = req.body;
    if (!query) return res.status(400).json({ error: 'Missing query parameter.' });

    const result = await AphuraDeepResearchAgent.executeOmniResearch(query, {
      composioAction,
      composioEntityId,
      channel
    });

    return res.status(200).json({ success: true, data: result });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Advanced Server-Sent Events (SSE) Streaming Call (CRUSHES LINKUP)
router.get('/stream', async (req, res) => {
  const { query, composioAction, composioEntityId } = req.query;
  if (!query) return res.status(400).json({ error: 'Missing query parameter.' });

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, payload) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    const result = await AphuraDeepResearchAgent.executeOmniResearch(query, {
      composioAction,
      composioEntityId,
      onEvent: (type, msg) => sendEvent(type, msg)
    });

    sendEvent('final_report', result);
    res.end();
  } catch (error) {
    sendEvent('error', { message: error.message });
    res.end();
  }
});

export default router;
