import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import audioUploader from '../../middlewares/uploder/uploadAudio.js';
import { GroqController } from './groq.controller.js';

const router = express.Router();

// Public model catalog
router.get('/models', GroqController.listModels);
router.get('/models/:modelId', GroqController.getModel);

// Authenticated AI endpoints
router.post('/chat', auth(), GroqController.chat);
router.post('/stream', auth(), GroqController.streamChat);
router.post('/tools', auth(), GroqController.toolCall);

// Speech-to-Text via Whisper Large V3 Turbo
router.post('/audio/transcribe', auth(), audioUploader.single('file'), GroqController.transcribeAudio);
router.post('/audio/translate', auth(), audioUploader.single('file'), GroqController.translateAudio);

// Text-to-Speech (TTS) via Orpheus
router.post('/audio/speech', auth(), GroqController.textToSpeech);

// Embeddings
router.post('/embeddings', auth(), GroqController.createEmbedding);

// Light model (gpt-oss-20b) — fast classification, evaluation, simple tasks
router.post('/light/chat', auth(), GroqController.lightChat);
router.post('/light/stream', auth(), GroqController.lightStream);

// Batches — async batch processing
router.post('/batches', auth(), GroqController.createBatch);
router.get('/batches', auth(), GroqController.listBatches);
router.get('/batches/:batchId', auth(), GroqController.getBatch);
router.post('/batches/:batchId/cancel', auth(), GroqController.cancelBatch);

// Files — upload/manage files for batch processing
router.post('/files', auth(), audioUploader.single('file'), GroqController.uploadFile);
router.get('/files', auth(), GroqController.listFiles);
router.get('/files/:fileId', auth(), GroqController.getFile);
router.delete('/files/:fileId', auth(), GroqController.deleteFile);
router.get('/files/:fileId/content', auth(), GroqController.getFileContent);

export const GroqRoutes = router;
export default GroqRoutes;
