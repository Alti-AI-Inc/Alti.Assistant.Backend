import mongoose from 'mongoose';
import { PubSub } from '@google-cloud/pubsub'; // GCP Pub/Sub for asynchronous task offloading

// --- GCP Pub/Sub Configuration ---
// Initialize the Pub/Sub client.
// In a production environment on GCP, authentication is handled automatically
// via the service account of the running resource (e.g., Cloud Run, GKE).
const pubSubClient = new PubSub();

// It's a best practice to use environment variables for topic names.
const STRIPE_WEBHOOK_TOPIC = process.env.STRIPE_WEBHOOK_TOPIC || 'stripe-webhooks';
const USAGE_TRACKING_TOPIC = process.env.USAGE_TRACKING_TOPIC || 'usage-tracking';
// --- End of GCP Pub/Sub Configuration ---

// --- GCP Database Resiliency Configuration ---
// NOTE: It is a best practice to centralize this connection logic in a dedicated module (e.g., /config/database.js)
// and import it in your main application entry point (e.g., server.js) to ensure the database is connected once.
const MONGO_URI = process.env.DATABASE_URL || 'mongodb://localhost:27017/altidatabase';

const mongooseOptions = {
  // --- Connection Pooling for Production ---
  // Limits the number of concurrent open connections. Adjust based on application load and database tier.
  // A pool size of 10 is a robust starting point for many applications on GCP.
  maxPoolSize: 10,
  // Maintains a minimum number of connections, reducing latency for the first operations after a period of inactivity.
  minPoolSize: 2,

  // --- Timeout Settings for Network Resiliency ---
  // How long the driver waits for a connection to be established. Increased to 30s for GCP's network environment.
  connectTimeoutMS: 30000,
  // How long a socket can be inactive before closing. Prevents premature closure during long-running queries.
  socketTimeoutMS: 45000,
  // How long the driver waits to find a suitable server. Resilient to transient network issues or replica set failovers.
  serverSelectionTimeoutMS: 30000,

  // --- KeepAlive Settings for GCP Network Infrastructure (VPC Peering, Cloud SQL Auth Proxy) ---
  // Enables TCP KeepAlive. This is crucial for maintaining long-lived connections through network proxies,
  // NATs, or firewalls which may otherwise terminate idle sockets.

  // The delay in milliseconds before the first keep-alive probe is sent on an idle socket.
  // A value of 300000ms (5 minutes) is recommended for GCP environments.

};

// Establish the database connection
// mongoose.connect removed

// --- Connection Event Listeners for Observability ---
mongoose.connection.on('connected', () => {
  console.log(`Mongoose connected to database.`);
});

mongoose.connection.on('error', err => {
  console.error('Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('Mongoose disconnected. The driver will attempt to reconnect.');
});

// --- End of GCP Database Resiliency Configuration ---

import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { checkUsageLimits } from '../../middlewares/checkUsageLimits/checkUsageLimits.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import { PaymentService } from './payment.service.js';
// import { checkFreePlanLimits } from '../../middlewares/checkFreePlanLimits/checkFreePlanLimits.js';
import { checkFreePlanLimits } from '../../middlewares/checkFreePlanLimits/checkFreePlanLimits.js';

/**
 * @openapi
 * /api/v1/payments/create-checkout-session:
 *   post:
 *     summary: Create a Stripe checkout session
 *     description: Generates a Stripe checkout session URL for a specified user and subscription plan.
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
 *             required:
 *               - userId
 *               - plan
 *             properties:
 *               userId:
 *                 type: string
 *                 description: The ID of the user purchasing the subscription.
 *                 example: '60d0fe4f5311236168a109ca'
 *               plan:
 *                 type: string
 *                 description: The subscription plan to purchase.
 *                 enum: [monthly, yearly]
 *                 example: 'monthly'
 *     responses:
 *       '200':
 *         description: Checkout session created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     url:
 *                       type: string
 *                       description: The URL for the Stripe checkout session.
 *       '400':
 *         description: Bad Request - Invalid User ID provided.
 *       '404':
 *         description: Not Found - User with the provided ID does not exist.
 *       '500':
 *         description: Internal Server Error.
 */
/**
 * Creates a Stripe checkout session for a user to subscribe to a plan.
 * It validates the user's existence and then calls the payment service to generate the session URL.
 * @permission Requires an authenticated user.
 * @param {import('express').Request} req - The Express request object, containing `userId` and `plan` in the body.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response with the checkout session URL or an error.
 */
const createCheckoutSession = catchAsync(async (req, res) => {
  const { userId, plan } = req.body;
  // console.log(userId, plan);

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    console.error('Invalid User ID:', userId);
    return res.status(400).json({ error: 'Invalid User ID' });
  }

  // Optimization: Added .lean() as the user object is likely read-only for creating a checkout session.
  // This reduces Mongoose document overhead.
  const user = await UserModel.findById(userId).lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sessionUrl = await PaymentService.createCheckoutSessionService(
    user,
    plan
  );

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Checkout session created successfully',
    data: { url: sessionUrl },
  });
});

