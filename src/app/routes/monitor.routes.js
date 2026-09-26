import { Router } from 'express';
import { AphuraMonitorEngine } from '../services/monitor.service.js';

const router = Router();

router.post('/execute', async (req, res) => {
  try {
    const { message, url } = req.body;
    const targetUrl = url || message; // User can just paste a URL in the chat box
    
    if (!targetUrl) return res.status(400).json({ error: 'Missing target URL.' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (type, payload) => {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: `[${type.toUpperCase()}] ${JSON.stringify(payload)}\n\n` })}\n\n`);
    };

    const result = await AphuraMonitorEngine.checkChanges(targetUrl, null, null, {
      onEvent: (type, msg) => sendEvent(type, msg)
    });

    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n### MONITOR REPORT\n\n- **Changed:** ${result.changed}\n- **Changes:**\n${result.changes || 'None'}` })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `[ERROR] ${error.message}` })}\n\n`);
    res.end();
  }
});

export default router;
