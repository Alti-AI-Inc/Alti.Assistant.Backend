import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Mock express.Router()
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  use: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock subscriptionController
const mockSubscriptionController = {
  handleStripeWebhook: vi.fn(),
  getAvailablePlans: vi.fn(),
  getMySubscription: vi.fn(),
  getTenantSubscription: vi.fn(),
  createFreeSubscription: vi.fn(),
  upgradeSubscription: vi.fn(),
  confirmPayment: vi.fn(),
  processCheckout: vi.fn(),
  createBillingPortalSession: vi.fn(),
  cancelSubscription: vi.fn(),
  addSeat: vi.fn(),
  removeSeat: vi.fn(),
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
  getUsageStats: vi.fn(),
};
vi.mock('./subscription.controller.js', () => ({
  default: mockSubscriptionController,
}));

// Mock auth middleware
// auth() is a factory function that returns the actual middleware
const mockAuthMiddlewareInstance = vi.fn((req, res, next) => next());
const mockAuthMiddlewareFactory = vi.fn(() => mockAuthMiddlewareInstance);
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuthMiddlewareFactory,
}));

// Mock tenant context middlewares
const mockExtractTenantContext = vi.fn((req, res, next) => next());
const mockRequireTenantAdmin = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
  requireTenantAdmin: mockRequireTenantAdmin,
}));

// Mock rate limiter middleware
// createRateLimiter is a factory function that returns the actual middleware
const mockRateLimiterMiddleware = vi.fn((req, res, next) => next());
const mockCreateRateLimiter = vi.fn(() => mockRateLimiterMiddleware);
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: mockCreateRateLimiter,
}));

// Import the router AFTER all mocks are set up
// This ensures that when subscription.routes.js is evaluated, it uses our mocked dependencies.
import router from './subscription.routes.js';

