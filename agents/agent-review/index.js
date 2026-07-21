/**
 * @fileoverview Alti Assistant Review Agent microservice entry point.
 * Handles content, code, and document review with structured findings.
 */

import dotenv from 'dotenv';
dotenv.config();

import cors from 'cors';
import express from 'express';

import config from '../../shared/config/index.js';
import { connectDB, disconnectDB, isHealthy } from '../../shared/db/index.js';
import { createLogger } from '../../shared/logging/index.js';
import internalRouter from './src/routes/internal.route.js';

const { logger } = createLogger('agent-review');
const app = express();

app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use('/api/v1/review', internalRouter);

app.get('/health', async (_req, res) => {
  const dbHealthy = await isHealthy();
  res.status(dbHealthy ? 200 : 503).json({
    success: dbHealthy,
    message: dbHealthy ? 'agent-review is healthy' : 'agent-review degraded',
    checks: {
      server: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: config.env,
      mongodb: dbHealthy ? 'connected' : 'disconnected',
    },
  });
});

app.get('/liveness', (_req, res) => {
  res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

app.get('/readiness', async (_req, res) => {
  const ready = await isHealthy();
  res.status(ready ? 200 : 503).json({
    success: ready,
    message: ready ? 'agent-review ready' : 'agent-review not ready',
  });
});

app.get('/', (_req, res) => {
  res.json({ service: 'agent-review', status: 'running' });
});

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

const port = config.port || 8080;

async function start() {
  try {
    const { loadMissingSecrets } = await import('../../shared/config/index.js');
    await loadMissingSecrets();

    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected for agent-review');
  } catch (error) {
    logger.error(
      `MongoDB connection failed: ${error.message}. Starting without DB.`
    );
  }

  const server = app.listen(port, () => {
    logger.info(`agent-review listening on port ${port}`, {
      env: config.env,
      port,
    });
  });

  const SHUTDOWN_TIMEOUT_MS = 10000;

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
      } catch (error) {
        logger.error(`Error closing MongoDB: ${error.message}`);
      }
      clearTimeout(forceExitTimer);
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
  });
}

start();

export default app;
