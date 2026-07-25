/**
 * @fileoverview Inso Assistant Image Agent — Express microservice entry point.
 * Handles image generation and editing via Gemini native image generation.
 *
 * Cloud Run default port: 8080
 */

import express from 'express';
import cors from 'cors';

// ── Shared modules (relative path from agents/agent-image/) ─────────────────
import config from '../../shared/config/index.js';
import { createLogger } from '../../shared/logging/index.js';
import { connectDB, disconnectDB, isHealthy } from '../../shared/db/index.js';

// ── Agent routes ────────────────────────────────────────────────────────────
import internalRouter from './src/routes/internal.route.js';

const { logger } = createLogger('agent-image');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.disable('x-powered-by');
app.set('trust proxy', true);

// ── Health / Readiness / Liveness ────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbHealthy = await isHealthy();
  const status = dbHealthy ? 'ok' : 'degraded';
  res.status(dbHealthy ? 200 : 503).json({
    status,
    agent: 'image',
    timestamp: new Date().toISOString(),
    db: dbHealthy ? 'connected' : 'disconnected',
  });
});

app.get('/liveness', (_req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

app.get('/readiness', async (_req, res) => {
  const ready = await isHealthy();
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'agent-image ready' : 'agent-image not ready',
  });
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/', internalRouter);

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ service: 'agent-image', status: 'running' });
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const PORT = config.port || 8080;

async function start() {
  try {
    const { loadMissingSecrets } = await import('../../shared/config/index.js');
    await loadMissingSecrets();

    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected.');
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}. Starting without DB.`);
  }

  const server = app.listen(PORT, () => {
    logger.info(`agent-image listening on port ${PORT}`, {
      env: config.env,
      port: PORT,
    });
  });

  // ── Graceful Shutdown ──────────────────────────────────────────────────────
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    const forceExitTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await disconnectDB();
        logger.info('MongoDB connection closed');
      } catch (err) {
        logger.error(`Error closing MongoDB: ${err.message}`);
      }
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
  });
}

start();

export default app;
