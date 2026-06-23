/**
 * @fileoverview Write Agent microservice entry point.
 * Express server that handles document generation and export requests
 * forwarded from the API Gateway.
 *
 * Shared modules are imported via relative paths so each agent can
 * run as an independent Cloud Run service while reusing core logic.
 */

import express from 'express';
import cors from 'cors';

import config from '../../shared/config/index.js';
import { createLogger } from '../../shared/logging/index.js';
import { connectDB, disconnectDB, isHealthy } from '../../shared/db/index.js';
import internalRouter from './src/routes/internal.route.js';

const { logger } = createLogger('agent-write');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbHealthy = await isHealthy();
  const status = dbHealthy ? 'healthy' : 'degraded';
  res.status(dbHealthy ? 200 : 503).json({
    status,
    agent: 'write',
    timestamp: new Date().toISOString(),
    db: dbHealthy ? 'connected' : 'disconnected',
  });
});

// ── Agent Routes ─────────────────────────────────────────────────────────────
app.use('/', internalRouter);

// ── Startup ──────────────────────────────────────────────────────────────────
const PORT = config.port || 8080;

async function start() {
  try {
    await connectDB();
    logger.info('MongoDB connected for agent-write');

    app.listen(PORT, () => {
      logger.info(`agent-write listening on port ${PORT}`, {
        env: config.env,
        port: PORT,
      });
    });
  } catch (error) {
    logger.error(`agent-write failed to start: ${error.message}`);
    process.exit(1);
  }
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down agent-write gracefully');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down agent-write gracefully');
  await disconnectDB();
  process.exit(0);
});

start();

export default app;
