import { WorkerOptions, cli, VoicePipelineAgent, llm } from '@livekit/agents';
import * as silero from '@livekit/agents-plugin-silero';
import * as google from '@livekit/agents-plugin-google';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';

/**
 * Initializes and runs the LiveKit Voice Agent via Google Cloud
 */
export async function runVoiceAgentWorker() {
  try {
    logger.info('Initializing LiveKit Google Cloud Voice Agent Worker...');
    
    cli.runApp(new WorkerOptions({
      agent: async (ctx) => {
        logger.info(`Voice Agent connecting to room: ${ctx.room.name}`);

        const initialContext = new llm.ChatContext().append({
          role: llm.ChatRole.SYSTEM,
          text: 'You are Inso AI, a highly intelligent and helpful voice assistant. Keep your answers concise, conversational, and directly address the user.',
        });

        const agent = new VoicePipelineAgent(
          await silero.VAD.load(),
          new google.STT(),
          new google.LLM(),
          new google.TTS(),
          { chatCtx: initialContext }
        );

        agent.start(ctx.room, ctx.participant);

        const greeting = 'Hello! I am Inso AI. How can I help you today?';
        await agent.say(greeting, true);
        logger.info('Voice Agent initialized and ready.');
      },
      apiKey: config.livekit_api_key,
      apiSecret: config.livekit_secret_key,
      wsUrl: config.livekit_ws_url || 'ws://localhost:7880',
    }));
  } catch (error) {
    logger.error('Failed to initialize LiveKit Voice Agent Worker', error);
  }
}
