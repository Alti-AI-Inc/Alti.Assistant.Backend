import { v4 as uuidv4 } from 'uuid';
import UsageLog from './usageLog.model.js';
import { logger } from '../../../shared/logger.js';
import crypto from 'crypto';

/**
 * Map endpoint to module and action
 */
const mapEndpointToModule = (endpoint, method) => {
  const path = endpoint.toLowerCase();

  // Module mapping
  if (
    path.includes('/auth') ||
    path.includes('/login') ||
    path.includes('/register')
  ) {
    return {
      module: 'auth',
      action: method === 'POST' ? 'authenticate' : 'query',
    };
  }
  if (path.includes('/tenant')) {
    return { module: 'tenant', action: extractAction(path, method) };
  }
  if (path.includes('/legal-contract-review')) {
    return {
      module: 'legal-contract-review',
      action: extractAction(path, method),
    };
  }
  if (path.includes('/legal-contract')) {
    return { module: 'legal-contract', action: extractAction(path, method) };
  }
  if (path.includes('/document-review')) {
    return { module: 'document-review', action: extractAction(path, method) };
  }
  if (path.includes('/document-analysis')) {
    return { module: 'document-analysis', action: extractAction(path, method) };
  }
  if (path.includes('/document-draft')) {
    return { module: 'document-drafting', action: extractAction(path, method) };
  }
  if (path.includes('/knowledge-bank') || path.includes('/knowledgebank')) {
    return { module: 'knowledge-bank', action: extractAction(path, method) };
  }
  if (path.includes('/code')) {
    return { module: 'code-generation', action: extractAction(path, method) };
  }
  if (path.includes('/search')) {
    return { module: 'search', action: 'search' };
  }
  if (path.includes('/deep-research') || path.includes('/research')) {
    return { module: 'deep-research', action: extractAction(path, method) };
  }
  if (path.includes('/presentation')) {
    return { module: 'presentation', action: extractAction(path, method) };
  }
  if (path.includes('/report')) {
    return { module: 'report-generation', action: extractAction(path, method) };
  }
  if (path.includes('/article')) {
    return { module: 'article-writer', action: extractAction(path, method) };
  }
  if (path.includes('/creative-writing')) {
    return { module: 'creative-writing', action: extractAction(path, method) };
  }
  if (path.includes('/rewrite')) {
    return { module: 'rewrite', action: extractAction(path, method) };
  }
  if (path.includes('/translation') || path.includes('/translate')) {
    return { module: 'translation', action: extractAction(path, method) };
  }
  if (path.includes('/transcription') || path.includes('/transcribe')) {
    return { module: 'transcription', action: extractAction(path, method) };
  }
  if (path.includes('/brainstorm')) {
    return { module: 'brainstorm', action: extractAction(path, method) };
  }
  if (path.includes('/plan')) {
    return { module: 'plan-generator', action: extractAction(path, method) };
  }
  if (path.includes('/image')) {
    return { module: 'image-generation', action: extractAction(path, method) };
  }
  if (path.includes('/stripe')) {
    return { module: 'stripe', action: extractAction(path, method) };
  }

  return { module: 'other', action: extractAction(path, method) };
};

/**
 * Extract action from path and method
 */
const extractAction = (path, method) => {
  if (path.includes('/generate')) return 'generate';
  if (path.includes('/analyze')) return 'analyze';
  if (path.includes('/review')) return 'review';
  if (path.includes('/search')) return 'search';
  if (path.includes('/create')) return 'create';
  if (path.includes('/upload')) return 'upload';
  if (path.includes('/download')) return 'download';
  if (path.includes('/delete')) return 'delete';

  // Fallback to method-based action
  switch (method) {
    case 'GET':
      return 'read';
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return 'unknown';
  }
};

/**
 * Anonymize IP address (hash it)
 */
const anonymizeIP = (ip) => {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
};

/**
 * Map HTTP status code to status
 */
const getStatusFromCode = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 400 && statusCode < 600) return 'error';
  return 'partial';
};

/**
 * Map status code to error type
 */
const getErrorType = (statusCode) => {
  if (statusCode === 400) return 'validation';
  if (statusCode === 401) return 'authentication';
  if (statusCode === 403) return 'authorization';
  if (statusCode === 404) return 'not-found';
  if (statusCode === 429) return 'rate-limit';
  if (statusCode === 408 || statusCode === 504) return 'timeout';
  if (statusCode >= 500) return 'server';
  return null;
};

