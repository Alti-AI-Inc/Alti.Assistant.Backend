import { StateGraph, Annotation } from '@langchain/langgraph';
import videoService from '../services/videoService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('videoWorkflow');

const VideoState = Annotation.Root({
  prompt: Annotation(),
  enhancedPrompt: Annotation(),
  qualityTier: Annotation(),
  videoUrl: Annotation(),
  operationName: Annotation(),
  metadata: Annotation()
});

async function analyzeVideoPrompt(state) {
  logger.info('Analyzing video prompt');
  return { qualityTier: 'standard' };
}

async function compileVideoPrompt(state) {
  logger.info('Compiling video prompt');
  const enhanced = await videoService.enhancePrompt(state.prompt);
  return { enhancedPrompt: enhanced };
}

async function generateVideo(state) {
  logger.info('Generating video');
  const result = await videoService.generateVideo(state.prompt, {});
  return { 
    videoUrl: result.videoUrl,
    operationName: result.metadata.operationName,
    metadata: result.metadata
  };
}

const workflow = new StateGraph(VideoState)
  .addNode('analyzeVideoPrompt', analyzeVideoPrompt)
  .addNode('compileVideoPrompt', compileVideoPrompt)
  .addNode('generateVideo', generateVideo)
  .addEdge('__start__', 'analyzeVideoPrompt')
  .addEdge('analyzeVideoPrompt', 'compileVideoPrompt')
  .addEdge('compileVideoPrompt', 'generateVideo')
  .addEdge('generateVideo', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting video workflow');
  return await app.invoke(input);
}
