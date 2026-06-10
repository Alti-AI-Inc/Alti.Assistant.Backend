import httpStatus from 'http-status';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import subscriptionService from './subscription.service.js';
import ProductModel from '../products/products.model.js';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js'; // Fixed import path
import StripeEvent from './stripeEvent.model.js';
import BillingAuditLog from './billingAuditLog.model.js';
import { logger } from '../../../shared/logger.js';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';

/**
 * @typedef {object} UserAuthInfo
 * @property {string} _id - The user's ID.
 * @property {string} tenantId - The ID of the tenant the user belongs to.
 * @property {string} role - The role of the user (e.g., 'admin', 'user').
 */

/**
 * Subscription Controller
 * HTTP handlers for subscription management
 */

/**
 * @swagger
 * /api/v1/subscription/plans:
 *   get:
 *     summary: Get all available subscription plans
 *     description: Retrieves a list of all active and available subscription plans from the product catalog.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Plans retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Plans retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id: { type: string, example: "654321098765432109876543" }
 *                       name: { type: string, example: "Basic Plan" }
 *                       description: { type: string, example: "Entry-level features" }
 *                       price: { type: number, example: 10 }
 *                       currency: { type: string, example: "USD" }
 *                       features: { type: array, items: { type: string }, example: ["Feature A", "Feature B"] }
 *                       stripeProductId: { type: string, example: "prod_ABC123" }
 *                       stripePriceId: { type: string, example: "price_XYZ789" }
 *                       type: { type: string, example: "monthly" }
 *                       status: { type: string, example: "active" }
 *                       isAvailable: { type: boolean, example: true }
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Get all available plans.
 * Handles GET /api/v1/subscription/plans.
 *
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const getAvailablePlans = catchAsync(async (req, res) => {
  // Optimization Note: Ensure ProductModel.getAvailablePlans() uses .lean() for read-only operations
  // to return plain JavaScript objects and reduce Mongoose document overhead.
  // Indexing Recommendation: Consider indexing fields used in ProductModel.getAvailablePlans()
  // (e.g., 'status', 'isAvailable', 'type') if filtering or sorting is applied.
  const plans = await ProductModel.getAvailablePlans();

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Plans retrieved successfully',
    data: plans.map((plan) => plan.toPublicJSON()),
  });
});

/**
 * @swagger
 * /api/v1/subscription/my-subscription:
 *   get:
 *     summary: Get current user's subscription details
 *     description: Retrieves the detailed subscription information, including usage, for the authenticated user.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscription retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Subscription retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/SubscriptionWithUsage'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Get current user's subscription.
 * Handles GET /api/v1/subscription/my-subscription.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If no subscription is found for the user (404 NOT_FOUND).
 */
const getMySubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // Optimization Note: Ensure subscriptionService.getSubscriptionWithUsage() uses .lean()
  // for read-only operations to return plain JavaScript objects.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const subscriptionData =
    await subscriptionService.getSubscriptionWithUsage(userId);

  if (!subscriptionData) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No subscription found');
  }

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Subscription retrieved successfully',
    data: subscriptionData,
  });
});

/**
 * @swagger
 * /api/v1/subscription/tenant/{tenantId}:
 *   get:
 *     summary: Get a specific tenant's subscription details
 *     description: Retrieves the detailed subscription information, including usage, for a specified tenant.
 *                  Requires 'admin' role or the requesting user to belong to the specified tenant.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: tenantId
 *         schema:
 *           type: string
 *           format: objectId
 *         required: true
 *         description: The ID of the tenant to retrieve the subscription for.
 *     responses:
 *       200:
 *         description: Tenant subscription retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Tenant subscription retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/SubscriptionWithUsage'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Get tenant subscription.
 * Handles GET /api/v1/subscription/tenant/:tenantId.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the user is not authorized (403 FORBIDDEN).
 * @throws {ApiError} If no subscription is found for the tenant (404 NOT_FOUND).
 */
