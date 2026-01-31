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
  createSubscriptionController,
  cancelSubscriptionController,
  listAccounts,
  listProducts,
  listSubscriptions,
  getSingleSubscription,
  listPricesController,
  handleWebhook,
  testWebhook
} from './stripe.controller.js';

const router = express.Router();

// Webhook route (MUST be before body parser - raw body needed)
router.post('/webhook', handleWebhook);

// Test webhook (development only)
router.post('/test-webhook', auth(), testWebhook);

// Customer routes
router.post('/customer', auth(), extractTenantContext, createCustomerController);
router.get('/customers', auth(), extractTenantContext, listAccounts);
router.get('/customer/:customerId', auth(), extractTenantContext, getCustomerController);
router.put('/customer/:customerId', auth(), extractTenantContext, updateCustomerController);
router.delete('/customer/:customerId', auth(), extractTenantContext, deleteCustomerController);

// Product routes
router.post('/products', auth(), extractTenantContext, createProductController);
router.get('/products', auth(), extractTenantContext, listProducts);
router.get('/products/:productId', auth(), extractTenantContext, retrieveProductController);
router.get('/prices', auth(), extractTenantContext, listPricesController);

// Payment routes
router.post('/payment-intent', auth(), extractTenantContext, createPaymentIntentController);
router.post('/payment-method', auth(), extractTenantContext, addPaymentMethodController);
router.get('/payment-methods/:customerId/:type', auth(), extractTenantContext, listPaymentMethodsController);


//Subscription routes can be added here in the future
router.post('/subscription', auth(), extractTenantContext, createSubscriptionController);
router.get('/subscriptions', auth(), extractTenantContext, listSubscriptions);
router.get('/subscription/:subscriptionId', auth(), extractTenantContext, getSingleSubscription);
router.delete('/subscription/:subscriptionId', auth(), extractTenantContext, cancelSubscriptionController);

export { router as stripeRoutes };