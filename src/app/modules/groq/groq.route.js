import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import audioUploader from '../../middlewares/uploder/uploadAudio.js';
import { GroqController } from './groq.controller.js';

const router = express.Router();

// Public model catalog
router.get('/models', GroqController.listModels);

// Authenticated AI endpoints
router.post('/chat', auth(), GroqController.chat);
router.post('/stream', auth(), GroqController.streamChat);
router.post('/tools', auth(), GroqController.toolCall);

// Speech-to-Text via Whisper Large V3 Turbo
router.post('/audio/transcribe', auth(), audioUploader.single('file'), GroqController.transcribeAudio);
router.post('/audio/translate', auth(), audioUploader.single('file'), GroqController.translateAudio);

// Light model (gpt-oss-20b) — fast classification, evaluation, simple tasks
router.post('/light/chat', auth(), GroqController.lightChat);
router.post('/light/stream', auth(), GroqController.lightStream);

export const GroqRoutes = router;
export default GroqRoutes;
