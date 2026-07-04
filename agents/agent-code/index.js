/**
 * @fileoverview Alti Assistant Code Agent — Express microservice entry point.
 * Handles code generation, debugging, review, and explanation.
 *
 * Cloud Run default port: 8080
 */

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import { createLogger } from '../../shared/logging/index.js';
import { connectDB, disconnectDB, isHealthy } from '../../shared/db/index.js';
import config from '../../shared/config/index.js';
import internalRouter from './src/routes/internal.route.js';

const { logger } = createLogger('agent-code');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.disable('x-powered-by');
app.set('trust proxy', true);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/v1/code', internalRouter);

// ── Health / Readiness ───────────────────────────────────────────────────────
app.get('/health', async (_req, res) => {
  const dbHealthy = await isHealthy();
  const checks = {
    server: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.env,
    mongodb: dbHealthy ? 'connected' : 'disconnected',
  };

  res.status(dbHealthy ? 200 : 503).json({
    success: dbHealthy,
    message: dbHealthy ? 'agent-code is healthy' : 'agent-code degraded',
    checks,
  });
});

app.get('/liveness', (_req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

app.get('/readiness', async (_req, res) => {
  const ready = await isHealthy();
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'agent-code ready' : 'agent-code not ready',
  });
});

// ── Root ─────────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({ service: 'agent-code', status: 'running' });
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ── Start ────────────────────────────────────────────────────────────────────
const port = config.port || 8080;

async function start() {
  try {
    await connectDB();
    logger.info('✅ MongoDB connected');
  } catch (err) {
    logger.error(`❌ MongoDB connection failed: ${err.message}. Starting without DB.`);
  }

  const server = app.listen(port, () => {
    logger.info(`✅ agent-code running on 0.0.0.0:${port}`);
    logger.info(`   Environment: ${config.env}`);
  });

  // ── Graceful Shutdown ────────────────────────────────────────────────────
  const SHUTDOWN_TIMEOUT_MS = 10_000;

  const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully`);

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
