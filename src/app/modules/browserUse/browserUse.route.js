import express from 'express';
import { BrowserUseController } from './browserUse.controller.js';
// import auth from '../../middlewares/auth/auth.js';


const router = express.Router();

router.post('/task', BrowserUseController.runTaskController);
router.get('/status/:sessionId/:taskId', BrowserUseController.getTaskStatusController);

// --- NEW HISTORY ROUTES ---

router.get('/sessions/:userId', BrowserUseController.getUserSessionsController);
router.get('/session/:sessionId/:userId', BrowserUseController.getSessionByIdController);




export const browserUseAiRoutes = router;