/**
 * @openapi
 * /api/v1/payments/webhook:
 *   post:
 *     summary: Handle Stripe webhook events
 *     description: >
 *       Listens for and processes incoming webhook events from Stripe to manage subscription statuses,
 *       payment successes, and other billing-related events. This endpoint is intended to be called by Stripe's servers,
 *       not by client applications. It relies on signature verification handled within the service layer.
 *     tags:
 *       - Payment
 *     requestBody:
 *       description: Stripe event object. The structure is determined by the event type from Stripe.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: A generic object to represent the Stripe event payload.
 *     responses:
 *       '200':
 *         description: Acknowledges successful receipt of the event.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       '400':
 *         description: Bad Request - Often due to a webhook signature verification error.
 */
/**
 * Handles incoming webhooks from Stripe to update subscription status.
 * This endpoint is publicly accessible but secured by Stripe's signature verification,
 * which is handled by the underlying service.
 * @param {import('express').Request} req - The Express request object, containing the raw body for signature verification.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Delegates to the webhook service and sends a response.
 */
const handleWebhook = catchAsync(async (req, res) => {
  // REFACTOR: Offload Stripe webhook processing to a background worker via Pub/Sub.
  // This ensures the endpoint responds to Stripe immediately, preventing timeouts and retries,
  // and makes the system more resilient to processing failures. The heavy lifting (database updates,
  // sending emails, etc.) is handled asynchronously by a separate, scalable worker service.

  // The background worker will need the raw body for signature verification.
  // This assumes a middleware like `express.json({ verify: ... })` has attached `req.rawBody`.
  const payload = {
    // Pass all headers, as some may be relevant for processing.
    headers: req.headers,
    // Stripe's SDK requires the raw, unparsed request body as a Buffer or string.
    // We send it as a string for JSON compatibility. The worker will handle it.
    body: req.rawBody ? req.rawBody.toString('utf-8') : JSON.stringify(req.body),
    // Explicitly include the signature for the worker to use in verification.
    stripeSignature: req.headers['stripe-signature'],
  };

  const dataBuffer = Buffer.from(JSON.stringify(payload));

  // Asynchronously publish the entire webhook event for a separate worker to process.
  await pubSubClient.topic(STRIPE_WEBHOOK_TOPIC).publishMessage({ data: dataBuffer });

  // Immediately acknowledge receipt to Stripe.
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'Webhook received and queued for processing.',
    data: { received: true },
  });
});

/**
 * @openapi
 * /api/v1/payments/subscriptions:
 *   get:
 *     summary: Get all subscriptions
 *     description: Fetches a list of all user subscriptions in the system. Limited to the 500 most recent subscriptions. This is an admin-only endpoint.
 *     tags:
 *       - Payment
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: A list of all subscriptions.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Subscription'
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User does not have the required 'ADMIN' role.
 */
/**
 * Retrieves a list of all subscriptions, sorted by creation date.
 * @permission Requires `ADMIN` role.
 * @param {import('express').Request} req - The Express request object.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response with a list of all subscriptions or an error.
 */
const getAllSubscriptions = catchAsync(async (req, res) => {
  // Optimization: Added .lean() for read-only query to return plain JavaScript objects,
  // improving performance by skipping Mongoose document instantiation.
  // Indexing Recommendation: For better performance on sorting, consider adding an index to `createdAt` field:
  // db.subscriptions.createIndex({ createdAt: -1 })
  const subscriptions = await SubscriptionModel.find({}).sort({
    createdAt: -1,
  }).limit(500).lean();
  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'All subscriptions fetched successfully',
    data: subscriptions,
  });
});

/**
 * @openapi
 * /api/v1/payments/subscriptions/{userId}:
 *   get:
 *     summary: Get subscriptions for a specific user
 *     description: Fetches all subscription records associated with a given user ID.
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
 *           format: mongoId
 *         description: The unique identifier of the user.
 *     responses:
 *       '200':
 *         description: A list of subscriptions for the specified user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Subscription'
 *       '400':
 *         description: Bad Request - User ID is missing or invalid.
 *       '401':
 *         description: Unauthorized - User is not authenticated.
 *       '403':
 *         description: Forbidden - User is not an admin and is trying to access another user's subscriptions.
 *       '404':
 *         description: Not Found - No subscriptions found for this user.
 */
