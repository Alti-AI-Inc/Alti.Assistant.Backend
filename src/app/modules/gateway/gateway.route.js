/**
 * @fileoverview Gateway routes for agent microservice management.
 * Provides endpoints for monitoring agent health and querying the agent registry.
 */

import express from 'express';
import { checkAgentHealth, getAgentRegistry } from './agentProxy.js';

const router = express.Router();

/**
 * GET /api/v1/gateway/agents
 * Returns the registry of all configured agent services and their models.
 */
router.get('/agents', async (req, res) => {
  try {
    const registry = getAgentRegistry();
    res.json({
      success: true,
      data: registry,
      meta: {
        totalAgents: Object.keys(registry).length,
        configuredAgents: Object.values(registry).filter((a) => a.configured).length,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/v1/gateway/health
 * Checks the health of all agent services and returns their status.
 */
router.get('/health', async (req, res) => {
  try {
    const health = await checkAgentHealth();
    const allHealthy = Object.values(health).every(
      (h) => h.status === 'healthy' || h.status === 'unconfigured'
    );

    res.status(allHealthy ? 200 : 503).json({
      success: allHealthy,
      data: health,
      meta: {
        overallStatus: allHealthy ? 'healthy' : 'degraded',
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
