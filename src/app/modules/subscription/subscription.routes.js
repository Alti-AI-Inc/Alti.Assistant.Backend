import express from 'express';
import subscriptionController from './subscription.controller.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext, requireTenantAdmin } from '../../middlewares/tenant/tenantContext.js';
import createRateLimiter from '../../middlewares/rateLimit/authLimiter.js';

/**
 * @constant {Function} billingLimiter - Rate limiter for billing-related actions.
 * Limits requests to 10 actions per 5 minutes to prevent abuse and ensure system stability.
 * @param {number} maxRequests - The maximum number of requests allowed within the window.
 * @param {number} windowMinutes - The time window in minutes.
 */
const billingLimiter = createRateLimiter(5, 10); // Max 10 billing actions per 5 minutes

/**
 * @constant {express.Router} router - Express router for subscription-related routes.
 */
const router = express.Router();

/**
 * Subscription Routes
 * All routes require authentication except webhook and available plans.
 * @swagger
 * tags:
 *   name: Subscriptions
 *   description: API for managing user and tenant subscriptions, billing, and usage.
 */

// Public routes (no auth)

/**
 * @swagger
 * /webhook:
 *   post:
 *     summary: Handle Stripe Webhook Events
 *     description: Receives and processes webhook events from Stripe, such as successful payments, subscription changes, etc.
 *                  This endpoint is public and does not require authentication.
 *     tags: [Subscriptions]
 *     requestBody:
 *       description: Stripe webhook event payload.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The raw Stripe event object.
 *             example:
 *               id: evt_12345
 *               object: event
 *               type: customer.subscription.updated
 *               data:
 *                 object:
 *                   id: sub_abcde
 *     responses:
 *       200:
 *         description: Webhook successfully received and processed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid webhook payload or signature.
 *       500:
 *         description: Internal server error during webhook processing.
 *     x-middleware:
 *       - subscriptionController.handleStripeWebhook
 */
router.post('/webhook', subscriptionController.handleStripeWebhook);

/**
 * @swagger
 * /plans:
 *   get:
 *     summary: Get Available Subscription Plans
 *     description: Retrieves a list of all available subscription plans that users can subscribe to.
 *                  This endpoint is public and does not require authentication.
 *     tags: [Subscriptions]
 *     responses:
 *       200:
 *         description: A list of available subscription plans.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: plan_premium
 *                   name:
 *                     type: string
 *                     example: Premium Plan
 *                   price:
 *                     type: number
 *                     format: float
 *                     example: 9.99
 *                   currency:
 *                     type: string
 *                     example: USD
 *                   features:
 *                     type: array
 *                     items:
 *                       type: string
 *                     example: ["Feature A", "Feature B"]
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - subscriptionController.getAvailablePlans
 */
router.get('/plans', subscriptionController.getAvailablePlans);

// Protected routes (require auth)
/**
 * @swagger
 * security:
 *   - bearerAuth: []
 * x-middleware:
 *   - auth()
 */
router.use(auth());

/**
 * @swagger
 * /my-subscription:
 *   get:
 *     summary: Get Current User's Subscription
 *     description: Retrieves the subscription details for the authenticated user.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User's subscription details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: sub_xyz123
 *                 status:
 *                   type: string
 *                   example: active
 *                 plan:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: plan_standard
 *                     name:
 *                       type: string
 *                       example: Standard Plan
 *                 currentPeriodEnd:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-12-31T23:59:59Z"
 *                 tenantId:
 *                   type: string
 *                   example: tenant_abc
 *       401:
 *         description: Unauthorized, authentication token missing or invalid.
 *       404:
 *         description: Subscription not found for the user.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.getMySubscription
 */
router.get('/my-subscription', subscriptionController.getMySubscription);

/**
 * @swagger
 * /tenant/{tenantId}:
 *   get:
 *     summary: Get Tenant Subscription
 *     description: Retrieves the subscription details for a specific tenant.
 *                  Requires the authenticated user to be an administrator of the specified tenant.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: true
 *         description: The unique identifier of the tenant.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Tenant's subscription details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: sub_xyz123
 *                 status:
 *                   type: string
 *                   example: active
 *                 plan:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: plan_enterprise
 *                     name:
 *                       type: string
 *                       example: Enterprise Plan
 *                 currentPeriodEnd:
 *                   type: string
 *                   format: date-time
 *                   example: "2024-12-31T23:59:59Z"
 *                 tenantId:
 *                   type: string
 *                   example: tenant_abc
 *       401:
 *         description: Unauthorized, authentication token missing or invalid.
 *       403:
 *         description: Forbidden, user does not have admin rights for the specified tenant.
 *       404:
 *         description: Tenant or subscription not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - extractTenantContext
 *       - requireTenantAdmin
 *       - subscriptionController.getTenantSubscription
 */