/**
 * Create usage log asynchronously (non-blocking)
 */
const createLogAsync = (logData) => {
  // Use setImmediate to defer execution and not block response
  setImmediate(() => {
    UsageLog.create(logData)
      .then(() => {
        // Silent success
      })
      .catch((error) => {
        logger.error('Failed to create usage log:', {
          error: error.message,
          logData: {
            userId: logData.userId,
            tenantId: logData.tenantId,
            module: logData.module,
            endpoint: logData.endpoint,
          },
        });
      });
  });
};

/**
 * Log API request usage
 */
const logRequest = (data) => {
  const {
    userId,
    tenantId,
    endpoint,
    method,
    startTime,
    endTime,
    statusCode,
    errorMessage = null,
    tokensUsed = 0,
    modelUsed = null,
    inputSize = 0,
    outputSize = 0,
    metadata = {},
    ipAddress = null,
    userAgent = null,
  } = data;

  // Calculate duration
  const duration = endTime - startTime;

  // Map endpoint to module and action
  const { module, action } = mapEndpointToModule(endpoint, method);

  // Determine status and error type
  const status = getStatusFromCode(statusCode);
  const errorType = status === 'error' ? getErrorType(statusCode) : null;

  // Create log data
  const logData = {
    timestamp: new Date(startTime),
    userId,
    tenantId: tenantId || null,
    module,
    action,
    endpoint,
    method,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    duration,
    status,
    statusCode,
    errorType,
    errorMessage: errorMessage ? String(errorMessage).substring(0, 500) : null, // Limit length
    tokensUsed,
    modelUsed,
    inputSize,
    outputSize,
    requestId: uuidv4(),
    ipAddress: anonymizeIP(ipAddress),
    userAgent: userAgent ? String(userAgent).substring(0, 200) : null, // Limit length
    metadata,
  };

  // Log asynchronously (non-blocking)
  createLogAsync(logData);
};

/**
 * Get tenant usage summary
 */
const getTenantUsage = async (tenantId, startDate, endDate) => {
  try {
    return await UsageLog.getTenantUsageSummary(tenantId, startDate, endDate);
  } catch (error) {
    logger.error('Error getting tenant usage summary:', error);
    throw error;
  }
};

/**
 * Get user usage summary
 */
const getUserUsage = async (userId, startDate, endDate) => {
  try {
    return await UsageLog.getUserUsageSummary(userId, startDate, endDate);
  } catch (error) {
    logger.error('Error getting user usage summary:', error);
    throw error;
  }
};

/**
 * Get usage statistics for a time period
 */
const getUsageStats = async (filters = {}) => {
  try {
    const {
      tenantId,
      userId,
      module,
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
      endDate = new Date(),
    } = filters;

    const matchStage = {
      timestamp: { $gte: startDate, $lte: endDate },
    };

    if (tenantId) matchStage.tenantId = tenantId;
    if (userId) matchStage.userId = userId;
    if (module) matchStage.module = module;

    const stats = await UsageLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          successCount: {
            $sum: { $cond: [{ $eq: ['$status', 'success'] }, 1, 0] },
          },
          errorCount: {
            $sum: { $cond: [{ $eq: ['$status', 'error'] }, 1, 0] },
          },
          avgDuration: { $avg: '$duration' },
          maxDuration: { $max: '$duration' },
          minDuration: { $min: '$duration' },
          totalTokens: { $sum: '$tokensUsed' },
          avgTokens: { $avg: '$tokensUsed' },
        },
      },
      {
        $project: {
          _id: 0,
          totalRequests: 1,
          successCount: 1,
          errorCount: 1,
          successRate: {
            $multiply: [{ $divide: ['$successCount', '$totalRequests'] }, 100],
          },
          avgDuration: { $round: ['$avgDuration', 2] },
          maxDuration: 1,
          minDuration: 1,
          totalTokens: 1,
          avgTokens: { $round: ['$avgTokens', 2] },
        },
      },
    ]);

    return stats[0] || null;
  } catch (error) {
    logger.error('Error getting usage stats:', error);
    throw error;
  }
};

export const usageLogService = {
  logRequest,
  getTenantUsage,
  getUserUsage,
  getUsageStats,
};
