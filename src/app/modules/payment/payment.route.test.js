import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { paymentController } from './payment.controller.js';
import { authenticate } from '../../middlewares/auth/authenticate.js';
import { authorize } from '../../middlewares/auth/authorize.js';
import { ROLES } from '../../config/roles.js';

// Mock dependencies
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockRoute = vi.fn().mockImplementation(() => ({
  get: mockGet,
  post: mockPost,
}));

const {
  mockRouter,
  mockExpressRaw
} = vi.hoisted(() => {
  const mockRouter = {
    route: mockRoute,
  };
  const mockExpressRaw = vi.fn().mockImplementation(options => `express.raw(${JSON.stringify(options)})`);

  return {
    mockRouter,
    mockExpressRaw
  };
});

vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
    raw: mockExpressRaw,
  },
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: vi.fn().mockImplementation(() => 'extractTenantContextMiddleware'),
}));

vi.mock('./payment.controller.js', () => ({
  paymentController: {
    createCheckoutSession: vi.fn().mockImplementation(() => 'createCheckoutSessionHandler'),
    getAllSubscriptions: vi.fn().mockImplementation(() => 'getAllSubscriptionsHandler'),
    getSubscriptionsByUserId: vi.fn().mockImplementation(() => 'getSubscriptionsByUserIdHandler'),
    handleWebhook: vi.fn().mockImplementation(() => 'handleWebhookHandler'),
  },
}));

vi.mock('../../middlewares/auth/authenticate.js', () => ({
  authenticate: vi.fn().mockImplementation(() => 'authenticateMiddleware'),
}));

vi.mock('../../middlewares/auth/authorize.js', () => ({
  authorize: vi.fn().mockImplementation(roles => `authorizeMiddleware(${roles.join(',')})`),
}));

vi.mock('../../config/roles.js', () => ({
  ROLES: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    USER: 'user',
  },
}));

describe('Payment Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import the router to apply mocks for each test
    await import('./payment.route.js');
  });

  describe('POST /create-checkout-session', () => {
    it('should register the route with authentication and tenant context middleware', () => {
      expect(mockRoute).toHaveBeenCalledWith('/create-checkout-session');
      expect(mockPost).toHaveBeenCalledWith(
        extractTenantContext,
        authenticate,
        paymentController.createCheckoutSession
      );
    });
  });

  describe('GET /admin/all', () => {
    it('should register the route with admin/super_admin authorization', () => {
      expect(mockRoute).toHaveBeenCalledWith('/admin/all');
      expect(authorize).toHaveBeenCalledWith([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
      expect(mockGet).toHaveBeenCalledWith(
        extractTenantContext,
        authenticate,
        authorize([ROLES.SUPER_ADMIN, ROLES.ADMIN]),
        paymentController.getAllSubscriptions
      );
    });
  });

  describe('GET /:userId', () => {
    it('should register the route with authentication for user-specific subscriptions', () => {
      expect(mockRoute).toHaveBeenCalledWith('/:userId');
      expect(mockGet).toHaveBeenCalledWith(
        extractTenantContext,
        authenticate,
        paymentController.getSubscriptionsByUserId
      );
    });
  });

  describe('POST /webhook', () => {
    it('should register the Stripe webhook handler with raw body parser', () => {
      expect(mockRoute).toHaveBeenCalledWith('/webhook');
      expect(mockExpressRaw).toHaveBeenCalledWith({ type: 'application/json' });
      expect(mockPost).toHaveBeenCalledWith(
        mockExpressRaw({ type: 'application/json' }),
        extractTenantContext,
        paymentController.handleWebhook
      );
    });
  });
});