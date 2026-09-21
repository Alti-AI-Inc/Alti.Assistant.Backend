import { LangChainService } from '../../langchain/langchain.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute reasoning strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ goal, context: reasoningContext }, context = {}) {
  try {
    const { plan, solution, critique } = await LangChainService.runReasoningGraph({ goal, context: reasoningContext });
    return { route: 'REASONING', plan, solution, critique };
  } catch (error) {
    logger.error('Error in reasoningStrategy', error);
    throw error;
  }
}
