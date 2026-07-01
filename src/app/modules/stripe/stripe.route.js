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
} from './stripe.controller.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';

const router = express.Router();

// Webhook route (MUST be before body parser - raw body needed)
/**
 * @openapi
 * /stripe/webhook:
 *   post:
 *     summary: Handles incoming webhooks from Stripe
 *     description: >
 *       This endpoint receives and processes webhook events from Stripe to keep the application's state in sync.
 *       It must be publicly accessible and should not be behind a JSON body parser as Stripe requires the raw request body for signature verification.
 *     tags:
 *       - Stripe Webhooks
 *     requestBody:
 *       description: Raw webhook event payload from Stripe.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *                 example: evt_12345
 *               object:
 *                 type: string
 *                 example: event
 *               type:
 *                 type: string
 *                 example: invoice.paid
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook received and acknowledged.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Bad request, e.g., invalid signature or payload.
 */
router.post('/webhook', handleWebhook);

// Test webhook (development only)
/**
 * @openapi
 * /stripe/test-webhook:
 *   post:
 *     summary: Triggers a test webhook event (Development Only)
 *     description: >
 *       An endpoint for development and testing purposes to simulate a Stripe webhook event.
 *       Requires authentication.
 *     tags:
 *       - Stripe Webhooks
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: The type of webhook event to simulate.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               eventType:
 *                 type: string
 *                 description: The Stripe event type to test (e.g., 'invoice.paid').
 *                 example: 'invoice.paid'
 *               data:
 *                 type: object
 *                 description: The data payload for the event.
 *     responses:
 *       200:
 *         description: Test webhook processed successfully.
 *       401:
 *         description: Unauthorized.
 */
router.post('/test-webhook', auth(), testWebhook);

// Customer routes
/**
 * @openapi
 * /stripe/customer:
 *   post:
 *     summary: Create a Stripe customer
 *     description: >
 *       Creates a new Stripe customer associated with the authenticated user and the current tenant.
 *       The user's ID and tenant ID are used to link the Stripe customer in the local database.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Customer information.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The customer's email address.
 *               name:
 *                 type: string
 *                 description: The customer's full name.
 *     responses:
 *       201:
 *         description: Customer created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeCustomer'
 *       400:
 *         description: Bad request, e.g., user already has a customer object.
 *       401:
 *         description: Unauthorized.
 */
router.post(
  '/customer',
  auth(),
  extractTenantContext,
  createCustomerController
);

/**
 * @openapi
 * /stripe/customers:
 *   get:
 *     summary: List all Stripe customers for the tenant
 *     description: >
 *       Retrieves a list of all Stripe customers associated with the current tenant.
 *       Requires administrative privileges.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of Stripe customers.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StripeCustomer'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden. User does not have required permissions.
 */
router.get('/customers', auth(), extractTenantContext, listAccounts);

/**
 * @openapi
 * /stripe/customer:
 *   get:
 *     summary: Get the current user's Stripe customer details
 *     description: >
 *       Retrieves the Stripe customer object associated with the currently authenticated user for the current tenant.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stripe customer details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeCustomer'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer not found for this user.
 */
router.get('/customer', auth(), extractTenantContext, getCustomerController);

/**
 * @openapi
 * /stripe/customer:
 *   put:
 *     summary: Update the current user's Stripe customer details
 *     description: >
 *       Updates the Stripe customer object associated with the currently authenticated user for the current tenant.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Fields to update for the customer.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeCustomer'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer not found for this user.
 */
router.put('/customer', auth(), extractTenantContext, updateCustomerController);

/**
 * @openapi
 * /stripe/customer:
 *   delete:
 *     summary: Delete the current user's Stripe customer
 *     description: >
 *       Deletes the Stripe customer object associated with the currently authenticated user for the current tenant.
 *       This is a destructive action.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer deleted successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer not found for this user.
 */
router.delete(
  '/customer',
  auth(),
  extractTenantContext,
  deleteCustomerController
);

// Product routes
/**
 * @openapi
 * /stripe/products:
 *   post:
 *     summary: Create a new Stripe product
 *     description: >
 *       Creates a new product in Stripe for the current tenant.
 *       Requires administrative privileges.
 *     tags:
 *       - Stripe Products
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Product details.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the product.
 *               description:
 *                 type: string
 *                 description: The product's description.
 *     responses:
 *       201:
 *         description: Product created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeProduct'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.post('/products', auth(), extractTenantContext, createProductController);

/**
 * @openapi
 * /stripe/products:
 *   get:
 *     summary: List all available products
 *     description: >
 *       Retrieves a list of all active products from Stripe. This is a public endpoint and does not require authentication.
 *     tags:
 *       - Stripe Products
 *     responses:
 *       200:
 *         description: A list of products.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StripeProduct'
 */
router.get('/products', optionalAuth(), listProducts); // Public endpoint

/**
 * @openapi
 * /stripe/products/{productId}:
 *   get:
 *     summary: Retrieve a single product
 *     description: >
 *       Retrieves the details of a specific product by its Stripe Product ID.
 *       Requires authentication.
 *     tags:
 *       - Stripe Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Stripe ID of the product to retrieve.
 *     responses:
 *       200:
 *         description: Product details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeProduct'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Product not found.
 */
router.get(
  '/products/:productId',
  auth(),
  extractTenantContext,
  retrieveProductController
);

