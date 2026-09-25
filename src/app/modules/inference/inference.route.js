/**
 * Aphura Sovereign Inference Router
 * Powered by Together.ai (License: MIT).
 * Official Reference: https://docs.together.ai/reference/chat-completions
 */
import express from 'express';
import { InferenceGateway } from './inference.gateway.js';
import { DesktopGateway } from '../desktop/desktop.gateway.js';
import { llmListModels } from '../../services/llm.client.js';

const router = express.Router();

// ── Chat Completions (Both streaming and non-streaming) ─────────────────────
router.post('/chat/completions', async (req, res) => {
  await InferenceGateway.handleChatCompletion(req.body, res);
});

router.post('/v1/chat/completions', async (req, res) => {
  await InferenceGateway.handleChatCompletion(req.body, res);
});

// ── Text Prompt Completions ────────────────────────────────────────────────
router.post('/completions', async (req, res) => {
  await InferenceGateway.handleTextCompletion(req.body, res);
});

router.post('/v1/completions', async (req, res) => {
  await InferenceGateway.handleTextCompletion(req.body, res);
});

import audioUploader from '../../middlewares/uploder/uploadAudio.js';

// ── Image Generations (Official: https://docs.together.ai/reference/post-images-generations)
router.post('/images/generations', async (req, res) => {
  await InferenceGateway.handleImageGeneration(req.body, res);
});

router.post('/v1/images/generations', async (req, res) => {
  await InferenceGateway.handleImageGeneration(req.body, res);
});

// ── Audio Speech (Official: https://docs.together.ai/reference/audio-speech) ─
router.post('/audio/speech', async (req, res) => {
  await InferenceGateway.handleSpeech(req, res);
});

router.post('/v1/audio/speech', async (req, res) => {
  await InferenceGateway.handleSpeech(req, res);
});

// ── Realtime Speech WebSocket Info (Official: https://docs.together.ai/reference/audio-speech-websocket)
router.get('/audio/speech/websocket', (req, res) => {
  InferenceGateway.handleSpeechWebSocketInfo(req, res);
});

router.get('/v1/audio/speech/websocket', (req, res) => {
  InferenceGateway.handleSpeechWebSocketInfo(req, res);
});

// ── Audio Transcriptions (Official: https://docs.together.ai/reference/audio-transcriptions)
router.post('/audio/transcriptions', audioUploader.single('file'), async (req, res) => {
  await InferenceGateway.handleTranscriptions(req, res);
});

router.post('/v1/audio/transcriptions', audioUploader.single('file'), async (req, res) => {
  await InferenceGateway.handleTranscriptions(req, res);
});

// ── Audio Translations (Official: https://docs.together.ai/reference/audio-translations)
router.post('/audio/translations', audioUploader.single('file'), async (req, res) => {
  await InferenceGateway.handleTranslations(req, res);
});

router.post('/v1/audio/translations', audioUploader.single('file'), async (req, res) => {
  await InferenceGateway.handleTranslations(req, res);
});

// ── Realtime Transcription WebSocket Info (Official: https://docs.together.ai/reference/audio-transcriptions-realtime)
router.get('/realtime', (req, res) => {
  InferenceGateway.handleRealtimeSTTInfo(req, res);
});

router.get('/v1/realtime', (req, res) => {
  InferenceGateway.handleRealtimeSTTInfo(req, res);
});

// ── Models Discovery (OpenAI/Together SDK compatible format) ───────────────
const modelsHandler = async (req, res) => {
  try {
    const list = await llmListModels();
    const data = (Array.isArray(list) ? list : list?.data || []).map((m) => ({
      id: typeof m === 'string' ? m : m.id,
      object: 'model',
      created: 1700000000,
      owned_by: 'together-ai',
      type: typeof m === 'object' ? m.type : 'chat',
    }));
    res.json({ object: 'list', data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

router.get('/models', modelsHandler);
router.get('/v1/models', modelsHandler);

// ── Desktop Integration Status ─────────────────────────────────────────────
router.get('/desktop/status', (req, res) => {
  const isConnected = DesktopGateway.clients.has('admin_user');
  res.json({ connected: isConnected });
});

export const inferenceRoutes = router;
export default router;
