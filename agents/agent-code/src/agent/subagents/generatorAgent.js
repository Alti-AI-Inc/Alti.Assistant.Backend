import { createLogger } from '../../../../../shared/logging/index.js';
import { CodeService } from '../../services/codeService.js';

const { logger } = createLogger('code-generator-agent');
const codeService = new CodeService();

export async function generateCode(state) {
  logger.info('generateCode sub-agent', { language: state.language });

  // If in swarm mode, explanation holds the architecture design from architectAgent
  const promptToUse = state.isSwarm && state.explanation 
    ? `Architecture Design:\n${state.explanation}\n\nTask:\n${state.prompt}`
    : state.prompt;

  const result = await codeService.generateCode(
    promptToUse,
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
