import { StateGraph, Annotation } from '@langchain/langgraph';
import audioService from '../services/audioService.js';
import { createLogger } from '../../../../shared/logging/index.js';
import { chatInterviewer, confirmDetails, promptExpansion, classifyIntent } from './subagents/generatorAgent.js';
import { generateScript, selectVoiceProfile, synthesizeSpeech } from './subagents/speechAgent.js';
import { generateMusic } from './subagents/musicAgent.js';
import { editAudio } from './subagents/editorAgent.js';

const { logger } = createLogger('audioWorkflow');

const AudioState = Annotation.Root({
  prompt: Annotation(),
  conversationHistory: Annotation({ default: () => [] }),
  state: Annotation(), // 'gather', 'confirm', 'generate'
  reply: Annotation(),
  enhancedPrompt: Annotation(),
  audioType: Annotation(),
  script: Annotation(),
  voiceConfig: Annotation(),
  audioBase64: Annotation(),
  metadata: Annotation()
});

async function analyzeIntent(state) {
  logger.info('Analyzing audio prompt intent');
  const currentState = await audioService.analyzeIntent(state.prompt, state.conversationHistory);
  return { state: currentState };
}

const workflow = new StateGraph(AudioState)
  .addNode('analyzeIntent', analyzeIntent)
  .addNode('chatInterviewer', chatInterviewer)
  .addNode('confirmDetails', confirmDetails)
  .addNode('promptExpansion', promptExpansion)
  .addNode('classifyIntent', classifyIntent)
  .addNode('generateScript', generateScript)
  .addNode('selectVoiceProfile', selectVoiceProfile)
  .addNode('synthesizeSpeech', synthesizeSpeech)
  .addNode('generateMusic', generateMusic)
  .addNode('editAudio', editAudio)
  
  .addEdge('__start__', 'analyzeIntent')
  .addConditionalEdges('analyzeIntent', (state) => {
    if (state.state === 'gather') return 'chatInterviewer';
    if (state.state === 'confirm') return 'confirmDetails';
    if (state.state === 'edit') return 'editAudio';
    return 'promptExpansion';
  }, {
    'chatInterviewer': 'chatInterviewer',
    'confirmDetails': 'confirmDetails',
    'promptExpansion': 'promptExpansion',
    'editAudio': 'editAudio'
  })
  
  .addEdge('confirmDetails', 'promptExpansion')
  .addEdge('promptExpansion', 'classifyIntent')
  .addConditionalEdges('classifyIntent', (state) => {
    if (state.audioType === 'music') return 'generateMusic';
    return 'generateScript';
  }, {
    'generateMusic': 'generateMusic',
    'generateScript': 'generateScript'
  })
  
  .addEdge('generateScript', 'selectVoiceProfile')
  .addEdge('selectVoiceProfile', 'synthesizeSpeech')
  
  .addEdge('chatInterviewer', '__end__')
  .addEdge('synthesizeSpeech', '__end__')
  .addEdge('generateMusic', '__end__')
  .addEdge('editAudio', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting audio workflow');
  return await app.invoke(input);
}
