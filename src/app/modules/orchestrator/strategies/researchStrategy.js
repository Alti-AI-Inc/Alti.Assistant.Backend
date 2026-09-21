import { logger } from '../../../../shared/logger.js';

/**
 * Execute research strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ query, depth }, context = {}) {
  try {
    const response = await fetch('https://api.exa.ai/agent/runs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.EXA_API_KEY
      },
      body: JSON.stringify({ query, depth })
    });
    
    const data = await response.json();

    return { route: 'RESEARCH', runId: data.id, status: data.status };
  } catch (error) {
    logger.error('Error in researchStrategy', error);
    throw error;
  }
}
