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
    if (req.query?.projectId || req.query?.visibility || req.query?.organizationId) {
      return await InferenceGateway.handleListCustomModels(req, res);
    }
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

// ── Dedicated Model Inference (DMI) (Official: https://docs.together.ai/reference/dmi/endpoints-list)
const createEndpointRoutes = [
  '/endpoints',
  '/v1/endpoints',
  '/projects/:projectId/endpoints',
  '/v1/projects/:projectId/endpoints',
];
createEndpointRoutes.forEach((p) => {
  router.post(p, async (req, res) => {
    await InferenceGateway.handleCreateEndpoint(req, res);
  });
});

const listEndpointRoutes = [
  '/endpoints',
  '/v1/endpoints',
  '/projects/:projectId/endpoints',
  '/v1/projects/:projectId/endpoints',
];
listEndpointRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListEndpoints(req, res);
  });
});

const hardwareRoutes = [
  '/endpoints/hardware',
  '/v1/endpoints/hardware',
];
hardwareRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListHardware(req, res);
  });
});

const avzonesRoutes = [
  '/endpoints/avzones',
  '/v1/endpoints/avzones',
];
avzonesRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListAvzones(req, res);
  });
});

// Organization scoped endpoints (Mounted BEFORE /endpoints/:id to avoid parameter swallowing)
const orgEndpointRoutes = [
  '/endpoints/organization',
  '/v1/endpoints/organization',
  '/endpoints/org',
  '/v1/endpoints/org',
  '/endpoints/organization/:organizationId',
  '/v1/endpoints/organization/:organizationId',
  '/organizations/:organizationId/endpoints',
  '/v1/organizations/:organizationId/endpoints',
];
orgEndpointRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListOrgEndpoints(req, res);
  });
});

// Endpoint events
const endpointEventsRoutes = [
  '/endpoints/:id/events',
  '/v1/endpoints/:id/events',
  '/projects/:projectId/endpoints/:id/events',
  '/v1/projects/:projectId/endpoints/:id/events',
];
endpointEventsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListEndpointEvents(req, res);
  });
});

// Endpoint analytics
const endpointAnalyticsRoutes = [
  '/endpoints/:id/analytics',
  '/v1/endpoints/:id/analytics',
  '/projects/:projectId/endpoints/:id/analytics',
  '/v1/projects/:projectId/endpoints/:id/analytics',
];
endpointAnalyticsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleGetEndpointAnalytics(req, res);
  });
});

// Endpoint retrieve
const getEndpointRoutes = [
  '/endpoints/:id',
  '/v1/endpoints/:id',
  '/projects/:projectId/endpoints/:id',
  '/v1/projects/:projectId/endpoints/:id',
];
getEndpointRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleGetEndpoint(req, res);
  });
});

// Endpoint update (PUT and PATCH)
const updateEndpointRoutes = [
  '/endpoints/:id',
  '/v1/endpoints/:id',
  '/projects/:projectId/endpoints/:id',
  '/v1/projects/:projectId/endpoints/:id',
];
updateEndpointRoutes.forEach((p) => {
  router.put(p, async (req, res) => {
    await InferenceGateway.handleUpdateEndpoint(req, res);
  });
  router.patch(p, async (req, res) => {
    await InferenceGateway.handleUpdateEndpoint(req, res);
  });
});

// Endpoint delete
const deleteEndpointRoutes = [
  '/endpoints/:id',
  '/v1/endpoints/:id',
  '/projects/:projectId/endpoints/:id',
  '/v1/projects/:projectId/endpoints/:id',
];
deleteEndpointRoutes.forEach((p) => {
  router.delete(p, async (req, res) => {
    await InferenceGateway.handleDeleteEndpoint(req, res);
  });
});

// ── Dedicated Model Inference (DMI) - Models, Uploads & Configs ──────────
// Official Reference: https://docs.together.ai/reference/dmi/supported-models-list

