import { logger } from '../logger.js';

export const withExponentialBackoff = async (operation, maxRetries = 3, baseDelayMs = 1000) => {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      return await operation();
    } catch (error) {
      attempt++;
      
      // Specifically check if it's a rate limit (429) or transient 5xx error
      const isTransient = error.status === 429 || error.status >= 500 || error.message.includes('rate limit');
      
      if (!isTransient || attempt >= maxRetries) {
        logger.error(`[Retry Strategy] Operation failed permanently after ${attempt} attempts: ${error.message}`);
        throw error;
      }
      
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(`[Retry Strategy] Transient error detected (${error.message}). Retrying in ${delay}ms (Attempt ${attempt + 1}/${maxRetries})...`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
};
