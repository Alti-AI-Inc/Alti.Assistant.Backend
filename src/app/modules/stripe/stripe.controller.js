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
  detachPaymentMethodService,
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

/**
 * Initializes the Stripe API client with the secret key and API version.
 * @type {Stripe}
 */
const stripe = new Stripe(config.stripe.stripe_secret_key, {
  apiVersion: '2022-11-15',
});

/**
 * Retrieves or creates a Stripe customer ID based on the request context (authenticated user or active tenant).
 * If a customer ID does not exist for the current context and `createIfMissing` is true, a new Stripe customer
 * will be created and associated with the user or tenant owner.
 *
 * @param {object} req - The Express request object, expected to contain `req.user` (for personal context)
 *                       and optionally `req.tenantId` (for organization context).
 * @param {boolean} [createIfMissing=true] - If true, a new Stripe customer will be created if one doesn't exist.
 *                                         If false, it will only attempt to retrieve an existing customer ID.
 * @returns {Promise<{customerId: string|null, context: 'personal'|'organization'}>} An object containing
 *          the Stripe customer ID and the context (personal or organization).
 * @throws {ApiError} If the user or tenant is not found in the database.
 */
const getStripeCustomerId = async (req, createIfMissing = true) => {
  const userId = req.user._id;
  const tenantId = req.tenantId;

  let customerId = null;
  let context = 'personal';

  if (tenantId) {
    context = 'organization';
    // Optimization: Use .lean() as the tenant document is only read, not modified.
    const tenant = await Tenant.findById(tenantId).lean();
    if (!tenant) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Tenant not found');
    }

    // Check if the tenant already has a subscription with customer ID
    // Optimization: Use .lean() as the subscription document is only read for stripeCustomerId.
    // Recommendation: Add an index to `tenantId` in the Subscription model for faster lookups.
    const subscription = await Subscription.findOne({ tenantId }).lean();
    if (subscription && subscription.stripeCustomerId) {
      customerId = subscription.stripeCustomerId;
    }

    // Fall back to tenant owner's stripeAccountId
    if (!customerId) {
      // Optimization: Use .lean() as the owner document is only read for stripeAccountId.
      const owner = await UserModel.findById(tenant.ownerId).lean();
      if (owner && owner.stripeAccountId) {
        customerId = owner.stripeAccountId;
      }
    }

    if (!customerId && createIfMissing) {
      // Optimization: Use .lean() as the owner document is only read for email and name for Stripe customer creation.
      // The subsequent update is handled by `findByIdAndUpdate` or `req.user.save()`.
      const owner = (await UserModel.findById(tenant.ownerId).lean()) || req.user;
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
        // req.user is assumed to be a full Mongoose document from middleware, so saving is fine.
        req.user.stripeAccountId = customerId;
        await req.user.save();
      } else {
        // This is already optimized using findByIdAndUpdate
        await UserModel.findByIdAndUpdate(tenant.ownerId, {
          stripeAccountId: customerId,
        });
      }
    }
  } else {
    // Personal mode
    // Note: This user document is modified and saved later, so .lean() cannot be used here.
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

/**
 * @swagger
 * /api/v1/stripe/customer:
 *   post:
 *     summary: Create a new Stripe customer
 *     description: Creates a new Stripe customer. Note: In most cases, the customer is created implicitly via getStripeCustomerId when needed. This endpoint allows explicit creation.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
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
 *                 example: customer@example.com
 *               name:
 *                 type: string
 *                 description: The customer's full name.
 *                 example: John Doe
 *               description:
 *                 type: string
 *                 description: An arbitrary string to be displayed in the Stripe Dashboard.
 *                 example: Customer for project X
 *             required:
 *               - email
 *     responses:
 *       201:
 *         description: Customer created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 customer:
 *                   type: object
 *                   description: The created Stripe customer object.
 *                   properties:
 *                     id: { type: string, example: 'cus_Nxxxx' }
 *                     email: { type: string, example: 'customer@example.com' }
 *                     name: { type: string, example: 'John Doe' }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const createCustomerController = catchAsync(async (req, res, next) => {
  const customer = await createCustomerService(req.body);
  res.status(201).json({ customer });
});

/**
 * @swagger
 * /api/v1/stripe/customer/me:
 *   get:
 *     summary: Get current user/tenant's Stripe customer details
 *     description: Retrieves the Stripe customer details for the authenticated user or the active tenant. If no customer exists, one will be created implicitly.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Customer retrieved successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customer:
 *                       type: object
 *                       description: The Stripe customer object.
 *                       properties:
 *                         id: { type: string, example: 'cus_Nxxxx' }
 *                         email: { type: string, example: 'user@example.com' }
 *                         name: { type: string, example: 'User Name' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
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

/**
 * @swagger
 * /api/v1/stripe/customer/me:
 *   patch:
 *     summary: Update current user/tenant's Stripe customer details
 *     description: Updates the Stripe customer details for the authenticated user or the active tenant.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The customer's new full name.
 *                 example: Jane Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The customer's new email address.
 *                 example: jane.doe@example.com
 *               phone:
 *                 type: string
 *                 description: The customer's new phone number.
 *                 example: "+1234567890"
 *             # Add other Stripe customer update fields as needed
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Customer updated successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customer:
 *                       type: object
 *                       description: The updated Stripe customer object.
 *                       properties:
 *                         id: { type: string, example: 'cus_Nxxxx' }
 *                         email: { type: string, example: 'jane.doe@example.com' }
 *                         name: { type: string, example: 'Jane Doe' }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
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

/**
 * @swagger
 * /api/v1/stripe/customer/me:
 *   delete:
 *     summary: Delete current user/tenant's Stripe customer
 *     description: Deletes the Stripe customer for the authenticated user or the active tenant. This action is irreversible.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Customer deleted successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer was for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     confirmation:
 *                       type: object
 *                       description: Confirmation object from Stripe indicating deletion status.
 *                       properties:
 *                         id: { type: string, example: 'cus_Nxxxx' }
 *                         deleted: { type: boolean, example: true }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
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

/**
 * @swagger
 * /api/v1/stripe/products:
 *   post:
 *     summary: Create Stripe products and their prices
 *     description: Creates or updates Stripe products and their associated prices. This is typically an admin-only endpoint for initial setup or synchronization of product offerings.
 *     tags:
 *       - Stripe Products
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: Products and prices created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Products and prices created successfully
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const createProductController = catchAsync(async (req, res, next) => {
  await createProductService();
  res.status(201).json({ message: 'Products and prices created successfully' });
});

/**
 * @swagger
 * /api/v1/stripe/products/{productId}:
 *   get:
 *     summary: Retrieve a single Stripe product
 *     description: Retrieves details of a specific Stripe product by its ID.
 *     tags:
 *       - Stripe Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: productId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Stripe product to retrieve.
 *         example: prod_Nxxxx
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 product:
 *                   type: object
 *                   description: The Stripe product object.
 *                   properties:
 *                     id: { type: string, example: 'prod_Nxxxx' }
 *                     name: { type: string, example: 'Premium Plan' }
 *                     description: { type: string, example: 'Access to all premium features.' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const retrieveProductController = catchAsync(async (req, res, next) => {
  const { productId } = req.params;
  const product = await retrieveProductService(productId);
  res.status(200).json({ product });
});

/**
 * @swagger
 * /api/v1/stripe/payment-intents:
 *   post:
 *     summary: Create a Stripe Payment Intent
 *     description: Creates a Payment Intent for a specified amount and currency. This is the first step in collecting payment for one-time purchases.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: number
 *                 description: The amount to collect (in cents/smallest currency unit).
 *                 example: 1000
 *               currency:
 *                 type: string
 *                 description: Three-letter ISO currency code (e.g., 'usd').
 *                 example: usd
 *             required:
 *               - amount
 *               - currency
 *     responses:
 *       201:
 *         description: Payment intent created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 201 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Payment intent created successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customerId:
 *                       type: string
 *                       description: The Stripe customer ID associated with the payment intent.
 *                       example: cus_Nxxxx
 *                     paymentIntent:
 *                       type: object
 *                       description: The Stripe Payment Intent object.
 *                       properties:
 *                         id: { type: string, example: 'pi_Nxxxx' }
 *                         client_secret: { type: string, example: 'pi_Nxxxx_secret_Nxxxx' }
 *                         amount: { type: number, example: 1000 }
 *                         currency: { type: string, example: 'usd' }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
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

/**
 * @swagger
 * /api/v1/stripe/payment-methods:
 *   post:
 *     summary: Add a payment method to the current user/tenant's Stripe customer
 *     description: Attaches a payment method (e.g., a card) to the authenticated user's or active tenant's Stripe customer. Automatically promotes the user to 'admin' role upon successful addition of billing details.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethodId:
 *                 type: string
 *                 description: The ID of the Stripe PaymentMethod to attach. This ID is typically obtained from the client-side using Stripe.js.
 *                 example: pm_card_visa
 *             required:
 *               - paymentMethodId
 *     responses:
 *       200:
 *         description: Payment method added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Payment method added successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customerId:
 *                       type: string
 *                       description: The Stripe customer ID to which the payment method was attached.
 *                       example: cus_Nxxxx
 *                     paymentMethod:
 *                       type: object
 *                       description: The attached Stripe PaymentMethod object.
 *                       properties:
 *                         id: { type: string, example: 'pm_Nxxxx' }
 *                         type: { type: string, example: 'card' }
 *                         card: { type: object, properties: { last4: { type: string, example: '4242' }, brand: { type: string, example: 'visa' } } }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const addPaymentMethodController = catchAsync(async (req, res, next) => {
  const { paymentMethodId } = req.body;
  const { customerId, context } = await getStripeCustomerId(req);

  const paymentMethod = await savePaymentMethodService(
    customerId,
    paymentMethodId
  );

  // Automatically promote user to admin when they enter billing details
  if (req.user && req.user._id) {
    // This is already optimized using findByIdAndUpdate
    await UserModel.findByIdAndUpdate(req.user._id, { role: 'admin' });
  }

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

/**
 * @swagger
 * /api/v1/stripe/payment-method/{paymentMethodId}:
 *   delete:
 *     summary: Delete/detach a payment method
 *     description: Detaches a payment method from the Stripe customer associated with the current tenant context.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentMethodId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the Payment Method to delete/detach.
 *     responses:
 *       200:
 *         description: Payment method detached successfully.
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const deletePaymentMethodController = catchAsync(async (req, res, next) => {
  const { paymentMethodId } = req.params;
  const { customerId } = await getStripeCustomerId(req, false);

  if (!customerId) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Stripe customer not found');
  }

  // Retrieve payment method to verify ownership
  const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
  if (!paymentMethod || paymentMethod.customer !== customerId) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'You do not have permission to delete this payment method'
    );
  }

  await detachPaymentMethodService(paymentMethodId);

  return sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Payment method deleted successfully',
  });
});

/**
 * @swagger
 * /api/v1/stripe/payment-methods/{customerId}/{type?}:
 *   get:
 *     summary: List payment methods for a specific Stripe customer
 *     description: Retrieves a list of payment methods for a given Stripe customer ID, optionally filtered by type. This is typically an admin-only endpoint or for internal use.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Stripe customer.
 *         example: cus_Nxxxx
 *       - in: path
 *         name: type
 *         schema:
 *           type: string
 *           enum: [card, sepa_debit, us_bank_account]
 *         required: false
 *         description: Optional filter for payment method type.
 *         example: card
 *     responses:
 *       200:
 *         description: Payment methods retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 paymentMethods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A Stripe PaymentMethod object.
 *                     properties:
 *                       id: { type: string, example: 'pm_Nxxxx' }
 *                       type: { type: string, example: 'card' }
 *                       card: { type: object, properties: { last4: { type: string, example: '4242' }, brand: { type: string, example: 'visa' } } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const listPaymentMethodsController = catchAsync(async (req, res, next) => {
  const { customerId, type } = req.params;
  const paymentMethods = await getAllPaymentMethodsService(customerId, type);
  res.status(200).json({ paymentMethods });
});

/**
 * @swagger
 * /api/v1/stripe/payment-methods/me:
 *   get:
 *     summary: List payment methods for the current user/tenant
 *     description: Retrieves a list of payment methods associated with the authenticated user's or active tenant's Stripe customer. Gracefully handles cases where no Stripe customer exists.
 *     tags:
 *       - Stripe Payments
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Payment methods retrieved successfully or no customer found.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Payment methods retrieved successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customerId:
 *                       type: string
 *                       description: The Stripe customer ID. Present if a customer exists.
 *                       example: cus_Nxxxx
 *                     paymentMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: A Stripe PaymentMethod object.
 *                         properties:
 *                           id: { type: string, example: 'pm_Nxxxx' }
 *                           type: { type: string, example: 'card' }
 *                           card: { type: object, properties: { last4: { type: string, example: '4242' }, brand: { type: string, example: 'visa' } } }
 *                     hasStripeCustomer:
 *                       type: boolean
 *                       description: Indicates if a Stripe customer exists for the current context.
 *                       example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
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

/**
 * @swagger
 * /api/v1/stripe/subscriptions:
 *   post:
 *     summary: Create a new Stripe subscription
 *     description: Creates a new Stripe subscription for the authenticated user or active tenant based on a specified price ID. Automatically promotes the user to 'admin' role upon successful subscription.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               priceId:
 *                 type: string
 *                 description: The ID of the Stripe Price to subscribe to.
 *                 example: price_Nxxxx
 *             required:
 *               - priceId
 *     responses:
 *       201:
 *         description: Subscription created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 201 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Subscription created successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customerId:
 *                       type: string
 *                       description: The Stripe customer ID associated with the subscription.
 *                       example: cus_Nxxxx
 *                     subscription:
 *                       type: object
 *                       description: The created Stripe Subscription object.
 *                       properties:
 *                         id: { type: string, example: 'sub_Nxxxx' }
 *                         status: { type: string, example: 'active' }
 *                         current_period_end: { type: number, example: 1678886400 }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const createSubscriptionController = catchAsync(async (req, res, next) => {
  const { priceId } = req.body;
  const { customerId, context } = await getStripeCustomerId(req);

  const subscription = await createSubscriptionService(customerId, priceId);

  // Automatically promote user to admin when they start a subscription
  if (req.user && req.user._id) {
    // This is already optimized using findByIdAndUpdate
    await UserModel.findByIdAndUpdate(req.user._id, { role: 'admin' });
  }

  // Optimization: Use .lean() as the product document is only read for its properties.
  // Recommendation: Add an index to `stripePriceId` in the Product model for faster lookups.
  const product = await Product.findOne({ stripePriceId: priceId }).lean();
  const query = { stripeSubscriptionId: subscription.id };
  // Note: existingSubscription is modified and saved later, so .lean() cannot be used here.
  // Recommendation: Add an index to `stripeSubscriptionId` and `tenantId` (or a compound index `tenantId, stripeSubscriptionId`)
  // in the Subscription model for faster lookups.
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

/**
 * @swagger
 * /api/v1/stripe/prices:
 *   get:
 *     summary: List all Stripe prices
 *     description: Retrieves a list of all Stripe prices, optionally filtered by query parameters (e.g., `active=true`, `type=recurring`, `product=prod_Nxxxx`). This is typically an admin-only endpoint or for displaying available plans.
 *     tags:
 *       - Stripe Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: active
 *         schema:
 *           type: boolean
 *         description: Only return prices that are active.
 *         example: true
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [one_time, recurring]
 *         description: Only return prices of this type.
 *         example: recurring
 *       - in: query
 *         name: product
 *         schema:
 *           type: string
 *         description: Only return prices for the given product ID.
 *         example: prod_Nxxxx
 *     responses:
 *       200:
 *         description: Prices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prices:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A Stripe Price object.
 *                     properties:
 *                       id: { type: string, example: 'price_Nxxxx' }
 *                       unit_amount: { type: number, example: 1000 }
 *                       currency: { type: string, example: 'usd' }
 *                       recurring: { type: object, properties: { interval: { type: string, example: 'month' } } }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const listPricesController = catchAsync(async (req, res, next) => {
  const prices = await retrieveAllPricesService(req.query);
  res.status(200).json({ prices });
});

/**
 * @swagger
 * /api/v1/stripe/customers:
 *   get:
 *     summary: List all Stripe customers
 *     description: Retrieves a list of all Stripe customers. This is typically an admin-only endpoint for managing all customers in the Stripe account.
 *     tags:
 *       - Stripe Customers
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accounts:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A Stripe Customer object.
 *                     properties:
 *                       id: { type: string, example: 'cus_Nxxxx' }
 *                       email: { type: string, example: 'customer@example.com' }
 *                       name: { type: string, example: 'John Doe' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const listAccounts = catchAsync(async (req, res, next) => {
  const accounts = await retrieveAllCustomersService();
  res.status(200).json({ accounts });
});

/**
 * @swagger
 * /api/v1/stripe/products/all:
 *   get:
 *     summary: List all Stripe products
 *     description: Retrieves a list of all Stripe products. This is typically an admin-only endpoint for viewing all product definitions.
 *     tags:
 *       - Stripe Products
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A Stripe Product object.
 *                     properties:
 *                       id: { type: string, example: 'prod_Nxxxx' }
 *                       name: { type: string, example: 'Premium Plan' }
 *                       description: { type: string, example: 'Access to all premium features.' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const listProducts = catchAsync(async (req, res, next) => {
  const products = await retrieveAllProductsService();
  res.status(200).json({ products });
});

/**
 * @swagger
 * /api/v1/stripe/subscriptions/all:
 *   get:
 *     summary: List all Stripe subscriptions
 *     description: Retrieves a list of all Stripe subscriptions across all customers. This is typically an admin-only endpoint for overview and management.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscriptions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscriptions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     description: A Stripe Subscription object.
 *                     properties:
 *                       id: { type: string, example: 'sub_Nxxxx' }
 *                       status: { type: string, example: 'active' }
 *                       customer: { type: string, example: 'cus_Nxxxx' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
const listSubscriptions = catchAsync(async (req, res, next) => {
  const subscriptions = await retrieveAllSubscriptionsService();
  res.status(200).json({ subscriptions });
});

/**
 * @swagger
 * /api/v1/stripe/subscriptions/{subscriptionId}:
 *   get:
 *     summary: Retrieve a single Stripe subscription
 *     description: Retrieves details of a specific Stripe subscription by its ID.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Stripe subscription to retrieve.
 *         example: sub_Nxxxx
 *     responses:
 *       200:
 *         description: Subscription retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 subscription:
 *                   type: object
 *                   description: The Stripe Subscription object.
 *                   properties:
 *                     id: { type: string, example: 'sub_Nxxxx' }
 *                     status: { type: string, example: 'active' }
 *                     customer: { type: string, example: 'cus_Nxxxx' }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const getSingleSubscription = catchAsync(async (req, res, next) => {
  const { subscriptionId } = req.params;
  const subscription = await retrieveSubscriptionService(subscriptionId);
  res.status(200).json({ subscription });
});

/**
 * @swagger
 * /api/v1/stripe/subscriptions/{subscriptionId}/cancel:
 *   post:
 *     summary: Cancel a Stripe subscription
 *     description: Cancels a specific Stripe subscription by its ID. The subscription will be canceled at the end of its current billing period.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: subscriptionId
 *         schema:
 *           type: string
 *         required: true
 *         description: The ID of the Stripe subscription to cancel.
 *         example: sub_Nxxxx
 *     responses:
 *       200:
 *         description: Subscription cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 confirmation:
 *                   type: object
 *                   description: The cancelled Stripe Subscription object.
 *                   properties:
 *                     id: { type: string, example: 'sub_Nxxxx' }
 *                     status: { type: string, example: 'canceled' }
 *                     cancel_at_period_end: { type: boolean, example: true }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
const cancelSubscriptionController = catchAsync(async (req, res, next) => {
  const { subscriptionId } = req.params;
  const confirmation = await cancelSubscriptionService(subscriptionId);
  res.status(200).json({ confirmation });
});

/**
 * @swagger
 * /api/v1/stripe/subscriptions/me:
 *   get:
 *     summary: List subscriptions for the current user/tenant
 *     description: Retrieves a list of subscriptions associated with the authenticated user's or active tenant's Stripe customer.
 *     tags:
 *       - Stripe Subscriptions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Subscriptions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode: { type: number, example: 200 }
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: 'Subscriptions retrieved successfully' }
 *                 data:
 *                   type: object
 *                   properties:
 *                     context:
 *                       type: string
 *                       description: Indicates if the customer is for a 'personal' user or an 'organization' tenant.
 *                       example: personal
 *                     customerId:
 *                       type: string
 *                       description: The Stripe customer ID. Present if a customer exists.
 *                       example: cus_Nxxxx
 *                     subscriptions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         description: A Stripe Subscription object.
 *                         properties:
 *                           id: { type: string, example: 'sub_Nxxxx' }
 *                           status: { type: string, example: 'active' }
 *                           current_period_end: { type: number, example: 1678886400 }
 *                     hasStripeCustomer:
 *                       type: boolean
 *                       description: Indicates if a Stripe customer exists for the current context.
 *                       example: true
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         $ref: '#/components/responses/Forbidden'
 */
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

/**
 * @swagger
 * /api/v1/stripe/webhook:
 *   post:
 *     summary: Handle Stripe webhook events
 *     description: Endpoint for Stripe to send webhook events. Verifies the signature and processes events like 'customer.subscription.updated', 'invoice.payment_succeeded', etc.
 *     tags:
 *       - Stripe Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: A Stripe Event object.
 *             example:
 *               id: evt_12345
 *               object: event
 *               type: customer.subscription.updated
 *               data:
 *                 object:
 *                   id: sub_Nxxxx
 *                   status: active
 *     responses:
 *       200:
 *         description: Event processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 received: { type: boolean, example: true }
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
const handleWebhook = webhookController.handleStripeWebhook;

/**
 * @swagger
 * /api/v1/stripe/webhook/test:
 *   post:
 *     summary: Test Stripe webhook functionality
 *     description: A test endpoint to simulate Stripe webhook events for development and debugging purposes. This endpoint does not verify signatures and should not be used in production.
 *     tags:
 *       - Stripe Webhooks
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Any JSON payload to simulate a Stripe event.
 *             example:
 *               test_event: true
 *               message: This is a test webhook event.
 *     responses:
 *       200:
 *         description: Test event received successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: 'Test webhook received' }
 */
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
};