// 1. Supported Models
const listSupportedModelsRoutes = ['/supported-models', '/v1/supported-models'];
listSupportedModelsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListSupportedModels(req, res);
  });
});

const getSupportedModelRoutes = ['/supported-models/:id', '/v1/supported-models/:id'];
getSupportedModelRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleGetSupportedModel(req, res);
  });
});

// 2. Organization Scoped Models (Mounted BEFORE /models/:id)
const orgModelRoutes = [
  '/models/organization',
  '/v1/models/organization',
  '/models/org',
  '/v1/models/org',
  '/models/organization/:organizationId',
  '/v1/models/organization/:organizationId',
  '/organizations/:organizationId/models',
  '/v1/organizations/:organizationId/models',
];
orgModelRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListOrgModels(req, res);
  });
});

// 3. Remote Model Uploads (Mounted BEFORE /models/:id)
const createModelUploadRoutes = [
  '/models/uploads',
  '/v1/models/uploads',
  '/projects/:projectId/models/uploads',
  '/v1/projects/:projectId/models/uploads',
];
createModelUploadRoutes.forEach((p) => {
  router.post(p, async (req, res) => {
    await InferenceGateway.handleCreateModelUpload(req, res);
  });
});

const listModelUploadsRoutes = [
  '/models/uploads',
  '/v1/models/uploads',
  '/projects/:projectId/models/uploads',
  '/v1/projects/:projectId/models/uploads',
];
listModelUploadsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListModelUploads(req, res);
  });
});

const modelUploadEventsRoutes = [
  '/models/uploads/:id/events',
  '/v1/models/uploads/:id/events',
  '/projects/:projectId/models/uploads/:id/events',
  '/v1/projects/:projectId/models/uploads/:id/events',
];
modelUploadEventsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListModelUploadEvents(req, res);
  });
});

const getModelUploadRoutes = [
  '/models/uploads/:id',
  '/v1/models/uploads/:id',
  '/projects/:projectId/models/uploads/:id',
  '/v1/projects/:projectId/models/uploads/:id',
];
getModelUploadRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleGetModelUpload(req, res);
  });
});

// 4. Project Models Sub-resources (Files & Revisions - Mounted BEFORE /models/:id)
const modelFilesRoutes = [
  '/models/:id/files',
  '/v1/models/:id/files',
  '/projects/:projectId/models/:id/files',
  '/v1/projects/:projectId/models/:id/files',
];
modelFilesRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListCustomModelFiles(req, res);
  });
});

const modelRevisionsRoutes = [
  '/models/:id/revisions',
  '/v1/models/:id/revisions',
  '/projects/:projectId/models/:id/revisions',
  '/v1/projects/:projectId/models/:id/revisions',
];
modelRevisionsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListCustomModelRevisions(req, res);
  });
});

// 5. Project Models CRUD
const createCustomModelRoutes = [
  '/models',
  '/v1/models',
  '/projects/:projectId/models',
  '/v1/projects/:projectId/models',
];
createCustomModelRoutes.forEach((p) => {
  router.post(p, async (req, res) => {
    await InferenceGateway.handleCreateCustomModel(req, res);
  });
});

const listProjectModelsRoutes = [
  '/projects/:projectId/models',
  '/v1/projects/:projectId/models',
];
listProjectModelsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListCustomModels(req, res);
  });
});

const getCustomModelRoutes = [
  '/models/:id',
  '/v1/models/:id',
  '/projects/:projectId/models/:id',
  '/v1/projects/:projectId/models/:id',
];
getCustomModelRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleGetCustomModel(req, res);
  });
});

const updateCustomModelRoutes = [
  '/models/:id',
  '/v1/models/:id',
  '/projects/:projectId/models/:id',
  '/v1/projects/:projectId/models/:id',
];
updateCustomModelRoutes.forEach((p) => {
  router.put(p, async (req, res) => {
    await InferenceGateway.handleUpdateCustomModel(req, res);
  });
  router.patch(p, async (req, res) => {
    await InferenceGateway.handleUpdateCustomModel(req, res);
  });
});

