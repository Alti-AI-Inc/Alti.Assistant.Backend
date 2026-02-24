import catchAsync from '../../../shared/catchAsync.js';
import httpStatus from 'http-status';
import UserModel from '../auth/auth.model.js';
import Tenant from '../tenant/tenant.model.js';
import ApiError from '../../../errors/ApiError.js';
import sendResponse from '../../../shared/sendResponse.js';
import { createCustomerService, deleteCustomerService, retrieveAllCustomersService, retrieveAllProductsService, retrieveAllSubscriptionsService, retrieveCustomerService, updateCustomerService } from "./customer/stripe.service.js";
import { createPaymentIntentService, getAllPaymentMethodsService, savePaymentMethodService } from "./paymentMethod.service.js";
import { createProductService, retrieveAllPricesService, retrieveProductService } from "./products/product.service.js";
import { cancelSubscriptionService, createSubscriptionService, retrieveSubscriptionService, getCustomerSubscriptionsService } from "./subscription.service.js";
import SubscriptionModel from '../payment/payment.model.js';
import Product from './products/products.model.js';
import { withTenantFilter } from '../../helpers/tenantQuery.js';

/**
 * Helper function to get Stripe customer ID based on context
 * - Personal mode (currentTenantId: null) → user.stripeAccountId
 * - Organization mode (currentTenantId: ObjectId) → tenant.subscription.stripeCustomerId
 */
const getStripeCustomerId = async (req, throwOnMissing = true) => {
  const userId = req.user._id || req.user.userId || req.user.id;
  const currentTenantId = req.user?.currentTenantId;

  let customerId;
  let context;
  console.log('Getting Stripe customer ID for user:', userId, 'with tenant context:', currentTenantId);
  // Personal mode - use user's Stripe customer
  if (currentTenantId === null || currentTenantId === undefined) {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
    }

    customerId = user.stripeAccountId;
    context = 'personal';

    if (!customerId && throwOnMissing) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No Stripe customer found for user.');
    }
  }
  // Organization mode - use tenant's Stripe customer
  else {
    const tenant = await Tenant.findById(currentTenantId);
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
    }

    customerId = tenant.subscription?.stripeCustomerId;
    context = 'organization';

    if (!customerId && throwOnMissing) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'No Stripe customer found for tenant.');
    }
  }

  return { customerId, context };
};

const createCustomerController = catchAsync(async (req, res, next) => {
  const user = req.user;

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

  const paymentIntent = await createPaymentIntentService(amount, currency, customerId);

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

  const paymentMethod = await savePaymentMethodService(customerId, paymentMethodId);

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
 * - If currentTenantId is null: use user's stripeAccountId (personal mode)
 * - If currentTenantId exists: use tenant's stripeCustomerId (organization mode)
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

  // Fetch payment methods from Stripe
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
});

const createSubscriptionController = catchAsync(async (req, res, next) => {
  const { priceId } = req.body;
  const { customerId, context } = await getStripeCustomerId(req);

  const subscription = await createSubscriptionService(customerId, priceId);

  //Insert subscription in the database with the tenantId and userId for future reference (optional, but recommended)
  // You would typically have a Subscription model to save this info
  const product = Product.findOne({ stripePriceId: priceId });
  const query = { userId: req.user._id }
  const existingSubscription = await SubscriptionModel.findOne({ stripeSubscriptionId: req ? withTenantFilter(req, query) : query });
  if (existingSubscription) {
    // Update existing subscription record
    existingSubscription.stripeSubscriptionId = subscription.id;
    existingSubscription.status = subscription.status;
    existingSubscription.price = priceId;
    existingSubscription.productId = product ? product._id : null;
    await existingSubscription.save();
  } else {
    const newSubscription = new SubscriptionModel({
      tenantId: req.tenantId || null, // null for personal mode
      userId: req.user._id,
      stripeSubscriptionId: subscription.id,
      status: subscription.status,
      price: priceId,
      productId: product ? product._id : null,
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
})

const listProducts = catchAsync(async (req, res, next) => {
  const products = await retrieveAllProductsService();
  res.status(200).json({ products });
})

const listSubscriptions = catchAsync(async (req, res, next) => {
  const subscriptions = await retrieveAllSubscriptionsService();
  res.status(200).json({ subscriptions });
})

const getSingleSubscription = catchAsync(async (req, res, next) => {
  const { subscriptionId } = req.params;
  const subscription = await retrieveSubscriptionService(subscriptionId);
  res.status(200).json({ subscription });
})


const cancelSubscriptionController = catchAsync(async (req, res, next) => {
  // Implementation for canceling a subscription
  const { subscriptionId } = req.params;
  const confirmation = await cancelSubscriptionService(subscriptionId);
  res.status(200).json({ confirmation });
});

/**
 * Get subscriptions for current context (user or tenant)
 * - If currentTenantId is null: use user's stripeAccountId (personal mode)
 * - If currentTenantId exists: use tenant's stripeCustomerId (organization mode)
 */
const getMySubscriptionsController = catchAsync(async (req, res, next) => {
  const { customerId, context } = await getStripeCustomerId(req, false);
  console.log('Customer ID for subscriptions:', customerId);
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

  // Fetch subscriptions from Stripe
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
  listPricesController
};