import { usageLogService } from '../../modules/usage/usageLog.service.js';
import { logger } from '../../../shared/logger.js';

/**
 * Usage Logging Middleware
 * Captures API request metrics and logs asynchronously
 * Does not block request/response cycle
 */
const usageLogger = (req, res, next) => {
  // Capture request start time
  const startTime = Date.now();

  // Store original response methods
  const originalSend = res.send;
  const originalJson = res.json;

  // Track response data
  let responseBody = null;
  let responseSent = false;

  // Override res.json to capture response
  res.json = function (data) {
    if (!responseSent) {
      responseBody = data;
      responseSent = true;
    }
    return originalJson.call(this, data);
  };

  // Override res.send to capture response
  res.send = function (data) {
    if (!responseSent) {
      responseBody = data;
      responseSent = true;
    }
    return originalSend.call(this, data);
  };

  // Capture response finish event
  res.on('finish', () => {
    try {
      const endTime = Date.now();

      // Extract user and tenant from request (set by auth middleware)
      const userId = req.user?._id || req.user?.id || null;
      const tenantId = req.tenant?._id
        || req.tenant?.id
        || req.user?.currentTenantId
        || req.user?.activeTenantId
        || req.user?.tenantId
        || null;

      // Skip logging if no user (some public endpoints)
      if (!userId) {
        return;
      }

      // Get request details
      const endpoint = req.originalUrl || req.url;
      const method = req.method;
      const statusCode = res.statusCode;

      // Get IP and User Agent
      const ipAddress = req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'];
      const userAgent = req.headers['user-agent'];

      // Calculate request/response sizes
      const inputSize = req.headers['content-length'] ? parseInt(req.headers['content-length']) : 0;
      const outputSize = res.get('content-length') ? parseInt(res.get('content-length')) : 0;

      // Extract error message if error response
      let errorMessage = null;
      if (statusCode >= 400 && responseBody) {
        try {
          const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;
          errorMessage = parsed.message || parsed.error || null;
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Extract AI usage from response (if available)
      let tokensUsed = 0;
      let modelUsed = null;
      let metadata = {};

      if (responseBody) {
        try {
          const parsed = typeof responseBody === 'string' ? JSON.parse(responseBody) : responseBody;

          // Check for AI usage data in common locations
          if (parsed.usage?.total_tokens) {
            tokensUsed = parsed.usage.total_tokens;
          } else if (parsed.data?.usage?.total_tokens) {
            tokensUsed = parsed.data.usage.total_tokens;
          } else if (parsed.tokensUsed) {
            tokensUsed = parsed.tokensUsed;
          }

          // Check for model info
          if (parsed.model) {
            modelUsed = parsed.model;
          } else if (parsed.data?.model) {
            modelUsed = parsed.data.model;
          }

          // Add any metadata from response
          if (parsed.metadata) {
            metadata = parsed.metadata;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Add request-specific metadata
      if (req.body?.documentType) {
        metadata.documentType = req.body.documentType;
      }
      if (req.body?.language) {
        metadata.language = req.body.language;
      }
      if (req.files?.length) {
        metadata.filesCount = req.files.length;
      }
      if (req.query?.search) {
        metadata.searchQuery = String(req.query.search).substring(0, 100);
      }

      // Log asynchronously (non-blocking)
      usageLogService.logRequest({
        userId,
        tenantId,
        endpoint,
        method,
        startTime,
        endTime,
        statusCode,
        errorMessage,
        tokensUsed,
        modelUsed,
        inputSize,
        outputSize,
        metadata,
        ipAddress,
        userAgent,
      });
    } catch (error) {
      // Silently fail - don't impact response
      logger.error('Error in usage logger middleware:', {
        error: error.message,
        endpoint: req.originalUrl,
      });
    }
  });

  // Continue to next middleware
  next();
};

export default usageLogger;
