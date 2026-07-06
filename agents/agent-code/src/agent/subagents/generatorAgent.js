import { createLogger } from '../../../../../shared/logging/index.js';
import { CodeService } from '../../services/codeService.js';

const { logger } = createLogger('code-generator-agent');
const codeService = new CodeService();

export async function generateCode(state) {
  logger.info('generateCode sub-agent', { language: state.language });

  const result = await codeService.generateCode(
    state.prompt,
    state.userContext,
    { language: state.language }
  );

  return {
    code: result.code,
    tests: result.tests,
    explanation: result.explanation,
    metadata: result.metadata,
  };
}
