import catchAsync from '../../../shared/catchAsync.js';
import httpStatus from 'http-status';
import UserModel from '../auth/auth.model.js';
import Tenant from '../tenant/tenant.model.js';
import ApiError from '../../../errors/ApiError.js';
import sendResponse from '../../../shared/sendResponse.js';
import {
  createCustomerService,
  deleteCustomerService,
  retrieveAllCustomersService,
  retrieveAllProductsService,
  retrieveAllSubscriptionsService,
  retrieveCustomerService,
  updateCustomerService,
} from './customer/stripe.service.js';
import {
  createPaymentIntentService,
  getAllPaymentMethodsService,
  savePaymentMethodService,
} from './paymentMethod.service.js';
import {
  createProductService,
  retrieveAllPricesService,
  retrieveProductService,
} from './products/product.service.js';
import {
  cancelSubscriptionService,
  createSubscriptionService,
  retrieveSubscriptionService,
  getCustomerSubscriptionsService,
} from './subscription.service.js';
import webhookController from './webhook.controller.js';
import Product from '../products/products.model.js';
import Subscription from '../subscription/subscription.model.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';
import Stripe from 'stripe';
import config from '../../../../config/index.js';

const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

/**
 * Get or create Stripe customer ID based on request context (user or tenant)
 */
const getStripeCustomerId = async (req, createIfMissing = true) => {
  const userId = req.user._id;
  const tenantId = req.tenantId;

  let customerId = null;
  let context = 'personal';

  if (tenantId) {
    context = 'organization';
    const tenant = await Tenant.findById(tenantId);
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
    }

    // Check if the tenant already has a subscription with customer ID
    const subscription = await Subscription.findOne({ tenantId });
    if (subscription && subscription.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    }

    // Fall back to tenant owner's stripeAccountId
    if (!customerId) {
      const owner = await UserModel.findById(tenant.ownerId);
      if (owner && owner.stripeAccountId) {
        customerId = owner.stripeAccountId;
      }
    }

    if (!customerId && createIfMissing) {
      const owner = (await UserModel.findById(tenant.ownerId)) || req.user;
      const customer = await stripe.customers.create({
        email: owner.email,
        name: tenant.name,
        metadata: {
          tenantId: tenantId.toString(),
          ownerId: tenant.ownerId.toString(),
        },
      });
      customerId = customer.id;

      // If owner is the current user, save it
      if (owner._id.toString() === req.user._id.toString()) {
        owner.stripeAccountId = customerId;
        await owner.save();
      } else {
        await UserModel.findByIdAndUpdate(tenant.ownerId, {
          stripeAccountId: customerId,
        });
      }
    }
  } else {
    // Personal mode
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }
    customerId = user.stripeAccountId;

    if (!customerId && createIfMissing) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.email,
        metadata: {
          userId: userId.toString(),
        },
      });
      customerId = customer.id;
      user.stripeAccountId = customerId;
      await user.save();
    }
  }

  return { customerId, context };
};

const createCustomerController = catchAsync(async (req, res, next) => {
  const customer = await createCustomerService(req.body);
  res.status(201).json({ customer });
});

const getCustomerController = catchAsync(async (req, res, next) => {
  const { customerId, context } = await getStripeCustomerId(req);
  const customer = await retrieveCustomerService(customerId);

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Customer retrieved successfully',
    data: {
      context,
      customer,
    },
  });
});

const updateCustomerController = catchAsync(async (req, res, next) => {
  const { customerId, context } = await getStripeCustomerId(req);
  const updateData = req.body;
  const customer = await updateCustomerService(customerId, updateData);

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Customer updated successfully',
    data: {
      context,
      customer,
    },
  });
});

const deleteCustomerController = catchAsync(async (req, res, next) => {
  const { customerId, context } = await getStripeCustomerId(req);
  const confirmation = await deleteCustomerService(customerId);

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Customer deleted successfully',
    data: {
      context,
      confirmation,
    },
  });
});

const createProductController = catchAsync(async (req, res, next) => {
  await createProductService();
  res.status(201).json({ message: 'Products and prices created successfully' });
});

const retrieveProductController = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const product = await retrieveProductService(productId);
  res.status(200).json({ product });
});

const createPaymentIntentController = catchAsync(async (req, res, next) => {
  const { amount, currency } = req.body;
  const { customerId, context } = await getStripeCustomerId(req);

  const paymentIntent = await createPaymentIntentService(
    amount,
    currency,
    customerId
  );

  return sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Payment intent created successfully',
    data: {
      context,
      customerId,
      paymentIntent,
    },
  });
});

const addPaymentMethodController = catchAsync(async (req, res, next) => {
  const { paymentMethodId } = req.body;
  const { customerId, context } = await getStripeCustomerId(req);

  const paymentMethod = await savePaymentMethodService(
    customerId,
    paymentMethodId
  );

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment method added successfully',
    data: {
      context,
      customerId,
      paymentMethod,
    },
  });
});

const listPaymentMethodsController = catchAsync(async (req, res, next) => {
  const { customerId, type } = req.params;
  const paymentMethods = await getAllPaymentMethodsService(customerId, type);
  res.status(200).json({ paymentMethods });
});

