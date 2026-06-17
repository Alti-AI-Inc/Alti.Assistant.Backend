import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import ApiError from '../../../errors/ApiError.js';

// Setup hoisting mocks
const {
  mockSubscriptionFindByUser,
  mockSubscriptionFindOne,
  mockTenantFindById,
  mockCheckMonthlyUsageLimit,
  mockLoggerError,
} = vi.hoisted(() => ({
  mockSubscriptionFindByUser: vi.fn(),
  mockSubscriptionFindOne: vi.fn(),
  mockTenantFindById: vi.fn(),
  mockCheckMonthlyUsageLimit: vi.fn(),
  mockLoggerError: vi.fn(),
}));

// Mock Mongoose models
vi.mock('../subscription/subscription.model.js', () => ({
  default: {
    findByUser: mockSubscriptionFindByUser,
    findOne: mockSubscriptionFindOne,
  },
}));

vi.mock('../tenant/tenant.model.js', () => ({
  default: {
    findById: mockTenantFindById,
  },
}));

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: mockLoggerError,
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock Subscription Service (dynamically loaded in middleware)
vi.mock('../subscription/subscription.service.js', () => ({
  default: {
    checkMonthlyUsageLimit: mockCheckMonthlyUsageLimit,
  },
}));

// Import the middleware
import { planLimitMiddleware } from './planLimit.middleware.js';

describe('planLimitMiddleware', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {
      isGuest: false,
      user: {
        id: 'user123',
        tenantId: 'tenant123',
      },
      body: {},
      query: {},
    };
    res = {};
    next = vi.fn();
  });

  describe('Guest and Auth Checks', () => {
    it('should call next() immediately if request is guest (req.isGuest is true)', async () => {
      req.isGuest = true;
      const middleware = planLimitMiddleware('search');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockSubscriptionFindByUser).not.toHaveBeenCalled();
    });

    it('should call next() immediately if request user is guest (req.user.isGuest is true)', async () => {
      req.user.isGuest = true;
      const middleware = planLimitMiddleware('search');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockSubscriptionFindByUser).not.toHaveBeenCalled();
    });

    it('should call next() immediately if user is not present (unauthenticated search route)', async () => {
      req.user = undefined;
      const middleware = planLimitMiddleware('search');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(mockSubscriptionFindByUser).not.toHaveBeenCalled();
    });

    it('should return UNAUTHORIZED error if req.user is empty object (no user id resolved)', async () => {
      req.user = {};
      const middleware = planLimitMiddleware('search');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.UNAUTHORIZED);
    });
  });

  describe('Members Limits', () => {
    it('should block inviting team members if no active subscription is found', async () => {
      mockSubscriptionFindByUser.mockResolvedValue(null);
      mockSubscriptionFindOne.mockResolvedValue(null);

      const middleware = planLimitMiddleware('members');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
      expect(error.message).toContain('No active subscription found');
    });

    it('should block inviting team members if subscription is free', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({
        plan: 'free',
        limits: { canInviteTeam: false },
      });

      const middleware = planLimitMiddleware('members');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
      expect(error.message).toContain('current plan does not support team members');
    });

    it('should block if seat limit has been reached', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({
        plan: 'explore',
        limits: { canInviteTeam: true, unlimitedSeats: false },
        seats: { used: 5, total: 5 },
      });

      const middleware = planLimitMiddleware('members');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
      expect(error.message).toContain('Seat limit reached');
    });

    it('should block if tenant max user limit has been reached', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({
        plan: 'explore',
        limits: { canInviteTeam: true, unlimitedSeats: true },
        seats: { used: 5, total: 10 },
        tenantId: 'tenant123',
      });
      mockTenantFindById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          limits: { maxUsers: 10 },
          usage: { usersCount: 10 },
        }),
      });

      const middleware = planLimitMiddleware('members');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
      expect(error.message).toContain('Tenant has reached the maximum user/member limit');
    });

    it('should allow if seat and tenant limits are not exceeded', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({
        plan: 'explore',
        limits: { canInviteTeam: true, unlimitedSeats: false },
        seats: { used: 2, total: 5 },
        tenantId: 'tenant123',
      });
      mockTenantFindById.mockReturnValue({
        lean: vi.fn().mockResolvedValue({
          limits: { maxUsers: 10 },
          usage: { usersCount: 5 },
        }),
      });

      const middleware = planLimitMiddleware('members');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Action Limits', () => {
    it('should block action if subscription is missing', async () => {
      mockSubscriptionFindByUser.mockResolvedValue(null);

      const middleware = planLimitMiddleware('action');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
    });

    it('should block action if subscription plan is free', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'free' });

      const middleware = planLimitMiddleware('action');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
    });

    it('should block action if subscription is suspended', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'explore', status: 'past_due' });

      const middleware = planLimitMiddleware('action');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      expect(next.mock.calls[0][0].statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
    });

    it('should allow action if subscription is active', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'explore', status: 'active' });

      const middleware = planLimitMiddleware('action');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Metered Feature Limits', () => {
    it('should resolve chatbot as projects if not shared', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'explore', status: 'active' });
      mockCheckMonthlyUsageLimit.mockResolvedValue({ allowed: true });
      req.body = { isShared: false };

      const middleware = planLimitMiddleware('chatbot');
      await middleware(req, res, next);

      expect(mockCheckMonthlyUsageLimit).toHaveBeenCalledWith('user123', 'tenant123', 'projects');
      expect(next).toHaveBeenCalledWith();
    });

    it('should resolve chatbot as models if shared', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'explore', status: 'active' });
      mockCheckMonthlyUsageLimit.mockResolvedValue({ allowed: true });
      req.body = { isShared: true };

      const middleware = planLimitMiddleware('chatbot');
      await middleware(req, res, next);

      expect(mockCheckMonthlyUsageLimit).toHaveBeenCalledWith('user123', 'tenant123', 'models');
      expect(next).toHaveBeenCalledWith();
    });

    it('should resolve search as research if deepSearch is true', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'explore', status: 'active' });
      mockCheckMonthlyUsageLimit.mockResolvedValue({ allowed: true });
      req.body = { deepSearch: true };

      const middleware = planLimitMiddleware('search');
      await middleware(req, res, next);

      expect(mockCheckMonthlyUsageLimit).toHaveBeenCalledWith('user123', 'tenant123', 'research');
      expect(next).toHaveBeenCalledWith();
    });

    it('should block if checkMonthlyUsageLimit returns allowed: false', async () => {
      mockSubscriptionFindByUser.mockResolvedValue({ plan: 'explore', status: 'active' });
      mockCheckMonthlyUsageLimit.mockResolvedValue({
        allowed: false,
        message: 'Monthly write limit reached',
      });

      const middleware = planLimitMiddleware('write');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ApiError));
      const error = next.mock.calls[0][0];
      expect(error.statusCode).toBe(httpStatus.PAYMENT_REQUIRED);
      expect(error.message).toBe('Monthly write limit reached');
    });
  });

  describe('Resilience and Fail-Open behavior', () => {
    it('should fail-open and call next() on any internal error', async () => {
      mockSubscriptionFindByUser.mockRejectedValue(new Error('DB connection timed out'));

      const middleware = planLimitMiddleware('search');
      await middleware(req, res, next);

      expect(mockLoggerError).toHaveBeenCalled();
      expect(next).toHaveBeenCalledWith();
    });
  });
});
