import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('imageEditorAgent');

export async function editImage(state) {
  logger.info('Editing image (mock)');
  return { 
    reply: 'Image edited successfully (mock implementation).',
    metadata: { action: 'edit' }
  };
}
