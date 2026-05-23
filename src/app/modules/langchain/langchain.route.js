import express from 'express';
import { LangchainController } from './langchain.controller.js';

const router = express.Router();

router.get('/repositories', LangchainController.getRepositories);
router.get('/stats', LangchainController.getStats);
router.post('/import', LangchainController.importSubmodule);

export const langchainRoutes = router;
