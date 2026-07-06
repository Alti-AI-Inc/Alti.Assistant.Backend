import videoService from '../../services/videoService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('videoGeneratorAgent');

export async function chatInterviewer(state) {
  logger.info('Running video chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await videoService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

export async function confirmDetails(state) {
  logger.info('Running video confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await videoService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

export async function analyzeVideoPrompt(state) {
  logger.info('Analyzing video prompt for generation');
  return { qualityTier: 'standard' };
}

export async function createStoryboard(state) {
  logger.info('Creating storyboard');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const storyboard = await videoService.createStoryboard(finalPrompt);
  return { storyboard };
}

export async function generateVideo(state) {
  logger.info('Generating video');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await videoService.generateVideo(finalPrompt, { 
    referenceImage: state.referenceImage 
  });
  return { 
    videoUrl: result.videoUrl,
    operationName: result.metadata.operationName,
    metadata: result.metadata
  };
}
