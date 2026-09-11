import express from 'express';
import { ResearchWebhookController } from './exaResearch.webhook.controller.js';

const router = express.Router();

// Mount this router directly on the app (not behind the space-scoped/auth
// router), and register the webhook URL with `POST /webhooks` on Exa's side
// (see the Websets reference doc's Webhook section). express.raw() here is
// required for HMAC signature verification — if a global express.json()
// runs first, req.body will already be parsed and the raw bytes will be lost.
router.post(
  '/webset-webhook',
  express.raw({ type: 'application/json' }),
  ResearchWebhookController.handleWebsetWebhook
);

export const ResearchWebhookRoutes = router;
export default router;
