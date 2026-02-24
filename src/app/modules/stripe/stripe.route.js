import express from 'express';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import {
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
} from './stripe.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Customer routes
router.post('/customer', auth(), extractTenantContext, createCustomerController);
router.get('/customers', auth(), extractTenantContext, listAccounts);
router.get('/customer', auth(), extractTenantContext, getCustomerController);
router.put('/customer', auth(), extractTenantContext, updateCustomerController);
router.delete('/customer', auth(), extractTenantContext, deleteCustomerController);

// Product routes
router.post('/products', auth(), extractTenantContext, createProductController);
router.get('/products', optionalAuth(), listProducts); // Public endpoint
router.get('/products/:productId', auth(), extractTenantContext, retrieveProductController);
router.get('/prices', optionalAuth(), listPricesController); // Public endpoint

// Payment routes
router.post('/payment-intent', auth(), extractTenantContext, createPaymentIntentController);
router.post('/payment-method', auth(), extractTenantContext, addPaymentMethodController);
router.get('/payment-methods/:customerId/:type', auth(), extractTenantContext, listPaymentMethodsController);
router.get('/my-payment-methods', auth(), extractTenantContext, getMyPaymentMethodsController);


//Subscription routes can be added here in the future
router.post('/subscription', auth(), extractTenantContext, createSubscriptionController);
router.get('/subscriptions', auth(), extractTenantContext, listSubscriptions);
router.get('/my-subscriptions', auth(), extractTenantContext, getMySubscriptionsController);
router.get('/subscription/:subscriptionId', auth(), extractTenantContext, getSingleSubscription);
router.delete('/subscription/:subscriptionId', auth(), extractTenantContext, cancelSubscriptionController);

export { router as stripeRoutes };