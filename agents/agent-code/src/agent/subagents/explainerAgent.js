import { createLogger } from '../../../../../shared/logging/index.js';
import { CodeService } from '../../services/codeService.js';

const { logger } = createLogger('code-explainer-agent');
const codeService = new CodeService();

function _extractCodeBlock(text) {
  const match = text.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

export async function explainCode(state) {
  logger.info('explainCode sub-agent');

  const codeToExplain = _extractCodeBlock(state.prompt) || state.prompt;
  const result = await codeService.explainCode(codeToExplain, state.userContext);

  return {
    explanation: result.explanation,
    metadata: result.metadata,
  };
}
