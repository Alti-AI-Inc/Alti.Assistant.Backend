import express from 'express';
import { RealtimeController } from './realtime.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// REST endpoints for WebSocket config (used by frontend to get connection params)
router.get('/tts-config', auth(), RealtimeController.getTTSConfig);
router.get('/stt-config', auth(), RealtimeController.getSTTConfig);

export default router;
export { RealtimeController };
