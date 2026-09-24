import express from 'express';
import { InferenceGateway } from './inference.gateway.js';

const router = express.Router();

/**
 * 🚀 Liberty Center One - Sovereign Inference API
 * 100% OpenAI-compatible endpoint. Any standard SDK can connect here.
 * We act as our own OpenRouter, funneling to Together.ai.
 */
router.post('/chat/completions', async (req, res) => {
  // Ensure the request is streaming
  if (!req.body.stream) {
    return res.status(400).json({ error: 'Sovereign Inference API currently only supports streaming requests.' });
  }

  // Gateway handles the MoE routing and streaming proxy
  await InferenceGateway.streamChatCompletion(req.body, res);
});

export const inferenceRoutes = router;
