import { Router } from 'express';
import { AphuraDeepResearchAgent } from '../services/research.service.js';

const router = Router();

// Standard blocking REST call
router.post('/invoke', async (req, res) => {
  try {
    const { query, message, composioAction, composioEntityId, channel } = req.body;
    const targetQuery = query || message;
    if (!targetQuery) return res.status(400).json({ error: 'Missing query parameter.' });

    const result = await AphuraDeepResearchAgent.executeOmniResearch(targetQuery, {
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
router.post('/stream', async (req, res) => {
  const { query, message, composioAction, composioEntityId } = req.body;
  const targetQuery = query || message;
  
  if (!targetQuery) return res.status(400).json({ error: 'Missing query parameter.' });

  // Set SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (type, payload) => {
    // The frontend PostConversationStream parser expects data objects
    // Wrap events into chunks
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `[${type.toUpperCase()}] ${JSON.stringify(payload)}\n\n` })}\n\n`);
  };

  try {
    const result = await AphuraDeepResearchAgent.executeOmniResearch(targetQuery, {
      composioAction,
      composioEntityId,
      onEvent: (type, msg) => sendEvent(type, msg)
    });

    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n### DEEP RESEARCH FINAL REPORT\n\n${result.report}` })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `[ERROR] ${error.message}` })}\n\n`);
    res.end();
  }
});

export default router;
