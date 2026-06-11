import { v4 as uuidv4 } from 'uuid';
import UsageLog from './usageLog.model.js'; // Consider adding indexes to UsageLog model for performance.
// Recommended indexes for UsageLog model (in usageLog.model.js):
// 1. { timestamp: -1 } for time-based range queries (descending is common for recent logs).
// 2. { tenantId: 1, timestamp: -1 } for tenant-specific time-based queries.
// 3. { userId: 1, timestamp: -1 } for user-specific time-based queries.
// 4. { module: 1, timestamp: -1 } for module-specific time-based queries.
// For read operations in getTenantUsageSummary/getUserUsageSummary, ensure .lean() is used if they return Mongoose documents
// to avoid the overhead of Mongoose document instantiation.
import { logger } from '../../../shared/logger.js';
import crypto from 'crypto';
import { PubSub } from '@google-cloud/pubsub';

/**
 * Google Cloud Pub/Sub client instance.
 * Used for asynchronously publishing usage log messages to a topic.
 * @type {PubSub}
 */
const pubsub = new PubSub();

/**
 * The name of the GCP Pub/Sub topic where usage logs are sent.
 * Configured via the `USAGE_LOG_TOPIC` environment variable, with a default fallback.
 * @type {string}
 */
const TOPIC_NAME = process.env.USAGE_LOG_TOPIC || 'usage-logs';

/**
 * Maps an API endpoint and HTTP method to a specific module and action for usage logging.
 * This function categorizes requests based on their path and method to provide granular usage insights.
 *
 * @param {string} endpoint - The API endpoint path (e.g., '/api/v1/auth/login').
 * @param {string} method - The HTTP method of the request (e.g., 'POST', 'GET', 'PUT').
 * @returns {{module: string, action: string}} An object containing the identified module and action.
 *   - `module`: A string representing the functional module (e.g., 'auth', 'tenant', 'legal-contract-review').
 *   - `action`: A string representing the specific action performed within the module (e.g., 'authenticate', 'create', 'read').
 */
const mapEndpointToModule = (endpoint, method) => {
  const path = endpoint.toLowerCase();

  // For maintainability with many routes, consider a more structured approach,
  // e.g., an array of objects with regex matching.
  // For now, this if-else chain is clear and functional.

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
  if (path.includes('/tenant') || path.includes('/workspace')) {
    return { module: 'workspace-management', action: extractAction(path, method) };
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
  if (path.includes('/stripe') || path.includes('/billing') || path.includes('/subscription')) {
    return { module: 'billing-subscription', action: extractAction(path, method) };
  }

  return { module: 'other', action: extractAction(path, method) };
};

/**
 * Extracts a specific action from a given URL path and HTTP method.
 * This function looks for keywords in the path or falls back to method-based actions.
 *
 * @param {string} path - The lowercase API endpoint path.
 * @param {string} method - The HTTP method of the request (e.g., 'POST', 'GET').
 * @returns {string} A string representing the identified action (e.g., 'generate', 'create', 'read', 'unknown').
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
  if (path.includes('/update')) return 'update';

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
 * Anonymizes an IP address by hashing it using SHA256 and a salt.
 * This helps in protecting user privacy while still allowing for some level of IP-based analytics.
 *
 * @param {string | null | undefined} ip - The IP address string to anonymize.
 * @returns {string | null} The first 16 characters of the HMAC-SHA256 hash of the IP address, or `null` if the input is falsy.
 */
const anonymizeIP = (ip) => {
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT;
  if (!salt) {
    logger.warn('IP_HASH_SALT is not set. IP anonymization is less secure.');
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }
  return crypto.createHmac('sha256', salt).update(ip).digest('hex').substring(0, 16);
};

/**
 * Maps an HTTP status code to a general status category.
 *
 * @param {number} statusCode - The HTTP status code (e.g., 200, 404, 500).
 * @returns {'success' | 'redirect' | 'client-error' | 'server-error' | 'unknown'} The categorized status.
 */
const getStatusFromCode = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 300 && statusCode < 400) return 'redirect';
  if (statusCode >= 400 && statusCode < 500) return 'client-error';
  if (statusCode >= 500 && statusCode < 600) return 'server-error';
  return 'unknown';
};

/**
 * Maps an HTTP status code to a specific error type.
 * This provides more detailed categorization for error logging and analysis.
 *
 * @param {number} statusCode - The HTTP status code (e.g., 400, 401, 500).
 * @returns {'validation' | 'authentication' | 'authorization' | 'not-found' | 'rate-limit' | 'timeout' | 'server' | null}
 *   The specific error type, or `null` if no specific error type is matched.
 */
