import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import subscriptionController from './subscription.controller.js';
import subscriptionService from './subscription.service.js';
import ProductModel from '../products/products.model.js';
import ApiError from '../../../errors/ApiError.js';
import config from '../../../../config/index.js';
import StripeEvent from './stripeEvent.model.js';
import BillingAuditLog from './billingAuditLog.model.js';
import { logger } from '../../../shared/logger.js';
import { sendSecurityAlert } from '../../../shared/securityAlerts.js';
import { isStripeIp } from '../../../shared/stripeSecurity.js';

// Mock shared utilities and external dependencies
vi.mock('../../../shared/catchAsync.js', () => ({
  default: (fn) => async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error); // Simulate catchAsync passing error to next middleware
    }
  },
}));
vi.mock('../../../shared/sendResponse.js', () => ({
  default: vi.fn(),
}));
vi.mock('./subscription.service.js');
vi.mock('../products/products.model.js');
vi.mock('../../../errors/ApiError.js');
vi.mock('../../../../config/index.js', () => ({
  default: {
    stripe: {
      webhook_secret: 'test_webhook_secret',
      webhook_secret_fallback: 'test_webhook_secret_fallback',
    },
  },
}));
vi.mock('./stripeEvent.model.js');
vi.mock('./billingAuditLog.model.js');
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));
vi.mock('../../../shared/securityAlerts.js', () => ({
  sendSecurityAlert: vi.fn(),
}));
vi.mock('../../../shared/stripeSecurity.js', () => ({
  isStripeIp: vi.fn(),
}));

const {
  mockStripe
} = vi.hoisted(() => {
  // Mock Stripe module
  const mockStripe = {
    webhooks: {
      constructEvent: vi.fn(),
    },
  };

  return {
    mockStripe
  };
});
vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => mockStripe),
}));

