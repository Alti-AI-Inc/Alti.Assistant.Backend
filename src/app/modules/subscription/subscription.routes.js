import express from 'express';
import subscriptionController from './subscription.controller.js';
import auth from '../../middlewares/auth/auth.js';

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

// Upgrade subscription (creates checkout session)
router.post('/upgrade', subscriptionController.upgradeSubscription);

// Process successful checkout
router.post('/process-checkout', subscriptionController.processCheckout);

// Cancel subscription
router.post('/cancel', subscriptionController.cancelSubscription);

// Seat management
router.post('/add-seat', subscriptionController.addSeat);
router.post('/remove-seat', subscriptionController.removeSeat);

// Usage tracking
router.get('/usage-limit/:limitType', subscriptionController.checkUsageLimit);
router.post('/increment-usage', subscriptionController.incrementUsage);
router.get('/usage-stats', subscriptionController.getUsageStats);

export default router;
