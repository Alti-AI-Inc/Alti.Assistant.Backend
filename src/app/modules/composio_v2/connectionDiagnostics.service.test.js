import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ActionAuditLog from './models/actionAuditLog.model.js';
import { logger } from '../../../shared/logger.js';
import { connectionDiagnosticsService } from './connectionDiagnostics.service.js';

vi.mock('./models/actionAuditLog.model.js', () => ({
  default: {
    aggregate: vi.fn(),
    countDocuments: vi.fn(),
    find: vi.fn()
  }
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn()
  }
}));

describe('ConnectionDiagnosticsService', () => {
  const mockUserId = 'user-123';
  const mockWorkspaceUserIds = ['user-123', 'user-456'];
  const now = new Date('2023-10-27T10:30:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getConnectionDiagnostics', () => {
    it('should return a healthy report for a user with good stats', async () => {
      const mockGeneralStats = [{ _id: null, total24h: 50, successes: 49, failures: 1, avgDurationMs: 150 }];
      const mockAppStats = [{ _id: 'google', total: 50, successes: 49, failures: 1, avgDurationMs: 150 }];
      const mockErrorStats = [{ _id: { app: 'google', errorMsg: 'API Error' }, count: 1 }];
      const mockIntervalStats = [
        { _id: new Date('2023-10-27T09:30:00.000Z').getTime(), count: 1 },
        { _id: new Date('2023-10-27T10:20:00.000Z').getTime(), count: 1 }
      ];
      const mockPastHourCount = 2;

      ActionAuditLog.aggregate
        .mockResolvedValueOnce(mockGeneralStats)
        .mockResolvedValueOnce(mockAppStats)
        .mockResolvedValueOnce(mockErrorStats)
        .mockResolvedValueOnce(mockIntervalStats);
      ActionAuditLog.countDocuments.mockResolvedValueOnce(mockPastHourCount);

      const result = await connectionDiagnosticsService.getConnectionDiagnostics(mockUserId);

      expect(result.success).toBe(true);
      expect(result.diagnostics.status).toBe('healthy');
      expect(result.diagnostics.warnings).toEqual([]);
      expect(result.diagnostics.performanceSummary.totalActions24h).toBe(50);
      expect(result.diagnostics.performanceSummary.successRate24h).toBe(98);
      expect(result.diagnostics.rateLimiting.currentHourCount).toBe(2);
      expect(result.diagnostics.rateLimiting.hourlyUsagePercent).toBe(2);
      expect(result.diagnostics.rateLimiting.dailyUsagePercent).toBe(5);
      expect(result.diagnostics.rateLimiting.forecast.predictedNextHourCount).toBe(2);
      expect(result.diagnostics.rateLimiting.forecast.accelerationFactor).toBe(0);
      expect(result.diagnostics.appDiagnostics[0].app).toBe('google');
      expect(result.diagnostics.errorDistribution.length).toBe(1);
    });

    it('should return a critical report for high daily usage', async () => {
      const mockGeneralStats = [{ _id: null, total24h: 850, successes: 800, failures: 50, avgDurationMs: 200 }];
      ActionAuditLog.aggregate
        .mockResolvedValueOnce(mockGeneralStats)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      ActionAuditLog.countDocuments.mockResolvedValueOnce(50);

      const result = await connectionDiagnosticsService.getConnectionDiagnostics(mockUserId);

      expect(result.diagnostics.status).toBe('critical');
      expect(result.diagnostics.warnings).toContain('Active API usage has reached critical quota levels. Impending rate limits expected.');
      expect(result.diagnostics.rateLimiting.dailyUsagePercent).toBe(85);
    });

    it('should return a warning report for accelerating usage', async () => {
      const mockGeneralStats = [{ _id: null, total24h: 100, successes: 95, failures: 5, avgDurationMs: 150 }];
      const mockIntervalStats = [
        { _id: new Date('2023-10-27T09:35:00.000Z').getTime(), count: 3 }, // First half
        { _id: new Date('2023-10-27T10:05:00.000Z').getTime(), count: 12 } // Second half
      ];
      const mockPastHourCount = 15;

      ActionAuditLog.aggregate
        .mockResolvedValueOnce(mockGeneralStats)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(mockIntervalStats);
      ActionAuditLog.countDocuments.mockResolvedValueOnce(mockPastHourCount);

      const result = await connectionDiagnosticsService.getConnectionDiagnostics(mockUserId);

      expect(result.diagnostics.status).toBe('warning');
      expect(result.diagnostics.warnings).toContain('Accelerating tool executions are projected to breach hourly quotas soon.');
      expect(result.diagnostics.rateLimiting.forecast.accelerationFactor).toBe(3);
      expect(result.diagnostics.rateLimiting.forecast.predictedNextHourCount).toBe(45); // 15 * (1 + 2) [capped at 2]
      expect(result.diagnostics.rateLimiting.forecast.predictedUsagePercent).toBe(38); // (45/120)*100
    });

    it('should return a warning report for high failure rates', async () => {
      const mockGeneralStats = [{ _id: null, total24h: 20, successes: 10, failures: 10, avgDurationMs: 500 }];
      ActionAuditLog.aggregate
        .mockResolvedValueOnce(mockGeneralStats)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);
      ActionAuditLog.countDocuments.mockResolvedValueOnce(5);

      const result = await connectionDiagnosticsService.getConnectionDiagnostics(mockUserId);

      expect(result.diagnostics.status).toBe('warning');
      expect(result.diagnostics.warnings).toContain('High failure rates detected on current tool connections.');
      expect(result.diagnostics.performanceSummary.successRate24h).toBe(50);
    });

    it('should handle workspace diagnostics by using $in for userIds', async () => {
      ActionAuditLog.aggregate.mockResolvedValue([]);
      ActionAuditLog.countDocuments.mockResolvedValue(0);

      await connectionDiagnosticsService.getConnectionDiagnostics(mockWorkspaceUserIds);

      const expectedMatchQuery = {
        userId: { $in: mockWorkspaceUserIds },
        createdAt: { $gte: new Date('2023-10-26T10:30:00.000Z') }
      };

      expect(ActionAuditLog.aggregate.mock.calls[0][0][0].$match).toEqual(expectedMatchQuery);
      expect(ActionAuditLog.countDocuments.mock.calls[0][0].userId).toEqual({ $in: mockWorkspaceUserIds });
    });

    it('should handle cases with no audit logs gracefully', async () => {
      ActionAuditLog.aggregate.mockResolvedValue([]);
      ActionAuditLog.countDocuments.mockResolvedValue(0);

      const result = await connectionDiagnosticsService.getConnectionDiagnostics(mockUserId);

      expect(result.success).toBe(true);
      expect(result.diagnostics.status).toBe('healthy');
      expect(result.diagnostics.performanceSummary.totalActions24h).toBe(0);
      expect(result.diagnostics.performanceSummary.successRate24h).toBe(100);
      expect(result.diagnostics.rateLimiting.currentHourCount).toBe(0);
      expect(result.diagnostics.appDiagnostics).toEqual([]);
      expect(result.diagnostics.errorDistribution).toEqual([]);
    });

    it('should catch and log errors from the database', async () => {
      const dbError = new Error('Database connection failed');
      ActionAuditLog.aggregate.mockRejectedValue(dbError);

      await expect(connectionDiagnosticsService.getConnectionDiagnostics(mockUserId)).rejects.toThrow(dbError);
      expect(logger.error).toHaveBeenCalledWith('ConnectionDiagnosticsService.getConnectionDiagnostics failed:', dbError);
    });
  });

  describe('getSingleConnectionDiagnostics', () => {
    const mockApp = 'salesforce';

    it('should return a healthy report for a specific app', async () => {
      const mockLogs = [
        { status: 'success', durationMs: 100 },
        { status: 'success', durationMs: 150 },
        { status: 'failed', durationMs: 200, error: { message: 'Invalid credentials' } }
      ];
      ActionAuditLog.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockLogs)
      });

      const result = await connectionDiagnosticsService.getSingleConnectionDiagnostics(mockUserId, mockApp);

      expect(result.success).toBe(true);
      expect(result.app).toBe(mockApp);
      expect(result.diagnostics.status).toBe('healthy');
      expect(result.diagnostics.totalActions24h).toBe(3);
      expect(result.diagnostics.successRate).toBe(67);
      expect(result.diagnostics.avgLatencyMs).toBe(150);
      expect(result.diagnostics.failures).toBe(1);
      expect(result.diagnostics.topErrors).toEqual([{ message: 'Invalid credentials', count: 1 }]);
      expect(result.diagnostics.recommendations).toEqual(['No issues detected. Connection is operating cleanly.']);
    });

    it('should return a degraded report for an app with high failure rate', async () => {
      const mockLogs = [
        { status: 'success', durationMs: 100 },
        { status: 'failed', durationMs: 200, error: { message: 'API limit exceeded' } },
        { status: 'failed', durationMs: 220, error: { message: 'API limit exceeded' } },
        { status: 'failed', durationMs: 180, error: { message: 'Invalid input' } }
      ];
      ActionAuditLog.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockLogs)
      });

      const result = await connectionDiagnosticsService.getSingleConnectionDiagnostics(mockUserId, mockApp);

      expect(result.diagnostics.status).toBe('degraded');
      expect(result.diagnostics.successRate).toBe(25);
      expect(result.diagnostics.recommendations).toContain(
        'Connection is displaying high failure rates. Trigger connection recovery to re-verify OAuth tokens.'
      );
      expect(result.diagnostics.topErrors).toEqual([
        { message: 'API limit exceeded', count: 2 },
        { message: 'Invalid input', count: 1 }
      ]);
    });

    it('should add a recommendation for high latency', async () => {
      const mockLogs = [
        { status: 'success', durationMs: 6000 },
        { status: 'success', durationMs: 5500 },
        { status: 'success', durationMs: 100 },
        { status: 'success', durationMs: 150 }
      ];
      ActionAuditLog.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockLogs)
      });

      const result = await connectionDiagnosticsService.getSingleConnectionDiagnostics(mockUserId, mockApp);

      expect(result.diagnostics.recommendations).toContain(
        'High latency (latency > 5000ms) detected on 30% of requests. Investigate third-party service latency.'
      );
    });

    it('should handle workspace diagnostics by using $in for userIds', async () => {
      ActionAuditLog.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      await connectionDiagnosticsService.getSingleConnectionDiagnostics(mockWorkspaceUserIds, mockApp);

      const expectedQuery = {
        userId: { $in: mockWorkspaceUserIds },
        app: mockApp,
        createdAt: { $gte: new Date('2023-10-26T10:30:00.000Z') }
      };

      expect(ActionAuditLog.find).toHaveBeenCalledWith(expectedQuery);
    });

    it('should handle cases with no logs for the app gracefully', async () => {
      ActionAuditLog.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([])
      });

      const result = await connectionDiagnosticsService.getSingleConnectionDiagnostics(mockUserId, mockApp);

      expect(result.success).toBe(true);
      expect(result.diagnostics.status).toBe('healthy');
      expect(result.diagnostics.totalActions24h).toBe(0);
      expect(result.diagnostics.successRate).toBe(100);
      expect(result.diagnostics.failures).toBe(0);
      expect(result.diagnostics.topErrors).toEqual([]);
      expect(result.diagnostics.recommendations).toEqual(['No issues detected. Connection is operating cleanly.']);
    });

    it('should catch and log errors from the database', async () => {
      const dbError = new Error('Query failed');
      ActionAuditLog.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(dbError)
      });

      await expect(connectionDiagnosticsService.getSingleConnectionDiagnostics(mockUserId, mockApp)).rejects.toThrow(dbError);
      expect(logger.error).toHaveBeenCalledWith(
        `ConnectionDiagnosticsService.getSingleConnectionDiagnostics failed for app ${mockApp}:`,
        dbError
      );
    });
  });
});