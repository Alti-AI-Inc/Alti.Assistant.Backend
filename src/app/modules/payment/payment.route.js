import express from 'express';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { paymentController } from './payment.controller.js';
// BUGFIX: Import authentication and authorization middlewares to secure endpoints.
import { authenticate } from '../../middlewares/auth/authenticate.js';
import { authorize } from '../../middlewares/auth/authorize.js';
// BUGFIX: Import roles for clear and consistent role-based access control.
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
 *               // SECURITY-FIX: Removed userId from the request body to prevent IDOR vulnerabilities.
 *               // The user ID will be derived from the authenticated user's session/token.
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
  // SECURITY-FIX: Added authentication middleware. The controller must use req.user.id
  // instead of a userId from the request body to prevent IDOR.
  .post(extractTenantContext, authenticate, paymentController.createCheckoutSession);

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
  // SECURITY-FIX: Added authentication and role-based authorization.
  // Only super_admins and admins can access all tenant subscriptions.
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
  // SECURITY-FIX: Added authentication. The controller MUST perform authorization checks
  // to prevent IDOR. It must verify that the authenticated user (req.user) is either:
  // 1. The same as the requested userId (req.params.userId).
  // 2. An admin/super_admin.
  // 3. A manager responsible for the user specified by req.params.userId.
  .get(extractTenantContext, authenticate, paymentController.getSubscriptionsByUserId);

/**
 * @openapi
 * /api/v1/subscriptions/webhook:
 *   post:
 *     summary: Stripe Webhook Handler
 *     description: >
 *       Handles incoming webhook events from Stripe to update subscription statuses, handle payments, etc.
 *       This endpoint is intended to be called by Stripe's services, not by a client application.
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
 *       200:
 *         description: Acknowledged. The webhook was received and processed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad Request - Invalid payload or signature verification failed.
 *     x-multi-tenant-context:
 *       - required: true
 *         description: The tenant context is extracted from the webhook metadata to process the event for the correct tenant.
 */
router
  .route('/webhook')
  // This endpoint is public facing for Stripe, security is handled by verifying the
  // Stripe signature in the controller, so no user authentication middleware is needed.
  .post(
    express.raw({ type: 'application/json' }),
    extractTenantContext,
    paymentController.handleWebhook
  );

/**
 * The exported Express router for payment and subscription routes.
 * @name subscriptionRoutes
 */
export const subscriptionRoutes = router;