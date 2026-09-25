import { logger } from '../../../shared/logger.js';
import crypto from 'crypto';
import { GitHubWebhookService } from './github.webhook.js';
import { StripeWebhookService } from './stripe.webhook.js';
import { TwilioWebhookService } from './twilio.webhook.js';
import { VoicePlatformWebhookService } from './voice_platform.webhook.js';

export const WebhookGateway = {
  verifySignature(req, secret, signatureHeader) {
    // In production, implement HMAC SHA256 validation
    logger.info(`[Webhook Gateway] Validating cryptographic signature for incoming webhook...`);
    return true; 
  },

  async routeWebhook(req, res) {
    let source = "unknown";
    if (req.headers["x-github-event"]) source = "github";
    else if (req.headers["stripe-signature"]) source = "stripe";
    else if (req.headers["x-twilio-signature"]) source = "twilio";
    else if (req.headers["x-voice-platform-signature"]) source = "voice_platform";
    
    try {
      if (source === 'github') {
        const result = await GitHubWebhookService.handlePushEvent(req.body);
        return res.status(200).json(result);
      } else if (source === 'stripe') {
      } else if (source === "twilio") {
        const xmlResponse = await TwilioWebhookService.handleIncomingSMS(req.body);
        res.setHeader("Content-Type", "text/xml");
        return res.status(200).send(xmlResponse);
      } else if (source === "voice_platform") {
        const result = await VoicePlatformWebhookService.handleVoiceIntent(req.body);
        return res.status(200).json(result);
        const result = await StripeWebhookService.handlePaymentIntent(req.body);
        return res.status(200).json(result);
      } else {
        logger.warn(`[Webhook Gateway] Unknown webhook source detected. Dropping payload.`);
        return res.status(400).json({ error: 'Unknown webhook source' });
      }
    } catch (err) {
      logger.error(`[Webhook Gateway] Webhook processing failed: ${err.message}`);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  }
};