const getErrorType = (statusCode) => {
  if (statusCode < 400) return null;
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
 * Asynchronously publishes a usage log entry to GCP Pub/Sub.
 * This ensures that database writes are offloaded from the main application process,
 * allowing for stateless, container-friendly scaling.
 *
 * @param {object} logData - The data object for the usage log entry.
 * @returns {void}
 */
const createLogAsync = (logData) => {
  const dataBuffer = Buffer.from(JSON.stringify(logData));

  pubsub
    .topic(TOPIC_NAME)
    .publishMessage({ data: dataBuffer })
    .catch((error) => {
      logger.error('Failed to publish usage log to Pub/Sub. Falling back to direct DB write.', {
        error, // Log the full error for better debugging
        logContext: {
          userId: logData.userId,
          tenantId: logData.tenantId,
          requestId: logData.requestId,
        },
      });
      // Fallback to direct DB write to prevent data loss if Pub/Sub is unavailable
      UsageLog.create(logData).catch((dbError) => {
        logger.error('Fallback database write for usage log also failed. Data loss occurred.', {
          error: dbError,
          originalLogRequestId: logData.requestId, // Correlate the failed log
        });
      });
    });
};

/**
 * Logs details of an API request for usage tracking and analytics.
 * This function processes raw request data, categorizes it, and then asynchronously
 * persists it. It calculates duration, maps endpoints to modules/actions,
 * determines status and error types, and anonymizes sensitive information like IP addresses.
 *
 * @param {object} data - The raw request data to be logged.
 * @param {string} [data.userId] - The ID of the user who made the request.
 * @param {string} [data.tenantId] - The ID of the tenant associated with the request.
 * @param {string} data.endpoint - The API endpoint path.
 * @param {string} data.method - The HTTP method of the request.
 * @param {number} data.startTime - The timestamp (ms) when the request started.
 * @param {number} data.endTime - The timestamp (ms) when the request ended.
 * @param {number} data.statusCode - The HTTP status code of the response.
 * @param {string} [data.errorMessage=null] - Any error message associated with a failed request.
 * @param {number} [data.tokensUsed=0] - The number of tokens consumed by an AI model, if applicable.
 * @param {string} [data.modelUsed=null] - The name of the AI model used, if applicable.
 * @param {number} [data.inputSize=0] - The size of the request payload in bytes.
 * @param {number} [data.outputSize=0] - The size of the response payload in bytes.
 * @param {object} [data.metadata={}] - Any additional metadata to be stored with the log.
 * @param {string} [data.ipAddress=null] - The client's IP address.
 * @param {string} [data.userAgent=null] - The client's user agent string.
 * @returns {void}
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

  const duration = endTime - startTime;
  const { module, action } = mapEndpointToModule(endpoint, method);
  const status = getStatusFromCode(statusCode);
  const errorType = getErrorType(statusCode);

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
    errorMessage: errorMessage ? String(errorMessage).substring(0, 500) : null,
    tokensUsed,
    modelUsed,
    inputSize,
    outputSize,
    requestId: uuidv4(),
    ipAddress: anonymizeIP(ipAddress),
    userAgent: userAgent ? String(userAgent).substring(0, 256) : null,
    metadata,
  };

  createLogAsync(logData);
};

/**
 * Retrieves a summary of usage for a specific tenant within a given date range.
 *
 * @permission Requires admin privileges or being a member of the specified tenant.
 * @multi-tenant This function is tenant-aware and requires a `tenantId`.
 *
 * @param {string} tenantId - The ID of the tenant for whom to retrieve usage.
 * @param {Date} startDate - The start date for the usage period.
 * @param {Date} endDate - The end date for the usage period.
 * @returns {Promise<object[]>} A promise that resolves to an array of usage summary objects.
 * @throws {Error} If an error occurs during the database query.
 */
const getTenantUsage = async (tenantId, startDate, endDate) => {
  try {
    // The model method should use .lean() for performance.
    return await UsageLog.getTenantUsageSummary(tenantId, startDate, endDate);
  } catch (error) {
    logger.error(`Error getting tenant usage summary for tenantId: ${tenantId}`, { error });
    throw error;
  }
};

/**
 * Retrieves a summary of usage for a specific user within a given date range.
 *
 * @permission Requires admin privileges or the request must be from the specified user.
 *
 * @param {string} userId - The ID of the user for whom to retrieve usage.
 * @param {Date} startDate - The start date for the usage period.
 * @param {Date} endDate - The end date for the usage period.
 * @returns {Promise<object[]>} A promise that resolves to an array of usage summary objects.
 * @throws {Error} If an error occurs during the database query.
 */
const getUserUsage = async (userId, startDate, endDate) => {
  try {
    // The model method should use .lean() for performance.
    return await UsageLog.getUserUsageSummary(userId, startDate, endDate);
  } catch (error) {
    logger.error(`Error getting user usage summary for userId: ${userId}`, { error });
    throw error;
  }
};

/**
 * Retrieves aggregated usage statistics based on various filters and a time period.
 *
 * @permission Requires admin privileges. If `tenantId` or `userId` is provided,
 * the caller must have appropriate permissions for that scope.
 * @multi-tenant Can be filtered by `tenantId`.
 *
 * @param {object} [filters={}] - An object containing optional filters for the usage statistics.
 * @param {string} [filters.tenantId] - Filter stats by a specific tenant ID.
 * @param {string} [filters.userId] - Filter stats by a specific user ID.
 * @param {string} [filters.module] - Filter stats by a specific module.
 * @param {Date} [filters.startDate=new Date(Date.now() - 30 days)] - The start date for the period. Defaults to 30 days ago.
 * @param {Date} [filters.endDate=new Date()] - The end date for the period. Defaults to now.
 * @returns {Promise<object>} A promise that resolves to an object containing the aggregated usage statistics.
 *   The object will contain default zero values if no matching logs are found.
 * @throws {Error} If an error occurs during the aggregation query.
 */
const getUsageStats = async (filters = {}) => {
  try {
    const {
      tenantId,
      userId,
      module,
      startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Default to last 30 days
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
            $sum: { $cond: [{ $in: ['$status', ['client-error', 'server-error']] }, 1, 0] },
          },
          avgDuration: { $avg: '$duration' },
          maxDuration: { $max: '$duration' },
          minDuration: { $min: '$duration' },
          totalTokens: { $sum: '$tokensUsed' },
        },
      },
      {
        $project: {
          _id: 0,
          totalRequests: 1,
          successCount: 1,
          errorCount: 1,
          successRate: {
            $cond: {
              if: { $gt: ['$totalRequests', 0] },
              then: { $multiply: [{ $divide: ['$successCount', '$totalRequests'] }, 100] },
              else: 0,
            },
          },
          avgDuration: { $round: ['$avgDuration', 2] },
          maxDuration: 1,
          minDuration: 1,
          totalTokens: 1,
          avgTokens: {
            $cond: {
              if: { $gt: ['$totalRequests', 0] },
              then: { $round: [{ $divide: ['$totalTokens', '$totalRequests'] }, 2] },
              else: 0,
            },
          },
        },
      },
    ]);

    // If no records match, aggregation returns an empty array. Return a default object.
    return stats[0] || {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      successRate: 0,
      avgDuration: 0,
      maxDuration: 0,
      minDuration: 0,
      totalTokens: 0,
      avgTokens: 0,
    };
  } catch (error) {
    logger.error('Error getting usage stats:', { error, filters });
    throw error;
  }
};

