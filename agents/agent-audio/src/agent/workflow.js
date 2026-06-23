import { StateGraph, Annotation } from '@langchain/langgraph';
import audioService from '../services/audioService.js';
import { createLogger } from '../../../../shared/logging/index.js';

const { logger } = createLogger('audioWorkflow');

const AudioState = Annotation.Root({
  prompt: Annotation(),
  audioType: Annotation(),
  script: Annotation(),
  voiceConfig: Annotation(),
  audioBase64: Annotation(),
  metadata: Annotation()
});

async function classifyIntent(state) {
  logger.info('Classifying intent');
  const result = await audioService.classifyAudioIntent(state.prompt);
  return { audioType: result.audioType };
}

async function generateScript(state) {
  logger.info('Generating script');
  const result = await audioService.generateScript(state.prompt, state.audioType);
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

const workflow = new StateGraph(AudioState)
  .addNode('classifyIntent', classifyIntent)
  .addNode('generateScript', generateScript)
  .addNode('selectVoiceProfile', selectVoiceProfile)
  .addNode('synthesizeSpeech', synthesizeSpeech)
  .addEdge('__start__', 'classifyIntent')
  .addEdge('classifyIntent', 'generateScript')
  .addEdge('generateScript', 'selectVoiceProfile')
  .addEdge('selectVoiceProfile', 'synthesizeSpeech')
  .addEdge('synthesizeSpeech', '__end__');

export const app = workflow.compile();

export async function runWorkflow(input) {
  logger.info('Starting audio workflow');
  return await app.invoke(input);
}
