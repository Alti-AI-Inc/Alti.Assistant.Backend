import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import audioUploader from '../../middlewares/uploder/uploadAudio.js';
import { LlmController } from './llm.controller.js';

const router = express.Router();

// Public model catalog
router.get('/models', LlmController.listModels);
router.get('/models/:modelId', LlmController.getModel);

// Authenticated AI endpoints
router.post('/chat', auth(), LlmController.chat);
router.post('/stream', auth(), LlmController.streamChat);
router.post('/tools', auth(), LlmController.toolCall);

// Speech-to-Text via Whisper Large V3 Turbo
router.post('/audio/transcribe', auth(), audioUploader.single('file'), LlmController.transcribeAudio);
router.post('/audio/translate', auth(), audioUploader.single('file'), LlmController.translateAudio);

// Text-to-Speech (TTS) via Orpheus
router.post('/audio/speech', auth(), LlmController.textToSpeech);

// Embeddings
router.post('/embeddings', auth(), LlmController.createEmbedding);

// Light model (gpt-oss-20b) — fast classification, evaluation, simple tasks
router.post('/light/chat', auth(), LlmController.lightChat);
router.post('/light/stream', auth(), LlmController.lightStream);

// Batches — async batch processing
router.post('/batches', auth(), LlmController.createBatch);
router.get('/batches', auth(), LlmController.listBatches);
router.get('/batches/:batchId', auth(), LlmController.getBatch);
router.post('/batches/:batchId/cancel', auth(), LlmController.cancelBatch);

// Files — upload/manage files for batch processing
router.post('/files', auth(), audioUploader.single('file'), LlmController.uploadFile);
router.get('/files', auth(), LlmController.listFiles);
router.get('/files/:fileId', auth(), LlmController.getFile);
router.delete('/files/:fileId', auth(), LlmController.deleteFile);
router.get('/files/:fileId/content', auth(), LlmController.getFileContent);

export const LlmRoutes = router;
export default LlmRoutes;
