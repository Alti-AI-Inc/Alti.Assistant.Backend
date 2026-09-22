import { OpenClawService } from '../../openclaw/openclaw.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute agent strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute(params, context = {}) {
  try {
    let agentId = params.agentId;
    let reply;

    if (agentId) {
      reply = await OpenClawService.sendMessage(agentId, params.message);
    } else {
      const agent = await OpenClawService.createAgent(params.agentConfig || {});
      agentId = agent.agentId;
      reply = agent.initialReply || 'Agent created';
    }

    return { route: 'AGENT', agentId, reply };
  } catch (error) {
    logger.error('Error in agentStrategy', error);
    throw error;
  }
}