const getTenantSubscription = catchAsync(async (req, res) => {
  const { tenantId } = req.params;
  // Assuming req.user is populated by authentication middleware and contains _id, tenantId, and role.
  const requestingUserTenantId = req.user.tenantId;
  const requestingUserRole = req.user.role;

  // Authorization check:
  // Only users with 'admin' role can view subscriptions for arbitrary tenants.
  // Regular users can only view subscriptions for their own tenant.
  if (requestingUserRole !== 'admin' && tenantId !== requestingUserTenantId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: You are not authorized to view this tenant\'s subscription.');
  }

  // Optimization Note: Ensure subscriptionService.getTenantSubscription() uses .lean()
  // for read-only operations to return plain JavaScript objects.
  // Indexing Recommendation: Ensure 'tenantId' is indexed on the Subscription model for efficient lookups.
  const subscription =
    await subscriptionService.getTenantSubscription(tenantId);

  if (!subscription) {
    throw new ApiError(
      httpStatus.NOT_FOUND,
      'No subscription found for this tenant'
    );
  }

  // Defensive check: Ensure the found subscription actually belongs to the requested tenant.
  // This guards against potential issues if `getTenantSubscription` returns an unexpected subscription.
  if (subscription.tenantId.toString() !== tenantId.toString()) {
      throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: Subscription found does not match the requested tenant.');
  }

  // Optimization Note: Ensure subscriptionService.getSubscriptionWithUsage() uses .lean()
  // for read-only operations to return plain JavaScript objects.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const subscriptionData = await subscriptionService.getSubscriptionWithUsage(
    subscription.userId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Tenant subscription retrieved successfully',
    data: subscriptionData,
  });
});

/**
 * @swagger
 * /api/v1/subscription/create-free:
 *   post:
 *     summary: Create a free subscription for a user/tenant
 *     description: Creates a new free-tier subscription for the authenticated user and specified tenant.
 *                  This is typically used for initial onboarding.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
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
 *                 format: objectId
 *                 description: The ID of the tenant for which to create the free subscription.
 *                 example: "654321098765432109876543"
 *     responses:
 *       201:
 *         description: Free subscription created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: Free subscription created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Subscription'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Create free subscription.
 * Handles POST /api/v1/subscription/create-free.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 */
const createFreeSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { tenantId } = req.body;

  const subscription = await subscriptionService.createFreeSubscription(
    userId,
    tenantId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Free subscription created successfully',
    data: subscription,
  });
});

/**
 * @swagger
 * /api/v1/subscription/upgrade:
 *   post:
 *     summary: Upgrade or create a paid subscription
 *     description: Initiates a subscription upgrade or creation process. This endpoint handles various scenarios
 *                  including existing subscriptions, saved payment methods, 3D Secure requirements, and new checkouts.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - tenantId
 *             properties:
 *               stripeProductId:
 *                 type: string
 *                 description: The Stripe Product ID of the desired plan. Required if planName is not provided.
 *                 example: "prod_N0tAReAlID"
 *               planName:
 *                 type: string
 *                 description: The name of the desired plan. Required if stripeProductId is not provided.
 *                 example: "Premium Monthly"
 *               tenantId:
 *                 type: string
 *                 format: objectId
 *                 description: The ID of the tenant for which to upgrade/create the subscription.
 *                 example: "654321098765432109876543"
 *               seats:
 *                 type: number
 *                 description: The initial number of seats for the subscription. Defaults to 1.
 *                 minimum: 1
 *                 example: 5
 *     responses:
 *       200:
 *         description: Plan changed successfully (for existing subscriptions) or checkout session created.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 statusCode: { type: number, example: 200 }
 *                 message: { type: string, example: "Plan changed successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: ["plan_changed", "checkout_session"], example: "plan_changed" }
 *                     subscription: { $ref: '#/components/schemas/Subscription' }
 *                     checkoutUrl: { type: string, example: "https://checkout.stripe.com/c/pay/cs_..." }
 *       201:
 *         description: New subscription created successfully with a saved payment method.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 statusCode: { type: number, example: 201 }
 *                 message: { type: string, example: "Subscription created successfully" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: ["subscription_created"], example: "subscription_created" }
 *                     subscription: { $ref: '#/components/schemas/Subscription' }
 *       202:
 *         description: Payment requires additional authentication (e.g., 3D Secure).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 statusCode: { type: number, example: 202 }
 *                 message: { type: string, example: "Payment requires additional authentication" }
 *                 data:
 *                   type: object
 *                   properties:
 *                     type: { type: string, enum: ["requires_action"], example: "requires_action" }
 *                     clientSecret: { type: string, example: "pi_ABC123_secret_XYZ789" }
 *                     subscriptionId: { type: string, example: "sub_N0tAReAlID" }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Upgrade subscription (hybrid approach).
 * Handles POST /api/v1/subscription/upgrade.
 *
 * This function handles various scenarios for subscription upgrades or new subscriptions:
 * - If an existing subscription is found and a saved payment method is available, it attempts to update the plan.
 * - If a new subscription is created with a saved payment method, it returns `subscription_created`.
 * - If 3D Secure is required, it returns `requires_action` with a client secret for frontend confirmation.
 * - If no saved payment method, it creates a Stripe Checkout session and returns `checkout_session` with the URL.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If `stripeProductId` or `planName` is missing (400 BAD_REQUEST).
 * @throws {ApiError} If `seats` is less than 1 (400 BAD_REQUEST).
 */
const upgradeSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { stripeProductId, planName, tenantId, seats } = req.body;

  // Require either stripeProductId or planName
  if (!stripeProductId && !planName) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Either stripeProductId or planName is required'
    );
  }

  const initialSeats = seats || 1;
  if (initialSeats < 1) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Seats must be at least 1');
  }

  const result = await subscriptionService.upgradeSubscription(
    userId,
    { stripeProductId, planName },
    tenantId,
    initialSeats,
    { userId, ipAddress: req.ip }
  );

  // Determine response message based on result type
  let message;
  let statusCode = httpStatus.OK;

  switch (result.type) {
    case 'plan_changed':
      message = result.message || 'Plan changed successfully';
      break;
    case 'subscription_created':
      message = result.message || 'Subscription created successfully';
      statusCode = httpStatus.CREATED;
      break;
    case 'requires_action':
      message = result.message || 'Payment requires additional authentication';
      statusCode = httpStatus.ACCEPTED;
      break;
    case 'checkout_session':
      message =
        result.message ||
        'Checkout session created - redirect to complete payment';
      break;
    default:
      message = 'Subscription updated';
  }

  sendResponse(res, {
    success: true,
    statusCode,
    message,
    data: result,
  });
});

/**
 * @swagger
 * /api/v1/subscription/confirm-payment:
 *   post:
 *     summary: Confirm subscription payment after 3D Secure authentication
 *     description: Confirms a subscription payment after a client-side 3D Secure authentication flow.
 *                  This typically involves a PaymentIntent client secret.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subscriptionId
 *               - tenantId
 *             properties:
 *               subscriptionId:
 *                 type: string
 *                 description: The ID of the subscription requiring confirmation.
 *                 example: "sub_N0tAReAlID"
 *               tenantId:
 *                 type: string
 *                 format: objectId
 *                 description: The ID of the tenant associated with the subscription.
 *                 example: "654321098765432109876543"
 *     responses:
 *       201:
 *         description: Subscription activated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: Subscription activated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Subscription'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Confirm subscription payment after 3D Secure.
 * Handles POST /api/v1/subscription/confirm-payment.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If `subscriptionId` is missing (400 BAD_REQUEST).
 */
const confirmPayment = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { subscriptionId, tenantId } = req.body;

  if (!subscriptionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Subscription ID is required');
  }

  // It is assumed that subscriptionService.confirmSubscriptionPayment
  // performs authorization checks to ensure the subscriptionId belongs to the userId/tenantId.
  const subscription = await subscriptionService.confirmSubscriptionPayment(
    subscriptionId,
    userId,
    tenantId
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Subscription activated successfully',
    data: subscription,
  });
});

/**
 * @swagger
 * /api/v1/subscription/process-checkout:
 *   post:
 *     summary: Process a successful Stripe Checkout session
 *     description: Finalizes a subscription after a user completes a Stripe Checkout session.
 *                  This endpoint links the Stripe session to the internal user/tenant.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
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
 *                 description: The ID of the completed Stripe Checkout session.
 *                 example: "cs_test_N0tAReAlID"
 *     responses:
 *       201:
 *         description: Subscription activated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 201
 *                 message:
 *                   type: string
 *                   example: Subscription activated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Subscription'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Process successful checkout.
 * Handles POST /api/v1/subscription/process-checkout.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If `sessionId` is missing (400 BAD_REQUEST).
 */
const processCheckout = catchAsync(async (req, res) => {
  const { sessionId } = req.body;
  const userId = req.user._id; // Get userId from the authenticated user

  if (!sessionId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Session ID is required');
  }

  // Pass userId to the service layer for authorization and linking.
  // The service method should verify that the sessionId corresponds to a checkout
  // initiated by or associated with this userId to prevent IDOR.
  const subscription =
    await subscriptionService.processStripeCheckout(sessionId, userId);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.CREATED,
    message: 'Subscription activated successfully',
    data: subscription,
  });
});

