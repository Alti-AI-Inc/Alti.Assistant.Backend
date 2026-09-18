import express from 'express';
import subscriptionController from './subscription.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext, requireTenantAdmin } from '../../middlewares/tenant/tenantContext.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';


const billingLimiter = createRateLimiter(5, 10); // Max 10 billing actions per 5 minutes

const router = express.Router();

router.post('/webhook', subscriptionController.handleStripeWebhook);

router.get('/plans', subscriptionController.getAvailablePlans);

router.use(auth());

router.get('/my-subscription', subscriptionController.getMySubscription);

router.get(
  '/tenant/:tenantId',
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.getTenantSubscription
);

router.post('/create-free', subscriptionController.createFreeSubscription);

router.post('/upgrade', billingLimiter, subscriptionController.upgradeSubscription);

router.post('/confirm-payment', billingLimiter, subscriptionController.confirmPayment);

router.post('/process-checkout', subscriptionController.processCheckout);

router.post('/billing-portal', billingLimiter, subscriptionController.createBillingPortalSession);

router.post(
  '/cancel',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.cancelSubscription
);

router.post(
  '/add-seat',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.addSeat
);

router.post(
  '/remove-seat',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.removeSeat
);

router.get('/usage-limit/:limitType', subscriptionController.checkUsageLimit);

router.get('/check-limit', subscriptionController.checkUsageLimit);

router.post('/increment-usage', subscriptionController.incrementUsage);

router.get('/usage-stats', subscriptionController.getUsageStats);

router.get('/usage', subscriptionController.getUsageStats);

export default router;