const deleteCustomModelRoutes = [
  '/models/:id',
  '/v1/models/:id',
  '/projects/:projectId/models/:id',
  '/v1/projects/:projectId/models/:id',
];
deleteCustomModelRoutes.forEach((p) => {
  router.delete(p, async (req, res) => {
    await InferenceGateway.handleDeleteCustomModel(req, res);
  });
});

// 6. Model Configurations (Configs)
const listConfigsRoutes = [
  '/configs',
  '/v1/configs',
  '/projects/:projectId/configs',
  '/v1/projects/:projectId/configs',
];
listConfigsRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleListModelConfigs(req, res);
  });
});

const getConfigRoutes = [
  '/configs/:id',
  '/v1/configs/:id',
  '/projects/:projectId/configs/:id',
  '/v1/projects/:projectId/configs/:id',
];
getConfigRoutes.forEach((p) => {
  router.get(p, async (req, res) => {
    await InferenceGateway.handleGetModelConfig(req, res);
  });
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

// ── GPU Clusters (Official: https://docs.together.ai/reference/clusters) ────
// 1. Create cluster (POST /compute/clusters, POST /clusters & /v1/ aliases)
const createClusterRoutes = ['/compute/clusters', '/v1/compute/clusters', '/clusters', '/v1/clusters'];
createClusterRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateCluster(req, res);
  });
});

// 2. List cluster regions (GET /compute/regions & aliases - registered before /:id)
const clusterRegionsRoutes = ['/compute/regions', '/v1/compute/regions', '/clusters/regions', '/v1/clusters/regions'];
clusterRegionsRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListClusterRegions(req, res);
  });
});

// 3. List all GPU clusters (GET /compute/clusters, GET /clusters & /v1/ aliases)
const listClusterRoutes = ['/compute/clusters', '/v1/compute/clusters', '/clusters', '/v1/clusters'];
listClusterRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListClusters(req, res);
  });
});

// ── GPU Cluster Shared Storage Volumes (Official: https://docs.together.ai/reference/clusters_storages)
// Must be registered before /compute/clusters/:id so 'storage' is not matched as a cluster ID
const createStorageRoutes = [
  '/compute/clusters/storage/volumes',
  '/v1/compute/clusters/storage/volumes',
  '/clusters/storage/volumes',
  '/v1/clusters/storage/volumes',
  '/clusters_storages',
  '/v1/clusters_storages',
  '/clusters/storage',
  '/v1/clusters/storage',
];
createStorageRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateClusterStorage(req, res);
  });
});

const listStorageRoutes = [
  '/compute/clusters/storage/volumes',
  '/v1/compute/clusters/storage/volumes',
  '/clusters/storage/volumes',
  '/v1/clusters/storage/volumes',
  '/clusters_storages',
  '/v1/clusters_storages',
  '/clusters/storage',
  '/v1/clusters/storage',
];
listStorageRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListClusterStorages(req, res);
  });
});

const getStorageRoutes = [
  '/compute/clusters/storage/volumes/:id',
  '/v1/compute/clusters/storage/volumes/:id',
  '/clusters/storage/volumes/:id',
  '/v1/clusters/storage/volumes/:id',
  '/clusters_storages/:id',
  '/v1/clusters_storages/:id',
  '/clusters/storage/:id',
  '/v1/clusters/storage/:id',
];
getStorageRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetClusterStorage(req, res);
  });
});

const updateStorageRoutes = [
  '/compute/clusters/storage/volumes',
  '/v1/compute/clusters/storage/volumes',
  '/compute/clusters/storage/volumes/:id',
  '/v1/compute/clusters/storage/volumes/:id',
  '/clusters/storage/volumes/:id',
  '/v1/clusters/storage/volumes/:id',
  '/clusters_storages/:id',
  '/v1/clusters_storages/:id',
  '/clusters/storage/:id',
  '/v1/clusters/storage/:id',
];
updateStorageRoutes.forEach((path) => {
  router.put(path, async (req, res) => {
    await InferenceGateway.handleUpdateClusterStorage(req, res);
  });
  router.patch(path, async (req, res) => {
    await InferenceGateway.handleUpdateClusterStorage(req, res);
  });
});

