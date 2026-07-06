import { createLogger } from '../../../../../shared/logging/index.js';
import { CodeService } from '../../services/codeService.js';

const { logger } = createLogger('code-reviewer-agent');
const codeService = new CodeService();

function _extractCodeBlock(text) {
  const match = text.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

export async function reviewCode(state) {
  logger.info('reviewCode sub-agent');

  const codeToReview = _extractCodeBlock(state.prompt) || state.prompt;
  const result = await codeService.reviewCode(codeToReview, state.userContext);

  return {
    review: {
      summary: result.review,
      issues: result.issues,
      suggestions: result.suggestions,
      securityFlags: result.securityFlags,
      score: result.score,
    },
    metadata: result.metadata,
  };
}
