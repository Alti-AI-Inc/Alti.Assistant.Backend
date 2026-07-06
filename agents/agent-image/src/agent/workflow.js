import { StateGraph, Annotation } from '@langchain/langgraph';
import imageService from '../services/imageService.js';
import { createLogger } from '../../../../shared/logging/index.js';
import { chatInterviewer, confirmDetails, promptExpansion, generateImage } from './subagents/generatorAgent.js';
import { editImage } from './subagents/editorAgent.js';
import { upscaleImage } from './subagents/upscalerAgent.js';

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

const workflow = new StateGraph(ImageState)
  .addNode('analyzeIntent', analyzeIntent)
  .addNode('chatInterviewer', chatInterviewer)
  .addNode('confirmDetails', confirmDetails)
  .addNode('promptExpansion', promptExpansion)
  .addNode('generateImage', generateImage)
  .addNode('editImage', editImage)
  .addNode('upscaleImage', upscaleImage)
  
  .addEdge('__start__', 'analyzeIntent')
  .addConditionalEdges('analyzeIntent', (state) => {
    if (state.state === 'gather') return 'chatInterviewer';
    if (state.state === 'confirm') return 'confirmDetails';
    if (state.state === 'edit') return 'editImage';
    if (state.state === 'upscale') return 'upscaleImage';
    return 'promptExpansion';
  }, {
    'chatInterviewer': 'chatInterviewer',
    'confirmDetails': 'confirmDetails',
    'promptExpansion': 'promptExpansion',
    'editImage': 'editImage',
    'upscaleImage': 'upscaleImage'
  })
  
  .addEdge('confirmDetails', 'promptExpansion')
  .addEdge('promptExpansion', 'generateImage')
  .addEdge('chatInterviewer', '__end__')
  .addEdge('generateImage', '__end__')
  .addEdge('editImage', '__end__')
  .addEdge('upscaleImage', '__end__');
  


export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting image workflow');
  return await app.invoke(input);
}
