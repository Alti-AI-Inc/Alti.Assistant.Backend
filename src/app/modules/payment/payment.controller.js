import mongoose from 'mongoose';
import catchAsync from '../../../shared/catchAsync.js';
import sendResponse from '../../../shared/sendResponse.js';
import { checkUsageLimits } from '../../middlewares/checkUsageLimits/checkUsageLimits.js';
import UserModel from '../auth/auth.model.js';
import SubscriptionModel from './payment.model.js';
import { PaymentService } from './payment.service.js';
// import { checkFreePlanLimits } from '../../middlewares/checkFreePlanLimits/checkFreePlanLimits.js';
import { checkFreePlanLimits } from '../../middlewares/checkFreePlanLimits/checkFreePlanLimits.js';

const createCheckoutSession = catchAsync(async (req, res, next) => {
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

const handleWebhook = catchAsync(async (req, res, next) => {
  await PaymentService.handleWebhookService(req, res);
});

const getAllSubscriptions = catchAsync(async (req, res, next) => {
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

const getSubscriptionsByUserId = catchAsync(async (req, res, next) => {
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
    const user = await checkFreePlanLimits(userId, 'image', session);

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

export const paymentController = {
  createCheckoutSession,
  handleWebhook,
  getAllSubscriptions,
  getSubscriptionsByUserId,
  incrementPromptsUsed,
  incrementImagesUsed,
};