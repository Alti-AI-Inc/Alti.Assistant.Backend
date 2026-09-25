import { Router } from 'express';
import { logger } from '../../shared/logger.js';

export const healthRouter = Router();

healthRouter.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

healthRouter.get('/readiness', (req, res) => {
  // Simulate checking DB connections
  res.status(200).json({ status: 'READY' });
});