const deleteStorageRoutes = [
  '/compute/clusters/storage/volumes/:id',
  '/v1/compute/clusters/storage/volumes/:id',
  '/clusters/storage/volumes/:id',
  '/v1/clusters/storage/volumes/:id',
  '/clusters_storages/:id',
  '/v1/clusters_storages/:id',
  '/clusters/storage/:id',
  '/v1/clusters/storage/:id',
];
deleteStorageRoutes.forEach((path) => {
  router.delete(path, async (req, res) => {
    await InferenceGateway.handleDeleteClusterStorage(req, res);
  });
});

// 4. Get GPU cluster details (GET /compute/clusters/:id, GET /clusters/:id & /v1/ aliases)
const getClusterRoutes = ['/compute/clusters/:id', '/v1/compute/clusters/:id', '/clusters/:id', '/v1/clusters/:id'];
getClusterRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetCluster(req, res);
  });
});

// 5. Update GPU cluster configuration (PUT /compute/clusters/:id & PATCH & /v1/ aliases)
const updateClusterRoutes = ['/compute/clusters/:id', '/v1/compute/clusters/:id', '/clusters/:id', '/v1/clusters/:id'];
updateClusterRoutes.forEach((path) => {
  router.put(path, async (req, res) => {
    await InferenceGateway.handleUpdateCluster(req, res);
  });
  router.patch(path, async (req, res) => {
    await InferenceGateway.handleUpdateCluster(req, res);
  });
});

// 6. Delete GPU cluster (DELETE /compute/clusters/:id, DELETE /clusters/:id & /v1/ aliases)
const deleteClusterRoutes = ['/compute/clusters/:id', '/v1/compute/clusters/:id', '/clusters/:id', '/v1/clusters/:id'];
deleteClusterRoutes.forEach((path) => {
  router.delete(path, async (req, res) => {
    await InferenceGateway.handleDeleteCluster(req, res);
  });
});

// ── Cluster Remediations (Official: https://docs.together.ai/reference/remediation)
// 1. Create remediation (POST)
const createRemediationRoutes = [
  '/compute/clusters/:cluster_id/instances/:instance_id/remediations',
  '/v1/compute/clusters/:cluster_id/instances/:instance_id/remediations',
  '/clusters/:cluster_id/instances/:instance_id/remediations',
  '/v1/clusters/:cluster_id/instances/:instance_id/remediations',
  '/remediations',
  '/v1/remediations',
];
createRemediationRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateRemediation(req, res);
  });
});

// 2. List remediations (GET)
const listRemediationRoutes = [
  '/compute/clusters/:cluster_id/instances/:instance_id/remediations',
  '/v1/compute/clusters/:cluster_id/instances/:instance_id/remediations',
  '/clusters/:cluster_id/instances/:instance_id/remediations',
  '/v1/clusters/:cluster_id/instances/:instance_id/remediations',
  '/remediations',
  '/v1/remediations',
];
listRemediationRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListRemediations(req, res);
  });
});

// 3. Approve remediation (POST .../approve)
const approveRemediationRoutes = [
  '/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/approve',
  '/v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/approve',
  '/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/approve',
  '/v1/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/approve',
  '/remediations/:id/approve',
  '/v1/remediations/:id/approve',
];
approveRemediationRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleApproveRemediation(req, res);
  });
});

// 4. Cancel remediation (POST .../cancel)
const cancelRemediationRoutes = [
  '/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/cancel',
  '/v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/cancel',
  '/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/cancel',
  '/v1/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/cancel',
  '/remediations/:id/cancel',
  '/v1/remediations/:id/cancel',
];
cancelRemediationRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCancelRemediation(req, res);
  });
});

