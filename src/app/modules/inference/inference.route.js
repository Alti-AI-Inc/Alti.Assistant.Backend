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
import datasetUploader from '../../middlewares/uploder/uploadDataset.js';

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

// ── Audio Voices (Official: https://docs.together.ai/reference/audio-voices) ──
router.get('/audio/voices', async (req, res) => {
  await InferenceGateway.handleListVoices(req, res);
});

router.get('/v1/audio/voices', async (req, res) => {
  await InferenceGateway.handleListVoices(req, res);
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

// ── Videos (Official: https://docs.together.ai/reference/create-videos & get-videos-id)
router.post('/videos', async (req, res) => {
  await InferenceGateway.handleCreateVideo(req, res);
});

router.post('/v1/videos', async (req, res) => {
  await InferenceGateway.handleCreateVideo(req, res);
});

router.get('/videos/:id', async (req, res) => {
  await InferenceGateway.handleGetVideo(req, res);
});

router.get('/v1/videos/:id', async (req, res) => {
  await InferenceGateway.handleGetVideo(req, res);
});

// ── Code Interpreter (Official: https://docs.together.ai/reference/tci-execute & tci-sessions)
router.post('/tci/execute', async (req, res) => {
  await InferenceGateway.handleExecuteCode(req, res);
});

router.post('/v1/tci/execute', async (req, res) => {
  await InferenceGateway.handleExecuteCode(req, res);
});

router.get('/tci/sessions', async (req, res) => {
  await InferenceGateway.handleListCodeSessions(req, res);
});

router.get('/v1/tci/sessions', async (req, res) => {
  await InferenceGateway.handleListCodeSessions(req, res);
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

// ── Embeddings (Official: https://docs.together.ai/reference/embeddings) ────
router.post('/embeddings', async (req, res) => {
  await InferenceGateway.handleEmbeddings(req, res);
});

router.post('/v1/embeddings', async (req, res) => {
  await InferenceGateway.handleEmbeddings(req, res);
});

// ── Rerank (Official: https://docs.together.ai/reference/rerank) ────────────
router.post('/rerank', async (req, res) => {
  await InferenceGateway.handleRerank(req, res);
});

router.post('/v1/rerank', async (req, res) => {
  await InferenceGateway.handleRerank(req, res);
});

// ── Files (Official: https://docs.together.ai/reference/files & https://docs.together.ai/reference/upload-file)
const uploadFileRoutes = ['/files', '/v1/files', '/files/upload', '/v1/files/upload'];
uploadFileRoutes.forEach((path) => {
  router.post(path, datasetUploader.single('file'), async (req, res) => {
    await InferenceGateway.handleUploadFile(req, res);
  });
});

router.get('/files', async (req, res) => {
  await InferenceGateway.handleListFiles(req, res);
});

router.get('/v1/files', async (req, res) => {
  await InferenceGateway.handleListFiles(req, res);
});

router.get('/files/:id/content', async (req, res) => {
  await InferenceGateway.handleGetFileContent(req, res);
});

router.get('/v1/files/:id/content', async (req, res) => {
  await InferenceGateway.handleGetFileContent(req, res);
});

router.get('/files/:id', async (req, res) => {
  await InferenceGateway.handleGetFile(req, res);
});

router.get('/v1/files/:id', async (req, res) => {
  await InferenceGateway.handleGetFile(req, res);
});

router.delete('/files/:id', async (req, res) => {
  await InferenceGateway.handleDeleteFile(req, res);
});

router.delete('/v1/files/:id', async (req, res) => {
  await InferenceGateway.handleDeleteFile(req, res);
});

// ── Fine-Tuning (Official: https://docs.together.ai/reference/fine-tuning) ──
router.post('/fine-tunes', async (req, res) => {
  await InferenceGateway.handleCreateFineTune(req, res);
});

router.post('/v1/fine-tunes', async (req, res) => {
  await InferenceGateway.handleCreateFineTune(req, res);
});

router.post('/fine-tuning', async (req, res) => {
  await InferenceGateway.handleCreateFineTune(req, res);
});

router.post('/v1/fine-tuning', async (req, res) => {
  await InferenceGateway.handleCreateFineTune(req, res);
});

router.get('/fine-tunes', async (req, res) => {
  await InferenceGateway.handleListFineTunes(req, res);
});

router.get('/v1/fine-tunes', async (req, res) => {
  await InferenceGateway.handleListFineTunes(req, res);
});

router.get('/fine-tuning', async (req, res) => {
  await InferenceGateway.handleListFineTunes(req, res);
});

router.get('/v1/fine-tuning', async (req, res) => {
  await InferenceGateway.handleListFineTunes(req, res);
});

router.post('/fine-tunes/estimate-price', async (req, res) => {
  await InferenceGateway.handleEstimateFineTunePrice(req, res);
});

router.post('/v1/fine-tunes/estimate-price', async (req, res) => {
  await InferenceGateway.handleEstimateFineTunePrice(req, res);
});

router.get('/fine-tunes/models/limits', async (req, res) => {
  await InferenceGateway.handleGetFineTuneModelLimits(req, res);
});

router.get('/v1/fine-tunes/models/limits', async (req, res) => {
  await InferenceGateway.handleGetFineTuneModelLimits(req, res);
});

router.get('/fine-tunes/models/:model/limits', async (req, res) => {
  await InferenceGateway.handleGetFineTuneModelLimits(req, res);
});

router.get('/v1/fine-tunes/models/:model/limits', async (req, res) => {
  await InferenceGateway.handleGetFineTuneModelLimits(req, res);
});

router.get('/fine-tunes/:id/events', async (req, res) => {
  await InferenceGateway.handleListFineTuneEvents(req, res);
});

router.get('/v1/fine-tunes/:id/events', async (req, res) => {
  await InferenceGateway.handleListFineTuneEvents(req, res);
});

router.get('/fine-tunes/:id/checkpoints', async (req, res) => {
  await InferenceGateway.handleListFineTuneCheckpoints(req, res);
});

router.get('/v1/fine-tunes/:id/checkpoints', async (req, res) => {
  await InferenceGateway.handleListFineTuneCheckpoints(req, res);
});

router.get('/fine-tunes/:id/checkpoint', async (req, res) => {
  await InferenceGateway.handleListFineTuneCheckpoints(req, res);
});

router.get('/v1/fine-tunes/:id/checkpoint', async (req, res) => {
  await InferenceGateway.handleListFineTuneCheckpoints(req, res);
});

router.get('/fine-tunes/:id/metrics', async (req, res) => {
  await InferenceGateway.handleGetFineTuneMetrics(req, res);
});

router.get('/v1/fine-tunes/:id/metrics', async (req, res) => {
  await InferenceGateway.handleGetFineTuneMetrics(req, res);
});

router.get('/fine-tunes/:id/download', async (req, res) => {
  await InferenceGateway.handleDownloadFineTune(req, res);
});

router.get('/v1/fine-tunes/:id/download', async (req, res) => {
  await InferenceGateway.handleDownloadFineTune(req, res);
});

router.get('/fine-tunes/:id/download-tokenized-dataset', async (req, res) => {
  await InferenceGateway.handleDownloadTokenizedDataset(req, res);
});

router.get('/v1/fine-tunes/:id/download-tokenized-dataset', async (req, res) => {
  await InferenceGateway.handleDownloadTokenizedDataset(req, res);
});

router.post('/fine-tunes/:id/cancel', async (req, res) => {
  await InferenceGateway.handleCancelFineTune(req, res);
});

router.post('/v1/fine-tunes/:id/cancel', async (req, res) => {
  await InferenceGateway.handleCancelFineTune(req, res);
});

router.get('/fine-tunes/:id', async (req, res) => {
  await InferenceGateway.handleGetFineTune(req, res);
});

router.get('/v1/fine-tunes/:id', async (req, res) => {
  await InferenceGateway.handleGetFineTune(req, res);
});

router.delete('/fine-tunes/:id', async (req, res) => {
  await InferenceGateway.handleDeleteFineTune(req, res);
});

router.delete('/v1/fine-tunes/:id', async (req, res) => {
  await InferenceGateway.handleDeleteFineTune(req, res);
});

// ── Batches (Official: https://docs.together.ai/reference/batches) ──────────
router.post('/batches', async (req, res) => {
  await InferenceGateway.handleCreateBatch(req, res);
});

router.post('/v1/batches', async (req, res) => {
  await InferenceGateway.handleCreateBatch(req, res);
});

router.get('/batches', async (req, res) => {
  await InferenceGateway.handleListBatches(req, res);
});

router.get('/v1/batches', async (req, res) => {
  await InferenceGateway.handleListBatches(req, res);
});

router.post('/batches/:id/cancel', async (req, res) => {
  await InferenceGateway.handleCancelBatch(req, res);
});

router.post('/v1/batches/:id/cancel', async (req, res) => {
  await InferenceGateway.handleCancelBatch(req, res);
});

router.get('/batches/:id', async (req, res) => {
  await InferenceGateway.handleGetBatch(req, res);
});

router.get('/v1/batches/:id', async (req, res) => {
  await InferenceGateway.handleGetBatch(req, res);
});

// ── Dedicated Endpoints (Official: https://docs.together.ai/reference/endpoints)
router.post('/endpoints', async (req, res) => {
  await InferenceGateway.handleCreateEndpoint(req, res);
});

router.post('/v1/endpoints', async (req, res) => {
  await InferenceGateway.handleCreateEndpoint(req, res);
});

router.get('/endpoints', async (req, res) => {
  await InferenceGateway.handleListEndpoints(req, res);
});

router.get('/v1/endpoints', async (req, res) => {
  await InferenceGateway.handleListEndpoints(req, res);
});

router.get('/endpoints/hardware', async (req, res) => {
  await InferenceGateway.handleListHardware(req, res);
});

router.get('/v1/endpoints/hardware', async (req, res) => {
  await InferenceGateway.handleListHardware(req, res);
});

router.get('/endpoints/avzones', async (req, res) => {
  await InferenceGateway.handleListAvzones(req, res);
});

router.get('/v1/endpoints/avzones', async (req, res) => {
  await InferenceGateway.handleListAvzones(req, res);
});

router.get('/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleGetEndpoint(req, res);
});

router.get('/v1/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleGetEndpoint(req, res);
});

router.put('/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleUpdateEndpoint(req, res);
});

router.put('/v1/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleUpdateEndpoint(req, res);
});

