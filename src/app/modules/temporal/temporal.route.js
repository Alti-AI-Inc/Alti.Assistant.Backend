import express from 'express';
import { TemporalController } from './temporal.controller.js';
import auth from '../../middlewares/auth/auth.js';

const router = express.Router();

// All Temporal endpoints are strictly secured under JWT authorization
router.get('/repositories', auth(), TemporalController.getRepositories);
router.get('/stats', auth(), TemporalController.getStats);
router.post('/sync', auth(), TemporalController.syncCatalog);

export const temporalRoutes = router;