router.get(
  '/tenant/:tenantId',
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.getTenantSubscription
);

/**
 * @swagger
 * /create-free:
 *   post:
 *     summary: Create Free Subscription
 *     description: Creates a free tier subscription for the authenticated user's tenant.
 *                  Typically used for initial onboarding.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Optional tenant ID if the user manages multiple tenants.
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the tenant for which to create the free subscription.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Free subscription successfully created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Free subscription created successfully.
 *                 subscription:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: sub_free123
 *                     status:
 *                       type: string
 *                       example: active
 *                     plan:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: plan_free
 *                         name:
 *                           type: string
 *                           example: Free Plan
 *       400:
 *         description: Bad request, e.g., tenant already has an active subscription.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.createFreeSubscription
 */
router.post('/create-free', subscriptionController.createFreeSubscription);

/**
 * @swagger
 * /upgrade:
 *   post:
 *     summary: Upgrade Subscription
 *     description: Initiates an upgrade or change of the current subscription plan.
 *                  This can involve direct charges, plan changes, or creating a Stripe checkout session.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Details for the subscription upgrade.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planId
 *             properties:
 *               planId:
 *                 type: string
 *                 description: The ID of the new plan to upgrade to.
 *                 example: "price_12345"
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of the tenant if the user manages multiple.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *               paymentMethodId:
 *                 type: string
 *                 description: Optional. Stripe Payment Method ID for direct charge.
 *                 example: "pm_card_visa"
 *               returnUrl:
 *                 type: string
 *                 description: Optional. URL to redirect to after checkout session completion.
 *                 example: "https://your-app.com/checkout-success"
 *     responses:
 *       200:
 *         description: Subscription upgrade initiated successfully. May return a client secret for 3D Secure or a checkout session URL.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Subscription upgrade initiated.
 *                 clientSecret:
 *                   type: string
 *                   description: Stripe client secret for payment confirmation (e.g., 3D Secure).
 *                   example: "pi_xyz_secret_abc"
 *                 checkoutSessionUrl:
 *                   type: string
 *                   description: URL to redirect the user to for Stripe Checkout.
 *                   example: "https://checkout.stripe.com/pay/cs_test_..."
 *                 subscription:
 *                   type: object
 *                   description: Updated subscription details if no further action is needed.
 *       400:
 *         description: Bad request, e.g., invalid plan ID, missing payment details.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment required, e.g., insufficient funds or payment method declined.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - billingLimiter
 *       - subscriptionController.upgradeSubscription
 */
router.post('/upgrade', billingLimiter, subscriptionController.upgradeSubscription);

/**
 * @swagger
 * /confirm-payment:
 *   post:
 *     summary: Confirm Payment
 *     description: Confirms a payment after 3D Secure authentication or other required actions.
 *                  This is typically called after a client-side payment intent confirmation.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Payment confirmation details.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentIntentId
 *             properties:
 *               paymentIntentId:
 *                 type: string
 *                 description: The ID of the Stripe Payment Intent to confirm.
 *                 example: "pi_xyz123"
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of the tenant if the user manages multiple.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Payment successfully confirmed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Payment confirmed successfully.
 *                 subscription:
 *                   type: object
 *                   description: The updated subscription details.
 *       400:
 *         description: Bad request, e.g., invalid payment intent ID.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment failed or requires further action.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - billingLimiter
 *       - subscriptionController.confirmPayment
 */
router.post('/confirm-payment', billingLimiter, subscriptionController.confirmPayment);

/**
 * @swagger
 * /process-checkout:
 *   post:
 *     summary: Process Stripe Checkout Session
 *     description: Processes the successful completion of a Stripe Checkout Session.
 *                  This endpoint is typically called after a user is redirected back from Stripe.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Details from the Stripe Checkout session.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sessionId
 *             properties:
 *               sessionId:
 *                 type: string
 *                 description: The ID of the Stripe Checkout Session.
 *                 example: "cs_test_12345"
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of the tenant if the user manages multiple.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Checkout session successfully processed and subscription updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Checkout session processed successfully.
 *                 subscription:
 *                   type: object
 *                   description: The updated subscription details.
 *       400:
 *         description: Bad request, e.g., invalid session ID or session not completed.
 *       401:
 *         description: Unauthorized.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.processCheckout
 */
