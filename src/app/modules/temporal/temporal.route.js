import express from 'express';
import { TemporalController } from './temporal.controller.js';

const router = express.Router();

router.get('/repositories', TemporalController.getRepositories);
router.get('/stats', TemporalController.getStats);
router.post('/sync', TemporalController.syncCatalog);

export const temporalRoutes = router;
