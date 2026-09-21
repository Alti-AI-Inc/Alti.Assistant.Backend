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
  deletePaymentMethodController,
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
  createCheckoutSessionController,
  createBillingPortalController,
  listInvoicesController,
  getInvoiceController,
  createRefundController,
} from './stripe.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

const router = express.Router();

router.post('/webhook', handleWebhook);

router.post('/test-webhook', auth(), testWebhook);

router.post(
  '/customer',
  auth(),
  extractTenantContext,
  createCustomerController
);

router.get('/customers', auth(), extractTenantContext, listAccounts);

router.get('/customer', auth(), extractTenantContext, getCustomerController);

router.put('/customer', auth(), extractTenantContext, updateCustomerController);

router.delete(
  '/customer',
  auth(),
  extractTenantContext,
  deleteCustomerController
);

router.post('/products', auth(), extractTenantContext, createProductController);

router.get('/products', optionalAuth(), listProducts); // Public endpoint

router.get(
  '/products/:productId',
  auth(),
  extractTenantContext,
  retrieveProductController
);

router.get('/prices', optionalAuth(), listPricesController); // Public endpoint

router.post(
  '/payment-intent',
  auth(),
  extractTenantContext,
  createPaymentIntentController
);

router.post(
  '/payment-method',
  auth(),
  extractTenantContext,
  addPaymentMethodController
);

router.delete(
  '/payment-method/:paymentMethodId',
  auth(),
  extractTenantContext,
  deletePaymentMethodController
);

router.get(
  '/payment-methods/:customerId/:type',
  auth(),
  extractTenantContext,
  listPaymentMethodsController
);

router.get(
  '/my-payment-methods',
  auth(),
  extractTenantContext,
  getMyPaymentMethodsController
);

router.post(
  '/subscription',
  auth(),
  extractTenantContext,
  createSubscriptionController
);

router.get('/subscriptions', auth(), extractTenantContext, listSubscriptions);

router.get(
  '/my-subscriptions',
  auth(),
  extractTenantContext,
  getMySubscriptionsController
);

router.get(
  '/subscription/:subscriptionId',
  auth(),
  extractTenantContext,
  getSingleSubscription
);

router.delete(
  '/subscription/:subscriptionId',
  auth(),
  extractTenantContext,
  cancelSubscriptionController
);

// Checkout Sessions
router.post(
  '/checkout-session',
  auth(),
  extractTenantContext,
  createCheckoutSessionController
);

// Customer Billing Portal
router.post(
  '/billing-portal',
  auth(),
  extractTenantContext,
  createBillingPortalController
);

// Invoices
router.get(
  '/invoices',
  auth(),
  extractTenantContext,
  listInvoicesController
);

router.get(
  '/invoices/:invoiceId',
  auth(),
  extractTenantContext,
  getInvoiceController
);

// Refunds
router.post(
  '/refunds',
  auth(),
  extractTenantContext,
  createRefundController
);

/**
 * Express router for handling Stripe related API endpoints.
 * @type {express.Router}
 */
export { router as stripeRoutes };