/**
 * @swagger
 * /api/v1/subscription/cancel:
 *   post:
 *     summary: Cancel the current user's subscription
 *     description: Cancels the authenticated user's active subscription.
 *                  The cancellation can be immediate or at the end of the current billing period.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               immediate:
 *                 type: boolean
 *                 description: If true, the subscription is cancelled immediately. Otherwise, it cancels at the period end.
 *                 default: false
 *                 example: false
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Subscription will cancel at period end
 *                 data:
 *                   $ref: '#/components/schemas/Subscription'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Cancel subscription.
 * Handles POST /api/v1/subscription/cancel.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If no active subscription is found for the user (404 NOT_FOUND).
 */
const cancelSubscription = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { immediate } = req.body;

  // Optimization Note: Ensure subscriptionService.getUserSubscription() uses .lean()
  // for read-only operations to return plain JavaScript objects, as the document is only
  // used to extract _id and then passed to another service method.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const updatedSubscription = await subscriptionService.cancelSubscription(
    subscription._id,
    immediate || false,
    { userId, ipAddress: req.ip }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: immediate
      ? 'Subscription cancelled immediately'
      : 'Subscription will cancel at period end',
    data: updatedSubscription,
  });
});

/**
 * @swagger
 * /api/v1/subscription/add-seat:
 *   post:
 *     summary: Add a seat to the current user's subscription
 *     description: Adds a new user (seat) to the authenticated user's subscription.
 *                  This typically involves updating the subscription quantity in Stripe.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newUserId
 *             properties:
 *               newUserId:
 *                 type: string
 *                 format: objectId
 *                 description: The ID of the user to add as a new seat to the subscription.
 *                 example: "654321098765432109876544"
 *     responses:
 *       200:
 *         description: Seat added successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Seat added successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription:
 *                       $ref: '#/components/schemas/Subscription'
 *                     seatsUsed:
 *                       type: number
 *                       example: 2
 *                     seatsAvailable:
 *                       type: number
 *                       example: 8
 *                     totalCost:
 *                       type: number
 *                       example: 20
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Add seat to subscription.
 * Handles POST /api/v1/subscription/add-seat.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If no active subscription is found for the user (404 NOT_FOUND).
 */
const addSeat = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { newUserId } = req.body;

  // Optimization Note: Ensure subscriptionService.getUserSubscription() uses .lean()
  // for read-only operations to return plain JavaScript objects, as the document is only
  // used to extract _id and then passed to another service method.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  // It is assumed that subscriptionService.addSeatToSubscription
  // performs authorization checks to ensure newUserId is valid and belongs to the same tenant/organization.
  const updatedSubscription = await subscriptionService.addSeatToSubscription(
    subscription._id,
    newUserId,
    { userId, ipAddress: req.ip }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Seat added successfully',
    data: {
      subscription: updatedSubscription,
      seatsUsed: updatedSubscription.seats.used,
      seatsAvailable: updatedSubscription.seats.available,
      totalCost:
        updatedSubscription.pricePerSeat * updatedSubscription.seats.used,
    },
  });
});

/**
 * @swagger
 * /api/v1/subscription/remove-seat:
 *   post:
 *     summary: Remove a seat from the current user's subscription
 *     description: Removes a user (seat) from the authenticated user's subscription.
 *                  This typically involves updating the subscription quantity in Stripe.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - removeUserId
 *             properties:
 *               removeUserId:
 *                 type: string
 *                 format: objectId
 *                 description: The ID of the user to remove as a seat from the subscription.
 *                 example: "654321098765432109876544"
 *     responses:
 *       200:
 *         description: Seat removed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Seat removed successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     subscription:
 *                       $ref: '#/components/schemas/Subscription'
 *                     seatsUsed:
 *                       type: number
 *                       example: 1
 *                     seatsAvailable:
 *                       type: number
 *                       example: 9
 *                     totalCost:
 *                       type: number
 *                       example: 10
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Remove seat from subscription.
 * Handles POST /api/v1/subscription/remove-seat.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If no active subscription is found for the user (404 NOT_FOUND).
 */
