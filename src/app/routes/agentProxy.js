import { createProxyMiddleware } from 'http-proxy-middleware';
import { logger } from '../../shared/logger.js';

// Base domains or mapping for environments.
// For production, these should map to actual Cloud Run URLs.
// For local, they can map to localhost ports.
const getAgentTarget = (agentName, localPort) => {
  if (process.env.NODE_ENV === 'production') {
    // Determine target from environment variable or construct it
    const envVarName = `AGENT_${agentName.toUpperCase().replace(/-/g, '_')}_URL`;
    return process.env[envVarName] || `https://${agentName}-${process.env.GOOGLE_CLOUD_PROJECT}.run.app`;
  }
  return `http://localhost:${localPort}`;
};

export const createAgentProxy = (agentName, localPort) => {
  const target = getAgentTarget(agentName, localPort);
  logger.info(`Setting up proxy for ${agentName} to ${target}`);
  
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // e.g. /api/v1/code/generate -> /api/v1/code/generate
      // In some architectures, the agent might not have the base prefix, but our agents 
      // are currently using `app.use('/api/v1/...', router)`. So we don't necessarily rewrite.
      // Wait, let's verify what the agent microservice expects.
      return path;
    },
    onProxyReq: (proxyReq, req, res) => {
      // Forward the auth header if necessary, or attach Cloud IAM token if required (Cloud Run unauthenticated handles this already if allowed).
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${agentName}:`, err);
      res.status(502).json({ error: 'Agent Service Unavailable', details: err.message });
    }
  });
};
