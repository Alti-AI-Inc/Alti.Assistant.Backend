import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock ComposioAuth model
const mockSave = vi.fn();
const mockConnection = (status = 'ACTIVE', connectedAccountId = 'acc123', toolkitSlug = 'test-toolkit', authConfigId = 'ac_test') => ({
  _id: 'conn123',
  userId: 'user123',
  status,
  connectedAccountId,
  toolkit: toolkitSlug ? { slug: toolkitSlug } : undefined,
  authConfigId,
  accessToken: 'initial_access',
  refreshToken: 'initial_refresh',
  save: mockSave,
});

const ComposioAuth = {
  findOne: vi.fn(),
  find: vi.fn(),
};

// Mock actionAuditService
const actionAuditService = {
  logStart: vi.fn(),
  logComplete: vi.fn(),
};

const {
  logger
} = vi.hoisted(() => {
  // Mock logger
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    logger
  };
});

// Mock config
const config = {
  composio: {
    orgApiKey: 'test-api-key',
  },
};

// Mock Composio SDK
const mockGetConnectedAccount = vi.fn();
const Composio = vi.fn().mockImplementation(() => ({
  connectedAccounts: {
    get: mockGetConnectedAccount,
  },
}));

// Mock modules before importing the service under test
vi.mock('./composio.model.js', () => ({ default: ComposioAuth }));
vi.mock('./actionAudit.service.js', () => ({ actionAuditService }));
vi.mock('../../../shared/logger.js', () => ({ logger }));
vi.mock('../../../../config/index.js', () => ({ default: config }));
vi.mock('@composio/core', () => ({ Composio }));

// Import the actual service after mocks are defined
import { connectionRecoveryService } from './connectionRecovery.service.js';

