import { v4 as uuidv4 } from 'uuid';
import UsageLog from './usageLog.model.js'; // Consider adding indexes to UsageLog model for performance.
// Recommended indexes for UsageLog model (in usageLog.model.js):
// 1. { timestamp: 1 } for time-based range queries.
// 2. { tenantId: 1, timestamp: 1 } for tenant-specific time-based queries.
// 3. { userId: 1, timestamp: 1 } for user-specific time-based queries.
// 4. { module: 1, timestamp: 1 } for module-specific time-based queries.
// 5. For read operations in getTenantUsageSummary/getUserUsageSummary, ensure .lean() is used if they return Mongoose documents
//    to avoid the overhead of Mongoose document instantiation.
import { logger } from '../../../shared/logger.js';
import crypto from 'crypto';

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
 * Anonymizes an IP address by hashing it using SHA256 and truncating the result.
 * This helps in protecting user privacy while still allowing for some level of IP-based analytics.
 *
 * @param {string | null | undefined} ip - The IP address string to anonymize.
 * @returns {string | null} The first 16 characters of the SHA256 hash of the IP address, or `null` if the input is falsy.
 */
const anonymizeIP = (ip) => {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
};

/**
 * Maps an HTTP status code to a general status category.
 *
 * @param {number} statusCode - The HTTP status code (e.g., 200, 404, 500).
 * @returns {'success' | 'error' | 'partial'} The categorized status:
 *   - 'success' for 2xx codes.
 *   - 'error' for 4xx or 5xx codes.
 *   - 'partial' for other codes (e.g., 3xx redirects).
 */
const getStatusFromCode = (statusCode) => {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 400 && statusCode < 600) return 'error';
  return 'partial';
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
 * Asynchronously creates a usage log entry in the database.
 * This operation is deferred using `setImmediate` to ensure it does not block the main event loop
 * and allows the API response to be sent quickly. Errors during log creation are caught and logged.
 *
 * @param {object} logData - The data object for the usage log entry.
 * @param {Date} logData.timestamp - The timestamp of the request.
 * @param {string} logData.userId - The ID of the user who made the request.
 * @param {string | null} logData.tenantId - The ID of the tenant, or `null`.
 * @param {string} logData.module - The identified module of the request.
 * @param {string} logData.action - The identified action of the request.
 * @param {string} logData.endpoint - The original API endpoint.
 * @param {string} logData.method - The HTTP method.
 * @param {Date} logData.startTime - The start time of the request.
 * @param {Date} logData.endTime - The end time of the request.
 * @param {number} logData.duration - The duration of the request in milliseconds.
 * @param {'success' | 'error' | 'partial'} logData.status - The general status of the request.
 * @param {number} logData.statusCode - The HTTP status code of the response.
 * @param {string | null} logData.errorType - The specific error type, or `null`.
 * @param {string | null} logData.errorMessage - The error message, truncated to 500 characters, or `null`.
 * @param {number} logData.tokensUsed - The number of tokens used (e.g., for AI models).
 * @param {string | null} logData.modelUsed - The AI model used, if any.
 * @param {number} logData.inputSize - The size of the input payload in bytes.
 * @param {number} logData.outputSize - The size of the output payload in bytes.
 * @param {string} logData.requestId - A unique ID for the request.
 * @param {string | null} logData.ipAddress - The anonymized IP address of the client.
 * @param {string | null} logData.userAgent - The user agent string, truncated to 200 characters, or `null`.
 * @param {object} logData.metadata - Additional metadata related to the request.
 * @returns {void}
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
 * Logs details of an API request for usage tracking and analytics.
 * This function processes raw request data, categorizes it, and then asynchronously
 * persists it to the database. It calculates duration, maps endpoints to modules/actions,
 * determines status and error types, and anonymizes sensitive information like IP addresses.
 *
 * @param {object} data - The raw request data to be logged.
 * @param {string} data.userId - The ID of the user making the request.
 * @param {string | null} data.tenantId - The ID of the tenant associated with the request, or `null`.
 * @param {string} data.endpoint - The full API endpoint path.
 * @param {string} data.method - The HTTP method of the request.
 * @param {number} data.startTime - The timestamp (in milliseconds) when the request started.
 * @param {number} data.endTime - The timestamp (in milliseconds) when the request ended.
 * @param {number} data.statusCode - The HTTP status code returned by the response.
 * @param {string | null} [data.errorMessage=null] - An optional error message if the request failed.
 * @param {number} [data.tokensUsed=0] - The number of tokens consumed by the request (e.g., for AI services).
 * @param {string | null} [data.modelUsed=null] - The specific AI model used, if applicable.
 * @param {number} [data.inputSize=0] - The size of the request input payload in bytes.
 * @param {number} [data.outputSize=0] - The size of the response output payload in bytes.
 * @param {object} [data.metadata={}] - Additional arbitrary metadata to store with the log.
 * @param {string | null} [data.ipAddress=null] - The client's IP address.
 * @param {string | null} [data.userAgent=null] - The client's User-Agent header.
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
 * Retrieves a summary of usage for a specific tenant within a given date range.
 * This function delegates to the `UsageLog` model to fetch aggregated usage data.
 *
 * @param {string} tenantId - The ID of the tenant for whom to retrieve usage.
 * @param {Date} startDate - The start date for the usage period.
 * @param {Date} endDate - The end date for the usage period.
 * @returns {Promise<object[]>} A promise that resolves to an array of usage summary objects.
 * @throws {Error} If an error occurs during the database query.
 */
