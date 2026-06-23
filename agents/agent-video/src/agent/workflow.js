import { StateGraph, Annotation } from '@langchain/langgraph';
import videoService from '../services/videoService.js';
import { createLogger } from '../../../../shared/logging/index.js';

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

async function chatInterviewer(state) {
  logger.info('Running video chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await videoService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

async function confirmDetails(state) {
  logger.info('Running video confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await videoService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

async function analyzeVideoPrompt(state) {
  logger.info('Analyzing video prompt for generation');
  return { qualityTier: 'standard' };
}

async function createStoryboard(state) {
  logger.info('Creating storyboard');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const storyboard = await videoService.createStoryboard(finalPrompt);
  return { storyboard };
}

async function generateVideo(state) {
  logger.info('Generating video');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await videoService.generateVideo(finalPrompt, {});
  return { 
    videoUrl: result.videoUrl,
    operationName: result.metadata.operationName,
    metadata: result.metadata
  };
}

const workflow = new StateGraph(VideoState)
  .addNode('analyzeIntent', analyzeIntent)
  .addNode('chatInterviewer', chatInterviewer)
  .addNode('confirmDetails', confirmDetails)
  .addNode('analyzeVideoPrompt', analyzeVideoPrompt)
  .addNode('createStoryboard', createStoryboard)
  .addNode('generateVideo', generateVideo)
  
  .addEdge('__start__', 'analyzeIntent')
  .addConditionalEdges('analyzeIntent', (state) => {
    if (state.state === 'gather') return 'chatInterviewer';
    if (state.state === 'confirm') return 'confirmDetails';
    return 'analyzeVideoPrompt'; // proceed to generate
  }, {
    'chatInterviewer': 'chatInterviewer',
    'confirmDetails': 'confirmDetails',
    'analyzeVideoPrompt': 'analyzeVideoPrompt'
  })
  
  .addEdge('chatInterviewer', '__end__')
  .addEdge('confirmDetails', '__end__')
  .addEdge('analyzeVideoPrompt', 'createStoryboard')
  .addEdge('createStoryboard', 'generateVideo')
  .addEdge('generateVideo', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting video workflow');
  return await app.invoke(input);
}
