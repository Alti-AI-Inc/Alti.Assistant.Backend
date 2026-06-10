import mongoose from 'mongoose';

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
  keepAlive: true,
  // The delay in milliseconds before the first keep-alive probe is sent on an idle socket.
  // A value of 300000ms (5 minutes) is recommended for GCP environments.
  keepAliveInitialDelay: 300000,
};

// Establish the database connection
mongoose.connect(MONGO_URI, mongooseOptions).catch(err => {
  console.error('FATAL: Initial MongoDB connection failed.', err);
  // In a production environment, you should exit the process if the database connection fails on startup.
  // process.exit(1);
});

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
  await PaymentService.handleWebhookService(req, res);
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
 * Increments the prompt usage count for a user.
 * This function handles both free and subscribed users within a database transaction to ensure atomicity.
 * If the user is on a free plan, it increments their `freePlanUsage.promptsUsed`.
 * If the user is subscribed, it increments the `usage.promptsUsed` on their active subscription record.
 * It gracefully handles database disconnection by bypassing the update.
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user whose prompt usage is to be incremented.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating the outcome of the operation.
 */
const incrementPromptsUsed = async (userId) => {
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ [Payment Controller] Database is not connected. Bypassing prompt usage increment.');
    return { success: true, message: 'Database disconnected. Bypassed prompt usage update.' };
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    // The `checkFreePlanLimits` function is expected to return a Mongoose document
    // because `user.save()` is called later if the user is not subscribed.
    const user = await checkFreePlanLimits(userId, 'prompt', session);

    if (user.isSubscribed) {
      // The `checkUsageLimits` function is external. If it performs a read-only lookup
      // for the subscription, it should internally use `.lean()` for performance.
      const subscription = await checkUsageLimits(userId);
      console.log('Subscription check result:', subscription);

      if (!subscription || !subscription._id) {
        throw new Error('Subscription not found or invalid.');
      }

      await SubscriptionModel.updateOne(
        { _id: subscription._id },
        { $inc: { 'usage.promptsUsed': 1 } },
        { session }
      );
    } else {
      if (!user.freePlanUsage) {
        user.freePlanUsage = { promptsUsed: 0, imagesUsed: 0 };
      }
      user.freePlanUsage.promptsUsed = (user.freePlanUsage.promptsUsed || 0) + 1;
      user.markModified('freePlanUsage');
      await user.save({ session });
    }

    await session.commitTransaction();
    return { success: true, message: 'Prompt usage updated successfully.' };
  } catch (error) {
    console.error('Error in incrementPromptsUsed:', error);
    await session.abortTransaction();
    return { success: false, message: error.message };
  } finally {
    session.endSession();
  }
};

/**
 * Increments the image generation usage count for a user.
 * This function handles both free and subscribed users within a database transaction to ensure atomicity.
 * If the user is on a free plan, it increments their `freePlanUsage.imagesUsed`.
 * If the user is subscribed, it increments the `usage.imagesUsed` on their active subscription record.
 * It gracefully handles database disconnection by bypassing the update.
 * @param {string | mongoose.Types.ObjectId} userId - The ID of the user whose image usage is to be incremented.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating the outcome of the operation.
 */
const incrementImagesUsed = async (userId) => {
  if (mongoose.connection.readyState !== 1) {
    console.warn('⚠️ [Payment Controller] Database is not connected. Bypassing image usage increment.');
    return { success: true, message: 'Database disconnected. Bypassed image usage update.' };
  }
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    // Bug Fix: Changed 'prompt' to 'image' in checkFreePlanLimits for image usage increment.
    // The `checkFreePlanLimits` function is expected to return a Mongoose document
    // because `user.save()` is called later if the user is not subscribed.
    const user = await checkFreePlanLimits(userId, 'image', session); // Optimization: Corrected 'prompt' to 'image' for accurate usage tracking.

    if (user.isSubscribed) {
      // The `checkUsageLimits` function is external. If it performs a read-only lookup
      // for the subscription, it should internally use `.lean()` for performance.
      const subscription = await checkUsageLimits(userId);
      // console.log("Subscription check result:", subscription);

      if (!subscription || !subscription._id) {
        throw new Error('Subscription not found or invalid.');
      }

      await SubscriptionModel.updateOne(
        { _id: subscription._id },
        { $inc: { 'usage.imagesUsed': 1 } },
        { session }
      );
    } else {
      if (!user.freePlanUsage) {
        user.freePlanUsage = { promptsUsed: 0, imagesUsed: 0 };
      }
      user.freePlanUsage.imagesUsed = (user.freePlanUsage.imagesUsed || 0) + 1;
      user.markModified('freePlanUsage');
      await user.save({ session });
    }

    await session.commitTransaction();
    return { success: true, message: 'Image usage updated successfully.' };
  } catch (error) {
    console.error('Error in incrementImagesUsed:', error);
    await session.abortTransaction();
    return {
      success: false,
      message: error.message || 'An error occurred while updating image usage.',
    };
  } finally {
    session.endSession();
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