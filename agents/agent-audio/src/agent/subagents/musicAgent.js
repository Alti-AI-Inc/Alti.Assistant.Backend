import audioService from '../../services/audioService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('audioMusicAgent');

export async function generateMusic(state) {
  logger.info('Generating music');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await audioService.generateMusic(finalPrompt);
  return {
    audioBase64: result.audioBuffer.toString('base64'),
    metadata: result.metadata
  };
}
