import { logger } from '../../../shared/logger.js';
import { SupervisorService } from '../orchestrator/supervisor.service.js';

export const VoicePlatformWebhookService = {
  async handleVoiceIntent(payload) {
    const { callId, transcribedIntent, callerId } = payload;
    
    logger.info(`[Voice Platform Bridge] Received transcribed intent from External Voice Platform (Call ID: ${callId})`);
    logger.info(`[Voice Platform Bridge] Intent: "${transcribedIntent}"`);
    
    // Route the voice transcript to the Aphura Orchestrator
    const { route } = await SupervisorService.routePrompt(transcribedIntent);
    
    logger.info(`[Voice Platform Bridge] Agent logic resolved. Returning action payload to Voice Platform.`);
    
    return {
      success: true,
      callId,
      aphuraRoute: route,
      synthesizedResponse: `I have triggered the ${route} protocol on your Liberty Center One backend.`
    };
  }
};
