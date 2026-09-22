import { TemporalService } from '../../temporal/temporal.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute workflow strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ type, args }, context = {}) {
  try {
    const { workflowId, status } = await TemporalService.startWorkflow({ workflowType: type, args });
    return { route: 'WORKFLOW', workflowId, status };
  } catch (error) {
    logger.error('Error in workflowStrategy', error);
    throw error;
  }
}
