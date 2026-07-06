import audioService from '../../services/audioService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('audioSpeechAgent');

export async function generateScript(state) {
  logger.info('Generating script');
  const finalPrompt = state.enhancedPrompt || state.prompt;
  const result = await audioService.generateScript(finalPrompt, state.audioType);
  return { script: result.script };
}

export async function selectVoiceProfile(state) {
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

export async function synthesizeSpeech(state) {
  logger.info('Synthesizing speech');
  const result = await audioService.synthesizeSpeech(state.script, state.voiceConfig);
  return { 
    audioBase64: result.audioBuffer.toString('base64'),
    audioUrl: result.audioUrl,
    metadata: result.metadata
  };
}
