import imageService from '../../services/imageService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('imageGeneratorAgent');

export async function chatInterviewer(state) {
  logger.info('Running chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await imageService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

export async function confirmDetails(state) {
  logger.info('Running confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await imageService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

export async function promptExpansion(state) {
  logger.info('Running prompt expansion');
  const basePrompt = state.enhancedPrompt || state.prompt;
  const enhanced = await imageService.enhancePrompt(basePrompt);
  return { enhancedPrompt: enhanced };
}

export async function generateImage(state) {
  logger.info('Generating image');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await imageService.generateImage(finalPrompt, {});
  return { 
    imageUrl: result.imageUrl,
    metadata: result.metadata
  };
}
