/**
 * @fileoverview Inso AI Research Agent — Express entry point.
 * Runs as an isolated Cloud Run service on port 8080.
 *
 * Startup:
 *  1. Load shared config, logger, and DB connection
 *  2. Register internal routes (execute, export)
 *  3. Listen on config.port (default 8080)
 *  4. Graceful shutdown on SIGTERM
 */

import express from 'express';
import cors from 'cors';

// ── Shared modules (relative path from agents/agent-research/) ──────────────
import config from '../../shared/config/index.js';
import { createLogger } from '../../shared/logging/index.js';
import { connectDB, disconnectDB } from '../../shared/db/index.js';

// ── Agent routes ────────────────────────────────────────────────────────────
import internalRouter from './src/routes/internal.route.js';

const { logger } = createLogger('agent-research');

const app = express();

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── Health check (no auth required — Cloud Run probe) ───────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', agent: 'research', uptime: process.uptime() });
});

// ── Internal routes (gateway → agent) ───────────────────────────────────────
app.use('/', internalRouter);

// ── Startup ─────────────────────────────────────────────────────────────────
async function start() {
  try {
    const { loadMissingSecrets } = await import('../../shared/config/index.js');
    await loadMissingSecrets();

    logger.info('Connecting to MongoDB...');
    await connectDB();
    logger.info('MongoDB connected for agent-research');

    const port = config.port || 8080;
    app.listen(port, () => {
      logger.info(`agent-research listening on port ${port}`);
    });
  } catch (error) {
    logger.error(`Failed to start agent-research: ${error.message}`);
    process.exit(1);
  }
}

// ── Graceful shutdown ───────────────────────────────────────────────────────
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down agent-research');
  await disconnectDB();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down agent-research');
  await disconnectDB();
  process.exit(0);
});

start();

export default app;
