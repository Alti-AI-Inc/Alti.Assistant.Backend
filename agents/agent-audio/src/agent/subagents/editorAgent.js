import audioService from '../../services/audioService.js';
import { createLogger } from '../../../../../shared/logging/index.js';

const { logger } = createLogger('audioEditorAgent');

export async function editAudio(state) {
  logger.info('Editing audio');
  const action = state.metadata?.editAction || 'mix';
  
  if (action === 'mix') {
    const speechBuffer = state.audioBase64 ? Buffer.from(state.audioBase64, 'base64') : null;
    const musicBuffer = state.metadata?.musicBase64 ? Buffer.from(state.metadata.musicBase64, 'base64') : null;
    
    const result = await audioService.mixAudio(speechBuffer, musicBuffer);
    return {
      audioBase64: result.audioBuffer.toString('base64'),
      metadata: { ...state.metadata, ...result.metadata }
    };
  } else if (action === 'transferTone') {
    const audioBuffer = state.audioBase64 ? Buffer.from(state.audioBase64, 'base64') : null;
    const targetTone = state.metadata?.targetTone || 'energetic';
    
    if (!audioBuffer) throw new Error('No audio buffer provided for tone transfer');
    
    const result = await audioService.transferTone(audioBuffer, targetTone);
    return {
      audioBase64: result.audioBuffer.toString('base64'),
      metadata: { ...state.metadata, ...result.metadata }
    };
  }

  return { 
    reply: 'Audio edited successfully.',
    metadata: { action: 'edit' }
  };
}
