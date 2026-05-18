import express from 'express';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { paymentController } from './payment.controller.js';
const router = express.Router();

router
  .route('/create-checkout-session')
  .post(extractTenantContext, paymentController.createCheckoutSession);
router
  .route('/admin/all')
  .get(extractTenantContext, paymentController.getAllSubscriptions);
router
  .route('/:userId')
  .get(extractTenantContext, paymentController.getSubscriptionsByUserId);

// Stripe Webhook Handling (Needs raw body)
router
  .route('/webhook')
  .post(
    express.raw({ type: 'application/json' }),
    extractTenantContext,
    paymentController.handleWebhook
  );

export const subscriptionRoutes = router;
