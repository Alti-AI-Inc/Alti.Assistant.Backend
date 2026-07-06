import { StateGraph, Annotation } from '@langchain/langgraph';
import videoService from '../services/videoService.js';
import { createLogger } from '../../../../shared/logging/index.js';
import { chatInterviewer, confirmDetails, analyzeVideoPrompt, createStoryboard, generateVideo } from './subagents/generatorAgent.js';
import { editVideo } from './subagents/editorAgent.js';

const { logger } = createLogger('videoWorkflow');

const VideoState = Annotation.Root({
  prompt: Annotation(),
  conversationHistory: Annotation({ default: () => [] }),
  state: Annotation(), // 'gather', 'confirm', 'generate'
  reply: Annotation(),
  enhancedPrompt: Annotation(),
  qualityTier: Annotation(),
  storyboard: Annotation(),
  videoUrl: Annotation(),
  operationName: Annotation(),
  metadata: Annotation()
});

async function analyzeIntent(state) {
  logger.info('Analyzing video prompt intent');
  const currentState = await videoService.analyzeIntent(state.prompt, state.conversationHistory);
  return { state: currentState };
}

const workflow = new StateGraph(VideoState)
  .addNode('analyzeIntent', analyzeIntent)
  .addNode('chatInterviewer', chatInterviewer)
  .addNode('confirmDetails', confirmDetails)
  .addNode('analyzeVideoPrompt', analyzeVideoPrompt)
  .addNode('createStoryboard', createStoryboard)
  .addNode('generateVideo', generateVideo)
  .addNode('editVideo', editVideo)
  
  .addEdge('__start__', 'analyzeIntent')
  .addConditionalEdges('analyzeIntent', (state) => {
    if (state.state === 'gather') return 'chatInterviewer';
    if (state.state === 'confirm') return 'confirmDetails';
    if (state.state === 'edit') return 'editVideo';
    return 'analyzeVideoPrompt'; // proceed to generate
  }, {
    'chatInterviewer': 'chatInterviewer',
    'confirmDetails': 'confirmDetails',
    'analyzeVideoPrompt': 'analyzeVideoPrompt',
    'editVideo': 'editVideo'
  })
  
  .addEdge('chatInterviewer', '__end__')
  .addEdge('confirmDetails', '__end__')
  .addEdge('analyzeVideoPrompt', 'createStoryboard')
  .addEdge('createStoryboard', 'generateVideo')
  .addEdge('generateVideo', '__end__')
  .addEdge('editVideo', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting video workflow');
  return await app.invoke(input);
}