const removeSeat = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { removeUserId } = req.body;

  // Optimization Note: Ensure subscriptionService.getUserSubscription() uses .lean()
  // for read-only operations to return plain JavaScript objects, as the document is only
  // used to extract _id and then passed to another service method.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  // It is assumed that subscriptionService.removeSeatFromSubscription
  // performs authorization checks to ensure removeUserId is valid and belongs to the same tenant/organization.
  const updatedSubscription =
    await subscriptionService.removeSeatFromSubscription(
      subscription._id,
      removeUserId,
      { userId, ipAddress: req.ip }
    );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Seat removed successfully',
    data: {
      subscription: updatedSubscription,
      seatsUsed: updatedSubscription.seats.used,
      seatsAvailable: updatedSubscription.seats.available,
      totalCost:
        updatedSubscription.pricePerSeat * updatedSubscription.seats.used,
    },
  });
});

/**
 * @swagger
 * /api/v1/subscription/usage-limit/{limitType}:
 *   get:
 *     summary: Check usage limit for a specific feature
 *     description: Retrieves the current usage and limits for a specified feature type for the authenticated user.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: limitType
 *         schema:
 *           type: string
 *           enum: [webSearch, deepResearch]
 *         required: true
 *         description: The type of usage limit to check (e.g., 'webSearch', 'deepResearch').
 *     responses:
 *       200:
 *         description: Usage limit checked successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Usage limit checked
 *                 data:
 *                   type: object
 *                   properties:
 *                     canUse: { type: boolean, example: true }
 *                     used: { type: number, example: 5 }
 *                     limit: { type: number, example: 10 }
 *                     remaining: { type: number, example: 5 }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Check usage limit.
 * Handles GET /api/v1/subscription/usage-limit/:limitType.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If `limitType` is invalid or missing (400 BAD_REQUEST).
 */
const checkUsageLimit = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const limitType = req.params.limitType || req.query.limitType;

  if (!limitType || !['webSearch', 'deepResearch'].includes(limitType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid or missing limit type');
  }

  // Optimization Note: Ensure subscriptionService.checkUsageLimit() uses .lean()
  // for read-only operations to return plain JavaScript objects.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const usageInfo = await subscriptionService.checkUsageLimit(
    userId,
    limitType
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Usage limit checked',
    data: usageInfo,
  });
});

/**
 * @swagger
 * /api/v1/subscription/increment-usage:
 *   post:
 *     summary: Increment usage counter for a specific feature
 *     description: Increments the usage counter for a specified feature type for the authenticated user.
 *                  This is typically called after a feature has been successfully used.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - limitType
 *             properties:
 *               limitType:
 *                 type: string
 *                 enum: [webSearch, deepResearch]
 *                 description: The type of usage counter to increment (e.g., 'webSearch', 'deepResearch').
 *                 example: "webSearch"
 *     responses:
 *       200:
 *         description: Usage incremented successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Usage incremented successfully
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Increment usage counter.
 * Handles POST /api/v1/subscription/increment-usage.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If `limitType` is invalid (400 BAD_REQUEST).
 */
const incrementUsage = catchAsync(async (req, res) => {
  const userId = req.user._id;
  const { limitType } = req.body;

  if (!['webSearch', 'deepResearch'].includes(limitType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid limit type');
  }

  await subscriptionService.incrementUsage(userId, limitType);

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Usage incremented successfully',
  });
});

/**
 * @swagger
 * /api/v1/subscription/usage-stats:
 *   get:
 *     summary: Get usage statistics for the current user's subscription
 *     description: Retrieves detailed usage statistics, including limits and current usage, for the authenticated user's subscription.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Usage statistics retrieved successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Usage statistics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     plan:
 *                       type: string
 *                       example: "Premium Monthly"
 *                     limits:
 *                       type: object
 *                       properties:
 *                         dailyWebSearchLimit: { type: number, example: 100 }
 *                         dailyDeepResearchLimit: { type: number, example: 10 }
 *                     usage:
 *                       type: object
 *                       properties:
 *                         webSearchUsedToday: { type: number, example: 15 }
 *                         deepResearchUsedToday: { type: number, example: 2 }
 *                         lastResetAt: { type: string, format: date-time, example: "2023-10-27T00:00:00.000Z" }
 *                     webSearch:
 *                       type: object
 *                       properties:
 *                         used: { type: number, example: 15 }
 *                         limit: { type: number, example: 100 }
 *                         remaining: { type: number, example: 85 }
 *                         percentage: { type: string, example: "15.0" }
 *                     deepResearch:
 *                       type: object
 *                       properties:
 *                         used: { type: number, example: 2 }
 *                         limit: { type: number, example: 10 }
 *                         remaining: { type: number, example: 8 }
 *                         percentage: { type: string, example: "20.0" }
 *                     lastResetAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2023-10-27T00:00:00.000Z"
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Get usage statistics.
 * Handles GET /api/v1/subscription/usage-stats.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If no active subscription is found for the user (404 NOT_FOUND).
 */
