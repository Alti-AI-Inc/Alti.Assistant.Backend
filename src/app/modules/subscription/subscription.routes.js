import express from 'express';
import subscriptionController from './subscription.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext, requireTenantAdmin } from '../../middlewares/tenant/tenantContext.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';

const billingLimiter = createRateLimiter(5, 10); // Max 10 billing actions per 5 minutes

const router = express.Router();

/**
 * Subscription Routes
 * All routes require authentication except webhook
 */

// Public routes (no auth)
router.post('/webhook', subscriptionController.handleStripeWebhook);

// Get available plans (public)
router.get('/plans', subscriptionController.getAvailablePlans);

// Protected routes (require auth)
router.use(auth());

// Get current user's subscription
router.get('/my-subscription', subscriptionController.getMySubscription);

// Get tenant subscription
router.get('/tenant/:tenantId', subscriptionController.getTenantSubscription);

// Create free subscription
router.post('/create-free', subscriptionController.createFreeSubscription);

// Upgrade subscription (hybrid: direct charge, plan change, or checkout session)
router.post('/upgrade', billingLimiter, subscriptionController.upgradeSubscription);

// Confirm payment after 3D Secure authentication
router.post('/confirm-payment', billingLimiter, subscriptionController.confirmPayment);

// Process successful checkout (after redirect from Stripe checkout)
router.post('/process-checkout', subscriptionController.processCheckout);

// Launch Stripe Customer Billing Portal
router.post('/billing-portal', billingLimiter, subscriptionController.createBillingPortalSession);

// Cancel subscription
router.post(
  '/cancel',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.cancelSubscription
);

// Seat management
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

// Usage tracking
router.get('/usage-limit/:limitType', subscriptionController.checkUsageLimit);
router.post('/increment-usage', subscriptionController.incrementUsage);
router.get('/usage-stats', subscriptionController.getUsageStats);

export default router;
