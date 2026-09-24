import { WebSocketServer } from 'ws';
import { logger } from '../../../shared/logger.js';
import { SovereignRouterService } from '../orchestrator/sovereignRouter.service.js';
import { SpeechService } from "./speech.service.js";
export const VoiceGateway = {
  wss: null,
  
  initialize(server) {
    this.wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
      if (request.url.startsWith('/api/v1/voice/stream')) {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
    });

    this.wss.on('connection', (ws, request) => {
      logger.info(`[Voice Gateway] 🎤 High-Fidelity Audio Stream connected`);
      
      let audioBuffer = [];

      ws.on('message', async (message, isBinary) => {
        if (isBinary) {
          // In a real integration, pipe these binary Opus/PCM frames directly into Whisper/Cartesia
          audioBuffer.push(message);
        } else {
          try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'end_of_speech') {
              // Simulate STT conversion
              const transcribedText = await SpeechService.transcribeAudio(Buffer.concat(audioBuffer));
              logger.info(`[Voice Gateway] Speech transcribed: ${transcribedText}`);
              
              // Route directly into the MoE Router
              const result = await SovereignRouterService.handlePromptJson({
                prompt: transcribedText,
                sessionId: data.sessionId || 'voice-session',
                userId: 'admin_user',
                userContext: {}
              });
              
              // In a real system, we would stream binary TTS (e.g., ElevenLabs) back to the socket.
              // For now, we return the text and let Flutter handle local TTS.
              const synthesizedAudio = await SpeechService.synthesizeSpeech(result.output);
              ws.send(synthesizedAudio, { binary: true });
              ws.send(JSON.stringify({
                type: 'voice_response',
                text: result.output,
                emotion: 'neutral'
              }));
              
              audioBuffer = []; // Reset
            }
          } catch (e) {
            logger.error(`[Voice Gateway] Message error: ${e.message}`);
          }
        }
      });

      ws.on('close', () => {
        logger.info(`[Voice Gateway] Audio Stream disconnected`);
      });
    });
    
    logger.info('🚀 Advanced Voice Streaming Bridge initialized on Aphura Edge');
  }
};
