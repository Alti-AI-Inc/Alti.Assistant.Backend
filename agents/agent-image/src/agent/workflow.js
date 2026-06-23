import { StateGraph, Annotation } from '@langchain/langgraph';
import imageService from '../services/imageService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('imageWorkflow');

const ImageState = Annotation.Root({
  prompt: Annotation(),
  enhancedPrompt: Annotation(),
  intent: Annotation(),
  imageUrl: Annotation(),
  metadata: Annotation()
});

async function analyzePrompt(state) {
  logger.info('Analyzing image prompt intent');
  // Simple heuristic for now; in production we'd use LLM classification
  const isEditing = state.prompt.toLowerCase().includes('edit') || state.prompt.toLowerCase().includes('change');
  return { intent: isEditing ? 'edit' : 'generate' };
}

async function compilePrompt(state) {
  logger.info('Compiling/enhancing prompt');
  if (state.intent === 'edit') return {}; // Skip enhancement for edits
  const enhanced = await imageService.enhancePrompt(state.prompt);
  return { enhancedPrompt: enhanced };
}

async function generateImage(state) {
  logger.info('Generating image');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await imageService.generateImage(finalPrompt, {});
  return { 
    imageUrl: result.imageUrl,
    metadata: result.metadata
  };
}

const workflow = new StateGraph(ImageState)
  .addNode('analyzePrompt', analyzePrompt)
  .addNode('compilePrompt', compilePrompt)
  .addNode('generateImage', generateImage)
  .addEdge('__start__', 'analyzePrompt')
  .addEdge('analyzePrompt', 'compilePrompt')
  .addEdge('compilePrompt', 'generateImage')
  .addEdge('generateImage', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting image workflow');
  return await app.invoke(input);
}