// 5. Reject remediation (POST .../reject)
const rejectRemediationRoutes = [
  '/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/reject',
  '/v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/reject',
  '/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/reject',
  '/v1/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id/reject',
  '/remediations/:id/reject',
  '/v1/remediations/:id/reject',
];
rejectRemediationRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleRejectRemediation(req, res);
  });
});

// 6. Get remediation details (GET)
const getRemediationRoutes = [
  '/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id',
  '/v1/compute/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id',
  '/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id',
  '/v1/clusters/:cluster_id/instances/:instance_id/remediations/:remediation_id',
  '/remediations/:id',
  '/v1/remediations/:id',
];
getRemediationRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetRemediation(req, res);
  });
});

// ── Together.ai Deployments (Official: https://docs.together.ai/reference/deployments)
// 1. List deployments (GET /deployments & /v1/deployments)
const listDeploymentRoutes = ['/deployments', '/v1/deployments'];
listDeploymentRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListDeployments(req, res);
  });
});

// 2. Create deployment (POST /deployments & /v1/deployments)
const createDeploymentRoutes = ['/deployments', '/v1/deployments'];
createDeploymentRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateDeployment(req, res);
  });
});

// 3. Deployment logs (GET /deployments/:id/logs & /v1/deployments/:id/logs)
const deploymentLogsRoutes = ['/deployments/:id/logs', '/v1/deployments/:id/logs'];
deploymentLogsRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetDeploymentLogs(req, res);
  });
});

// ── Together.ai Deployment Secrets (Official: https://docs.together.ai/reference/deployments-secrets)
// 1. List secrets (GET /deployments/secrets & /v1/deployments/secrets)
const listSecretsRoutes = ['/deployments/secrets', '/v1/deployments/secrets'];
listSecretsRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListSecrets(req, res);
  });
});

// 2. Create secret (POST /deployments/secrets & /v1/deployments/secrets)
const createSecretRoutes = ['/deployments/secrets', '/v1/deployments/secrets'];
createSecretRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateSecret(req, res);
  });
});

// 3. Retrieve secret (GET /deployments/secrets/:id & /v1/deployments/secrets/:id)
const getSecretRoutes = ['/deployments/secrets/:id', '/v1/deployments/secrets/:id'];
getSecretRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetSecret(req, res);
  });
});

// 4. Update secret (PATCH /deployments/secrets/:id, PUT, POST & /v1/ aliases)
const updateSecretRoutes = ['/deployments/secrets/:id', '/v1/deployments/secrets/:id'];
updateSecretRoutes.forEach((path) => {
  router.patch(path, async (req, res) => {
    await InferenceGateway.handleUpdateSecret(req, res);
  });
  router.put(path, async (req, res) => {
    await InferenceGateway.handleUpdateSecret(req, res);
  });
  router.post(path, async (req, res) => {
    await InferenceGateway.handleUpdateSecret(req, res);
  });
});

// 5. Delete secret (DELETE /deployments/secrets/:id & /v1/deployments/secrets/:id)
const deleteSecretRoutes = ['/deployments/secrets/:id', '/v1/deployments/secrets/:id'];
deleteSecretRoutes.forEach((path) => {
  router.delete(path, async (req, res) => {
    await InferenceGateway.handleDeleteSecret(req, res);
  });
});

// ── Together.ai Deployments Storage & Volumes (Official: https://docs.together.ai/reference/deployments-storage)
// 1. List volumes (GET /deployments/storage/volumes & /v1/deployments/storage/volumes)
const listDeploymentVolumeRoutes = ['/deployments/storage/volumes', '/v1/deployments/storage/volumes'];
listDeploymentVolumeRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListDeploymentVolumes(req, res);
  });
});

// 2. Create volume (POST /deployments/storage/volumes & /v1/deployments/storage/volumes)
const createDeploymentVolumeRoutes = ['/deployments/storage/volumes', '/v1/deployments/storage/volumes'];
createDeploymentVolumeRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCreateDeploymentVolume(req, res);
  });
});

