import express from 'express';
import { SwarmController } from './swarm.controller.js';

const router = express.Router();

// Expose POST endpoint for SSE collaborative agent swarm stream
router.post('/stream', SwarmController.performSwarmStreamingSearch);

export const SwarmRoutes = router;