describe('connectionRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations for ComposioAuth and Composio SDK
    ComposioAuth.findOne.mockResolvedValue(null);
    ComposioAuth.find.mockResolvedValue([]);
    mockSave.mockResolvedValue(true); // Default successful save
    mockGetConnectedAccount.mockResolvedValue(null); // Default no upstream connection

    actionAuditService.logStart.mockResolvedValue({ _id: 'auditLog123' });
    actionAuditService.logComplete.mockResolvedValue(true);
  });

  describe('attemptAutoRecovery', () => {
    const connectionId = 'conn123';
    const userId = 'user123';

    it('should throw an error if connection is not found', async () => {
      ComposioAuth.findOne.mockResolvedValue(null);

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe(`ComposioAuth connection not found: ${connectionId}`);
      expect(ComposioAuth.findOne).toHaveBeenCalledWith({ _id: connectionId, userId });
      expect(logger.info).toHaveBeenCalledWith(`ConnectionRecovery: starting auto-recovery cycle for connection ${connectionId}`);
      expect(actionAuditService.logStart).not.toHaveBeenCalled(); // No audit log if connection not found
      expect(actionAuditService.logComplete).not.toHaveBeenCalled(); // No audit log to complete
    });

    it('should return failure if connection has no connectedAccountId', async () => {
      const connection = mockConnection('ACTIVE', null); // No connectedAccountId
      ComposioAuth.findOne.mockResolvedValue(connection);

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result).toEqual({ success: false, error: 'No connectedAccountId available for recovery verification.' });
      expect(ComposioAuth.findOne).toHaveBeenCalledWith({ _id: connectionId, userId });
      expect(logger.warn).toHaveBeenCalledWith(`ConnectionRecovery: no connectedAccountId for ${connectionId}, cannot verify upstream`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: false, error: 'No connectedAccountId available for recovery verification.' }));
      expect(mockSave).not.toHaveBeenCalled(); // No save if no connectedAccountId
    });

    it('should successfully recover an active connection and update tokens', async () => {
      const connection = mockConnection('EXPIRED', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({
        status: 'ACTIVE',
        data: { accessToken: 'new_access_token', refreshToken: 'new_refresh_token' },
      });

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OAuth connection verified and recovered.');
      expect(result.connection).toBeDefined();
      expect(result.connection.status).toBe('ACTIVE');
      expect(result.connection.accessToken).toBe('new_access_token');
      expect(result.connection.refreshToken).toBe('new_refresh_token');

      expect(ComposioAuth.findOne).toHaveBeenCalledWith({ _id: connectionId, userId });
      expect(mockGetConnectedAccount).toHaveBeenCalledWith('acc123');
      expect(connection.save).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(`ConnectionRecovery: upstream verification confirmed ACTIVE for acc123`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: true }));
    });

    it('should successfully recover an active connection without updating tokens if not provided', async () => {
      const connection = mockConnection('EXPIRED', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({
        status: 'ACTIVE',
        data: {}, // No tokens provided
      });

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OAuth connection verified and recovered.');
      expect(result.connection).toBeDefined();
      expect(result.connection.status).toBe('ACTIVE');
      expect(result.connection.accessToken).toBe('initial_access'); // Should remain unchanged
      expect(result.connection.refreshToken).toBe('initial_refresh'); // Should remain unchanged

      expect(ComposioAuth.findOne).toHaveBeenCalledWith({ _id: connectionId, userId });
      expect(mockGetConnectedAccount).toHaveBeenCalledWith('acc123');
      expect(connection.save).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(`ConnectionRecovery: upstream verification confirmed ACTIVE for acc123`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: true }));
    });

    it('should mark connection as FAILED if upstream status is not ACTIVE', async () => {
      const connection = mockConnection('EXPIRED', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({ status: 'REVOKED' });

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upstream connection status is REVOKED. Re-authentication required.');
      expect(connection.status).toBe('FAILED'); // Should be updated to FAILED
      expect(connection.save).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(`ConnectionRecovery: upstream status for acc123 is REVOKED`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: false, error: 'Upstream connection status is REVOKED. Re-authentication required.' }));
    });

    it('should mark connection as FAILED if upstream status is unknown/null', async () => {
      const connection = mockConnection('EXPIRED', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({}); // No status property

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Upstream connection status is unknown. Re-authentication required.');
      expect(connection.status).toBe('FAILED'); // Should be updated to FAILED
      expect(connection.save).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(`ConnectionRecovery: upstream status for acc123 is unknown`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: false, error: 'Upstream connection status is unknown. Re-authentication required.' }));
    });

    it('should mark connection as REVOKED if SDK call fails with "not found" error', async () => {
      const connection = mockConnection('ACTIVE', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockRejectedValue(new Error('Connected account not found.'));

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connected account not found.');
      expect(connection.status).toBe('REVOKED'); // Should be updated to REVOKED
      expect(connection.save).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(`ConnectionRecovery: Composio SDK verification failed for acc123: Connected account not found.`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: false, error: 'Connected account not found.' }));
    });

    it('should mark connection as REVOKED if SDK call fails with "revoked" error', async () => {
      const connection = mockConnection('ACTIVE', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockRejectedValue(new Error('Token revoked.'));

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token revoked.');
      expect(connection.status).toBe('REVOKED'); // Should be updated to REVOKED
      expect(connection.save).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(`ConnectionRecovery: Composio SDK verification failed for acc123: Token revoked.`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: false, error: 'Token revoked.' }));
    });

    it('should not change connection status if SDK call fails with a generic error', async () => {
      const connection = mockConnection('EXPIRED', 'acc123'); // Initial status is EXPIRED
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockRejectedValue(new Error('Network error.'));

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error.');
      expect(connection.status).toBe('EXPIRED'); // Should remain EXPIRED
      expect(connection.save).not.toHaveBeenCalled(); // Should not save if status not changed
      expect(logger.warn).toHaveBeenCalledWith(`ConnectionRecovery: Composio SDK verification failed for acc123: Network error.`);
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).toHaveBeenCalledWith('auditLog123', expect.objectContaining({ success: false, error: 'Network error.' }));
    });

    it('should handle actionAuditService.logStart failure gracefully', async () => {
      const connection = mockConnection('EXPIRED', 'acc123');
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({ status: 'ACTIVE' });
      actionAuditService.logStart.mockRejectedValue(new Error('Audit log failed')); // Simulate logStart failure

      const result = await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('OAuth connection verified and recovered.');
      expect(actionAuditService.logStart).toHaveBeenCalled();
      expect(actionAuditService.logComplete).not.toHaveBeenCalled(); // No auditLogId to complete
      expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('Audit log failed')); // Error is caught internally
    });

    it('should use authConfigId if toolkit.slug is not available for audit log', async () => {
      const connection = mockConnection('EXPIRED', 'acc123', null, 'ac_my_app'); // No toolkit slug
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({ status: 'ACTIVE' });

      await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(actionAuditService.logStart).toHaveBeenCalledWith(expect.objectContaining({
        app: 'my_app',
      }));
    });

    it('should use "unknown_app" if neither toolkit.slug nor authConfigId is available for audit log', async () => {
      const connection = mockConnection('EXPIRED', 'acc123', null, null); // No toolkit slug or authConfigId
      ComposioAuth.findOne.mockResolvedValue(connection);
      mockGetConnectedAccount.mockResolvedValue({ status: 'ACTIVE' });

      await connectionRecoveryService.attemptAutoRecovery(connectionId, userId);

      expect(actionAuditService.logStart).toHaveBeenCalledWith(expect.objectContaining({
        app: 'unknown_app',
      }));
    });
  });

  describe('runHeartbeatRecovery', () => {
    const userId = 'user123';

    it('should return success with 0 recoveredCount if no warning connections are found', async () => {
      ComposioAuth.find.mockResolvedValue([]);

      const result = await connectionRecoveryService.runHeartbeatRecovery(userId);

      expect(result).toEqual({ success: true, message: 'All connected integrations are healthy.', recoveredCount: 0 });
      expect(ComposioAuth.find).toHaveBeenCalledWith({
        userId,
        status: { $in: ['EXPIRED', 'FAILED', 'PENDING'] },
      });
      expect(logger.error).not.toHaveBeenCalled();
      expect(connectionRecoveryService.attemptAutoRecovery).not.toHaveBeenCalled();
    });

    it('should trigger recovery for each warning connection and return the count', async () => {
      const mockConnections = [
        { _id: 'conn1', userId, status: 'EXPIRED', connectedAccountId: 'acc1' },
        { _id: 'conn2', userId, status: 'FAILED', connectedAccountId: 'acc2' },
        { _id: 'conn3', userId, status: 'PENDING', connectedAccountId: 'acc3' },
      ];
      ComposioAuth.find.mockResolvedValue(mockConnections);

      // Spy on attemptAutoRecovery to check if it's called
      const attemptAutoRecoverySpy = vi.spyOn(connectionRecoveryService, 'attemptAutoRecovery');
      attemptAutoRecoverySpy.mockResolvedValue({ success: true }); // Mock its return for the heartbeat

      const result = await connectionRecoveryService.runHeartbeatRecovery(userId);

      expect(result).toEqual({
        success: true,
        message: `Heartbeat triggered recovery cycles for ${mockConnections.length} expired/failed connection(s).`,
        recoveredCount: mockConnections.length,
      });
      expect(ComposioAuth.find).toHaveBeenCalledWith({
        userId,
        status: { $in: ['EXPIRED', 'FAILED', 'PENDING'] },
      });
      expect(attemptAutoRecoverySpy).toHaveBeenCalledTimes(mockConnections.length);
      expect(attemptAutoRecoverySpy).toHaveBeenCalledWith('conn1', userId);
      expect(attemptAutoRecoverySpy).toHaveBeenCalledWith('conn2', userId);
      expect(attemptAutoRecoverySpy).toHaveBeenCalledWith('conn3', userId);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should handle errors from attemptAutoRecovery gracefully (fire-and-forget)', async () => {
      const mockConnections = [
        { _id: 'conn1', userId, status: 'EXPIRED', connectedAccountId: 'acc1' },
        { _id: 'conn2', userId, status: 'FAILED', connectedAccountId: 'acc2' },
      ];
      ComposioAuth.find.mockResolvedValue(mockConnections);

      const attemptAutoRecoverySpy = vi.spyOn(connectionRecoveryService, 'attemptAutoRecovery');
      attemptAutoRecoverySpy.mockImplementation(async (connId, uId) => {
        if (connId === 'conn1') {
          return { success: true };
        } else {
          throw new Error('Recovery failed for conn2'); // Simulate failure
        }
      });

      const result = await connectionRecoveryService.runHeartbeatRecovery(userId);

      expect(result).toEqual({
        success: true, // Heartbeat itself still succeeds even if individual recoveries fail
        message: `Heartbeat triggered recovery cycles for ${mockConnections.length} expired/failed connection(s).`,
        recoveredCount: mockConnections.length,
      });
      expect(attemptAutoRecoverySpy).toHaveBeenCalledTimes(mockConnections.length);
      // The error from attemptAutoRecovery for conn2 should be caught internally by the .catch(() => {})
      // So logger.error from runHeartbeatRecovery should not be called for this.
      expect(logger.error).not.toHaveBeenCalledWith(expect.stringContaining('Recovery failed for conn2'));
    });

    it('should throw an error if ComposioAuth.find fails', async () => {
      const findError = new Error('Database query failed');
      ComposioAuth.find.mockRejectedValue(findError);

      await expect(connectionRecoveryService.runHeartbeatRecovery(userId)).rejects.toThrow(findError);
      expect(ComposioAuth.find).toHaveBeenCalledWith({
        userId,
        status: { $in: ['EXPIRED', 'FAILED', 'PENDING'] },
      });
      expect(logger.error).toHaveBeenCalledWith('ConnectionRecovery heartbeat failed:', findError);
      expect(connectionRecoveryService.attemptAutoRecovery).not.toHaveBeenCalled();
    });
  });
});