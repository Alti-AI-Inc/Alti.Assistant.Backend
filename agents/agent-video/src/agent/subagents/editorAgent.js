import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('videoEditorAgent');

export async function editVideo(state) {
  logger.info('Editing video (mock)');
  return { 
    reply: 'Video edited successfully (mock implementation).',
    metadata: { action: 'edit' }
  };
}
