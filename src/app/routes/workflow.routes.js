import { Router } from 'express';
import { AphuraWorkflowEngine } from '../services/workflow.service.js';

const router = Router();

router.post('/execute', async (req, res) => {
  try {
    // Both message or query can be provided
    const { message, instruction } = req.body;
    const targetQuery = message || instruction;
    
    if (!targetQuery) return res.status(400).json({ error: 'Missing message parameter.' });

    // Stream SSE back to the frontend
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendEvent = (type, payload) => {
      // The frontend PostConversationStream parser expects data objects
      // We wrap the raw strings into the expected chunk structure.
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: `[${type.toUpperCase()}] ${JSON.stringify(payload)}\n\n` })}\n\n`);
    };

    const result = await AphuraWorkflowEngine.executeWorkflow(targetQuery, {
      onEvent: (type, msg) => sendEvent(type, msg)
    });

    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `\n\n### FINAL REPORT\n\n${result.report}` })}\n\n`);
    res.end();
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'chunk', content: `[ERROR] ${error.message}` })}\n\n`);
    res.end();
  }
});

export default router;