// 3. Retrieve volume (GET /deployments/storage/volumes/:id & /v1/deployments/storage/volumes/:id)
const getDeploymentVolumeRoutes = ['/deployments/storage/volumes/:id', '/v1/deployments/storage/volumes/:id'];
getDeploymentVolumeRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetDeploymentVolume(req, res);
  });
});

// 4. Update volume (PATCH /deployments/storage/volumes/:id, PUT, POST & /v1/ aliases)
const updateDeploymentVolumeRoutes = ['/deployments/storage/volumes/:id', '/v1/deployments/storage/volumes/:id'];
updateDeploymentVolumeRoutes.forEach((path) => {
  router.patch(path, async (req, res) => {
    await InferenceGateway.handleUpdateDeploymentVolume(req, res);
  });
  router.put(path, async (req, res) => {
    await InferenceGateway.handleUpdateDeploymentVolume(req, res);
  });
  router.post(path, async (req, res) => {
    await InferenceGateway.handleUpdateDeploymentVolume(req, res);
  });
});

// 5. Delete volume (DELETE /deployments/storage/volumes/:id & /v1/deployments/storage/volumes/:id)
const deleteDeploymentVolumeRoutes = ['/deployments/storage/volumes/:id', '/v1/deployments/storage/volumes/:id'];
deleteDeploymentVolumeRoutes.forEach((path) => {
  router.delete(path, async (req, res) => {
    await InferenceGateway.handleDeleteDeploymentVolume(req, res);
  });
});

// 6. Download storage file (GET /deployments/storage/:filename & /v1/deployments/storage/:filename)
const getDeploymentStorageFileRoutes = ['/deployments/storage/:filename', '/v1/deployments/storage/:filename'];
getDeploymentStorageFileRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetDeploymentStorageFile(req, res);
  });
});

// 4. Retrieve deployment (GET /deployments/:id & /v1/deployments/:id)
const getDeploymentRoutes = ['/deployments/:id', '/v1/deployments/:id'];
getDeploymentRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetDeployment(req, res);
  });
});

// 5. Update deployment (PATCH /deployments/:id, PUT, POST & /v1/ aliases)
const updateDeploymentRoutes = ['/deployments/:id', '/v1/deployments/:id'];
updateDeploymentRoutes.forEach((path) => {
  router.patch(path, async (req, res) => {
    await InferenceGateway.handleUpdateDeployment(req, res);
  });
  router.put(path, async (req, res) => {
    await InferenceGateway.handleUpdateDeployment(req, res);
  });
  router.post(path, async (req, res) => {
    await InferenceGateway.handleUpdateDeployment(req, res);
  });
});

// 6. Delete deployment (DELETE /deployments/:id & /v1/deployments/:id)
const deleteDeploymentRoutes = ['/deployments/:id', '/v1/deployments/:id'];
deleteDeploymentRoutes.forEach((path) => {
  router.delete(path, async (req, res) => {
    await InferenceGateway.handleDeleteDeployment(req, res);
  });
});

// ── Together.ai Queue Suite (Official: https://docs.together.ai/reference/queue)
// 1. Submit queued job (POST /queue/submit & /v1/queue/submit)
const submitQueueRoutes = ['/queue/submit', '/v1/queue/submit'];
submitQueueRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleSubmitQueueJob(req, res);
  });
});

// 2. Poll job status (GET /queue/status & /v1/queue/status)
const getQueueStatusRoutes = ['/queue/status', '/v1/queue/status'];
getQueueStatusRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetQueueJobStatus(req, res);
  });
});

// 3. Cancel queued job (POST /queue/cancel & /v1/queue/cancel)
const cancelQueueRoutes = ['/queue/cancel', '/v1/queue/cancel'];
cancelQueueRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleCancelQueueJob(req, res);
  });
});

// 4. Clear model queue (POST /queue/clear & /v1/queue/clear)
const clearQueueRoutes = ['/queue/clear', '/v1/queue/clear'];
clearQueueRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleClearQueue(req, res);
  });
});

