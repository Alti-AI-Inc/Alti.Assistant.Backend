/**
 * @fileoverview Search Agent microservice entry point.
 * Express server with MongoDB connection, internal auth, health checks,
 * and graceful shutdown for Cloud Run deployment.
 */

import express from 'express';
import cors from 'cors';

import config from '../../shared/config/index.js';
import { createLogger } from '../../shared/logging/index.js';
import { connectDB, disconnectDB, isHealthy } from '../../shared/db/index.js';
import internalRouter from './src/routes/internal.route.js';

const { logger } = createLogger('agent-search');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbHealthy = await isHealthy();
  const status = dbHealthy ? 'ok' : 'degraded';
  res.status(dbHealthy ? 200 : 503).json({
    status,
    agent: 'search',
    timestamp: new Date().toISOString(),
    db: dbHealthy ? 'connected' : 'disconnected',
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/', internalRouter);

// ── Startup ──────────────────────────────────────────────────────────────────
const PORT = config.port || 8080;

async function start() {
  try {
    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected.');

    app.listen(PORT, () => {
      logger.info(`Search Agent listening on port ${PORT}`, {
        env: config.env,
        port: PORT,
      });
    });
  } catch (error) {
    logger.error(`Failed to start Search Agent: ${error.message}`);
    process.exit(1);
  }
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down gracefully...');
  await disconnectDB();
  process.exit(0);
});

start();

export default app;