const getUsageStats = catchAsync(async (req, res) => {
  const userId = req.user._id;

  // Optimization Note: Ensure subscriptionService.getUserSubscription() uses .lean()
  // for read-only operations to return plain JavaScript objects, as the document is only
  // used to extract data for the stats object.
  // Indexing Recommendation: Ensure 'userId' is indexed on the Subscription model for efficient lookups.
  const subscription = await subscriptionService.getUserSubscription(userId);
  if (!subscription) {
    throw new ApiError(httpStatus.NOT_FOUND, 'No active subscription found');
  }

  const stats = {
    plan: subscription.plan,
    limits: subscription.limits,
    usage: subscription.usage,
    webSearch: {
      used: subscription.usage.webSearchUsedToday,
      limit: subscription.limits.dailyWebSearchLimit,
      remaining: Math.max(
        0,
        subscription.limits.dailyWebSearchLimit -
          subscription.usage.webSearchUsedToday
      ),
      percentage: (
        (subscription.usage.webSearchUsedToday /
          subscription.limits.dailyWebSearchLimit) *
        100
      ).toFixed(1),
    },
    deepResearch: {
      used: subscription.usage.deepResearchUsedToday,
      limit: subscription.limits.dailyDeepResearchLimit,
      remaining: Math.max(
        0,
        subscription.limits.dailyDeepResearchLimit -
          subscription.usage.deepResearchUsedToday
      ),
      percentage:
        subscription.limits.dailyDeepResearchLimit > 0
          ? (
              (subscription.usage.deepResearchUsedToday /
                subscription.limits.dailyDeepResearchLimit) *
              100
            ).toFixed(1)
          : 0,
    },
    lastResetAt: subscription.usage.lastResetAt,
  };

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Usage statistics retrieved successfully',
    data: stats,
  });
});

/**
 * @swagger
 * /api/v1/subscription/webhook:
 *   post:
 *     summary: Handle Stripe webhook events
 *     description: Endpoint for Stripe to send webhook events. This endpoint processes various
 *                  Stripe events (e.g., checkout.session.completed, customer.subscription.updated)
 *                  to keep the application's subscription state synchronized with Stripe.
 *                  Includes IP verification and signature validation for security.
 *     tags:
 *       - Webhook
 *     parameters:
 *       - in: header
 *         name: stripe-signature
 *         schema:
 *           type: string
 *         required: true
 *         description: The Stripe-Signature header for webhook authenticity verification.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: The Stripe event payload.
 *             example:
 *               id: "evt_12345"
 *               object: "event"
 *               type: "checkout.session.completed"
 *               data:
 *                 object:
 *                   id: "cs_test_123"
 *                   object: "checkout.session"
 *     responses:
 *       200:
 *         description: Webhook event received and processed (or duplicate).
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *                 duplicate:
 *                   type: boolean
 *                   example: false
 *       400:
 *         description: Bad Request (e.g., missing signature, invalid signature).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden (e.g., untrusted sender IP address).
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Stripe webhook handler.
 * Handles POST /api/v1/subscription/webhook.
 *
 * This function is responsible for:
 * 1. IP address verification to ensure the request originates from Stripe.
 * 2. Signature verification using `stripe-signature` header and webhook secret(s).
 * 3. Replay attack protection by checking for duplicate event IDs.
 * 4. Processing various Stripe event types to update the application's subscription state.
 *
 * @param {import('express').Request} req - The Express request object. `req.body` is expected to be raw (Buffer) for signature verification.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the sender IP is untrusted (403 FORBIDDEN).
 * @throws {ApiError} If webhook secret is not configured (500 INTERNAL_SERVER_ERROR).
 * @throws {ApiError} If `stripe-signature` header is missing or verification fails (400 BAD_REQUEST).
 */