/**
 * Retrieves all subscriptions for a specific user, identified by their user ID.
 * @permission Requires `ADMIN` role or the authenticated user must be the owner of the subscriptions.
 * @param {import('express').Request} req - The Express request object, containing `userId` in the URL parameters.
 * @param {import('express').Response} res - The Express response object.
 * @returns {Promise<void>} Sends a JSON response with the user's subscriptions or an error.
 */
const getSubscriptionsByUserId = catchAsync(async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: 'User ID is required' });

  // Optimization: Added .lean() for read-only query to return plain JavaScript objects,
  // improving performance by skipping Mongoose document instantiation.
  // Indexing Recommendation: For efficient querying and sorting, consider adding a compound index:
  // db.subscriptions.createIndex({ userId: 1, createdAt: -1 })
  // Also ensure `userId` in `UserModel` has an index if `populate` is frequently used.
  const subscriptions = await SubscriptionModel.find({ userId })
    .populate('userId', 'email')
    .sort({ createdAt: -1 })
    .lean();

  if (!subscriptions.length) {
    return sendResponse(res, {
      statusCode: 404,
      success: false,
      message: 'No subscriptions found for this user',
    });
  }

  sendResponse(res, {
    statusCode: 200,
    success: true,
    message: 'User subscriptions fetched successfully',
    data: subscriptions,
  });
});

/**
 * Publishes a message to GCP Pub/Sub to increment a user's prompt usage count.
 * This function is now a lightweight, non-blocking "fire-and-forget" operation.
 * The actual database transaction and usage limit checks are handled by a separate background worker.
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user whose prompt usage is to be incremented.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating if the offloading was successful.
 */
const incrementPromptsUsed = async (userId) => {
  // REFACTOR: Offload usage tracking to a background worker via Pub/Sub.
  // This decouples the core application logic from the billing/metering system,
  // improving performance and resilience. The main user-facing request is no longer
  // blocked by this database write.
  try {
    const payload = { userId: userId.toString(), type: 'prompt', timestamp: new Date().toISOString() };
    const dataBuffer = Buffer.from(JSON.stringify(payload));

    // Asynchronously publish the usage event. The actual database update is handled by a separate worker.
    await pubSubClient.topic(USAGE_TRACKING_TOPIC).publishMessage({ data: dataBuffer });

    // This function now returns immediately after publishing the message.
    return { success: true, message: 'Prompt usage increment task was successfully offloaded.' };
  } catch (error) {
    // In a production system, use a more robust logger and set up monitoring/alerting
    // for Pub/Sub publishing failures.
    console.error(`[FATAL] Failed to publish 'prompt' usage event for userId: ${userId}. This may lead to incorrect billing.`, error);
    // Return a failure but do not throw, to avoid crashing the primary user workflow.
    // The calling service must decide how to handle this failure (e.g., retry, log, alert).
    return { success: false, message: 'Failed to offload usage increment task.' };
  }
};

/**
 * Publishes a message to GCP Pub/Sub to increment a user's image generation usage count.
 * This function is now a lightweight, non-blocking "fire-and-forget" operation.
 * The actual database transaction and usage limit checks are handled by a separate background worker.
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user whose image usage is to be incremented.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating if the offloading was successful.
 */
const incrementImagesUsed = async (userId) => {
  // REFACTOR: Offload usage tracking to a background worker via Pub/Sub.
  // This follows the same pattern as incrementPromptsUsed for decoupling and scalability.
  try {
    const payload = { userId: userId.toString(), type: 'image', timestamp: new Date().toISOString() };
    const dataBuffer = Buffer.from(JSON.stringify(payload));

    // Asynchronously publish the usage event.
    await pubSubClient.topic(USAGE_TRACKING_TOPIC).publishMessage({ data: dataBuffer });

    return { success: true, message: 'Image usage increment task was successfully offloaded.' };
  } catch (error) {
    console.error(`[FATAL] Failed to publish 'image' usage event for userId: ${userId}. This may lead to incorrect billing.`, error);
    return { success: false, message: 'Failed to offload usage increment task.' };
  }
};

/**
 * A collection of controller functions for handling payment and subscription-related operations.
 * @namespace paymentController
 */
export const paymentController = {
  createCheckoutSession,
  handleWebhook,
  getAllSubscriptions,
  getSubscriptionsByUserId,
  incrementPromptsUsed,
  incrementImagesUsed,
};
