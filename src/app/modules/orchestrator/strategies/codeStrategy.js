import { CodexService } from '../../codex/codex.service.js';
import { logger } from '../../../../shared/logger.js';

/**
 * Execute code strategy.
 * @param {Object} params
 * @param {Object} context
 */
export async function execute(params, context = {}) {
  try {
    const { subIntent, ...rest } = params;
    let result;

    switch (subIntent) {
      case 'generate':
        result = await CodexService.generate(rest);
        break;
      case 'explain':
        result = await CodexService.explain(rest);
        break;
      case 'refactor':
        result = await CodexService.refactor(rest);
        break;
      case 'review':
        result = await CodexService.review(rest);
        break;
      case 'execute':
        result = await CodexService.execute(rest);
        break;
      default:
        throw new Error('Unknown subIntent for code strategy');
    }

    return { route: 'CODE', subRoute: subIntent, result };
  } catch (error) {
    logger.error('Error in codeStrategy', error);
    throw error;
  }
}
