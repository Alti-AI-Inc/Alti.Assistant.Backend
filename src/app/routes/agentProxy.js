import { createProxyMiddleware } from 'http-proxy-middleware';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../shared/logger.js';

let auth;
if (process.env.NODE_ENV === 'production') {
  auth = new GoogleAuth();
}

const idTokenClients = new Map();

// Fetch IAM OIDC token for the target Cloud Run service
async function getAuthHeadersForTarget(target) {
  if (!auth) return {};
  try {
    let client = idTokenClients.get(target);
    if (!client) {
      client = await auth.getIdTokenClient(target);
      idTokenClients.set(target, client);
    }
    // This fetches the token and returns { Authorization: 'Bearer ...' }
    // The client internally caches the token until it expires
    return await client.getRequestHeaders();
  } catch (error) {
    logger.error(`Failed to get IAM token for target ${target}:`, error);
    return {};
  }
}

// Base domains or mapping for environments.
const getAgentTarget = (agentName, localPort) => {
  if (process.env.NODE_ENV === 'production') {
    const envVarName = `AGENT_${agentName.toUpperCase().replace(/-/g, '_')}_URL`;
    return process.env[envVarName] || `https://${agentName}-${process.env.GOOGLE_CLOUD_PROJECT}.run.app`;
  }
  return `http://localhost:${localPort}`;
};

export const createAgentProxy = (agentName, localPort) => {
  const target = getAgentTarget(agentName, localPort);
  logger.info(`Setting up proxy for ${agentName} to ${target}`);

  // Create the proxy middleware
  const proxy = createProxyMiddleware({
    target,
    changeOrigin: true,
    pathRewrite: (path, req) => {
      return path;
    },
    onError: (err, req, res) => {
      logger.error(`Proxy error for ${agentName}:`, err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'Agent Service Unavailable', details: err.message });
      }
    }
  });

  // Return a wrapper middleware that handles async token fetching
  return async (req, res, next) => {
    try {
      if (process.env.NODE_ENV === 'production') {
        const authHeaders = await getAuthHeadersForTarget(target);
        if (authHeaders.Authorization) {
          // Inject the IAM OIDC Bearer token into the request headers
          req.headers['authorization'] = authHeaders.Authorization;
        }
      } else {
        // In local development, we pass the internal dev secret
        req.headers['x-internal-secret'] = process.env.INTERNAL_SERVICE_SECRET;
      }
      
      // Call the actual proxy middleware
      return proxy(req, res, next);
    } catch (err) {
      logger.error(`Error in proxy wrapper for ${agentName}:`, err);
      res.status(500).json({ error: 'Internal Server Error during proxying' });
    }
  };
};
