import { createLogger } from '../../../../../shared/logging/index.js';
import { CodeService } from '../../services/codeService.js';

const { logger } = createLogger('architectAgent');
const codeService = new CodeService();

export async function architectCode(state) {
  logger.info('Architecting code');

  const result = await codeService.architectCode(state.prompt, state.userContext);

  return { 
    explanation: result.explanation,
    metadata: { ...state.metadata, ...result.metadata, architected: true }
  };
}
