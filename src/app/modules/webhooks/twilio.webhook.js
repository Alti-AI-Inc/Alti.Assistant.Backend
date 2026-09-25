import { logger } from '../../../shared/logger.js';
import { SupervisorService } from '../orchestrator/supervisor.service.js';

export const TwilioWebhookService = {
  async handleIncomingSMS(payload) {
    const fromNumber = payload.From;
    const body = payload.Body;
    
    logger.info(`[Twilio Webhook] Received SMS from ${fromNumber}: "${body}"`);
    logger.info(`[Twilio Webhook] Routing SMS prompt to LangChain Supervisor...`);
    
    // Route the SMS text just like a chat prompt
    const { route } = await SupervisorService.routePrompt(body);
    
    logger.info(`[Twilio Webhook] Supervisor selected route: ${route}. Triggering background execution...`);
    
    // In production, return TwiML to reply via SMS, or dispatch async response
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>Aphura Agent received your command. Routing to: ${route}. You will receive a text when execution completes.</Message>
</Response>`;
  }
};