const handleStripeWebhook = catchAsync(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret =
    config.stripe.webhook_secret || process.env.STRIPE_WEBHOOK_SECRET;

  console.log('Webhook received - signature present:', !!sig);
  console.log('Webhook secret configured:', !!webhookSecret);
  console.log(
    'Body type:',
    typeof req.body,
    Buffer.isBuffer(req.body) ? 'Buffer' : 'Not Buffer'
  );

  const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const isValidStripeIp = await isStripeIp(clientIp);

  if (!isValidStripeIp) {
    logger.error(`[STRIPE_SECURITY_ALERT] Webhook request originating from untrusted IP: ${clientIp}`);

    // Dispatch real-time security alert to Discord/Slack
    sendSecurityAlert(
      'Untrusted Webhook IP Blocked',
      `An incoming Stripe webhook request was rejected because the sender IP did not originate from Stripe's official IP ranges.`,
      {
        senderIp: clientIp,
        userAgent: req.headers['user-agent'] || 'none',
        signaturePresent: !!sig
      }
    ).catch(() => {});

    try {
      // Indexing Recommendation: Consider adding an index on 'action' and 'ipAddress' fields in BillingAuditLog model
      // if these fields are frequently queried for analytics or security monitoring.
      await BillingAuditLog.create({
        action: 'webhook_failed',
        previousState: { sig },
        newState: {
          error: 'Untrusted webhook IP address source',
          ip: clientIp,
          userAgent: req.headers['user-agent'],
        },
        ipAddress: clientIp,
      });
    } catch (logErr) {
      logger.error('Failed to create untrusted IP audit log:', logErr);
    }

    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Forbidden: untrusted sender source IP'
    );
  }

  if (!webhookSecret) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'Webhook secret not configured'
    );
  }

  if (!sig) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Missing stripe-signature header'
    );
  }

  let event;
  let verificationError = null;

  try {
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2022-11-15',
    });

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (primaryErr) {
      verificationError = primaryErr;

      const fallbackSecret = config.stripe.webhook_secret_fallback || process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
      if (fallbackSecret) {
        logger.info('[Stripe Security] Primary webhook secret verification failed. Trying fallback secret...');
        try {
          event = stripe.webhooks.constructEvent(req.body, sig, fallbackSecret);
          verificationError = null; // Verified! Clear error
          logger.info('[Stripe Security] Webhook signature verified successfully using fallback secret.');
        } catch (fallbackErr) {
          verificationError = new Error(`Both primary and fallback secret verifications failed. Fallback error: ${fallbackErr.message}`);
        }
      }
    }

    if (verificationError) {
      throw verificationError;
    }
    console.log('Webhook verified successfully:', event.type);
  } catch (err) {
    logger.error('[STRIPE_SECURITY_ALERT] Webhook signature verification failed', {
      message: err.message,
      ip: clientIp,
      userAgent: req.headers['user-agent'],
    });

    // Dispatch real-time security alert for signature mismatch
    sendSecurityAlert(
      'Webhook Signature Mismatch',
      `An incoming webhook signature check failed verification. This may indicate a replay attempt or incorrect webhook secret configuration.`,
      {
        senderIp: clientIp,
        errorMessage: err.message,
        userAgent: req.headers['user-agent'] || 'none',
        signature: sig || 'none'
      }
    ).catch(() => {});

    try {
      // Indexing Recommendation: Consider adding an index on 'action' and 'ipAddress' fields in BillingAuditLog model
      // if these fields are frequently queried for analytics or security monitoring.
      await BillingAuditLog.create({
        action: 'webhook_failed',
        previousState: { sig },
        newState: {
          error: err.message,
          ip: clientIp,
          userAgent: req.headers['user-agent'],
        },
        ipAddress: clientIp,
      });
    } catch (logErr) {
      logger.error('Failed to create webhook failure audit log:', logErr);
    }

    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Webhook signature verification failed: ${err.message}`
    );
  }

  // Webhook Replay Protection Guard
  // Optimization: Use .lean() for read-only query to reduce Mongoose document overhead.
  // Indexing Recommendation: Ensure 'eventId' is indexed on the StripeEvent model for efficient lookups.
  const existingEvent = await StripeEvent.findOne({ eventId: event.id }).lean();
  if (existingEvent) {
    console.log(`Duplicate webhook event ${event.id} discarded.`);
    return res.json({ received: true, duplicate: true });
  }
  await StripeEvent.create({ eventId: event.id });

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      // For webhook events, the service method `processStripeCheckout` is expected
      // to derive user/tenant context from the Stripe session object itself (e.g., customer ID, metadata)
      // and perform necessary internal authorization/linking.
      await subscriptionService.processStripeCheckout(session.id);
      break;
    }

    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object;
      await subscriptionService.updateSubscriptionFromStripe(subscription);
      break;
    }

    case 'invoice.payment_succeeded': {
      // Payment successful - update subscription and tenant
      const invoice = event.data.object;
      await subscriptionService.handleInvoicePaymentSucceeded(invoice);
      break;
    }

    case 'invoice.payment_failed': {
      // Payment failed - mark subscription as past_due
      const invoice = event.data.object;
      await subscriptionService.handleInvoicePaymentFailed(invoice);
      break;
    }

    case 'charge.dispute.created': {
      const dispute = event.data.object;
      await subscriptionService.handleDisputeCreated(dispute);
      break;
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object;
      await subscriptionService.handleDisputeClosed(dispute);
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
});

/**
 * @swagger
 * /api/v1/subscription/billing-portal:
 *   post:
 *     summary: Create a Stripe Customer Billing Portal session
 *     description: Generates a URL for the Stripe Customer Billing Portal, allowing users to manage their
 *                  subscription, payment methods, and billing history directly with Stripe.
 *                  Requires 'admin' role or the requesting user to belong to the specified tenant.
 *     tags:
 *       - Subscription
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               tenantId:
 *                 type: string
 *                 format: objectId
 *                 description: Optional. The ID of the tenant for which to create the billing portal session.
 *                              If not provided, defaults to the requesting user's tenantId.
 *                 example: "654321098765432109876543"
 *     responses:
 *       200:
 *         description: Billing portal session created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 statusCode:
 *                   type: number
 *                   example: 200
 *                 message:
 *                   type: string
 *                   example: Billing portal session created successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       format: uri
 *                       example: "https://billing.stripe.com/p/session/..."
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
/**
 * Create Stripe Customer Billing Portal session.
 * Handles POST /api/v1/subscription/billing-portal.
 *
 * @param {import('express').Request & { user: UserAuthInfo }} req - The Express request object with authenticated user information.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} A promise that resolves when the response is sent.
 * @throws {ApiError} If the user is not authorized (403 FORBIDDEN).
 */
const createBillingPortalSession = catchAsync(async (req, res) => {
  const userId = req.user._id;
  let tenantId = req.body.tenantId || req.query.tenantId || null;
  // Assuming req.user is populated by authentication middleware and contains _id, tenantId, and role.
  const requestingUserTenantId = req.user.tenantId;
  const requestingUserRole = req.user.role;
  const ipAddress = req.ip || 'unknown';

  // If no tenantId is explicitly provided in the request, default to the requesting user's tenantId.
  if (!tenantId) {
    tenantId = requestingUserTenantId;
  }

  // Authorization check:
  // Only users with 'admin' role can create billing portal sessions for arbitrary tenants.
  // Regular users can only create sessions for their own tenant.
  if (requestingUserRole !== 'admin' && tenantId.toString() !== requestingUserTenantId.toString()) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Forbidden: You are not authorized to create a billing portal session for this tenant.');
  }

  // The service method should ensure that the userId is authorized to act on behalf of the tenantId.
  // Optimization Note: Ensure subscriptionService.createBillingPortalSession() uses .lean()
  // for any internal read-only queries to fetch subscription or customer data.
  // Indexing Recommendation: Ensure 'userId' and 'tenantId' are indexed on the Subscription model for efficient lookups.
  const session = await subscriptionService.createBillingPortalSession(
    userId, // The user initiating the request
    tenantId, // The tenant for which the portal session is requested
    { ipAddress }
  );

  sendResponse(res, {
    success: true,
    statusCode: httpStatus.OK,
    message: 'Billing portal session created successfully',
    data: {
      url: session.url,
    },
  });
});

export default {
  getAvailablePlans,
  getMySubscription,
  getTenantSubscription,
  createFreeSubscription,
  upgradeSubscription,
  confirmPayment,
  processCheckout,
  cancelSubscription,
  addSeat,
  removeSeat,
  checkUsageLimit,
  incrementUsage,
  getUsageStats,
  handleStripeWebhook,
  createBillingPortalSession,
};