/**
 * Get payment methods for current context (user or tenant)
 */
const getMyPaymentMethodsController = catchAsync(async (req, res, next) => {
  const { customerId, context } = await getStripeCustomerId(req, false);

  if (!customerId) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `No Stripe customer found for ${context}`,
      data: {
        context,
        paymentMethods: [],
        hasStripeCustomer: false,
      },
    });
  }

  try {
    const paymentMethods = await getAllPaymentMethodsService(customerId);

    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: 'Payment methods retrieved successfully',
      data: {
        context,
        customerId,
        paymentMethods,
        hasStripeCustomer: true,
      },
    });
  } catch (error) {
    // If Stripe throws a "No such customer" error, treat it gracefully as if there are no payment methods
    if (error && error.message && error.message.includes('No such customer')) {
      console.warn(`[Stripe Controller] Customer ${customerId} not found in Stripe registry. Treating as empty/new.`);
      return sendResponse(res, {
        statusCode: httpStatus.OK,
        success: true,
        message: 'Stripe customer not found in registry. Treating as empty.',
        data: {
          context,
          customerId,
          paymentMethods: [],
          hasStripeCustomer: false,
        },
      });
    }
    // Re-throw other errors
    throw error;
  }
});

const createSubscriptionController = catchAsync(async (req, res, next) => {
  const { priceId } = req.body;
  const { customerId, context } = await getStripeCustomerId(req);

  const subscription = await createSubscriptionService(customerId, priceId);

  const product = await Product.findOne({ stripePriceId: priceId });
  const query = { stripeSubscriptionId: subscription.id };
  const existingSubscription = await Subscription.findOne(
    req ? withTenantFilter(req, query) : query
  );

  if (existingSubscription) {
    existingSubscription.stripeSubscriptionId = subscription.id;
    existingSubscription.status = subscription.status;
    existingSubscription.stripePriceId = priceId;
    existingSubscription.stripeProductId = product
      ? product.stripeProductId
      : null;
    existingSubscription.pricePerSeat = product ? product.price : 0;
    await existingSubscription.save();
  } else {
    const newSubscription = new Subscription({
      tenantId: req.tenantId || null,
      userId: req.user._id,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      stripePriceId: priceId,
      stripeProductId: product ? product.stripeProductId : null,
      pricePerSeat: product ? product.price : 0,
      limits: product
        ? {
            dailyWebSearchLimit: product.features.dailyWebSearchLimit,
            dailyDeepResearchLimit: product.features.dailyDeepResearchLimit,
            canInviteTeam: product.features.canInviteTeam,
            unlimitedSeats: product.features.unlimitedSeats,
          }
        : {
            dailyWebSearchLimit: 10,
            dailyDeepResearchLimit: 0,
            canInviteTeam: false,
            unlimitedSeats: false,
          },
    });
    await newSubscription.save();
  }

  return sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: 'Subscription created successfully',
    data: {
      context,
      customerId,
      subscription,
    },
  });
});

const listPricesController = catchAsync(async (req, res, next) => {
  const prices = await retrieveAllPricesService(req.query);
  res.status(200).json({ prices });
});

const listAccounts = catchAsync(async (req, res, next) => {
  const accounts = await retrieveAllCustomersService();
  res.status(200).json({ accounts });
});

const listProducts = catchAsync(async (req, res, next) => {
  const products = await retrieveAllProductsService();
  res.status(200).json({ products });
});

const listSubscriptions = catchAsync(async (req, res, next) => {
  const subscriptions = await retrieveAllSubscriptionsService();
  res.status(200).json({ subscriptions });
});

const getSingleSubscription = catchAsync(async (req, res, next) => {
  const { subscriptionId } = req.params;
  const subscription = await retrieveSubscriptionService(subscriptionId);
  res.status(200).json({ subscription });
});

const cancelSubscriptionController = catchAsync(async (req, res, next) => {
  const { subscriptionId } = req.params;
  const confirmation = await cancelSubscriptionService(subscriptionId);
  res.status(200).json({ confirmation });
});

const getMySubscriptionsController = catchAsync(async (req, res, next) => {
  const { customerId, context } = await getStripeCustomerId(req, false);

  if (!customerId) {
    return sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: `No Stripe customer found for ${context}`,
      data: {
        context,
        subscriptions: [],
        hasStripeCustomer: false,
      },
    });
  }

  const subscriptions = await getCustomerSubscriptionsService(customerId);

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Subscriptions retrieved successfully',
    data: {
      context,
      customerId,
      subscriptions,
      hasStripeCustomer: true,
    },
  });
});

const handleWebhook = webhookController.handleStripeWebhook;
const testWebhook = webhookController.testWebhook;

export {
  createCustomerController,
  getCustomerController,
  updateCustomerController,
  deleteCustomerController,
  createProductController,
  retrieveProductController,
  createPaymentIntentController,
  addPaymentMethodController,
  listPaymentMethodsController,
  getMyPaymentMethodsController,
  createSubscriptionController,
  cancelSubscriptionController,
  getMySubscriptionsController,
  listAccounts,
  listProducts,
  listSubscriptions,
  getSingleSubscription,
  listPricesController,
  handleWebhook,
  testWebhook,
};
