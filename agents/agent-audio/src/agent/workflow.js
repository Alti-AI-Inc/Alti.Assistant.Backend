import { StateGraph, Annotation } from '@langchain/langgraph';
import audioService from '../services/audioService.js';
import { createLogger } from '../../../../shared/logging/index.js';

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

async function chatInterviewer(state) {
  logger.info('Running audio chat interviewer');
  if (state.state !== 'gather') return {};
  
  const reply = await audioService.gatherDetails(state.prompt, state.conversationHistory);
  return { reply };
}

async function confirmDetails(state) {
  logger.info('Running audio confirm details');
  if (state.state !== 'confirm') return {};

  const confirmation = await audioService.confirmDetails(state.prompt, state.conversationHistory);
  return { 
    reply: confirmation.reply,
    enhancedPrompt: confirmation.enhancedPrompt
  };
}

async function promptExpansion(state) {
  logger.info('Running prompt expansion');
  const basePrompt = state.enhancedPrompt || state.prompt;
  const enhanced = await audioService.enhancePrompt(basePrompt);
  return { enhancedPrompt: enhanced };
}

async function classifyIntent(state) {
  logger.info('Classifying intent');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await audioService.classifyAudioIntent(finalPrompt);
  return { audioType: result.audioType };
}

async function generateScript(state) {
  logger.info('Generating script');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await audioService.generateScript(finalPrompt, state.audioType);
  return { script: result.script };
}

async function selectVoiceProfile(state) {
  logger.info('Selecting voice profile');
  const voiceMap = {
    'podcast': 'Aoede',
    'commercial': 'Puck',
    'voiceover': 'Kore',
    'narration': 'Fenrir'
  };
  const voiceName = voiceMap[state.audioType] || 'Kore';
  return { voiceConfig: { voiceName } };
}

async function synthesizeSpeech(state) {
  logger.info('Synthesizing speech');
  const result = await audioService.synthesizeSpeech(state.script, state.voiceConfig);
  return { 
    audioBase64: result.audioBuffer.toString('base64'),
    metadata: result.metadata
  };
}

async function generateMusic(state) {
  logger.info('Generating music');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await audioService.generateMusic(finalPrompt);
  return {
    audioBase64: result.audioBuffer.toString('base64'),
    metadata: result.metadata
  };
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
  .addEdge('generateMusic', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting audio workflow');
  return await app.invoke(input);
}
