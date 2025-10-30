import catchAsync from '../../../shared/catchAsync.js';
import UserModel from '../auth/auth.model.js';
import { createCustomerService, deleteCustomerService, retrieveCustomerService, updateCustomerService } from "./customer/stripe.service.js";
import { createPaymentIntentService, getAllPaymentMethodsService, savePaymentMethodService } from "./paymentMethod.service.js";
import { createProductService, retrieveProductService } from "./products/product.service.js";
import { cancelSubscriptionService, createSubscriptionService } from "./subscription.service.js";

const createCustomerController = catchAsync(async (req, res, next) => {
  const user = req.user;
  const customer = await createCustomerService(user);
  res.status(201).json({ customer });
});

const getCustomerController = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const customer = await retrieveCustomerService(customerId);
  res.status(200).json({ customer });
});

const updateCustomerController = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const updateData = req.body;
  const customer = await updateCustomerService(customerId, updateData);
  res.status(200).json({ customer });
});

const deleteCustomerController = catchAsync(async (req, res, next) => {
  const { customerId } = req.params;
  const confirmation = await deleteCustomerService(customerId);
  res.status(200).json({ confirmation });
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
  const userId = req.user._id || req.user.userId || req.user.id;
  const user = await UserModel.findOne({ _id: userId });
  const customerId = user.stripeAccountId;
  const paymentIntent = await createPaymentIntentService(amount, currency, customerId);
  res.status(201).json({ paymentIntent });
});

const addPaymentMethodController = catchAsync(async (req, res, next) => {
  const { paymentMethodId } = req.body;
  const userId = req.user._id || req.user.userId || req.user.id;
  const user = await UserModel.findOne({ _id: userId });
  const customerId = user.stripeAccountId;
  const paymentMethod = await savePaymentMethodService(customerId, paymentMethodId);
  res.status(200).json({ paymentMethod });
});

const listPaymentMethodsController = catchAsync(async (req, res, next) => {
  const { customerId, type } = req.params;
  const paymentMethods = await getAllPaymentMethodsService(customerId, type);
  res.status(200).json({ paymentMethods });
});

const createSubscriptionController = catchAsync(async (req, res, next) => {
  // Implementation for creating a subscription
  const { customerId, priceId } = req.body;
  const subscription = await createSubscriptionService(customerId, priceId);
  res.status(201).json({ subscription });
});

const cancelSubscriptionController = catchAsync(async (req, res, next) => {
  // Implementation for canceling a subscription
  const { subscriptionId } = req.params;
  const confirmation = await cancelSubscriptionService(subscriptionId);
  res.status(200).json({ confirmation });
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
  createSubscriptionController,
  cancelSubscriptionController
};