const getTenantUsage = async (tenantId, startDate, endDate) => {
  try {
    // Ensure UsageLog.getTenantUsageSummary uses .lean() if it returns Mongoose documents
    // to avoid overhead of Mongoose document instantiation.
    return await UsageLog.getTenantUsageSummary(tenantId, startDate, endDate);
  } catch (error) {
    logger.error('Error getting tenant usage summary:', error);
    throw error;
  }
};

/**
 * Retrieves a summary of usage for a specific user within a given date range.
 * This function delegates to the `UsageLog` model to fetch aggregated usage data.
 *
 * @param {string} userId - The ID of the user for whom to retrieve usage.
 * @param {Date} startDate - The start date for the usage period.
 * @param {Date} endDate - The end date for the usage period.
 * @returns {Promise<object[]>} A promise that resolves to an array of usage summary objects.
 * @throws {Error} If an error occurs during the database query.
 */
const getUserUsage = async (userId, startDate, endDate) => {
  try {
    // Ensure UsageLog.getUserUsageSummary uses .lean() if it returns Mongoose documents
    // to avoid overhead of Mongoose document instantiation.
    return await UsageLog.getUserUsageSummary(userId, startDate, endDate);
  } catch (error) {
    logger.error('Error getting user usage summary:', error);
    throw error;
  }
};

/**
 * Retrieves aggregated usage statistics based on various filters and a time period.
 * This function performs an aggregation pipeline on the `UsageLog` collection
 * to calculate total requests, success/error counts, average/max/min durations,
 * and total/average tokens used.
 *
 * @param {object} [filters={}] - An object containing optional filters for the usage statistics.
 * @param {string} [filters.tenantId] - Optional: Filter by a specific tenant ID.
 * @param {string} [filters.userId] - Optional: Filter by a specific user ID.
 * @param {string} [filters.module] - Optional: Filter by a specific module.
 * @param {Date} [filters.startDate=30 days ago] - Optional: The start date for the statistics period. Defaults to 30 days ago.
 * @param {Date} [filters.endDate=now] - Optional: The end date for the statistics period. Defaults to the current date.
 * @returns {Promise<object | null>} A promise that resolves to an object containing the aggregated usage statistics,
 *   or `null` if no data is found for the given filters.
 *   The returned object includes:
 *   - `totalRequests`: Total number of requests.
 *   - `successCount`: Number of successful requests.
 *   - `errorCount`: Number of erroneous requests.
 *   - `successRate`: Percentage of successful requests.
 *   - `avgDuration`: Average request duration in milliseconds.
 *   - `maxDuration`: Maximum request duration in milliseconds.
 *   - `minDuration`: Minimum request duration in milliseconds.
 *   - `totalTokens`: Total tokens used across all requests.
 *   - `avgTokens`: Average tokens used per request.
 * @throws {Error} If an error occurs during the aggregation query.
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

/**
 * @typedef {object} UsageLogService
 * @property {function(object): void} logRequest - Logs details of an API request for usage tracking.
 * @property {function(string, Date, Date): Promise<object[]>} getTenantUsage - Retrieves a summary of usage for a specific tenant.
 * @property {function(string, Date, Date): Promise<object[]>} getUserUsage - Retrieves a summary of usage for a specific user.
 * @property {function(object): Promise<object | null>} getUsageStats - Retrieves aggregated usage statistics based on filters.
 */

/**
 * Provides a collection of services for logging and retrieving API usage data.
 * This service encapsulates the business logic for tracking user and tenant interactions
 * with the application's various modules and endpoints.
 *
 * @type {UsageLogService}
 */
export const usageLogService = {
  logRequest,
  getTenantUsage,
  getUserUsage,
  getUsageStats,
};