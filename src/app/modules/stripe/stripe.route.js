import express from 'express';
import auth from '../../middlewares/auth/auth.js';
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
  cancelSubscriptionController
} from './stripe.controller.js';

const router = express.Router();

// Customer routes
router.post('/customer', auth(), createCustomerController);
router.get('/customer/:customerId', auth(), getCustomerController);
router.put('/customer/:customerId', auth(), updateCustomerController);
router.delete('/customer/:customerId', auth(), deleteCustomerController);

// Product routes
router.post('/products', auth(), createProductController);
router.get('/products/:productId', auth(), retrieveProductController);

// Payment routes
router.post('/payment-intent', auth(), createPaymentIntentController);
router.post('/payment-method', auth(), addPaymentMethodController);
router.get('/payment-methods/:customerId/:type', auth(), listPaymentMethodsController);


//Subscription routes can be added here in the future
router.post('/subscription', auth(), createSubscriptionController);
router.delete('/subscription/:subscriptionId', auth(), cancelSubscriptionController);

export { router as stripeRoutes };