/**
 * @fileoverview Shared internal authentication middleware for agent microservices.
 * Validates service-to-service requests from the API Gateway.
 *
 * Two auth modes:
 * 1. Internal Service Secret: Shared HMAC secret between gateway and agents
 * 2. GCP IAM Token: Google Cloud Run's native service-to-service auth (production)
 *
 * The gateway forwards the original user context (userId, email, plan) in
 * the X-User-Context header as a base64-encoded JSON object.
 *
 * Usage:
 *   import { internalAuth } from '@insoai/shared/auth';
 *   router.post('/execute', internalAuth, controller.execute);
 */

import { createLogger } from '../logging/index.js';
import config from '../config/index.js';

const { logger } = createLogger('shared-auth');

/**
 * Extract and validate user context from gateway-forwarded headers.
 * @param {import('express').Request} req
 * @returns {{ userId: string, email: string, plan: string } | null}
 */
function extractUserContext(req) {
  const userContextHeader = req.headers['x-user-context'];
  if (!userContextHeader) return null;

  try {
    const decoded = Buffer.from(userContextHeader, 'base64').toString('utf-8');
    const userContext = JSON.parse(decoded);

    if (!userContext.userId) {
      logger.warn('User context missing userId');
      return null;
    }

    return {
      userId: userContext.userId,
      email: userContext.email || '',
      plan: userContext.plan || 'free',
      tenantId: userContext.tenantId || null,
    };
  } catch (error) {
    logger.error(`Failed to parse user context: ${error.message}`);
    return null;
  }
}

/**
 * Internal authentication middleware.
 * Validates that the request comes from the API Gateway.
 */
export function internalAuth(req, res, next) {
  const isProduction = config.env === 'production';

  if (isProduction) {
    // In production, Cloud Run IAM handles service-to-service auth.
    // The gateway's identity token is validated by Cloud Run before
    // the request reaches this middleware. We just extract user context.
    const userContext = extractUserContext(req);
    if (!userContext) {
      return res.status(401).json({
        error: 'Missing or invalid user context',
        message: 'Request must include X-User-Context header from gateway',
      });
    }
    req.user = userContext;
    return next();
  }

  // Development mode: validate shared service secret
  const serviceSecret = req.headers['x-service-secret'];
  if (serviceSecret !== config.internal.serviceSecret) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid service secret. Agent services are not directly accessible.',
    });
  }

  // Extract user context
  const userContext = extractUserContext(req);
  if (!userContext) {
    return res.status(401).json({
      error: 'Missing user context',
      message: 'Gateway must forward X-User-Context header',
    });
  }

  req.user = userContext;
  next();
}

/**
 * Creates headers for gateway → agent service requests.
 * Used by the gateway to forward user context to agent services.
 * @param {object} user - The authenticated user object from the gateway
 * @param {string} [serviceSecret] - The shared service secret
 * @returns {object} Headers to include in the request
 */
export function createInternalHeaders(user, serviceSecret) {
  const userContext = Buffer.from(JSON.stringify({
    userId: user._id || user.userId,
    email: user.email,
    plan: user.plan || 'free',
    tenantId: user.tenantId || null,
  })).toString('base64');

  return {
    'X-User-Context': userContext,
    'X-Service-Secret': serviceSecret || config.internal.serviceSecret,
    'Content-Type': 'application/json',
  };
}

export default { internalAuth, createInternalHeaders };
