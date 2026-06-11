import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import UserUsageModel from './userUsage.model.js';
import SubscriptionModel from '../payment/payment.model.js';
import { logger } from '../../../shared/logger.js';
import { requestContextStore } from '../../../shared/requestContext.js';

import {
  checkUsageLimit,
  trackUsage,
  trackAndVerify,
  canMakeApiCall,
  checkImageGenerationLimit,
  recordImageGeneration,
  checkLimit,
  usageService,
} from './usage.service.js';

// Mock dependencies
vi.mock('./userUsage.model.js', () => ({
  default: {
    getTodayRequests: vi.fn(),
    incrementRequest: vi.fn(),
  },
}));

vi.mock('../payment/payment.model.js', () => ({
  default: {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../shared/requestContext.js', () => ({
  requestContextStore: {
    getStore: vi.fn(),
  },
}));

const mockUserContext = { userId: 'user123' };
const mockTenantContext = { userId: 'user456', workspaceId: 'tenant789' };

describe('usage.service.js', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('extractContext (internal)', () => {
    // This function is not exported, but its logic is critical to all other functions.
    // We test it via the public functions that use it.
    it('should extract context from requestContextStore when userContext is not provided', async () => {
      requestContextStore.getStore.mockReturnValue({
        req: { user: { _id: 'storeUser', tenantId: 'storeTenant' } },
      });
      UserUsageModel.getTodayRequests.mockResolvedValue(0);
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

      await checkUsageLimit(null, 'dailyRequest');

      expect(UserUsageModel.getTodayRequests).toHaveBeenCalledWith('storeUser', 'storeTenant');
    });

    it('should handle requestContextStore throwing an error gracefully', async () => {
      requestContextStore.getStore.mockImplementation(() => {
        throw new Error('No active context');
      });
      await expect(checkUsageLimit(null, 'dailyRequest')).rejects.toThrow('User context is required to check usage limits.');
    });
  });

  describe('checkUsageLimit', () => {
    it('should throw an error if user context is missing', async () => {
      await expect(checkUsageLimit(null, 'dailyRequest')).rejects.toThrow('User context is required to check usage limits.');
    });

    it('should throw an error for an invalid feature', async () => {
      await expect(checkUsageLimit(mockUserContext, 'invalidFeature')).rejects.toThrow('Invalid feature specified: invalidFeature');
      expect(logger.warn).toHaveBeenCalledWith('Unknown feature type passed to checkUsageLimit: invalidFeature');
    });

    it('should throw a generic error on database failure', async () => {
      const dbError = new Error('DB connection failed');
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.reject(dbError) });

      await expect(checkUsageLimit(mockUserContext, 'image')).rejects.toThrow('Could not verify usage limits. Please try again.');
      expect(logger.error).toHaveBeenCalledWith('Error in checkUsageLimit for feature "image":', dbError);
    });

    describe('dailyRequest feature', () => {
      it('should pass if usage is below the default limit', async () => {
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) }); // No subscription
        UserUsageModel.getTodayRequests.mockResolvedValue(5); // 5 requests used, default is 20

        await expect(checkUsageLimit(mockUserContext, 'dailyRequest')).resolves.toBeUndefined();
      });

      it('should throw LimitExceededError if usage meets the default limit', async () => {
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
        UserUsageModel.getTodayRequests.mockResolvedValue(20);

        await expect(checkUsageLimit(mockUserContext, 'dailyRequest')).rejects.toThrow('Usage limit of 20 for dailyRequest has been reached.');
      });

      it('should pass if usage is below the subscription limit', async () => {
        const subscription = { limits: { dailyRequests: 100 } };
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(subscription) });
        UserUsageModel.getTodayRequests.mockResolvedValue(99);

        await expect(checkUsageLimit(mockTenantContext, 'dailyRequest')).resolves.toBeUndefined();
        expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ tenantId: mockTenantContext.workspaceId });
      });



      it('should throw LimitExceededError if usage meets the subscription limit', async () => {
        const subscription = { limits: { dailyRequests: 50 } };
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(subscription) });
        UserUsageModel.getTodayRequests.mockResolvedValue(50);

        await expect(checkUsageLimit(mockTenantContext, 'dailyRequest', 1)).rejects.toThrow('Usage limit of 50 for dailyRequest has been reached.');
      });
    });

    describe('Other features (e.g., image)', () => {
      it('should pass for a user without tenant if usage is below subscription limit', async () => {
        const subscription = { limits: { images: 10 }, usage: { imagesUsed: 5 } };
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(subscription) });

        await expect(checkUsageLimit(mockUserContext, 'image')).resolves.toBeUndefined();
        expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ userId: mockUserContext.userId, tenantId: { $in: [null, undefined] } });
      });

      it('should throw for a user without tenant if usage meets subscription limit', async () => {
        const subscription = { limits: { images: 10 }, usage: { imagesUsed: 10 } };
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(subscription) });

        await expect(checkUsageLimit(mockUserContext, 'image')).rejects.toThrow('Usage limit of 10 for image has been reached.');
      });

      it('should pass for a tenant if usage is below default limit (no subscription)', async () => {
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

        await expect(checkUsageLimit(mockTenantContext, 'webSearch')).resolves.toBeUndefined(); // Default is 5, usage is 0
      });

      it('should throw for a tenant if usage meets default limit (no subscription)', async () => {
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });

        // Default is 1, so checking for 2 should fail
        await expect(checkUsageLimit(mockTenantContext, 'deepResearch', 2)).rejects.toThrow('Usage limit of 1 for deepResearch has been reached.');
      });

      it('should use 0 for usage if subscription.usage is missing', async () => {
        const subscription = { limits: { images: 10 } }; // No usage property
        SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(subscription) });

        await expect(checkUsageLimit(mockUserContext, 'image')).resolves.toBeUndefined();
      });
    });
  });

  describe('trackUsage', () => {
    it('should do nothing if userId is missing', async () => {
      await trackUsage({ workspaceId: 'tenant123' }, 'dailyRequest');
      expect(UserUsageModel.incrementRequest).not.toHaveBeenCalled();
      expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    });

    it('should do nothing if amount is <= 0', async () => {
      await trackUsage(mockUserContext, 'dailyRequest', 0);
      await trackUsage(mockUserContext, 'dailyRequest', -1);
      expect(UserUsageModel.incrementRequest).not.toHaveBeenCalled();
      expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    });

    it('should log an error and return for an invalid feature', async () => {
      await trackUsage(mockUserContext, 'invalidFeature');
      expect(logger.error).toHaveBeenCalledWith('Unknown feature type passed to trackUsage: invalidFeature');
      expect(UserUsageModel.incrementRequest).not.toHaveBeenCalled();
      expect(SubscriptionModel.updateOne).not.toHaveBeenCalled();
    });

    it('should call UserUsageModel.incrementRequest for "dailyRequest"', async () => {
      await trackUsage(mockTenantContext, 'dailyRequest', 5);
      expect(UserUsageModel.incrementRequest).toHaveBeenCalledWith(mockTenantContext.userId, mockTenantContext.workspaceId, 5);
    });

    it('should call SubscriptionModel.updateOne for other features (user context)', async () => {
      await trackUsage(mockUserContext, 'image', 2);
      expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
        { userId: mockUserContext.userId, tenantId: { $in: [null, undefined] } },
        { $inc: { 'usage.imagesUsed': 2 } }
      );
    });

    it('should call SubscriptionModel.updateOne for other features (tenant context)', async () => {
      await trackUsage(mockTenantContext, 'webSearch', 1);
      expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
        { tenantId: mockTenantContext.workspaceId },
        { $inc: { 'usage.webSearchesUsed': 1 } }
      );
    });

    it('should log but not throw on database error', async () => {
      const dbError = new Error('DB write failed');
      UserUsageModel.incrementRequest.mockRejectedValue(dbError);

      await expect(trackUsage(mockUserContext, 'dailyRequest')).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith('Error in trackUsage for feature "dailyRequest":', dbError);
    });
  });

  describe('trackAndVerify', () => {
    it('should call trackUsage after checkUsageLimit succeeds', async () => {
      // Mock success for check
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      UserUsageModel.getTodayRequests.mockResolvedValue(0);

      await trackAndVerify(mockUserContext, 'dailyRequest', 1);

      // Verify check was performed
      expect(UserUsageModel.getTodayRequests).toHaveBeenCalledWith(mockUserContext.userId, undefined);
      // Verify track was performed
      expect(UserUsageModel.incrementRequest).toHaveBeenCalledWith(mockUserContext.userId, undefined, 1);
    });

    it('should NOT call trackUsage if checkUsageLimit fails', async () => {
      // Mock failure for check
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      UserUsageModel.getTodayRequests.mockResolvedValue(20); // At the limit

      await expect(trackAndVerify(mockUserContext, 'dailyRequest', 1)).rejects.toThrow('Usage limit of 20 for dailyRequest has been reached.');

      // Verify track was NOT performed
      expect(UserUsageModel.incrementRequest).not.toHaveBeenCalled();
    });
  });

  describe('canMakeApiCall', () => {
    it('should return true if user is within limits', async () => {
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      UserUsageModel.getTodayRequests.mockResolvedValue(10);

      const result = await canMakeApiCall(mockUserContext, 'dailyRequest');
      expect(result).toBe(true);
    });

    it('should return false if user has exceeded limits', async () => {
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      UserUsageModel.getTodayRequests.mockResolvedValue(20);

      const result = await canMakeApiCall(mockUserContext, 'dailyRequest');
      expect(result).toBe(false);
      expect(logger.error).not.toHaveBeenCalled(); // LimitExceededError should not be logged
    });

    it('should return false and log error for unexpected errors', async () => {
      const dbError = new Error('DB connection failed');
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.reject(dbError) });

      const result = await canMakeApiCall(mockUserContext, 'dailyRequest');
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith('Error in canMakeApiCall:', expect.any(Error));
    });
  });

  describe('Wrapper & Alias Functions', () => {
    it('checkImageGenerationLimit should call checkUsageLimit correctly', async () => {
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve({ limits: { images: 10 }, usage: { imagesUsed: 11 } }) });
      await expect(checkImageGenerationLimit(mockUserContext)).rejects.toThrow('Usage limit of 10 for image has been reached.');
    });

    it('recordImageGeneration should call trackUsage correctly', async () => {
      await recordImageGeneration(mockUserContext);
      expect(SubscriptionModel.updateOne).toHaveBeenCalledWith(
        { userId: mockUserContext.userId, tenantId: { $in: [null, undefined] } },
        { $inc: { 'usage.imagesUsed': 1 } }
      );
    });

    it('checkLimit should call checkUsageLimit with a tenant context', async () => {
      SubscriptionModel.findOne.mockReturnValue({ lean: () => Promise.resolve(null) });
      await checkLimit('tenant789', 'deepResearch', 2);
      expect(SubscriptionModel.findOne).toHaveBeenCalledWith({ tenantId: 'tenant789' });
    });

    it('usageService should export all necessary functions', () => {
        expect(usageService.checkUsageLimit).toBe(checkUsageLimit);
        expect(usageService.trackUsage).toBe(trackUsage);
        expect(usageService.trackAndVerify).toBe(trackAndVerify);
        expect(usageService.canMakeApiCall).toBe(canMakeApiCall);
        expect(usageService.checkImageGenerationLimit).toBe(checkImageGenerationLimit);
        expect(usageService.recordImageGeneration).toBe(recordImageGeneration);
    });
  });
});