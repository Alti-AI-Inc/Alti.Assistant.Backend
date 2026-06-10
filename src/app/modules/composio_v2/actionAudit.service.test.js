import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { actionAuditService } from './actionAudit.service.js';
import ActionAuditLog from './models/actionAuditLog.model.js';
import User from '../auth/auth.model.js';
import { usageService } from '../usage/usage.service.js';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('./models/actionAuditLog.model.js', () => ({
  default: {
    insertMany: vi.fn(),
    updateOne: vi.fn(),
    find: vi.fn(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
  },
}));

vi.mock('../auth/auth.model.js', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
  },
}));

vi.mock('../usage/usage.service.js', () => ({
  usageService: {
    recordAction: vi.fn(),
  },
}));

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  const mockObjectId = (id) => ({
    _id: id,
    toString: () => id,
    equals: (other) => other.toString() === id,
  });
  mockObjectId.isValid = actualMongoose.Types.ObjectId.isValid;

  return {
    ...actualMongoose,
    default: {
      ...actualMongoose.default,
      Types: {
        ...actualMongoose.Types,
        ObjectId: vi.fn(mockObjectId),
      },
    },
  };
});

const mockObjectId = (id) => new mongoose.Types.ObjectId(id);

describe('ActionAuditService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-10-27T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('logStart', () => {
    it('should log the start of an action and return the new ID', async () => {
      const mockId = mockObjectId('653b9a7b7e0b7b5a8b3e9c9c');
      ActionAuditLog.insertMany.mockResolvedValue([{ _id: mockId }]);

      const params = {
        userId: 'user1',
        workspaceId: 'workspace1',
        app: 'testApp',
        action: 'testAction',
        parameters: { token: 'sensitive', data: 'safe' },
        context: { conversationId: 'conv1' },
      };

      const result = await actionAuditService.logStart(params);

      expect(ActionAuditLog.insertMany).toHaveBeenCalledWith([
        expect.objectContaining({
          userId: 'user1',
          workspaceId: 'workspace1',
          app: 'testApp',
          action: 'testAction',
          parameters: { token: '[REDACTED]', data: 'safe' },
          status: 'executing',
          conversationId: 'conv1',
          redacted: true,
        }),
      ], { lean: true });
      expect(result).toBe(mockId.toString());
    });

    it('should return null and log an error if userId or workspaceId is missing', async () => {
      const result = await actionAuditService.logStart({ app: 'testApp' });
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('ActionAuditService.logStart called with missing userId or workspaceId.');
      expect(ActionAuditLog.insertMany).not.toHaveBeenCalled();
    });

    it('should return null and log an error if the database operation fails', async () => {
      const error = new Error('DB Error');
      ActionAuditLog.insertMany.mockRejectedValue(error);

      const params = { userId: 'user1', workspaceId: 'workspace1', app: 'testApp', action: 'testAction' };
      const result = await actionAuditService.logStart(params);

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('ActionAuditService.logStart failed:', 'DB Error');
    });
  });

  describe('logComplete', () => {
    it('should update the log for a successful action and record usage', async () => {
      ActionAuditLog.updateOne.mockResolvedValue({ modifiedCount: 1 });
      usageService.recordAction.mockResolvedValue();

      const context = { auditLogId: 'log1', userId: 'user1', workspaceId: 'workspace1', app: 'testApp' };
      const outcome = { success: true, result: { data: 'some result', apiKey: 'secret' }, durationMs: 123 };

      await actionAuditService.logComplete(context, outcome);

      expect(ActionAuditLog.updateOne).toHaveBeenCalledWith(
        { _id: 'log1', userId: 'user1', workspaceId: 'workspace1' },
        {
          $set: {
            status: 'success',
            durationMs: 123,
            attempts: 1,
            retried: false,
            result: { data: 'some result', apiKey: '[REDACTED]' },
          },
        }
      );
      expect(usageService.recordAction).toHaveBeenCalledWith({
        userId: 'user1',
        workspaceId: 'workspace1',
        app: 'testApp',
        durationMs: 123,
      });
    });

    it('should update the log for a failed action and not record usage', async () => {
      ActionAuditLog.updateOne.mockResolvedValue({ modifiedCount: 1 });

      const context = { auditLogId: 'log1', userId: 'user1', workspaceId: 'workspace1', app: 'testApp' };
      const outcome = { success: false, error: new Error('Action Failed'), durationMs: 45 };

      await actionAuditService.logComplete(context, outcome);

      expect(ActionAuditLog.updateOne).toHaveBeenCalledWith(
        { _id: 'log1', userId: 'user1', workspaceId: 'workspace1' },
        {
          $set: expect.objectContaining({
            status: 'failed',
            error: { message: 'Action Failed' },
          }),
        }
      );
      expect(usageService.recordAction).not.toHaveBeenCalled();
    });

    it('should set status to "retried" for a failed action that was retried', async () => {
        ActionAuditLog.updateOne.mockResolvedValue({ modifiedCount: 1 });
  
        const context = { auditLogId: 'log1', userId: 'user1', workspaceId: 'workspace1', app: 'testApp' };
        const outcome = { success: false, error: new Error('Action Failed'), retried: true };
  
        await actionAuditService.logComplete(context, outcome);
  
        expect(ActionAuditLog.updateOne).toHaveBeenCalledWith(
          { _id: 'log1', userId: 'user1', workspaceId: 'workspace1' },
          {
            $set: expect.objectContaining({
              status: 'retried',
            }),
          }
        );
      });

    it('should skip update and log a warning if required context is missing', async () => {
      await actionAuditService.logComplete({ userId: 'user1' }, { success: true });
      expect(logger.warn).toHaveBeenCalledWith('ActionAuditService.logComplete called with missing auditLogId, userId, or workspaceId. Skipping update.');
      expect(ActionAuditLog.updateOne).not.toHaveBeenCalled();
    });

    it('should log an error if the database update fails', async () => {
        const error = new Error('DB Update Error');
        ActionAuditLog.updateOne.mockRejectedValue(error);
  
        const context = { auditLogId: 'log1', userId: 'user1', workspaceId: 'workspace1', app: 'testApp' };
        const outcome = { success: true };
  
        await actionAuditService.logComplete(context, outcome);
  
        expect(logger.error).toHaveBeenCalledWith('ActionAuditService.logComplete failed:', 'DB Update Error');
      });
  });

  describe('logRollback', () => {
    it('should update the log status to rolled_back', async () => {
      ActionAuditLog.updateOne.mockResolvedValue({ modifiedCount: 1 });
      const context = { auditLogId: 'log1', userId: 'user1', workspaceId: 'workspace1' };

      await actionAuditService.logRollback(context);

      expect(ActionAuditLog.updateOne).toHaveBeenCalledWith(
        { _id: 'log1', userId: 'user1', workspaceId: 'workspace1' },
        { $set: { status: 'rolled_back' } }
      );
    });

    it('should skip update and log a warning if required context is missing', async () => {
      await actionAuditService.logRollback({ userId: 'user1' });
      expect(logger.warn).toHaveBeenCalledWith('ActionAuditService.logRollback called with missing auditLogId, userId, or workspaceId. Skipping update.');
      expect(ActionAuditLog.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('getAuditLogs', () => {
    const mockFindChain = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn(),
    };
    beforeEach(() => {
      ActionAuditLog.find.mockReturnValue(mockFindChain);
    });

    it('should restrict a "user" to their own logs', async () => {
      const authUser = { _id: mockObjectId('user1'), role: 'user' };
      await actionAuditService.getAuditLogs(authUser, {});
      expect(ActionAuditLog.find).toHaveBeenCalledWith({ userId: authUser._id });
    });

    it('should restrict an "admin" to their workspace', async () => {
      const authUser = { _id: mockObjectId('admin1'), workspaceId: mockObjectId('workspace1'), role: 'admin' };
      await actionAuditService.getAuditLogs(authUser, {});
      expect(ActionAuditLog.find).toHaveBeenCalledWith({ workspaceId: authUser.workspaceId });
    });

    it('should allow an "admin" to filter by a user within their workspace', async () => {
        const authUser = { _id: mockObjectId('admin1'), workspaceId: mockObjectId('workspace1'), role: 'admin' };
        const targetUserId = mockObjectId('user2');
        User.findOne.mockResolvedValue({ _id: targetUserId, workspaceId: authUser.workspaceId });
  
        await actionAuditService.getAuditLogs(authUser, { userId: targetUserId.toString() });
  
        expect(User.findOne).toHaveBeenCalledWith({ _id: targetUserId, workspaceId: authUser.workspaceId });
        expect(ActionAuditLog.find).toHaveBeenCalledWith({
          workspaceId: authUser.workspaceId,
          userId: targetUserId,
        });
      });

    it('should return empty for an "admin" filtering a user not in their workspace', async () => {
        const authUser = { _id: mockObjectId('admin1'), workspaceId: mockObjectId('workspace1'), role: 'admin' };
        const targetUserId = mockObjectId('user-other-ws');
        User.findOne.mockResolvedValue(null);
  
        const result = await actionAuditService.getAuditLogs(authUser, { userId: targetUserId.toString() });
  
        expect(User.findOne).toHaveBeenCalledWith({ _id: targetUserId, workspaceId: authUser.workspaceId });
        expect(result).toEqual({ success: true, entries: [], total: 0, limit: 50, offset: 0, hasMore: false });
        expect(ActionAuditLog.find).not.toHaveBeenCalled();
      });

    it('should restrict a "manager" to their workspace and managed users', async () => {
      const authUser = { _id: mockObjectId('manager1'), workspaceId: mockObjectId('workspace1'), role: 'manager' };
      const managedUser = { _id: mockObjectId('user2') };
      const mockUserFindChain = { select: vi.fn().mockReturnThis(), lean: vi.fn().mockResolvedValue([managedUser]) };
      User.find.mockReturnValue(mockUserFindChain);

      await actionAuditService.getAuditLogs(authUser, {});

      expect(User.find).toHaveBeenCalledWith({ managerId: authUser._id });
      expect(ActionAuditLog.find).toHaveBeenCalledWith({
        workspaceId: authUser.workspaceId,
        userId: { $in: [managedUser._id, authUser._id] },
      });
    });

    it('should forbid a "manager" from viewing logs of an unmanaged user', async () => {
        const authUser = { _id: mockObjectId('manager1'), workspaceId: mockObjectId('workspace1'), role: 'manager' };
        const targetUserId = mockObjectId('unmanagedUser');
        User.findOne.mockResolvedValue(null);
  
        const result = await actionAuditService.getAuditLogs(authUser, { userId: targetUserId.toString() });
  
        expect(User.findOne).toHaveBeenCalledWith({
          _id: targetUserId,
          managerId: authUser._id,
          workspaceId: authUser.workspaceId,
        });
        expect(result).toEqual({ success: false, error: 'Forbidden: You can only view logs for users you manage.', entries: [], total: 0 });
      });

    it('should allow a "super_admin" to query any workspace or user', async () => {
      const authUser = { role: 'super_admin' };
      const workspaceId = mockObjectId('workspace2');
      const userId = mockObjectId('user3');

      await actionAuditService.getAuditLogs(authUser, { workspaceId: workspaceId.toString(), userId: userId.toString() });

      expect(ActionAuditLog.find).toHaveBeenCalledWith({
        workspaceId: workspaceId,
        userId: userId,
      });
    });

    it('should return a forbidden error for an unauthorized role', async () => {
        const authUser = { role: 'guest' };
        const result = await actionAuditService.getAuditLogs(authUser, {});
        expect(result).toEqual({ success: false, error: 'Forbidden', entries: [], total: 0 });
        expect(logger.warn).toHaveBeenCalledWith('Unauthorized role trying to access audit logs: guest');
      });
  });

  describe('getAnalytics', () => {
    const mockAnalyticsResult = [{
        statusAgg: [{ _id: 'success', count: 10 }],
        appAgg: [{ _id: 'testApp', total: 10, successes: 10, failures: 0, avgDurationMs: 100 }],
        performanceAgg: [{ _id: null, totalActions: 10, totalRetries: 1, avgDurationMs: 100, p95DurationMs: [200], successRate: 1 }],
        dailyAgg: [{ id: '2023-10-27', count: 10, successes: 10 }],
    }];

    beforeEach(() => {
        ActionAuditLog.aggregate.mockResolvedValue(mockAnalyticsResult);
    });

    it('should restrict a "user" to their own analytics', async () => {
        const authUser = { _id: mockObjectId('user1'), role: 'user' };
        await actionAuditService.getAnalytics(authUser, {});
        const matchStage = ActionAuditLog.aggregate.mock.calls[0][0][0].$match;
        expect(matchStage.userId).toEqual(authUser._id);
        expect(matchStage.workspaceId).toBeUndefined();
    });

    it('should restrict an "admin" to their workspace analytics', async () => {
        const authUser = { _id: mockObjectId('admin1'), workspaceId: mockObjectId('workspace1'), role: 'admin' };
        await actionAuditService.getAnalytics(authUser, {});
        const matchStage = ActionAuditLog.aggregate.mock.calls[0][0][0].$match;
        expect(matchStage.workspaceId).toEqual(authUser.workspaceId);
    });

    it('should forbid a "manager" from viewing analytics of an unmanaged user', async () => {
        const authUser = { _id: mockObjectId('manager1'), workspaceId: mockObjectId('workspace1'), role: 'manager' };
        const targetUserId = mockObjectId('unmanagedUser');
        User.findOne.mockResolvedValue(null);
  
        const result = await actionAuditService.getAnalytics(authUser, { userId: targetUserId.toString() });
  
        expect(User.findOne).toHaveBeenCalledWith({
          _id: targetUserId,
          managerId: authUser._id,
          workspaceId: authUser.workspaceId,
        });
        expect(result).toEqual({ success: false, error: 'Forbidden: You can only view analytics for users you manage.' });
      });

    it('should allow a "super_admin" to query any workspace', async () => {
        const authUser = { role: 'super_admin' };
        const workspaceId = mockObjectId('workspace2');
        await actionAuditService.getAnalytics(authUser, { workspaceId: workspaceId.toString() });
        const matchStage = ActionAuditLog.aggregate.mock.calls[0][0][0].$match;
        expect(matchStage.workspaceId).toEqual(workspaceId);
    });

    it('should correctly format the analytics response', async () => {
        const authUser = { _id: mockObjectId('user1'), role: 'user' };
        const result = await actionAuditService.getAnalytics(authUser, { window: '7d' });
  
        expect(result).toEqual({
          success: true,
          window: '7d',
          since: '2023-10-20T10:00:00.000Z',
          performance: {
            totalActions: 10,
            totalRetries: 1,
            avgDurationMs: 100,
            p95DurationMs: 200,
            successRate: 100,
          },
          statusDistribution: { success: 10 },
          appBreakdown: [{
            app: 'testApp',
            total: 10,
            successes: 10,
            failures: 0,
            successRate: 100,
            avgDurationMs: 100,
          }],
          dailyTrend: [{ id: '2023-10-27', count: 10, successes: 10 }],
        });
      });

    it('should handle empty aggregation results gracefully', async () => {
        ActionAuditLog.aggregate.mockResolvedValue([{}]);
        const authUser = { _id: mockObjectId('user1'), role: 'user' };
        const result = await actionAuditService.getAnalytics(authUser, {});
  
        expect(result.performance.totalActions).toBe(0);
        expect(result.statusDistribution).toEqual({});
        expect(result.appBreakdown).toEqual([]);
        expect(result.dailyTrend).toEqual([]);
      });
  });

  describe('Private helpers', () => {
    describe('_redactSensitive', () => {
        it('should redact sensitive keys at the top level', () => {
            const input = { user: 'test', password: '123', token: 'abc' };
            const expected = { user: 'test', password: '[REDACTED]', token: '[REDACTED]' };
            expect(actionAuditService._redactSensitive(input)).toEqual(expected);
        });

        it('should redact sensitive keys in nested objects', () => {
            const input = { data: { auth: { api_key: 'xyz' } }, safe: 'value' };
            const expected = { data: { auth: { api_key: '[REDACTED]' } }, safe: 'value' };
            expect(actionAuditService._redactSensitive(input)).toEqual(expected);
        });

        it('should handle arrays of objects', () => {
            const input = [{ credential: 'abc' }, { safe: 'def' }];
            const expected = [{ credential: '[REDACTED]' }, { safe: 'def' }];
            expect(actionAuditService._redactSensitive(input)).toEqual(expected);
        });
    });

    describe('_summarizeResult', () => {
        it('should truncate long strings', () => {
            const longString = 'a'.repeat(600);
            const result = actionAuditService._summarizeResult({ long: longString });
            expect(result.long).toBe('a'.repeat(500) + '...[truncated]');
        });

        it('should summarize arrays', () => {
            const result = actionAuditService._summarizeResult({ list: [1, 2, 3] });
            expect(result.list).toBe('[Array: 3 items]');
        });

        it('should summarize objects', () => {
            const result = actionAuditService._summarizeResult({ nested: { a: 1, b: 2 } });
            expect(result.nested).toBe('[Object: 2 keys]');
        });
    });

    describe('_windowToDate', () => {
        it('should handle "7d"', () => {
            const expected = new Date('2023-10-20T10:00:00.000Z');
            expect(actionAuditService._windowToDate('7d')).toEqual(expected);
        });

        it('should handle "24h"', () => {
            const expected = new Date('2023-10-26T10:00:00.000Z');
            expect(actionAuditService._windowToDate('24h')).toEqual(expected);
        });

        it('should default to 7 days for invalid input', () => {
            const expected = new Date('2023-10-20T10:00:00.000Z');
            expect(actionAuditService._windowToDate('invalid')).toEqual(expected);
        });
    });
  });
});