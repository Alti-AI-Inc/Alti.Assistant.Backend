import axiosRetry from 'axios-retry';
import { logger } from './logger.js';

/**
 * Wraps an axios instance with exponential backoff retry logic.
 * This ensures the sovereign system can survive transient 5xx errors from 3rd party APIs.
 * 
 * @param {import('axios').AxiosInstance} axiosInstance 
 * @param {string} serviceName - Name of the service for logging
 * @returns {import('axios').AxiosInstance}
 */
export function withRetry(axiosInstance, serviceName = 'ExternalAPI') {
  axiosRetry(axiosInstance, { 
    retries: 3, 
    retryDelay: axiosRetry.exponentialDelay,
    retryCondition: (error) => {
      const isRetryable = axiosRetry.isNetworkOrIdempotentRequestError(error) || (error.response && error.response.status >= 500);
      if (isRetryable) {
        logger.warn(`[${serviceName}] API Error: ${error.message} (Status: ${error.response?.status}). Retrying...`);
      }
      return isRetryable;
    }
  });
  return axiosInstance;
}

export default withRetry;
