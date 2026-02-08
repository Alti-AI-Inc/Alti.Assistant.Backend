import express from 'express';
import auth from '../../middlewares/auth.js';
import { GoogleWorkspaceController } from './google-workspace.controller.js';

const router = express.Router();

router.get('/auth-url', auth(), GoogleWorkspaceController.getAuthUrl);
router.post('/callback', auth(), GoogleWorkspaceController.handleCallback);
router.get('/files', auth(), GoogleWorkspaceController.listFiles);
router.get('/doc/:fileId', auth(), GoogleWorkspaceController.getDocContent);

export const GoogleWorkspaceRoutes = router;