// Mock http-status for direct comparison
vi.mock('http-status', () => ({
  default: {
    OK: 200,
    CREATED: 201,
    ACCEPTED: 202,
    BAD_REQUEST: 400,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

const sendResponse = (await import('../../../shared/sendResponse.js')).default;
const catchAsync = (await import('../../../shared/catchAsync.js')).default;

describe('Subscription Controller', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      user: {
        _id: 'user123',
        tenantId: 'tenant123',
        role: 'user',
      },
      params: {},
      query: {},
      body: {},
      headers: {},
      ip: '127.0.0.1',
    };
    res = {
      json: vi.fn(),
      status: vi.fn().mockImplementation(() => res),
    };
    next = vi.fn();

    // Reset all mocks before each test
    vi.clearAllMocks();
    subscriptionService.getAvailablePlans.mockResolvedValue([]);
    subscriptionService.getSubscriptionWithUsage.mockResolvedValue({});
    subscriptionService.getTenantSubscription.mockResolvedValue({});
    subscriptionService.createFreeSubscription.mockResolvedValue({});
    subscriptionService.upgradeSubscription.mockResolvedValue({});
    subscriptionService.confirmSubscriptionPayment.mockResolvedValue({});
    subscriptionService.processStripeCheckout.mockResolvedValue({});
    subscriptionService.getUserSubscription.mockResolvedValue({});
    subscriptionService.cancelSubscription.mockResolvedValue({});
    subscriptionService.addSeatToSubscription.mockResolvedValue({});
    subscriptionService.removeSeatFromSubscription.mockResolvedValue({});
    subscriptionService.checkUsageLimit.mockResolvedValue({});
    subscriptionService.incrementUsage.mockResolvedValue({});
    subscriptionService.handleInvoicePaymentSucceeded.mockResolvedValue({});
    subscriptionService.handleInvoicePaymentFailed.mockResolvedValue({});
    subscriptionService.handleDisputeCreated.mockResolvedValue({});
    subscriptionService.handleDisputeClosed.mockResolvedValue({});
    subscriptionService.updateSubscriptionFromStripe.mockResolvedValue({});
    subscriptionService.createBillingPortalSession.mockResolvedValue({});

    ProductModel.getAvailablePlans.mockResolvedValue([]);
    ProductModel.getAvailablePlans.mockResolvedValue([
      { toPublicJSON: () => ({ id: 'plan1', name: 'Basic' }) },
    ]);

    ApiError.mockImplementation((status, message) => {
      const error = new Error(message);
      error.statusCode = status;
      return error;
    });

    StripeEvent.findOne.mockResolvedValue(null);
    StripeEvent.create.mockResolvedValue({});
    BillingAuditLog.create.mockResolvedValue({});
    isStripeIp.mockResolvedValue(true);
    sendSecurityAlert.mockResolvedValue({});
    mockStripe.webhooks.constructEvent.mockReturnValue({ id: 'evt_123', type: 'test.event' });
  });

  describe('getAvailablePlans', () => {
    it('should return available plans successfully', async () => {
      const mockPlans = [
        { toPublicJSON: () => ({ id: 'plan1', name: 'Basic' }) },
        { toPublicJSON: () => ({ id: 'plan2', name: 'Premium' }) },
      ];
      ProductModel.getAvailablePlans.mockResolvedValue(mockPlans);

      await catchAsync(subscriptionController.getAvailablePlans)(req, res, next);

      expect(ProductModel.getAvailablePlans).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Plans retrieved successfully',
        data: [{ id: 'plan1', name: 'Basic' }, { id: 'plan2', name: 'Premium' }],
      });
    });

    it('should handle no plans found gracefully', async () => {
      ProductModel.getAvailablePlans.mockResolvedValue([]);

      await catchAsync(subscriptionController.getAvailablePlans)(req, res, next);

      expect(ProductModel.getAvailablePlans).toHaveBeenCalledTimes(1);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Plans retrieved successfully',
        data: [],
      });
    });
  });

  describe('getMySubscription', () => {
    it('should return user subscription successfully', async () => {
      const mockSubscription = { id: 'sub1', userId: 'user123' };
      subscriptionService.getSubscriptionWithUsage.mockResolvedValue(mockSubscription);

      await catchAsync(subscriptionController.getMySubscription)(req, res, next);

      expect(subscriptionService.getSubscriptionWithUsage).toHaveBeenCalledWith('user123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Subscription retrieved successfully',
        data: mockSubscription,
      });
    });

    it('should throw ApiError if no subscription is found', async () => {
      subscriptionService.getSubscriptionWithUsage.mockResolvedValue(null);

      await catchAsync(subscriptionController.getMySubscription)(req, res, next);

      expect(subscriptionService.getSubscriptionWithUsage).toHaveBeenCalledWith('user123');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.NOT_FOUND);
      expect(next.mock.calls[0][0].message).toBe('No subscription found');
    });
  });

  describe('getTenantSubscription', () => {
    const mockTenantId = 'tenant456';
    const mockSubscription = {
      _id: 'sub456',
      tenantId: mockTenantId,
      userId: 'user456',
    };
    const mockSubscriptionWithUsage = {
      ...mockSubscription,
      plan: 'pro',
      usage: {},
    };

    beforeEach(() => {
      req.params.tenantId = mockTenantId;
      subscriptionService.getTenantSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.getSubscriptionWithUsage.mockResolvedValue(mockSubscriptionWithUsage);
    });

    it('should allow admin to view any tenant subscription', async () => {
      req.user.role = 'admin';
      req.user.tenantId = 'adminTenant'; // Admin can be in any tenant

      await catchAsync(subscriptionController.getTenantSubscription)(req, res, next);

      expect(subscriptionService.getTenantSubscription).toHaveBeenCalledWith(mockTenantId);
      expect(subscriptionService.getSubscriptionWithUsage).toHaveBeenCalledWith(mockSubscription.userId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Tenant subscription retrieved successfully',
        data: mockSubscriptionWithUsage,
      });
    });

    it('should allow regular user to view their own tenant subscription', async () => {
      req.user.role = 'user';
      req.user.tenantId = mockTenantId; // User's tenant matches requested tenant

      await catchAsync(subscriptionController.getTenantSubscription)(req, res, next);

      expect(subscriptionService.getTenantSubscription).toHaveBeenCalledWith(mockTenantId);
      expect(subscriptionService.getSubscriptionWithUsage).toHaveBeenCalledWith(mockSubscription.userId);
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Tenant subscription retrieved successfully',
        data: mockSubscriptionWithUsage,
      });
    });

    it('should throw FORBIDDEN if regular user tries to view another tenant subscription', async () => {
      req.user.role = 'user';
      req.user.tenantId = 'differentTenant';

      await catchAsync(subscriptionController.getTenantSubscription)(req, res, next);

      expect(subscriptionService.getTenantSubscription).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.FORBIDDEN);
      expect(next.mock.calls[0][0].message).toBe('Forbidden: You are not authorized to view this tenant\'s subscription.');
    });

    it('should throw NOT_FOUND if no subscription is found for the tenant', async () => {
      req.user.role = 'admin';
      subscriptionService.getTenantSubscription.mockResolvedValue(null);

      await catchAsync(subscriptionController.getTenantSubscription)(req, res, next);

      expect(subscriptionService.getTenantSubscription).toHaveBeenCalledWith(mockTenantId);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.NOT_FOUND);
      expect(next.mock.calls[0][0].message).toBe('No subscription found for this tenant');
    });

    it('should throw FORBIDDEN if found subscription tenantId does not match requested tenantId', async () => {
      req.user.role = 'admin';
      subscriptionService.getTenantSubscription.mockResolvedValue({
        _id: 'sub456',
        tenantId: 'mismatchedTenant', // Mismatched tenantId
        userId: 'user456',
      });

      await catchAsync(subscriptionController.getTenantSubscription)(req, res, next);

      expect(subscriptionService.getTenantSubscription).toHaveBeenCalledWith(mockTenantId);
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.FORBIDDEN);
      expect(next.mock.calls[0][0].message).toBe('Forbidden: Subscription found does not match the requested tenant.');
    });
  });

  describe('createFreeSubscription', () => {
    it('should create a free subscription successfully', async () => {
      const mockSubscription = { id: 'freeSub', userId: 'user123', tenantId: 'tenant123' };
      req.body.tenantId = 'tenant123';
      subscriptionService.createFreeSubscription.mockResolvedValue(mockSubscription);

      await catchAsync(subscriptionController.createFreeSubscription)(req, res, next);

      expect(subscriptionService.createFreeSubscription).toHaveBeenCalledWith('user123', 'tenant123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: 'Free subscription created successfully',
        data: mockSubscription,
      });
    });
  });

  describe('upgradeSubscription', () => {
    it('should throw BAD_REQUEST if neither stripeProductId nor planName is provided', async () => {
      req.body = { tenantId: 'tenant123' };

      await catchAsync(subscriptionController.upgradeSubscription)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Either stripeProductId or planName is required');
    });

    it('should throw BAD_REQUEST if seats is less than 1', async () => {
      req.body = { stripeProductId: 'prod1', tenantId: 'tenant123', seats: 0 };

      await catchAsync(subscriptionController.upgradeSubscription)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Seats must be at least 1');
    });

    it('should handle plan_changed result', async () => {
      const mockResult = { type: 'plan_changed', message: 'Plan updated', data: { id: 'sub1' } };
      req.body = { stripeProductId: 'prod1', tenantId: 'tenant123', seats: 2 };
      subscriptionService.upgradeSubscription.mockResolvedValue(mockResult);

      await catchAsync(subscriptionController.upgradeSubscription)(req, res, next);

      expect(subscriptionService.upgradeSubscription).toHaveBeenCalledWith(
        'user123',
        { stripeProductId: 'prod1', planName: undefined },
        'tenant123',
        2,
        { userId: 'user123', ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Plan updated',
        data: mockResult,
      });
    });

    it('should handle subscription_created result', async () => {
      const mockResult = { type: 'subscription_created', data: { id: 'sub1' } };
      req.body = { planName: 'Premium', tenantId: 'tenant123' };
      subscriptionService.upgradeSubscription.mockResolvedValue(mockResult);

      await catchAsync(subscriptionController.upgradeSubscription)(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: 'Subscription created successfully',
        data: mockResult,
      });
    });

    it('should handle requires_action result', async () => {
      const mockResult = { type: 'requires_action', data: { clientSecret: 'cs_123' } };
      req.body = { stripeProductId: 'prod1', tenantId: 'tenant123' };
      subscriptionService.upgradeSubscription.mockResolvedValue(mockResult);

      await catchAsync(subscriptionController.upgradeSubscription)(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.ACCEPTED,
        message: 'Payment requires additional authentication',
        data: mockResult,
      });
    });

    it('should handle checkout_session result', async () => {
      const mockResult = { type: 'checkout_session', data: { url: 'stripe.com/checkout' } };
      req.body = { stripeProductId: 'prod1', tenantId: 'tenant123' };
      subscriptionService.upgradeSubscription.mockResolvedValue(mockResult);

      await catchAsync(subscriptionController.upgradeSubscription)(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Checkout session created - redirect to complete payment',
        data: mockResult,
      });
    });
  });

  describe('confirmPayment', () => {
    it('should throw BAD_REQUEST if subscriptionId is missing', async () => {
      req.body = { tenantId: 'tenant123' };

      await catchAsync(subscriptionController.confirmPayment)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Subscription ID is required');
    });

    it('should confirm payment successfully', async () => {
      const mockSubscription = { id: 'sub1', status: 'active' };
      req.body = { subscriptionId: 'sub1', tenantId: 'tenant123' };
      subscriptionService.confirmSubscriptionPayment.mockResolvedValue(mockSubscription);

      await catchAsync(subscriptionController.confirmPayment)(req, res, next);

      expect(subscriptionService.confirmSubscriptionPayment).toHaveBeenCalledWith('sub1', 'user123', 'tenant123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: 'Subscription activated successfully',
        data: mockSubscription,
      });
    });
  });

  describe('processCheckout', () => {
    it('should throw BAD_REQUEST if sessionId is missing', async () => {
      req.body = {};

      await catchAsync(subscriptionController.processCheckout)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Session ID is required');
    });

    it('should process checkout successfully', async () => {
      const mockSubscription = { id: 'sub1', status: 'active' };
      req.body = { sessionId: 'cs_123' };
      subscriptionService.processStripeCheckout.mockResolvedValue(mockSubscription);

      await catchAsync(subscriptionController.processCheckout)(req, res, next);

      expect(subscriptionService.processStripeCheckout).toHaveBeenCalledWith('cs_123', 'user123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.CREATED,
        message: 'Subscription activated successfully',
        data: mockSubscription,
      });
    });
  });

  describe('cancelSubscription', () => {
    const mockSubscription = { _id: 'sub1', status: 'active' };
    const mockUpdatedSubscription = { _id: 'sub1', status: 'cancelled_at_period_end' };

    beforeEach(() => {
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.cancelSubscription.mockResolvedValue(mockUpdatedSubscription);
    });

    it('should throw NOT_FOUND if no active subscription is found', async () => {
      subscriptionService.getUserSubscription.mockResolvedValue(null);

      await catchAsync(subscriptionController.cancelSubscription)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.NOT_FOUND);
      expect(next.mock.calls[0][0].message).toBe('No active subscription found');
    });

    it('should cancel subscription at period end by default', async () => {
      req.body = {}; // No immediate flag

      await catchAsync(subscriptionController.cancelSubscription)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith(
        'sub1',
        false,
        { userId: 'user123', ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Subscription will cancel at period end',
        data: mockUpdatedSubscription,
      });
    });

    it('should cancel subscription immediately if specified', async () => {
      req.body = { immediate: true };
      subscriptionService.cancelSubscription.mockResolvedValue({ ...mockUpdatedSubscription, status: 'canceled' });

      await catchAsync(subscriptionController.cancelSubscription)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(subscriptionService.cancelSubscription).toHaveBeenCalledWith(
        'sub1',
        true,
        { userId: 'user123', ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Subscription cancelled immediately',
        data: { ...mockUpdatedSubscription, status: 'canceled' },
      });
    });
  });

  describe('addSeat', () => {
    const mockSubscription = {
      _id: 'sub1',
      seats: { used: 1, available: 5 },
      pricePerSeat: 10,
    };
    const mockUpdatedSubscription = {
      _id: 'sub1',
      seats: { used: 2, available: 5 },
      pricePerSeat: 10,
    };

    beforeEach(() => {
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.addSeatToSubscription.mockResolvedValue(mockUpdatedSubscription);
    });

    it('should throw NOT_FOUND if no active subscription is found', async () => {
      subscriptionService.getUserSubscription.mockResolvedValue(null);
      req.body = { newUserId: 'newUser' };

      await catchAsync(subscriptionController.addSeat)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.NOT_FOUND);
      expect(next.mock.calls[0][0].message).toBe('No active subscription found');
    });

    it('should add a seat successfully', async () => {
      req.body = { newUserId: 'newUser' };

      await catchAsync(subscriptionController.addSeat)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(subscriptionService.addSeatToSubscription).toHaveBeenCalledWith(
        'sub1',
        'newUser',
        { userId: 'user123', ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Seat added successfully',
        data: {
          subscription: mockUpdatedSubscription,
          seatsUsed: 2,
          seatsAvailable: 5,
          totalCost: 20,
        },
      });
    });
  });

  describe('removeSeat', () => {
    const mockSubscription = {
      _id: 'sub1',
      seats: { used: 2, available: 5 },
      pricePerSeat: 10,
    };
    const mockUpdatedSubscription = {
      _id: 'sub1',
      seats: { used: 1, available: 5 },
      pricePerSeat: 10,
    };

    beforeEach(() => {
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
      subscriptionService.removeSeatFromSubscription.mockResolvedValue(mockUpdatedSubscription);
    });

    it('should throw NOT_FOUND if no active subscription is found', async () => {
      subscriptionService.getUserSubscription.mockResolvedValue(null);
      req.body = { removeUserId: 'oldUser' };

      await catchAsync(subscriptionController.removeSeat)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.NOT_FOUND);
      expect(next.mock.calls[0][0].message).toBe('No active subscription found');
    });

    it('should remove a seat successfully', async () => {
      req.body = { removeUserId: 'oldUser' };

      await catchAsync(subscriptionController.removeSeat)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(subscriptionService.removeSeatFromSubscription).toHaveBeenCalledWith(
        'sub1',
        'oldUser',
        { userId: 'user123', ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Seat removed successfully',
        data: {
          subscription: mockUpdatedSubscription,
          seatsUsed: 1,
          seatsAvailable: 5,
          totalCost: 10,
        },
      });
    });
  });

  describe('checkUsageLimit', () => {
    it('should throw BAD_REQUEST for invalid limit type', async () => {
      req.params.limitType = 'invalidType';

      await catchAsync(subscriptionController.checkUsageLimit)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Invalid or missing limit type');
    });

    it('should check usage limit successfully using params', async () => {
      const mockUsageInfo = { allowed: true, remaining: 5 };
      req.params.limitType = 'webSearch';
      subscriptionService.checkUsageLimit.mockResolvedValue(mockUsageInfo);

      await catchAsync(subscriptionController.checkUsageLimit)(req, res, next);

      expect(subscriptionService.checkUsageLimit).toHaveBeenCalledWith('user123', 'webSearch');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Usage limit checked',
        data: mockUsageInfo,
      });
    });

    it('should check usage limit successfully using query', async () => {
      const mockUsageInfo = { allowed: true, remaining: 5 };
      req.query.limitType = 'deepResearch';
      subscriptionService.checkUsageLimit.mockResolvedValue(mockUsageInfo);

      await catchAsync(subscriptionController.checkUsageLimit)(req, res, next);

      expect(subscriptionService.checkUsageLimit).toHaveBeenCalledWith('user123', 'deepResearch');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Usage limit checked',
        data: mockUsageInfo,
      });
    });
  });

  describe('incrementUsage', () => {
    it('should throw BAD_REQUEST for invalid limit type', async () => {
      req.body.limitType = 'invalidType';

      await catchAsync(subscriptionController.incrementUsage)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Invalid limit type');
    });

    it('should increment usage successfully', async () => {
      req.body.limitType = 'webSearch';

      await catchAsync(subscriptionController.incrementUsage)(req, res, next);

      expect(subscriptionService.incrementUsage).toHaveBeenCalledWith('user123', 'webSearch');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Usage incremented successfully',
      });
    });
  });

  describe('getUsageStats', () => {
    const mockSubscription = {
      _id: 'sub1',
      plan: 'Pro Plan',
      limits: {
        dailyWebSearchLimit: 100,
        dailyDeepResearchLimit: 10,
      },
      usage: {
        webSearchUsedToday: 20,
        deepResearchUsedToday: 5,
        lastResetAt: new Date('2023-01-01T00:00:00Z'),
      },
    };

    beforeEach(() => {
      subscriptionService.getUserSubscription.mockResolvedValue(mockSubscription);
    });

    it('should throw NOT_FOUND if no active subscription is found', async () => {
      subscriptionService.getUserSubscription.mockResolvedValue(null);

      await catchAsync(subscriptionController.getUsageStats)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.NOT_FOUND);
      expect(next.mock.calls[0][0].message).toBe('No active subscription found');
    });

    it('should return usage statistics successfully', async () => {
      await catchAsync(subscriptionController.getUsageStats)(req, res, next);

      expect(subscriptionService.getUserSubscription).toHaveBeenCalledWith('user123');
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Usage statistics retrieved successfully',
        data: {
          plan: 'Pro Plan',
          limits: mockSubscription.limits,
          usage: mockSubscription.usage,
          webSearch: {
            used: 20,
            limit: 100,
            remaining: 80,
            percentage: '20.0',
          },
          deepResearch: {
            used: 5,
            limit: 10,
            remaining: 5,
            percentage: '50.0',
          },
          lastResetAt: mockSubscription.usage.lastResetAt,
        },
      });
    });

    it('should handle zero deep research limit correctly', async () => {
      const zeroLimitSubscription = {
        ...mockSubscription,
        limits: {
          dailyWebSearchLimit: 100,
          dailyDeepResearchLimit: 0,
        },
        usage: {
          webSearchUsedToday: 20,
          deepResearchUsedToday: 0,
          lastResetAt: new Date('2023-01-01T00:00:00Z'),
        },
      };
      subscriptionService.getUserSubscription.mockResolvedValue(zeroLimitSubscription);

      await catchAsync(subscriptionController.getUsageStats)(req, res, next);

      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Usage statistics retrieved successfully',
        data: expect.objectContaining({
          deepResearch: {
            used: 0,
            limit: 0,
            remaining: 0,
            percentage: 0, // Should be 0 when limit is 0
          },
        }),
      });
    });
  });

  describe('handleStripeWebhook', () => {
    const mockStripeSignature = 't=123,v1=abc,v0=def';
    const mockRawBody = Buffer.from('{"id":"evt_test","type":"checkout.session.completed"}');

    beforeEach(() => {
      req.headers['stripe-signature'] = mockStripeSignature;
      req.body = mockRawBody;
      req.ip = '1.2.3.4'; // A trusted IP
      process.env.STRIPE_SECRET_KEY = 'sk_test_123';
      process.env.STRIPE_WEBHOOK_SECRET = 'test_webhook_secret';
      process.env.STRIPE_WEBHOOK_SECRET_FALLBACK = 'test_webhook_secret_fallback';
      isStripeIp.mockResolvedValue(true);
    });

    it('should throw FORBIDDEN if IP is not from Stripe', async () => {
      isStripeIp.mockResolvedValue(false);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(isStripeIp).toHaveBeenCalledWith('1.2.3.4');
      expect(logger.error).toHaveBeenCalledWith(
        '[STRIPE_SECURITY_ALERT] Webhook request originating from untrusted IP: 1.2.3.4'
      );
      expect(sendSecurityAlert).toHaveBeenCalledWith(
        'Untrusted Webhook IP Blocked',
        expect.any(String),
        expect.objectContaining({ senderIp: '1.2.3.4' })
      );
      expect(BillingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        action: 'webhook_failed',
        newState: expect.objectContaining({ error: 'Untrusted webhook IP address source' }),
      }));
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.FORBIDDEN);
      expect(next.mock.calls[0][0].message).toBe('Forbidden: untrusted sender source IP');
    });

    it('should throw INTERNAL_SERVER_ERROR if webhook secret is not configured', async () => {
      config.stripe.webhook_secret = null;
      process.env.STRIPE_WEBHOOK_SECRET = null;

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.INTERNAL_SERVER_ERROR);
      expect(next.mock.calls[0][0].message).toBe('Webhook secret not configured');
    });

    it('should throw BAD_REQUEST if stripe-signature header is missing', async () => {
      delete req.headers['stripe-signature'];

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe('Missing stripe-signature header');
    });

    it('should throw BAD_REQUEST if signature verification fails', async () => {
      const verificationError = new Error('Invalid signature');
      mockStripe.webhooks.constructEvent.mockImplementationOnce(() => {
        throw verificationError;
      }).mockImplementationOnce(() => {
        throw verificationError; // Fallback also fails
      });

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledTimes(2); // Tries primary and fallback
      expect(logger.error).toHaveBeenCalledWith(
        '[STRIPE_SECURITY_ALERT] Webhook signature verification failed',
        expect.objectContaining({ message: 'Both primary and fallback secret verifications failed. Fallback error: Invalid signature' })
      );
      expect(sendSecurityAlert).toHaveBeenCalledWith(
        'Webhook Signature Mismatch',
        expect.any(String),
        expect.objectContaining({ errorMessage: expect.stringContaining('Both primary and fallback secret verifications failed') })
      );
      expect(BillingAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
        action: 'webhook_failed',
        newState: expect.objectContaining({ error: expect.stringContaining('Both primary and fallback secret verifications failed') }),
      }));
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.BAD_REQUEST);
      expect(next.mock.calls[0][0].message).toBe(expect.stringContaining('Webhook signature verification failed'));
    });

    it('should use fallback secret if primary fails', async () => {
      mockStripe.webhooks.constructEvent
        .mockImplementationOnce(() => {
          throw new Error('Primary secret failed');
        })
        .mockReturnValueOnce({ id: 'evt_test', type: 'checkout.session.completed' }); // Fallback succeeds

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledTimes(2);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(mockRawBody, mockStripeSignature, 'test_webhook_secret');
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(mockRawBody, mockStripeSignature, 'test_webhook_secret_fallback');
      expect(logger.info).toHaveBeenCalledWith('[Stripe Security] Primary webhook secret verification failed. Trying fallback secret...');
      expect(logger.info).toHaveBeenCalledWith('[Stripe Security] Webhook signature verified successfully using fallback secret.');
      expect(StripeEvent.findOne).toHaveBeenCalledWith({ eventId: 'evt_test' });
      expect(StripeEvent.create).toHaveBeenCalledWith({ eventId: 'evt_test' });
      expect(subscriptionService.processStripeCheckout).toHaveBeenCalledWith('evt_test'); // session.id is event.id in this mock
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should discard duplicate webhook events', async () => {
      StripeEvent.findOne.mockResolvedValue({ eventId: 'evt_test' }); // Event already exists

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(StripeEvent.findOne).toHaveBeenCalledWith({ eventId: 'evt_test' });
      expect(StripeEvent.create).not.toHaveBeenCalled(); // Should not create duplicate
      expect(subscriptionService.processStripeCheckout).not.toHaveBeenCalled(); // Should not process
      expect(res.json).toHaveBeenCalledWith({ received: true, duplicate: true });
    });

    it('should handle checkout.session.completed event', async () => {
      const mockEvent = { id: 'cs_123', type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.processStripeCheckout).toHaveBeenCalledWith('cs_123');
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle customer.subscription.updated event', async () => {
      const mockSubscription = { id: 'sub_123', status: 'active' };
      const mockEvent = { id: 'evt_123', type: 'customer.subscription.updated', data: { object: mockSubscription } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(mockSubscription);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle customer.subscription.deleted event', async () => {
      const mockSubscription = { id: 'sub_123', status: 'canceled' };
      const mockEvent = { id: 'evt_123', type: 'customer.subscription.deleted', data: { object: mockSubscription } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.updateSubscriptionFromStripe).toHaveBeenCalledWith(mockSubscription);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle invoice.payment_succeeded event', async () => {
      const mockInvoice = { id: 'inv_123', status: 'paid' };
      const mockEvent = { id: 'evt_123', type: 'invoice.payment_succeeded', data: { object: mockInvoice } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.handleInvoicePaymentSucceeded).toHaveBeenCalledWith(mockInvoice);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle invoice.payment_failed event', async () => {
      const mockInvoice = { id: 'inv_123', status: 'failed' };
      const mockEvent = { id: 'evt_123', type: 'invoice.payment_failed', data: { object: mockInvoice } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.handleInvoicePaymentFailed).toHaveBeenCalledWith(mockInvoice);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle charge.dispute.created event', async () => {
      const mockDispute = { id: 'dis_123', status: 'created' };
      const mockEvent = { id: 'evt_123', type: 'charge.dispute.created', data: { object: mockDispute } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.handleDisputeCreated).toHaveBeenCalledWith(mockDispute);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should handle charge.dispute.closed event', async () => {
      const mockDispute = { id: 'dis_123', status: 'closed' };
      const mockEvent = { id: 'evt_123', type: 'charge.dispute.closed', data: { object: mockDispute } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(subscriptionService.handleDisputeClosed).toHaveBeenCalledWith(mockDispute);
      expect(res.json).toHaveBeenCalledWith({ received: true });
    });

    it('should log unhandled event types', async () => {
      const mockEvent = { id: 'evt_123', type: 'payment_intent.succeeded', data: { object: {} } };
      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      const consoleSpy = vi.spyOn(console, 'log');

      await catchAsync(subscriptionController.handleStripeWebhook)(req, res, next);

      expect(consoleSpy).toHaveBeenCalledWith('Unhandled event type payment_intent.succeeded');
      expect(res.json).toHaveBeenCalledWith({ received: true });
      consoleSpy.mockRestore();
    });
  });

  describe('createBillingPortalSession', () => {
    const mockSessionUrl = 'https://billing.stripe.com/session_123';

    beforeEach(() => {
      subscriptionService.createBillingPortalSession.mockResolvedValue({ url: mockSessionUrl });
    });

    it('should allow admin to create session for any tenant', async () => {
      req.user.role = 'admin';
      req.user.tenantId = 'adminTenant';
      req.body.tenantId = 'anotherTenant';

      await catchAsync(subscriptionController.createBillingPortalSession)(req, res, next);

      expect(subscriptionService.createBillingPortalSession).toHaveBeenCalledWith(
        'user123',
        'anotherTenant',
        { ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Billing portal session created successfully',
        data: { url: mockSessionUrl },
      });
    });

    it('should allow regular user to create session for their own tenant (from body)', async () => {
      req.user.role = 'user';
      req.user.tenantId = 'userTenant';
      req.body.tenantId = 'userTenant';

      await catchAsync(subscriptionController.createBillingPortalSession)(req, res, next);

      expect(subscriptionService.createBillingPortalSession).toHaveBeenCalledWith(
        'user123',
        'userTenant',
        { ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Billing portal session created successfully',
        data: { url: mockSessionUrl },
      });
    });

    it('should allow regular user to create session for their own tenant (from query)', async () => {
      req.user.role = 'user';
      req.user.tenantId = 'userTenant';
      req.query.tenantId = 'userTenant';
      req.body = {}; // Ensure body doesn't override

      await catchAsync(subscriptionController.createBillingPortalSession)(req, res, next);

      expect(subscriptionService.createBillingPortalSession).toHaveBeenCalledWith(
        'user123',
        'userTenant',
        { ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Billing portal session created successfully',
        data: { url: mockSessionUrl },
      });
    });

    it('should default to requesting user\'s tenantId if not provided', async () => {
      req.user.role = 'user';
      req.user.tenantId = 'userTenant';
      req.body = {};
      req.query = {};

      await catchAsync(subscriptionController.createBillingPortalSession)(req, res, next);

      expect(subscriptionService.createBillingPortalSession).toHaveBeenCalledWith(
        'user123',
        'userTenant',
        { ipAddress: '127.0.0.1' }
      );
      expect(sendResponse).toHaveBeenCalledWith(res, {
        success: true,
        statusCode: httpStatus.OK,
        message: 'Billing portal session created successfully',
        data: { url: mockSessionUrl },
      });
    });

    it('should throw FORBIDDEN if regular user tries to create session for another tenant', async () => {
      req.user.role = 'user';
      req.user.tenantId = 'userTenant';
      req.body.tenantId = 'anotherTenant';

      await catchAsync(subscriptionController.createBillingPortalSession)(req, res, next);

      expect(subscriptionService.createBillingPortalSession).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.FORBIDDEN);
      expect(next.mock.calls[0][0].message).toBe('Forbidden: You are not authorized to create a billing portal session for this tenant.');
    });
  });
});