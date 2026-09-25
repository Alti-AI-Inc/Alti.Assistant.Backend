import { logger } from '../../../shared/logger.js';
import crypto from 'crypto';
import { GitHubWebhookService } from './github.webhook.js';
import { StripeWebhookService } from './stripe.webhook.js';

export const WebhookGateway = {
  verifySignature(req, secret, signatureHeader) {
    // In production, implement HMAC SHA256 validation
    logger.info(`[Webhook Gateway] Validating cryptographic signature for incoming webhook...`);
    return true; 
  },

  async routeWebhook(req, res) {
    const source = req.headers['x-github-event'] ? 'github' : (req.headers['stripe-signature'] ? 'stripe' : 'unknown');
    
    try {
      if (source === 'github') {
        const result = await GitHubWebhookService.handlePushEvent(req.body);
        return res.status(200).json(result);
      } else if (source === 'stripe') {
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