router.post('/process-checkout', subscriptionController.processCheckout);

/**
 * @swagger
 * /billing-portal:
 *   post:
 *     summary: Create Stripe Customer Billing Portal Session
 *     description: Creates a session for the Stripe Customer Billing Portal, allowing users to manage their subscriptions,
 *                  payment methods, and view invoices directly through Stripe's hosted portal.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Details for creating the billing portal session.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - returnUrl
 *             properties:
 *               returnUrl:
 *                 type: string
 *                 description: The URL to redirect the user to after they exit the billing portal.
 *                 example: "https://your-app.com/settings/billing"
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of the tenant if the user manages multiple.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Billing portal session successfully created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: The URL to redirect the user to for the Stripe Billing Portal.
 *                   example: "https://billing.stripe.com/session/test_..."
 *       400:
 *         description: Bad request, e.g., missing return URL or no active subscription.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer or subscription not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - billingLimiter
 *       - subscriptionController.createBillingPortalSession
 */
router.post('/billing-portal', billingLimiter, subscriptionController.createBillingPortalSession);

/**
 * @swagger
 * /cancel:
 *   post:
 *     summary: Cancel Subscription
 *     description: Cancels an active subscription for a specified tenant.
 *                  Requires the authenticated user to be an administrator of the specified tenant.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Tenant ID for the subscription to cancel.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *             properties:
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the tenant whose subscription is to be canceled.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Subscription successfully canceled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Subscription canceled successfully.
 *                 subscription:
 *                   type: object
 *                   description: The updated subscription details, typically with status 'canceled' or 'ended'.
 *       400:
 *         description: Bad request, e.g., subscription already canceled or invalid tenant ID.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden, user does not have admin rights for the specified tenant.
 *       404:
 *         description: Subscription not found for the tenant.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - billingLimiter
 *       - extractTenantContext
 *       - requireTenantAdmin
 *       - subscriptionController.cancelSubscription
 */
router.post(
  '/cancel',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.cancelSubscription
);

/**
 * @swagger
 * /add-seat:
 *   post:
 *     summary: Add a Seat to Subscription
 *     description: Adds an additional seat (user license) to a tenant's subscription.
 *                  Requires the authenticated user to be an administrator of the specified tenant.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Tenant ID for the subscription to modify.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *             properties:
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the tenant whose subscription seats are to be increased.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Seat successfully added.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Seat added successfully.
 *                 subscription:
 *                   type: object
 *                   description: The updated subscription details with the new seat count.
 *       400:
 *         description: Bad request, e.g., no active subscription, plan does not support seats, or maximum seats reached.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden, user does not have admin rights for the specified tenant.
 *       404:
 *         description: Subscription not found for the tenant.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - billingLimiter
 *       - extractTenantContext
 *       - requireTenantAdmin
 *       - subscriptionController.addSeat
 */
router.post(
  '/add-seat',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.addSeat
);

/**
 * @swagger
 * /remove-seat:
 *   post:
 *     summary: Remove a Seat from Subscription
 *     description: Removes a seat (user license) from a tenant's subscription.
 *                  Requires the authenticated user to be an administrator of the specified tenant.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Tenant ID for the subscription to modify.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *             properties:
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: The ID of the tenant whose subscription seats are to be decreased.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Seat successfully removed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Seat removed successfully.
 *                 subscription:
 *                   type: object
 *                   description: The updated subscription details with the new seat count.
 *       400:
 *         description: Bad request, e.g., no active subscription, plan does not support seats, or minimum seats reached.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden, user does not have admin rights for the specified tenant.
 *       404:
 *         description: Subscription not found for the tenant.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - billingLimiter
 *       - extractTenantContext
 *       - requireTenantAdmin
 *       - subscriptionController.removeSeat
 */
router.post(
  '/remove-seat',
  billingLimiter,
  extractTenantContext,
  requireTenantAdmin,
  subscriptionController.removeSeat
);

/**
 * @swagger
 * /usage-limit/{limitType}:
 *   get:
 *     summary: Check Specific Usage Limit
 *     description: Checks the usage limit and current usage for a specific type of resource
 *                  (e.g., 'api_calls', 'storage').
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: limitType
 *         schema:
 *           type: string
 *         required: true
 *         description: The type of usage limit to check (e.g., 'api_calls', 'storage').
 *         example: "api_calls"
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: false
 *         description: Optional. The ID of the tenant if the user manages multiple.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Usage limit and current usage details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 limitType:
 *                   type: string
 *                   example: api_calls
 *                 currentUsage:
 *                   type: number
 *                   example: 1500
 *                 limit:
 *                   type: number
 *                   example: 5000
 *                 isExceeded:
 *                   type: boolean
 *                   example: false
 *                 remaining:
 *                   type: number
 *                   example: 3500
 *       400:
 *         description: Bad request, e.g., invalid limit type.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Subscription or limit type not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.checkUsageLimit
 */