/**
 * Checks if a tenant or user has exceeded a specific usage limit within the current billing cycle.
 * This is a crucial function for enforcing subscription plan limits.
 *
 * @multi-tenant This function is tenant-aware and requires a `tenantId`.
 *
 * @param {object} options - The options for the limit check.
 * @param {string} options.tenantId - The ID of the tenant to check.
 * @param {'tokens' | 'requests'} options.limitType - The type of limit to check ('tokens' or 'requests').
 * @param {number} options.limitValue - The value of the limit. A value of -1 can signify an unlimited plan.
 * @param {Date} options.cycleStartDate - The start date of the current billing or usage cycle.
 * @param {Date} [options.cycleEndDate=new Date()] - The end date of the cycle, defaults to now.
 * @returns {Promise<{exceeded: boolean, currentUsage: number, limit: number, remaining: number}>} A promise that resolves to an object indicating if the limit is exceeded.
 */
const checkUsageLimit = async ({ tenantId, limitType, limitValue, cycleStartDate, cycleEndDate = new Date() }) => {
  if (!tenantId || !limitType || limitValue === undefined || !cycleStartDate) {
    throw new Error('Missing required parameters for usage limit check.');
  }

  // A limit of -1 is a common convention for "unlimited".
  if (limitValue === -1) {
    return { exceeded: false, currentUsage: 0, limit: -1, remaining: Infinity };
  }

  try {
    const stats = await getUsageStats({
      tenantId,
      startDate: cycleStartDate,
      endDate: cycleEndDate,
    });

    const currentUsage = limitType === 'tokens' ? stats.totalTokens : stats.totalRequests;
    const exceeded = currentUsage >= limitValue;
    const remaining = Math.max(0, limitValue - currentUsage);

    return {
      exceeded,
      currentUsage,
      limit: limitValue,
      remaining,
    };
  } catch (error) {
    logger.error(`Error checking usage limit for tenant ${tenantId}:`, { error });
    // Fail-safe decision: Re-throwing the error allows the calling service (e.g., a middleware)
    // to decide whether to block the request (fail-closed) or allow it (fail-open).
    // For billing-related features, fail-closed is often the safer default to prevent financial loss.
    throw error;
  }
};


/**
 * @typedef {object} UsageLogService
 * @property {function(object): void} logRequest - Logs details of an API request for usage tracking.
 * @property {function(string, Date, Date): Promise<object[]>} getTenantUsage - Retrieves a summary of usage for a specific tenant.
 * @property {function(string, Date, Date): Promise<object[]>} getUserUsage - Retrieves a summary of usage for a specific user.
 * @property {function(object): Promise<object>} getUsageStats - Retrieves aggregated usage statistics based on filters.
 * @property {function(object): Promise<{exceeded: boolean, currentUsage: number, limit: number, remaining: number}>} checkUsageLimit - Checks if a usage limit has been exceeded for a tenant.
 */

/**
 * Provides a collection of services for logging, retrieving, and analyzing API usage data.
 * This service is fundamental for monitoring, billing, and enforcing subscription limits.
 *
 * @type {UsageLogService}
 */
export const usageLogService = {
  logRequest,
  getTenantUsage,
  getUserUsage,
  getUsageStats,
  checkUsageLimit,
};