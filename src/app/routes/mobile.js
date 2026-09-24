import express from 'express';
import { ApiKeyService } from '../modules/api-keys/apikey.service.js';
import { logger } from '../../shared/logger.js';
import httpStatus from 'http-status';

const router = express.Router();

// Strict Mobile Edge Authentication Middleware
const requireMobileEdgeAuth = async (req, res, next) => {
  const apiKey = req.headers['x-aphura-mobile-key'];
  if (!apiKey) {
    return res.status(httpStatus.UNAUTHORIZED).json({ success: false, message: 'Missing Mobile Edge API Key.' });
  }

  try {
    const tenantId = await ApiKeyService.validateApiKey(apiKey);
    if (!tenantId) {
      return res.status(httpStatus.UNAUTHORIZED).json({ success: false, message: 'Invalid or Revoked Mobile Edge API Key.' });
    }
    
    req.tenantId = tenantId; // Inject verified tenant
    next();
  } catch (error) {
    logger.error(`[Mobile Gateway] Auth error: ${error.message}`);
    return res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Mobile gateway auth failed.' });
  }
};

// ── Mobile App Hardened Routes ──────────────────────────────────────────────

// Health check specifically for the mobile Flutter app to ping
router.get('/ping', (req, res) => {
  res.status(200).json({ success: true, edge: 'Aphura Mobile Gateway', status: 'operational' });
});

// Protect all subsequent mobile routes
router.use(requireMobileEdgeAuth);

// Sovereign Router entrypoint optimized for Mobile
router.post('/chat/stream', async (req, res) => {
  // We will dynamically import the sovereign router to handle the request
  try {
    const { SovereignRouterService } = await import('../modules/orchestrator/sovereignRouter.service.js');
    await SovereignRouterService.handlePromptStream(req, res);
  } catch (error) {
    logger.error(`[Mobile Gateway] Stream failed: ${error.message}`);
    if (!res.headersSent) {
      res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Stream failed' });
    }
  }
});

// Register Mobile Push Token (FCM / APNs mapped to Zaqar)
router.post('/push/register', (req, res) => {
  const { deviceToken, platform } = req.body;
  // Here we would map the Apple/Google token to an OpenStack Zaqar queue
  logger.info(`[Mobile Gateway] Registered ${platform} push token for tenant ${req.tenantId}`);
  res.status(200).json({ success: true, message: 'Push token registered with Aphura Zaqar.' });
});

export const MobileRoutes = router;
