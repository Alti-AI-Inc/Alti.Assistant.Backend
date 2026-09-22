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
        result = await CodexService.generateCode(rest);
        break;
      case 'explain':
        result = await CodexService.explainCode(rest);
        break;
      case 'refactor':
        result = await CodexService.refactorCode(rest);
        break;
      case 'review':
        result = await CodexService.reviewCode(rest);
        break;
      case 'execute':
        result = await CodexService.executeCode(rest);
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
