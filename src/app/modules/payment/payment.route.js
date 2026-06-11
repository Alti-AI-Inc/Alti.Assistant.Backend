import express from 'express';
import { PubSub } from '@google-cloud/pubsub';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { paymentController } from './payment.controller.js';
import { authenticate } from '../../middlewares/auth/authenticate.js';
import { authorize } from '../../middlewares/auth/authorize.js';
import { ROLES } from '../../config/roles.js';

/**
 * Express router for handling payment and subscription-related routes.
 * @type {express.Router}
 */
const router = express.Router();

/**
 * @openapi
 * /api/v1/subscriptions/create-checkout-session:
 *   post:
 *     summary: Create a Stripe Checkout Session
 *     description: Initiates a new Stripe Checkout session for the authenticated user to subscribe to a plan.
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priceId:
 *                 type: string
 *                 description: The ID of the Stripe Price object for the subscription plan.
 *                 example: "price_1Hh2iJ2eZvKYlo2CqXqXqXqX"
 *     responses:
 *       200:
 *         description: Successfully created checkout session.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: The URL to redirect the user to for completing the payment.
 *                   example: "https://checkout.stripe.com/pay/cs_test_..."
 *       400:
 *         description: Bad Request - Missing required fields or invalid data.
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *       500:
 *         description: Internal Server Error.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted to ensure the checkout session is created for the correct tenant.
 */
router
  .route('/create-checkout-session')
  .post(extractTenantContext, authenticate, paymentController.createCheckoutSession);

/**
 * @openapi
 * /api/v1/subscriptions/create-customer-portal-session:
 *   post:
 *     summary: Create a Stripe Customer Portal Session
 *     description: >
 *       Creates a session for the Stripe Customer Portal, allowing the workspace owner
 *       to manage their billing details, invoices, and subscription plan.
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully created customer portal session.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: The URL to redirect the user to for the Stripe Customer Portal.
 *                   example: "https://billing.stripe.com/p/session/..."
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *       403:
 *         description: Forbidden - User is not an admin or workspace owner.
 *       404:
 *         description: Not Found - The workspace does not have an active subscription or Stripe customer ID.
 *       500:
 *         description: Internal Server Error.
 *     x-role-permissions:
 *       - required: ['super_admin', 'admin']
 *         description: Only users with 'super_admin' or 'admin' role can manage billing.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted to create the portal session for the correct workspace.
 */
router
  .route('/create-customer-portal-session')
  .post(
    extractTenantContext,
    authenticate,
    authorize([ROLES.SUPER_ADMIN, ROLES.ADMIN]),
    paymentController.createCustomerPortalSession
  );

/**
 * @openapi
 * /api/v1/subscriptions/status:
 *   get:
 *     summary: Get current workspace subscription status and limits
 *     description: >
 *       Retrieves the active subscription details for the current workspace, including the plan,
 *       status, and associated usage limits (e.g., max users, features).
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: The workspace's subscription and limits details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   $ref: '#/components/schemas/Subscription'
 *                 limits:
 *                   type: object
 *                   description: Plan-defined limits for the workspace.
 *                   properties:
 *                     maxUsers:
 *                       type: integer
 *                     maxAssistants:
 *                       type: integer
 *                     canUseCustomModels:
 *                       type: boolean
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *       404:
 *         description: Not Found - No active subscription found for the workspace.
 *       500:
 *         description: Internal Server Error.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted to retrieve the subscription for the correct workspace.
 */
router
  .route('/status')
  .get(extractTenantContext, authenticate, paymentController.getWorkspaceSubscriptionStatus);

/**
 * @openapi
 * /api/v1/subscriptions/cancel:
 *   patch:
 *     summary: Cancel the current workspace subscription
 *     description: >
 *       Schedules the current active subscription for the workspace to be canceled at the end of the billing period.
 *       This is an administrative action.
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription successfully scheduled for cancellation.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Subscription'
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *       403:
 *         description: Forbidden - User does not have permission to cancel the subscription.
 *       404:
 *         description: Not Found - No active subscription found for the workspace.
 *       500:
 *         description: Internal Server Error.
 *     x-role-permissions:
 *       - required: ['super_admin', 'admin']
 *         description: Only users with 'super_admin' or 'admin' role can cancel the workspace subscription.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted to identify the correct subscription to cancel.
 */