router.get('/usage-limit/:limitType', subscriptionController.checkUsageLimit);

/**
 * @swagger
 * /check-limit:
 *   get:
 *     summary: Check General Usage Limit
 *     description: Checks the general usage limit and current usage for the authenticated user's tenant.
 *                  This endpoint might return a summary or a default limit type.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: false
 *         description: Optional. The ID of the tenant if the user manages multiple.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: General usage limit and current usage details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary:
 *                   type: string
 *                   example: "You have used 1500 of 5000 API calls."
 *                 details:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       limitType:
 *                         type: string
 *                         example: api_calls
 *                       currentUsage:
 *                         type: number
 *                         example: 1500
 *                       limit:
 *                         type: number
 *                         example: 5000
 *                       isExceeded:
 *                         type: boolean
 *                         example: false
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.checkUsageLimit
 */
router.get('/check-limit', subscriptionController.checkUsageLimit);

/**
 * @swagger
 * /increment-usage:
 *   post:
 *     summary: Increment Usage Counter
 *     description: Increments the usage counter for a specific resource type for the authenticated user's tenant.
 *                  This is typically called by backend services to track resource consumption.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Details for incrementing usage.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - limitType
 *               - amount
 *             properties:
 *               limitType:
 *                 type: string
 *                 description: The type of usage to increment (e.g., 'api_calls', 'storage').
 *                 example: "api_calls"
 *               amount:
 *                 type: number
 *                 description: The amount by which to increment the usage.
 *                 example: 1
 *               tenantId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional. The ID of the tenant if the user manages multiple.
 *                 example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Usage counter successfully incremented.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Usage incremented successfully.
 *                 currentUsage:
 *                   type: number
 *                   example: 1501
 *                 limit:
 *                   type: number
 *                   example: 5000
 *       400:
 *         description: Bad request, e.g., invalid limit type or amount.
 *       401:
 *         description: Unauthorized.
 *       402:
 *         description: Payment required, usage limit exceeded.
 *       404:
 *         description: Subscription or limit type not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.incrementUsage
 */
router.post('/increment-usage', subscriptionController.incrementUsage);

/**
 * @swagger
 * /usage-stats:
 *   get:
 *     summary: Get Usage Statistics
 *     description: Retrieves detailed usage statistics for all tracked resources for the authenticated user's tenant.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: false
 *         description: Optional. The ID of the tenant if the user manages multiple.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Detailed usage statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   limitType:
 *                     type: string
 *                     example: api_calls
 *                   currentUsage:
 *                     type: number
 *                     example: 1500
 *                   limit:
 *                     type: number
 *                     example: 5000
 *                   isExceeded:
 *                     type: boolean
 *                     example: false
 *                   remaining:
 *                     type: number
 *                     example: 3500
 *                   unit:
 *                     type: string
 *                     example: calls
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.getUsageStats
 */
router.get('/usage-stats', subscriptionController.getUsageStats);

/**
 * @swagger
 * /usage:
 *   get:
 *     summary: Get Usage Statistics (Alias)
 *     description: An alias endpoint for retrieving detailed usage statistics for all tracked resources for the authenticated user's tenant.
 *     tags: [Subscriptions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: uuid
 *         required: false
 *         description: Optional. The ID of the tenant if the user manages multiple.
 *         example: "a1b2c3d4-e5f6-7890-1234-567890abcdef"
 *     responses:
 *       200:
 *         description: Detailed usage statistics.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   limitType:
 *                     type: string
 *                     example: api_calls
 *                   currentUsage:
 *                     type: number
 *                     example: 1500
 *                   limit:
 *                     type: number
 *                     example: 5000
 *                   isExceeded:
 *                     type: boolean
 *                     example: false
 *                   remaining:
 *                     type: number
 *                     example: 3500
 *                   unit:
 *                     type: string
 *                     example: calls
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Subscription not found.
 *       500:
 *         description: Internal server error.
 *     x-middleware:
 *       - auth()
 *       - subscriptionController.getUsageStats
 */
router.get('/usage', subscriptionController.getUsageStats);

export default router;