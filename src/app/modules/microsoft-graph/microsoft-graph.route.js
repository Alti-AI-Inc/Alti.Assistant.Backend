import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { MicrosoftGraphController } from './microsoft-graph.controller.js';

const router = express.Router();

router.get('/auth-url', auth(), MicrosoftGraphController.getAuthUrl);
router.post('/callback', auth(), MicrosoftGraphController.handleCallback);
router.get('/recent-files', auth(), MicrosoftGraphController.getRecentFiles);
router.post('/teams/message', auth(), MicrosoftGraphController.sendTeamsMessage);

export const MicrosoftGraphRoutes = router;