router
  .route('/cancel')
  .patch(
    extractTenantContext,
    authenticate,
    authorize([ROLES.SUPER_ADMIN, ROLES.ADMIN]),
    paymentController.cancelSubscription
  );

/**
 * @openapi
 * /api/v1/subscriptions/webhook:
 *   post:
 *     summary: Stripe Webhook Ingestion Endpoint
 *     description: >
 *       Receives incoming webhook events from Stripe, validates them, and enqueues them for asynchronous background processing.
 *       This endpoint is designed for high-throughput and reliability, immediately acknowledging receipt to Stripe
 *       and offloading the actual event handling to a GCP Pub/Sub topic.
 *       This prevents timeouts and ensures that long-running tasks associated with payment events
 *       (e.g., updating subscriptions, sending emails, provisioning services) do not block the request.
 *       It requires the raw request body for signature verification.
 *     tags:
 *       - Payment
 *     requestBody:
 *       description: Raw JSON payload from Stripe. The `Stripe-Signature` header must be present for verification.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: A Stripe event object.
 *     responses:
 *       202:
 *         description: Accepted. The webhook was received, validated, and successfully enqueued for processing.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "acknowledged"
 *       400:
 *         description: Bad Request - Invalid payload or signature verification failed.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted from the webhook metadata to process the event for the correct tenant.
 */
router
  .route('/webhook')
  .post(
    express.raw({ type: 'application/json' }),
    extractTenantContext,
    // ASYNC OFFLOAD: Instead of processing the webhook in-memory, which can be slow and cause timeouts,
    // we now enqueue the event into a GCP Pub/Sub topic. A separate, scalable worker service
    // will subscribe to this topic and handle the event processing asynchronously.
    // This makes the endpoint fast, reliable, and stateless.
    paymentController.enqueueStripeEvent
  );

/**
 * @openapi
 * /api/v1/subscriptions/admin/all:
 *   get:
 *     summary: Get all subscriptions (Admin/Super Admin)
 *     description: Retrieves a list of all subscriptions across all users within the tenant. Requires administrative privileges.
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of all subscriptions.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Subscription'
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *       403:
 *         description: Forbidden - User does not have administrative privileges.
 *       500:
 *         description: Internal Server Error.
 *     x-role-permissions:
 *       - required: ['super_admin', 'admin']
 *         description: Only users with the 'super_admin' or 'admin' role can access this endpoint.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted to retrieve subscriptions for the correct tenant.
 */
router
  .route('/admin/all')
  .get(
    extractTenantContext,
    authenticate,
    authorize([ROLES.SUPER_ADMIN, ROLES.ADMIN]),
    paymentController.getAllSubscriptions
  );

/**
 * @openapi
 * /api/v1/subscriptions/{userId}:
 *   get:
 *     summary: Get subscriptions for a specific user
 *     description: >
 *       Retrieves the subscription details for a specific user.
 *       - A user can retrieve their own subscription.
 *       - A manager can retrieve subscriptions for users they manage.
 *       - An admin/super_admin can retrieve any user's subscription within the tenant.
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the user whose subscriptions are to be retrieved.
 *     responses:
 *       200:
 *         description: The user's subscription details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Subscription'
 *       401:
 *         description: Unauthorized - User is not authenticated.
 *       403:
 *         description: Forbidden - User is trying to access another user's data without permission.
 *       404:
 *         description: Not Found - No subscriptions found for the user.
 *       500:
 *         description: Internal Server Error.
 *     x-role-permissions:
 *       - required: ['super_admin', 'admin', 'manager', 'user']
 *         description: Access is conditional. A user can access their own data. A manager can access their team's data. An admin can access any user's data in the tenant.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted to ensure the user and their subscription belong to the correct tenant.
 */
router
  .route('/:userId')
  .get(extractTenantContext, authenticate, paymentController.getSubscriptionsByUserId);

/**
 * The exported Express router for payment and subscription routes.
 * @name subscriptionRoutes
 */
export const subscriptionRoutes = router;