describe('Subscription Routes', () => {
  beforeEach(() => {
    // Clear all mocks before each test to ensure isolation
    vi.clearAllMocks();
    // Re-mock express.Router() and its methods if the module was re-imported
    // For route files, the module is typically imported once, so clearing method calls is sufficient.
    // Ensure the mock factory functions return their respective mock instances consistently.
    mockAuthMiddlewareFactory.mockReturnValue(mockAuthMiddlewareInstance);
    mockCreateRateLimiter.mockReturnValue(mockRateLimiterMiddleware);
  });

  // Helper to find a route definition by method and path
  const findRoute = (method, path) => {
    const calls = mockRouter[method].mock.calls;
    for (const call of calls) {
      if (call[0] === path) {
        return call;
      }
    }
    return null;
  };

  it('should initialize the Express router', () => {
    expect(express.Router).toHaveBeenCalledTimes(1);
    expect(router).toBe(mockRouter); // Ensure we're testing the mocked router instance
  });

  it('should create a billing rate limiter with correct parameters', () => {
    expect(mockCreateRateLimiter).toHaveBeenCalledTimes(1);
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 10);
  });

  // --- Public Routes (no auth) ---
  it('should define a POST /webhook route with handleStripeWebhook controller', () => {
    const route = findRoute('post', '/webhook');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.handleStripeWebhook);
  });

  it('should define a GET /plans route with getAvailablePlans controller', () => {
    const route = findRoute('get', '/plans');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.getAvailablePlans);
  });

  // --- Auth Middleware Application ---
  it('should apply auth middleware to all subsequent routes using router.use', () => {
    expect(mockAuthMiddlewareFactory).toHaveBeenCalledTimes(1); // auth() factory called once
    expect(mockRouter.use).toHaveBeenCalledWith(mockAuthMiddlewareInstance); // The returned middleware is used
  });

  // --- Protected Routes (implicitly covered by router.use(auth())) ---
  it('should define a GET /my-subscription route with getMySubscription controller', () => {
    const route = findRoute('get', '/my-subscription');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler (auth is via router.use)
    expect(route[1]).toBe(mockSubscriptionController.getMySubscription);
  });

  it('should define a GET /tenant/:tenantId route with tenant context, admin check, and getTenantSubscription controller', () => {
    const route = findRoute('get', '/tenant/:tenantId');
    expect(route).not.toBeNull();
    expect(route.length).toBe(4); // Path + 3 handlers
    expect(route[1]).toBe(mockExtractTenantContext);
    expect(route[2]).toBe(mockRequireTenantAdmin);
    expect(route[3]).toBe(mockSubscriptionController.getTenantSubscription);
  });

  it('should define a POST /create-free route with createFreeSubscription controller', () => {
    const route = findRoute('post', '/create-free');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.createFreeSubscription);
  });

  it('should define a POST /upgrade route with billing limiter and upgradeSubscription controller', () => {
    const route = findRoute('post', '/upgrade');
    expect(route).not.toBeNull();
    expect(route.length).toBe(3); // Path + 2 handlers
    expect(route[1]).toBe(mockRateLimiterMiddleware);
    expect(route[2]).toBe(mockSubscriptionController.upgradeSubscription);
  });

  it('should define a POST /confirm-payment route with billing limiter and confirmPayment controller', () => {
    const route = findRoute('post', '/confirm-payment');
    expect(route).not.toBeNull();
    expect(route.length).toBe(3); // Path + 2 handlers
    expect(route[1]).toBe(mockRateLimiterMiddleware);
    expect(route[2]).toBe(mockSubscriptionController.confirmPayment);
  });

  it('should define a POST /process-checkout route with processCheckout controller', () => {
    const route = findRoute('post', '/process-checkout');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.processCheckout);
  });

  it('should define a POST /billing-portal route with billing limiter and createBillingPortalSession controller', () => {
    const route = findRoute('post', '/billing-portal');
    expect(route).not.toBeNull();
    expect(route.length).toBe(3); // Path + 2 handlers
    expect(route[1]).toBe(mockRateLimiterMiddleware);
    expect(route[2]).toBe(mockSubscriptionController.createBillingPortalSession);
  });

  it('should define a POST /cancel route with billing limiter, tenant context, admin check, and cancelSubscription controller', () => {
    const route = findRoute('post', '/cancel');
    expect(route).not.toBeNull();
    expect(route.length).toBe(5); // Path + 4 handlers
    expect(route[1]).toBe(mockRateLimiterMiddleware);
    expect(route[2]).toBe(mockExtractTenantContext);
    expect(route[3]).toBe(mockRequireTenantAdmin);
    expect(route[4]).toBe(mockSubscriptionController.cancelSubscription);
  });

  it('should define a POST /add-seat route with billing limiter, tenant context, admin check, and addSeat controller', () => {
    const route = findRoute('post', '/add-seat');
    expect(route).not.toBeNull();
    expect(route.length).toBe(5); // Path + 4 handlers
    expect(route[1]).toBe(mockRateLimiterMiddleware);
    expect(route[2]).toBe(mockExtractTenantContext);
    expect(route[3]).toBe(mockRequireTenantAdmin);
    expect(route[4]).toBe(mockSubscriptionController.addSeat);
  });

  it('should define a POST /remove-seat route with billing limiter, tenant context, admin check, and removeSeat controller', () => {
    const route = findRoute('post', '/remove-seat');
    expect(route).not.toBeNull();
    expect(route.length).toBe(5); // Path + 4 handlers
    expect(route[1]).toBe(mockRateLimiterMiddleware);
    expect(route[2]).toBe(mockExtractTenantContext);
    expect(route[3]).toBe(mockRequireTenantAdmin);
    expect(route[4]).toBe(mockSubscriptionController.removeSeat);
  });

  it('should define a GET /usage-limit/:limitType route with checkUsageLimit controller', () => {
    const route = findRoute('get', '/usage-limit/:limitType');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.checkUsageLimit);
  });

  it('should define a GET /check-limit route with checkUsageLimit controller', () => {
    const route = findRoute('get', '/check-limit');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.checkUsageLimit);
  });

  it('should define a POST /increment-usage route with incrementUsage controller', () => {
    const route = findRoute('post', '/increment-usage');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.incrementUsage);
  });

  it('should define a GET /usage-stats route with getUsageStats controller', () => {
    const route = findRoute('get', '/usage-stats');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.getUsageStats);
  });

  it('should define a GET /usage route with getUsageStats controller', () => {
    const route = findRoute('get', '/usage');
    expect(route).not.toBeNull();
    expect(route.length).toBe(2); // Path + 1 handler
    expect(route[1]).toBe(mockSubscriptionController.getUsageStats);
  });
});