import { describe, it, expect, vi } from 'vitest';

const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
};

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => 'authMiddleware'),
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => 'optionalAuthMiddleware'),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: 'extractTenantContextMiddleware',
}));

const mockControllers = {
  createCustomerController: 'createCustomerController',
  getCustomerController: 'getCustomerController',
  updateCustomerController: 'updateCustomerController',
  deleteCustomerController: 'deleteCustomerController',
  createProductController: 'createProductController',
  retrieveProductController: 'retrieveProductController',
  createPaymentIntentController: 'createPaymentIntentController',
  addPaymentMethodController: 'addPaymentMethodController',
  listPaymentMethodsController: 'listPaymentMethodsController',
  getMyPaymentMethodsController: 'getMyPaymentMethodsController',
  createSubscriptionController: 'createSubscriptionController',
  cancelSubscriptionController: 'cancelSubscriptionController',
  getMySubscriptionsController: 'getMySubscriptionsController',
  listAccounts: 'listAccounts',
  listProducts: 'listProducts',
  listSubscriptions: 'listSubscriptions',
  getSingleSubscription: 'getSingleSubscription',
  listPricesController: 'listPricesController',
  handleWebhook: 'handleWebhook',
  testWebhook: 'testWebhook',
};

vi.mock('./stripe.controller.js', () => mockControllers);

// Import the router to trigger the route definitions on our mock
await import('./stripe.route.js');

describe('Stripe Routes', () => {
  describe('Webhook Routes', () => {
    it('should register POST /webhook route for handling Stripe webhooks', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/webhook',
        mockControllers.handleWebhook
      );
    });

    it('should register POST /test-webhook route for development testing', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/test-webhook',
        'authMiddleware',
        mockControllers.testWebhook
      );
    });
  });

  describe('Customer Routes', () => {
    it('should register POST /customer to create a customer', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/customer',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.createCustomerController
      );
    });

    it('should register GET /customers to list all customers for a tenant', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/customers',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.listAccounts
      );
    });

    it('should register GET /customer to get the current user\'s customer details', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/customer',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.getCustomerController
      );
    });

    it('should register PUT /customer to update the current user\'s customer details', () => {
      expect(mockRouter.put).toHaveBeenCalledWith(
        '/customer',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.updateCustomerController
      );
    });

    it('should register DELETE /customer to delete the current user\'s customer', () => {
      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/customer',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.deleteCustomerController
      );
    });
  });

  describe('Product and Price Routes', () => {
    it('should register POST /products to create a new product', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/products',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.createProductController
      );
    });

    it('should register GET /products as a public endpoint to list all products', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/products',
        'optionalAuthMiddleware',
        mockControllers.listProducts
      );
    });

    it('should register GET /products/:productId to retrieve a single product', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/products/:productId',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.retrieveProductController
      );
    });

    it('should register GET /prices as a public endpoint to list all prices', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/prices',
        'optionalAuthMiddleware',
        mockControllers.listPricesController
      );
    });
  });

  describe('Payment Routes', () => {
    it('should register POST /payment-intent to create a payment intent', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/payment-intent',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.createPaymentIntentController
      );
    });

    it('should register POST /payment-method to add a new payment method', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/payment-method',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.addPaymentMethodController
      );
    });

    it('should register GET /payment-methods/:customerId/:type to list a customer\'s payment methods', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/payment-methods/:customerId/:type',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.listPaymentMethodsController
      );
    });

    it('should register GET /my-payment-methods to get the current user\'s payment methods', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/my-payment-methods',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.getMyPaymentMethodsController
      );
    });
  });

  describe('Subscription Routes', () => {
    it('should register POST /subscription to create a new subscription', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/subscription',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.createSubscriptionController
      );
    });

    it('should register GET /subscriptions to list all tenant subscriptions', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/subscriptions',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.listSubscriptions
      );
    });

    it('should register GET /my-subscriptions to get the current user\'s subscriptions', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/my-subscriptions',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.getMySubscriptionsController
      );
    });

    it('should register GET /subscription/:subscriptionId to get a single subscription', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/subscription/:subscriptionId',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.getSingleSubscription
      );
    });

    it('should register DELETE /subscription/:subscriptionId to cancel a subscription', () => {
      expect(mockRouter.delete).toHaveBeenCalledWith(
        '/subscription/:subscriptionId',
        'authMiddleware',
        'extractTenantContextMiddleware',
        mockControllers.cancelSubscriptionController
      );
    });
  });
});