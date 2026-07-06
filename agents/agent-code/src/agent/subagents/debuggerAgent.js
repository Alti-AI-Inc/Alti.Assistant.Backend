import { createLogger } from '../../../../../shared/logging/index.js';
import { CodeService } from '../../services/codeService.js';

const { logger } = createLogger('code-debugger-agent');
const codeService = new CodeService();

function _extractCodeBlock(text) {
  const match = text.match(/```(?:\w+)?\s*\n([\s\S]*?)\n```/);
  return match ? match[1].trim() : null;
}

export async function debugCode(state) {
  logger.info('debugCode sub-agent', { error: state.error?.substring(0, 80) });

  const codeToDebug = _extractCodeBlock(state.prompt) || state.prompt;
  const result = await codeService.debugCode(codeToDebug, state.error, state.userContext);

  return {
    code: result.fixedCode,
    explanation: result.explanation,
    metadata: result.metadata,
  };
}
