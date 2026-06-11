import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependency. This must be done before importing the service.
const mockUsageService = {
  canMakeApiCall: vi.fn(),
  recordApiCall: vi.fn()
};

vi.mock('../usage/usage.service.js', () => ({
  usageService: mockUsageService
}));

// Import the service to be tested
import { TenantUsageService } from './tenant-usage.service.js';

describe('TenantUsageService', () => {
  beforeEach(() => {
    // Clear mock history before each test to ensure isolation
    vi.clearAllMocks();
  });

  describe('checkQuota', () => {
    const tenantId = 'tenant-123';
    const action = 'generate-report';

    it('should call usageService.canMakeApiCall with correct parameters and default amount', async () => {
      mockUsageService.canMakeApiCall.mockResolvedValue(true);

      const result = await TenantUsageService.checkQuota(tenantId, action);

      expect(mockUsageService.canMakeApiCall).toHaveBeenCalledTimes(1);
      expect(mockUsageService.canMakeApiCall).toHaveBeenCalledWith(
        { workspaceId: tenantId },
        action,
        1 // Default amount
      );
      expect(result).toBe(true);
    });

    it('should call usageService.canMakeApiCall with a specific amount', async () => {
      const amount = 10;
      mockUsageService.canMakeApiCall.mockResolvedValue(false);

      const result = await TenantUsageService.checkQuota(tenantId, action, amount);

      expect(mockUsageService.canMakeApiCall).toHaveBeenCalledTimes(1);
      expect(mockUsageService.canMakeApiCall).toHaveBeenCalledWith(
        { workspaceId: tenantId },
        action,
        amount
      );
      expect(result).toBe(false);
    });

    it('should return the value from usageService.canMakeApiCall', async () => {
      mockUsageService.canMakeApiCall.mockResolvedValue(true);
      let result = await TenantUsageService.checkQuota(tenantId, action);
      expect(result).toBe(true);

      mockUsageService.canMakeApiCall.mockResolvedValue(false);
      result = await TenantUsageService.checkQuota(tenantId, action);
      expect(result).toBe(false);
    });

    it('should propagate errors from usageService.canMakeApiCall', async () => {
      const error = new Error('Quota check failed');
      mockUsageService.canMakeApiCall.mockRejectedValue(error);

      await expect(TenantUsageService.checkQuota(tenantId, action)).rejects.toThrow(error);
    });
  });

  describe('trackUsage', () => {
    const tenantId = 'tenant-456';
    const userId = 'user-789';
    const action = 'send-email';

    it('should call usageService.recordApiCall with correct parameters and default amount', async () => {
      const mockResponse = { success: true };
      mockUsageService.recordApiCall.mockResolvedValue(mockResponse);

      const result = await TenantUsageService.trackUsage(tenantId, userId, action);

      expect(mockUsageService.recordApiCall).toHaveBeenCalledTimes(1);
      expect(mockUsageService.recordApiCall).toHaveBeenCalledWith(
        { workspaceId: tenantId, userId },
        { service: action, cost: 1 } // Default amount as cost
      );
      expect(result).toEqual(mockResponse);
    });

    it('should call usageService.recordApiCall with a specific amount', async () => {
      const amount = 5;
      const mockResponse = { success: true, usage: 5 };
      mockUsageService.recordApiCall.mockResolvedValue(mockResponse);

      const result = await TenantUsageService.trackUsage(tenantId, userId, action, amount);

      expect(mockUsageService.recordApiCall).toHaveBeenCalledTimes(1);
      expect(mockUsageService.recordApiCall).toHaveBeenCalledWith(
        { workspaceId: tenantId, userId },
        { service: action, cost: amount }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should return the value from usageService.recordApiCall', async () => {
      const mockResponse = { id: 'usage-record-123' };
      mockUsageService.recordApiCall.mockResolvedValue(mockResponse);

      const result = await TenantUsageService.trackUsage(tenantId, userId, action);
      expect(result).toEqual(mockResponse);
    });

    it('should propagate errors from usageService.recordApiCall', async () => {
      const error = new Error('Usage tracking failed');
      mockUsageService.recordApiCall.mockRejectedValue(error);

      await expect(TenantUsageService.trackUsage(tenantId, userId, action)).rejects.toThrow(error);
    });
  });
});