/**
 * @openapi
 * /stripe/prices:
 *   get:
 *     summary: List all available prices
 *     description: >
 *       Retrieves a list of all active prices (and their associated products) from Stripe.
 *       This is a public endpoint and does not require authentication.
 *     tags:
 *       - Stripe Products
 *     responses:
 *       200:
 *         description: A list of prices.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StripePrice'
 */
router.get('/prices', optionalAuth(), listPricesController); // Public endpoint

// Payment routes
/**
 * @openapi
 * /stripe/payment-intent:
 *   post:
 *     summary: Create a Payment Intent
 *     description: >
 *       Creates a Stripe Payment Intent to initiate a payment flow.
 *       This is typically used for one-time payments.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Payment Intent details.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: integer
 *                 description: The amount in the smallest currency unit (e.g., cents for USD).
 *                 example: 1000
 *               currency:
 *                 type: string
 *                 description: The three-letter ISO currency code.
 *                 example: 'usd'
 *     responses:
 *       201:
 *         description: Payment Intent created successfully. Returns a client secret to be used on the frontend.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 clientSecret:
 *                   type: string
 *       401:
 *         description: Unauthorized.
 */
router.post(
  '/payment-intent',
  auth(),
  extractTenantContext,
  createPaymentIntentController
);

/**
 * @openapi
 * /stripe/payment-method:
 *   post:
 *     summary: Add a new payment method
 *     description: >
 *       Adds a new payment method (e.g., a credit card) to the current user's Stripe customer object.
 *       The payment method ID is generated by the Stripe frontend elements.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Payment method ID from Stripe.js.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: The ID of the payment method created on the client-side.
 *                 example: 'pm_12345'
 *     responses:
 *       200:
 *         description: Payment method added successfully.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer not found.
 */
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

/**
 * @openapi
 * /stripe/payment-methods/{customerId}/{type}:
 *   get:
 *     summary: List payment methods for a specific customer
 *     description: >
 *       Retrieves a list of payment methods for a given Stripe Customer ID.
 *       Requires administrative privileges.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Stripe Customer ID.
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [card, sepa_debit]
 *         description: The type of payment method to list.
 *     responses:
 *       200:
 *         description: A list of payment methods.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get(
  '/payment-methods/:customerId/:type',
  auth(),
  extractTenantContext,
  listPaymentMethodsController
);

/**
 * @openapi
 * /stripe/my-payment-methods:
 *   get:
 *     summary: Get the current user's payment methods
 *     description: >
 *       Retrieves a list of saved payment methods for the currently authenticated user.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of the user's payment methods.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer not found.
 */
router.get(
  '/my-payment-methods',
  auth(),
  extractTenantContext,
  getMyPaymentMethodsController
);

//Subscription routes
/**
 * @openapi
 * /stripe/subscription:
 *   post:
 *     summary: Create a new subscription
 *     description: >
 *       Creates a new subscription for the authenticated user to a specific price plan.
 *       Requires the user to have a Stripe customer object and a default payment method.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Subscription details.
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priceId:
 *                 type: string
 *                 description: The Stripe ID of the price plan to subscribe to.
 *                 example: 'price_12345'
 *     responses:
 *       201:
 *         description: Subscription created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeSubscription'
 *       400:
 *         description: Bad request (e.g., no default payment method).
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer or Price not found.
 */
router.post(
  '/subscription',
  auth(),
  extractTenantContext,
  createSubscriptionController
);

/**
 * @openapi
 * /stripe/subscriptions:
 *   get:
 *     summary: List all subscriptions for the tenant
 *     description: >
 *       Retrieves a list of all subscriptions within the current tenant.
 *       Requires administrative privileges.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of subscriptions.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StripeSubscription'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 */
router.get('/subscriptions', auth(), extractTenantContext, listSubscriptions);

/**
 * @openapi
 * /stripe/my-subscriptions:
 *   get:
 *     summary: Get the current user's subscriptions
 *     description: >
 *       Retrieves a list of all active and past subscriptions for the currently authenticated user.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of the user's subscriptions.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/StripeSubscription'
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Customer not found.
 */
router.get(
  '/my-subscriptions',
  auth(),
  extractTenantContext,
  getMySubscriptionsController
);

/**
 * @openapi
 * /stripe/subscription/{subscriptionId}:
 *   get:
 *     summary: Get a single subscription
 *     description: >
 *       Retrieves the details of a specific subscription by its ID.
 *       The user must either own the subscription or have administrative privileges.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Stripe ID of the subscription.
 *     responses:
 *       200:
 *         description: Subscription details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeSubscription'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Subscription not found.
 */
router.get(
  '/subscription/:subscriptionId',
  auth(),
  extractTenantContext,
  getSingleSubscription
);

/**
 * @openapi
 * /stripe/subscription/{subscriptionId}:
 *   delete:
 *     summary: Cancel a subscription
 *     description: >
 *       Cancels a subscription at the end of the current billing period.
 *       The user must either own the subscription or have administrative privileges.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The Stripe ID of the subscription to cancel.
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StripeSubscription'
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden.
 *       404:
 *         description: Subscription not found.
 */
router.delete(
  '/subscription/:subscriptionId',
  auth(),
  extractTenantContext,
  cancelSubscriptionController
);

/**
 * Express router for handling Stripe related API endpoints.
 * @type {express.Router}
 */
export { router as stripeRoutes };