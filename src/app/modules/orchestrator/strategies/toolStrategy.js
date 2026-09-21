import { ComposioService } from '../../composio/composio.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute tool strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute({ query, params }, context = {}) {
  try {
    const tools = await ComposioService.searchTools(query);
    const toolSlug = tools?.[0]?.slug;
    
    if (!toolSlug) {
      throw new Error('No tool found for the given query.');
    }

    const result = await ComposioService.executeTool(toolSlug, params);
    return { route: 'TOOL_CALL', toolSlug, result };
  } catch (error) {
    logger.error('Error in toolStrategy', error);
    throw error;
  }
}
