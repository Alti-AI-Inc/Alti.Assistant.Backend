import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { connectionHealthService } from '../connectionHealth.service.js';

// Mock external dependencies
const mockComposio = {
  connectedAccounts: {
    get: vi.fn(),
    initiate: vi.fn(),
  },
};

vi.mock('@composio/core', () => ({
  Composio: vi.fn(() => mockComposio),
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    composio: {
      orgApiKey: 'mock-api-key',
    },
  },
}));

const mockComposioAuth = {
  find: vi.fn(),
  findOne: vi.fn(),
  updateOne: vi.fn(),
};

vi.mock('../../composio_v2/composio.model.js', () => ({
  default: mockComposioAuth,
}));

const mockAuthConfig = {
  find: vi.fn(),
  findOne: vi.fn(),
};

vi.mock('../../composio_v2/authConfig.model.js', () => ({
  default: mockAuthConfig,
}));

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
};

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Constants from the service file for consistent testing
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

describe('ConnectionHealthService', () => {
  const MOCK_NOW = new Date('2023-10-26T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(MOCK_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkConnectionHealth', () => {
    it('should return no connections if ComposioAuth.find returns empty', async () => {
      const userId = 'user123';
      mockComposioAuth.find.mockResolvedValueOnce([]);

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(mockComposioAuth.find).toHaveBeenCalledWith({ userId });
      expect(mockAuthConfig.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        userId,
        totalConnections: 0,
        healthy: [],
        stale: [],
        expired: [],
        errors: [],
        summary: 'No connections found for this user.',
        checkedAt: MOCK_NOW.toISOString(),
      });
      expect(mockLogger.info).toHaveBeenCalledWith(`ConnectionHealth: checking health for user ${userId}`);
    });

    it('should handle an error during ComposioAuth.find', async () => {
      const userId = 'user123';
      const errorMessage = 'DB error during find';
      mockComposioAuth.find.mockRejectedValueOnce(new Error(errorMessage));

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(mockComposioAuth.find).toHaveBeenCalledWith({ userId });
      expect(result).toEqual({
        success: false,
        userId,
        error: errorMessage,
        totalConnections: 0,
        healthy: [],
        stale: [],
        expired: [],
        errors: [{ error: errorMessage }],
        summary: `Health check failed: ${errorMessage}`,
        checkedAt: MOCK_NOW.toISOString(),
      });
      expect(mockLogger.error).toHaveBeenCalledWith('ConnectionHealth: error checking health:', expect.any(Error));
    });

    it('should correctly categorize healthy connections', async () => {
      const userId = 'user123';
      const connection1 = {
        _id: 'conn1',
        userId,
        connectedAccountId: 'acc1',
        authConfigId: 'ac1',
        status: 'active',
        toolkit: { slug: 'app1' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day old
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const authConfig1 = { authConfigId: 'ac1', app: 'App One' };

      mockComposioAuth.find.mockResolvedValueOnce([connection1]);
      mockAuthConfig.find.mockResolvedValueOnce([authConfig1]);
      mockComposio.connectedAccounts.get.mockResolvedValueOnce({ status: 'ACTIVE' });

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(mockComposioAuth.find).toHaveBeenCalledWith({ userId });
      expect(mockAuthConfig.find).toHaveBeenCalledWith({ authConfigId: { $in: ['ac1'] } });
      expect(mockComposio.connectedAccounts.get).toHaveBeenCalledWith('acc1');

      expect(result.success).toBe(true);
      expect(result.totalConnections).toBe(1);
      expect(result.healthy).toHaveLength(1);
      expect(result.stale).toHaveLength(0);
      expect(result.expired).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(result.healthy[0]).toMatchObject({
        connectedAccountId: 'acc1',
        authConfigId: 'ac1',
        status: 'healthy',
        app: 'app1',
        localStatus: 'active',
        details: { remoteStatus: 'ACTIVE' },
      });
      expect(result.summary).toBe('1 healthy (app1)');
    });

    it('should correctly categorize stale connections (age, pending, API error, unexpected remote status)', async () => {
      const userId = 'user123';
      const connection1 = { // Stale by age
        _id: 'conn1',
        userId,
        connectedAccountId: 'acc1',
        authConfigId: 'ac1',
        status: 'active',
        toolkit: { slug: 'app1' },
        createdAt: new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS - 1000).toISOString(), // Older than threshold
        updatedAt: new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS - 1000).toISOString(),
      };
      const connection2 = { // Stale by pending status
        _id: 'conn2',
        userId,
        connectedAccountId: 'acc2',
        authConfigId: 'ac2',
        status: 'pending',
        toolkit: { slug: 'app2' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const connection3 = { // Stale by API error
        _id: 'conn3',
        userId,
        connectedAccountId: 'acc3',
        authConfigId: 'ac3',
        status: 'active',
        toolkit: { slug: 'app3' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const connection4 = { // Stale by unexpected remote status
        _id: 'conn4',
        userId,
        connectedAccountId: 'acc4',
        authConfigId: 'ac4',
        status: 'active',
        toolkit: { slug: 'app4' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const authConfig1 = { authConfigId: 'ac1', app: 'App One' };
      const authConfig2 = { authConfigId: 'ac2', app: 'App Two' };
      const authConfig3 = { authConfigId: 'ac3', app: 'App Three' };
      const authConfig4 = { authConfigId: 'ac4', app: 'App Four' };

      mockComposioAuth.find.mockResolvedValueOnce([connection1, connection2, connection3, connection4]);
      mockAuthConfig.find.mockResolvedValueOnce([authConfig1, authConfig2, authConfig3, authConfig4]);
      mockComposio.connectedAccounts.get
        .mockRejectedValueOnce(new Error('API Down')) // For connection3
        .mockResolvedValueOnce({ status: 'UNKNOWN_STATUS' }); // For connection4

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(result.success).toBe(true);
      expect(result.totalConnections).toBe(4);
      expect(result.healthy).toHaveLength(0);
      expect(result.stale).toHaveLength(4);
      expect(result.expired).toHaveLength(0);
      expect(result.errors).toHaveLength(0);

      expect(result.stale[0]).toMatchObject({
        connectedAccountId: 'acc1',
        status: 'stale',
        app: 'app1',
        details: { reason: expect.stringContaining('not been refreshed') },
      });
      expect(result.stale[1]).toMatchObject({
        connectedAccountId: 'acc2',
        status: 'stale',
        app: 'app2',
        details: { reason: 'Connection was initiated but never completed.' },
      });
      expect(result.stale[2]).toMatchObject({
        connectedAccountId: 'acc3',
        status: 'stale',
        app: 'app3',
        details: { reason: 'Could not verify with Composio API: API Down' },
      });
      expect(result.stale[3]).toMatchObject({
        connectedAccountId: 'acc4',
        status: 'stale',
        app: 'app4',
        details: { remoteStatus: 'UNKNOWN_STATUS', reason: 'Unexpected remote status: UNKNOWN_STATUS' },
      });
      expect(result.summary).toBe('4 stale (app1, app2, app3, app4)');
    });

    it('should correctly categorize expired connections (local status, remote status, not found)', async () => {
      const userId = 'user123';
      const connection1 = { // Expired by local status
        _id: 'conn1',
        userId,
        connectedAccountId: 'acc1',
        authConfigId: 'ac1',
        status: 'failed',
        toolkit: { slug: 'app1' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const connection2 = { // Expired by remote status
        _id: 'conn2',
        userId,
        connectedAccountId: 'acc2',
        authConfigId: 'ac2',
        status: 'active',
        toolkit: { slug: 'app2' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const connection3 = { // Expired by remote not found
        _id: 'conn3',
        userId,
        connectedAccountId: 'acc3',
        authConfigId: 'ac3',
        status: 'active',
        toolkit: { slug: 'app3' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const authConfig1 = { authConfigId: 'ac1', app: 'App One' };
      const authConfig2 = { authConfigId: 'ac2', app: 'App Two' };
      const authConfig3 = { authConfigId: 'ac3', app: 'App Three' };

      mockComposioAuth.find.mockResolvedValueOnce([connection1, connection2, connection3]);
      mockAuthConfig.find.mockResolvedValueOnce([authConfig1, authConfig2, authConfig3]);
      mockComposio.connectedAccounts.get
        .mockResolvedValueOnce({ status: 'EXPIRED' }) // For connection2
        .mockResolvedValueOnce(null); // For connection3

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(result.success).toBe(true);
      expect(result.totalConnections).toBe(3);
      expect(result.healthy).toHaveLength(0);
      expect(result.stale).toHaveLength(0);
      expect(result.expired).toHaveLength(3);
      expect(result.errors).toHaveLength(0);

      expect(result.expired[0]).toMatchObject({
        connectedAccountId: 'acc1',
        status: 'expired',
        app: 'app1',
        details: { reason: 'Local status is "failed"' },
      });
      expect(result.expired[1]).toMatchObject({
        connectedAccountId: 'acc2',
        status: 'expired',
        app: 'app2',
        details: { remoteStatus: 'EXPIRED', reason: 'OAuth token has expired on Composio.' },
      });
      expect(result.expired[2]).toMatchObject({
        connectedAccountId: 'acc3',
        status: 'expired',
        app: 'app3',
        details: { reason: 'Connected account not found on Composio servers.' },
      });
      expect(result.summary).toBe('3 expired (app1, app2, app3)');
    });

    it('should handle a mix of connection statuses and build correct summary', async () => {
      const userId = 'user123';
      const healthyConn = {
        _id: 'connH', userId, connectedAccountId: 'accH', authConfigId: 'acH', status: 'active', toolkit: { slug: 'healthyApp' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const staleConn = {
        _id: 'connS', userId, connectedAccountId: 'accS', authConfigId: 'acS', status: 'active', toolkit: { slug: 'staleApp' },
        createdAt: new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS - 1000).toISOString(), updatedAt: new Date(MOCK_NOW.getTime() - STALE_THRESHOLD_MS - 1000).toISOString(),
      };
      const expiredConn = {
        _id: 'connE', userId, connectedAccountId: 'accE', authConfigId: 'acE', status: 'failed', toolkit: { slug: 'expiredApp' },
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(), updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const errorConn = { // This connection will cause an internal error in _checkSingleConnection due to invalid date
        _id: 'connErr', userId, connectedAccountId: 'accErr', authConfigId: 'acErr', status: 'active', toolkit: { slug: 'errorApp' },
        createdAt: 'invalid-date',
        updatedAt: 'invalid-date',
      };

      const authConfigH = { authConfigId: 'acH', app: 'Healthy App' };
      const authConfigS = { authConfigId: 'acS', app: 'Stale App' };
      const authConfigE = { authConfigId: 'acE', app: 'Expired App' };
      const authConfigErr = { authConfigId: 'acErr', app: 'Error App' };

      mockComposioAuth.find.mockResolvedValueOnce([healthyConn, staleConn, expiredConn, errorConn]);
      mockAuthConfig.find.mockResolvedValueOnce([authConfigH, authConfigS, authConfigE, authConfigErr]);
      mockComposio.connectedAccounts.get.mockResolvedValueOnce({ status: 'ACTIVE' }); // For healthyConn

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(result.success).toBe(true);
      expect(result.totalConnections).toBe(4);
      expect(result.healthy).toHaveLength(1);
      expect(result.stale).toHaveLength(1);
      expect(result.expired).toHaveLength(1);
      expect(result.errors).toHaveLength(1);

      expect(result.healthy[0].app).toBe('healthyApp');
      expect(result.stale[0].app).toBe('staleApp');
      expect(result.expired[0].app).toBe('expiredApp');
      expect(result.errors[0].app).toBe('errorApp');
      expect(result.errors[0].details.error).toContain('Invalid Date');

      expect(result.summary).toBe('1 healthy (healthyApp) | 1 stale (staleApp) | 1 expired (expiredApp) | 1 errors');
    });

    it('should use authConfig.app if toolkit.slug is unknown', async () => {
      const userId = 'user123';
      const connection = {
        _id: 'conn1',
        userId,
        connectedAccountId: 'acc1',
        authConfigId: 'ac1',
        status: 'active',
        toolkit: { slug: 'unknown' }, // Simulate unknown slug
        createdAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(MOCK_NOW.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      };
      const authConfig = { authConfigId: 'ac1', app: 'Resolved App Name' };

      mockComposioAuth.find.mockResolvedValueOnce([connection]);
      mockAuthConfig.find.mockResolvedValueOnce([authConfig]);
      mockComposio.connectedAccounts.get.mockResolvedValueOnce({ status: 'ACTIVE' });

      const result = await connectionHealthService.checkConnectionHealth(userId);

      expect(result.healthy[0].app).toBe('Resolved App Name');
      expect(result.summary).toBe('1 healthy (Resolved App Name)');
    });
  });

  describe('refreshStaleConnection', () => {
    it('should successfully initiate re-authentication for a stale connection', async () => {
      const userId = 'user123';
      const appName = 'Slack';
      const authConfig = { authConfigId: 'ac1', app: 'Slack' };
      const existingConnection = {
        _id: 'conn1',
        userId,
        authConfigId: 'ac1',
        connectedAccountId: 'old-acc-id',
        status: 'stale',
      };
      const newConnectionUrl = {
        id: 'new-acc-id',
        integrationId: 'new-int-id',
        redirectUrl: 'https://composio.dev/oauth/new',
      };

      mockAuthConfig.findOne.mockResolvedValueOnce(authConfig);
      mockComposioAuth.findOne.mockResolvedValueOnce(existingConnection);
      mockComposio.connectedAccounts.initiate.mockResolvedValueOnce(newConnectionUrl);
      mockComposioAuth.updateOne.mockResolvedValueOnce({ nModified: 1 });

      const result = await connectionHealthService.refreshStaleConnection(userId, appName);

      expect(mockAuthConfig.findOne).toHaveBeenCalledWith({ app: { $regex: new RegExp(appName, 'i') } });
      expect(mockComposioAuth.findOne).toHaveBeenCalledWith({ userId, authConfigId: authConfig.authConfigId });
      expect(mockComposio.connectedAccounts.initiate).toHaveBeenCalledWith(userId, authConfig.authConfigId);
      expect(mockComposioAuth.updateOne).toHaveBeenCalledWith(
        { _id: existingConnection._id },
        {
          $set: {
            connectedAccountId: newConnectionUrl.id,
            integrationId: newConnectionUrl.integrationId,
            redirectUrl: newConnectionUrl.redirectUrl,
            status: 'PENDING',
          },
        }
      );

      expect(result).toEqual({
        success: true,
        app: appName,
        message: `Re-authentication initiated for ${appName}. User must complete the OAuth flow.`,
        redirectUrl: newConnectionUrl.redirectUrl,
        newConnectedAccountId: newConnectionUrl.id,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(`ConnectionHealth: refreshing ${appName} for user ${userId}`);
    });

    it('should return error if auth config not found', async () => {
      const userId = 'user123';
      const appName = 'UnknownApp';
      mockAuthConfig.findOne.mockResolvedValueOnce(null);

      const result = await connectionHealthService.refreshStaleConnection(userId, appName);

      expect(mockAuthConfig.findOne).toHaveBeenCalledWith({ app: { $regex: new RegExp(appName, 'i') } });
      expect(mockComposioAuth.findOne).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: `App "${appName}" not found in auth configurations.`,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(`ConnectionHealth: refreshing ${appName} for user ${userId}`);
    });

    it('should return error if no existing connection found', async () => {
      const userId = 'user123';
      const appName = 'Slack';
      const authConfig = { authConfigId: 'ac1', app: 'Slack' };
      mockAuthConfig.findOne.mockResolvedValueOnce(authConfig);
      mockComposioAuth.findOne.mockResolvedValueOnce(null);

      const result = await connectionHealthService.refreshStaleConnection(userId, appName);

      expect(mockAuthConfig.findOne).toHaveBeenCalledWith({ app: { $regex: new RegExp(appName, 'i') } });
      expect(mockComposioAuth.findOne).toHaveBeenCalledWith({ userId, authConfigId: authConfig.authConfigId });
      expect(mockComposio.connectedAccounts.initiate).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: `No existing connection found for ${appName}.`,
      });
    });

    it('should handle errors during composio.connectedAccounts.initiate', async () => {
      const userId = 'user123';
      const appName = 'Slack';
      const authConfig = { authConfigId: 'ac1', app: 'Slack' };
      const existingConnection = {
        _id: 'conn1',
        userId,
        authConfigId: 'ac1',
        connectedAccountId: 'old-acc-id',
        status: 'stale',
      };
      const errorMessage = 'Composio API error';

      mockAuthConfig.findOne.mockResolvedValueOnce(authConfig);
      mockComposioAuth.findOne.mockResolvedValueOnce(existingConnection);
      mockComposio.connectedAccounts.initiate.mockRejectedValueOnce(new Error(errorMessage));

      const result = await connectionHealthService.refreshStaleConnection(userId, appName);

      expect(mockComposio.connectedAccounts.initiate).toHaveBeenCalledWith(userId, authConfig.authConfigId);
      expect(mockComposioAuth.updateOne).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
      expect(mockLogger.error).toHaveBeenCalledWith(`ConnectionHealth: refresh error for ${appName}:`, expect.any(Error));
    });

    it('should handle errors during ComposioAuth.updateOne', async () => {
      const userId = 'user123';
      const appName = 'Slack';
      const authConfig = { authConfigId: 'ac1', app: 'Slack' };
      const existingConnection = {
        _id: 'conn1',
        userId,
        authConfigId: 'ac1',
        connectedAccountId: 'old-acc-id',
        status: 'stale',
      };
      const newConnectionUrl = {
        id: 'new-acc-id',
        integrationId: 'new-int-id',
        redirectUrl: 'https://composio.dev/oauth/new',
      };
      const errorMessage = 'DB update error';

      mockAuthConfig.findOne.mockResolvedValueOnce(authConfig);
      mockComposioAuth.findOne.mockResolvedValueOnce(existingConnection);
      mockComposio.connectedAccounts.initiate.mockResolvedValueOnce(newConnectionUrl);
      mockComposioAuth.updateOne.mockRejectedValueOnce(new Error(errorMessage));

      const result = await connectionHealthService.refreshStaleConnection(userId, appName);

      expect(mockComposioAuth.updateOne).toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        error: errorMessage,
      });
      expect(mockLogger.error).toHaveBeenCalledWith(`ConnectionHealth: refresh error for ${appName}:`, expect.any(Error));
    });
  });

  describe('_buildSummary', () => {
    // Access the private method via the service instance's constructor prototype
    const serviceInstance = new connectionHealthService.constructor();

    it('should build a correct summary string for all statuses', () => {
      const healthy = [{ app: 'App1' }];
      const stale = [{ app: 'App2' }, { app: 'App3' }];
      const expired = [{ app: 'App4' }];
      const errors = [{ app: 'App5' }];

      const summary = serviceInstance._buildSummary(healthy, stale, expired, errors);
      expect(summary).toBe('1 healthy (App1) | 2 stale (App2, App3) | 1 expired (App4) | 1 errors');
    });

    it('should handle empty arrays correctly', () => {
      const summary = serviceInstance._buildSummary([], [], [], []);
      expect(summary).toBe('No connections found.');
    });

    it('should handle partial arrays correctly', () => {
      const healthy = [{ app: 'App1' }];
      const stale = [{ app: 'App2' }];
      const summary = serviceInstance._buildSummary(healthy, stale, [], []);
      expect(summary).toBe('1 healthy (App1) | 1 stale (App2)');
    });

    it('should handle only errors correctly', () => {
      const errors = [{ app: 'App5' }];
      const summary = serviceInstance._buildSummary([], [], [], errors);
      expect(summary).toBe('1 errors');
    });
  });
});