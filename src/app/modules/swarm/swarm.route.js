import express from 'express';
import { SwarmController } from './swarm.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Expose POST endpoint for SSE collaborative agent swarm stream with optional JWT verification
router.post('/stream', optionalAuth(), SwarmController.performSwarmStreamingSearch);

export const SwarmRoutes = router;