// 5. Get queue metrics (GET /queue/metrics & /v1/queue/metrics)
const getQueueMetricsRoutes = ['/queue/metrics', '/v1/queue/metrics'];
getQueueMetricsRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetQueueMetrics(req, res);
  });
});

// ── Together.ai Account & Identity (Official: https://docs.together.ai/reference/whoami)
const whoamiRoutes = ['/whoami', '/v1/whoami'];
whoamiRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleWhoami(req, res);
  });
});

// ── Together.ai Billing Usage (Official: https://docs.together.ai/reference/billing-usage)
const billingUsageRoutes = ['/billing/usage', '/v1/billing/usage'];
billingUsageRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetBillingUsage(req, res);
  });
});

// ── Together.ai Error Codes & Diagnostics (Official: https://docs.together.ai/docs/error-codes)
const errorCodesRoutes = ['/together/error-codes', '/v1/together/error-codes', '/error-codes', '/v1/error-codes'];
errorCodesRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleListErrorCodes(req, res);
  });
});

const errorCodeDetailRoutes = ['/together/error-codes/:code', '/v1/together/error-codes/:code', '/error-codes/:code', '/v1/error-codes/:code'];
errorCodeDetailRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetErrorCode(req, res);
  });
});

const diagnoseErrorRoutes = ['/together/diagnose-error', '/v1/together/diagnose-error', '/diagnose-error', '/v1/diagnose-error'];
diagnoseErrorRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleDiagnoseError(req, res);
  });
});

// ── Together.ai CLI Suite Execution & Telemetry (Official: https://docs.together.ai/reference/cli)
const executeCliRoutes = ['/together/cli/execute', '/v1/together/cli/execute', '/cli/execute', '/v1/cli/execute'];
executeCliRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleExecuteCliCommand(req, res);
  });
});

const getCliTelemetryRoutes = ['/together/cli/telemetry', '/v1/together/cli/telemetry', '/cli/telemetry', '/v1/cli/telemetry'];
getCliTelemetryRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetCliTelemetry(req, res);
  });
});

const updateCliTelemetryRoutes = ['/together/cli/telemetry', '/v1/together/cli/telemetry', '/cli/telemetry', '/v1/cli/telemetry'];
updateCliTelemetryRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleUpdateCliTelemetry(req, res);
  });
});

// ── Together.ai Framework Integrations (Composio, CrewAI, LangGraph, DSPy, PydanticAI, AutoGen, Agno, Intro)
const getFrameworksDocsRoutes = [
  '/together/frameworks/docs',
  '/v1/together/frameworks/docs',
  '/frameworks/docs',
  '/v1/frameworks/docs',
];
getFrameworksDocsRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetFrameworksDocs(req, res);
  });
});

const getFrameworkDocDetailRoutes = [
  '/together/frameworks/docs/:framework',
  '/v1/together/frameworks/docs/:framework',
  '/frameworks/docs/:framework',
  '/v1/frameworks/docs/:framework',
];
getFrameworkDocDetailRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetFrameworkDoc(req, res);
  });
});

const executeFrameworkRoutes = [
  '/together/frameworks/execute',
  '/v1/together/frameworks/execute',
  '/frameworks/execute',
  '/v1/frameworks/execute',
];
executeFrameworkRoutes.forEach((path) => {
  router.post(path, async (req, res) => {
    await InferenceGateway.handleExecuteFrameworkAgent(req, res);
  });
});

const getFrameworkConfigRoutes = [
  '/together/frameworks/config',
  '/v1/together/frameworks/config',
  '/frameworks/config',
  '/v1/frameworks/config',
];
getFrameworkConfigRoutes.forEach((path) => {
  router.get(path, async (req, res) => {
    await InferenceGateway.handleGetFrameworksConfig(req, res);
  });
});

// ── Desktop Integration Status ─────────────────────────────────────────────
router.get('/desktop/status', (req, res) => {
  const isConnected = DesktopGateway.clients.has('admin_user');
  res.json({ connected: isConnected });
});

export const inferenceRoutes = router;
export default router;
