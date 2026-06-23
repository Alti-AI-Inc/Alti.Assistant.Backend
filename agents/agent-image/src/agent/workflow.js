import { StateGraph, Annotation } from '@langchain/langgraph';
import imageService from '../services/imageService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('imageWorkflow');

const ImageState = Annotation.Root({
  prompt: Annotation(),
  conversationHistory: Annotation({ default: () => [] }),
  state: Annotation(), // 'gather', 'confirm', 'generate'
  reply: Annotation(),
  enhancedPrompt: Annotation(),
  imageUrl: Annotation(),
  metadata: Annotation()
});

async function analyzeIntent(state) {
  logger.info('Analyzing image prompt intent');
  const currentState = await imageService.analyzeIntent(state.prompt, state.conversationHistory);
  return { state: currentState };
}

async function chatInterviewer(state) {
  logger.info('Running chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await imageService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

async function confirmDetails(state) {
  logger.info('Running confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await imageService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

async function promptExpansion(state) {
  logger.info('Running prompt expansion');
  const basePrompt = state.enhancedPrompt || state.prompt;
  const enhanced = await imageService.enhancePrompt(basePrompt);
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
  .addNode('analyzeIntent', analyzeIntent)
  .addNode('chatInterviewer', chatInterviewer)
  .addNode('confirmDetails', confirmDetails)
  .addNode('promptExpansion', promptExpansion)
  .addNode('generateImage', generateImage)
  
  .addEdge('__start__', 'analyzeIntent')
  .addConditionalEdges('analyzeIntent', (state) => {
    if (state.state === 'gather') return 'chatInterviewer';
    if (state.state === 'confirm') return 'confirmDetails';
    return 'promptExpansion';
  }, {
    'chatInterviewer': 'chatInterviewer',
    'confirmDetails': 'confirmDetails',
    'promptExpansion': 'promptExpansion'
  })
  
  .addEdge('confirmDetails', 'promptExpansion')
  .addEdge('promptExpansion', 'generateImage')
  .addEdge('chatInterviewer', '__end__')
  .addEdge('generateImage', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting image workflow');
  return await app.invoke(input);
}