router.patch('/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleUpdateEndpoint(req, res);
});

router.patch('/v1/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleUpdateEndpoint(req, res);
});

router.delete('/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleDeleteEndpoint(req, res);
});

router.delete('/v1/endpoints/:id', async (req, res) => {
  await InferenceGateway.handleDeleteEndpoint(req, res);
});

// ── Evaluations (Official: https://docs.together.ai/reference/evals) ────────
// 1. Create evaluation job (POST /evaluation, POST /evaluations, POST /evals & /v1/ aliases)
const createEvalRoutes = ['/evaluation', '/v1/evaluation', '/evaluations', '/v1/evaluations', '/evals', '/v1/evals'];
createEvalRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateEval(req, res);
  });
});

// 2. List evaluation models (GET /evaluation/model-list, GET /evaluations/models & aliases)
// Must be registered before /:id routes so 'models' and 'model-list' are not matched as IDs
const evalModelsRoutes = [
  '/evaluation/model-list',
  '/v1/evaluation/model-list',
  '/evaluation/models',
  '/v1/evaluation/models',
  '/evaluations/models',
  '/v1/evaluations/models',
  '/evals/models',
  '/v1/evals/models',
];
evalModelsRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListEvalModels(req, res);
  });
});

// 3. List all evaluation jobs (GET /evaluation, GET /evaluations, GET /evals & /v1/ aliases)
const listEvalRoutes = ['/evaluation', '/v1/evaluation', '/evaluations', '/v1/evaluations', '/evals', '/v1/evals'];
listEvalRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListEvals(req, res);
  });
});

// 4. Get evaluation job status (GET /evaluation/:id/status, GET /evaluations/:id/status & aliases)
const evalStatusRoutes = [
  '/evaluation/:id/status',
  '/v1/evaluation/:id/status',
  '/evaluations/:id/status',
  '/v1/evaluations/:id/status',
  '/evals/:id/status',
  '/v1/evals/:id/status',
];
evalStatusRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetEvalStatus(req, res);
  });
});

// 5. Get evaluation job details (GET /evaluation/:id, GET /evaluations/:id & aliases)
const getEvalRoutes = [
  '/evaluation/:id',
  '/v1/evaluation/:id',
  '/evaluations/:id',
  '/v1/evaluations/:id',
  '/evals/:id',
  '/v1/evals/:id',
];
getEvalRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetEval(req, res);
  });
});


// ── Desktop Integration Status ─────────────────────────────────────────────
router.get('/desktop/status', (req, res) => {
  const isConnected = DesktopGateway.clients.has('admin_user');
  res.json({ connected: isConnected });
});

export const inferenceRoutes = router;
export default router;
