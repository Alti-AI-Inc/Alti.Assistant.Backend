import audioService from '../../services/audioService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('audioGeneratorAgent');

export async function chatInterviewer(state) {
  logger.info('Running audio chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await audioService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

export async function confirmDetails(state) {
  logger.info('Running audio confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await audioService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

export async function promptExpansion(state) {
  logger.info('Running prompt expansion');
  const basePrompt = state.enhancedPrompt || state.prompt;
  const enhanced = await audioService.enhancePrompt(basePrompt);
  return { enhancedPrompt: enhanced };
}

export async function classifyIntent(state) {
  logger.info('Classifying intent');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await audioService.classifyAudioIntent(finalPrompt);
  return { audioType: result.audioType };
}
