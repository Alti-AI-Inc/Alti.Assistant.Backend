import { describe, it, expect, vi, beforeEach } from 'vitest';
import { composioIntegrationService } from './composioIntegration.service.js';

// Mock external dependencies
// 1. Mock Composio SDK
const mockComposioInstance = {
  getTools: vi.fn(),
  connectedAccounts: {
    initiate: vi.fn(),
  },
};
vi.mock('@composio/core', () => ({
  Composio: vi.fn(() => mockComposioInstance),
}));

// 2. Mock config
vi.mock('../../../../../config/index.js', () => ({
  default: {
    composio: {
      orgApiKey: 'test-api-key',
    },
  },
}));

// 3. Mock Mongoose Models
// Helper to create chainable mock for .find().lean() or .findOne().lean()
const createLeanMock = (data) => ({
  lean: vi.fn().mockResolvedValue(data),
});

// Mock ComposioAuth Model
const ComposioAuthMock = vi.fn().mockImplementation((data) => {
  return {
    ...data,
    save: vi.fn().mockResolvedValue(data), // Mock save method on instance
  };
});
ComposioAuthMock.find = vi.fn((query) => createLeanMock([])); // Default to empty array
ComposioAuthMock.findOne = vi.fn((query) => createLeanMock(null)); // Default to null
vi.mock('../../composio_v2/composio.model.js', () => ({
  default: ComposioAuthMock,
}));

// Mock AuthConfig Model
const AuthConfigMock = {
  find: vi.fn((query) => createLeanMock([])), // Default to empty array
  findOne: vi.fn((query) => createLeanMock(null)), // Default to null
};
vi.mock('../../composio_v2/authConfig.model.js', () => ({
  default: AuthConfigMock,
}));

// Mock Tool Model
const ToolMock = {
  find: vi.fn((query) => ({
    limit: vi.fn(() => createLeanMock([])), // Default to empty array
    lean: vi.fn(() => createLeanMock([])), // For cases without limit
  })),
  distinct: vi.fn().mockResolvedValue([]), // Default to empty array
};
vi.mock('../../composio_v2/tools.model.js', () => ({
  default: ToolMock,
}));

// 4. Mock Logger
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
};
vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

describe('ComposioIntegrationService', () => {
  const userId = 'testUserId123';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Reset default mock implementations for models
    ComposioAuthMock.find.mockImplementation((query) => createLeanMock([]));
    ComposioAuthMock.findOne.mockImplementation((query) => createLeanMock(null));
    AuthConfigMock.find.mockImplementation((query) => createLeanMock([]));
    AuthConfigMock.findOne.mockImplementation((query) => createLeanMock(null));
    ToolMock.find.mockImplementation((query) => ({
      limit: vi.fn(() => createLeanMock([])),
      lean: vi.fn(() => createLeanMock([])),
    }));
    ToolMock.distinct.mockResolvedValue([]);
    mockComposioInstance.getTools.mockResolvedValue([]);
    mockComposioInstance.connectedAccounts.initiate.mockResolvedValue({});
    ComposioAuthMock.mockImplementation((data) => ({
      ...data,
      save: vi.fn().mockResolvedValue(data),
    }));
  });

  describe('getUserAvailableApps', () => {
    it('should return available apps with connection status for a user', async () => {
      const mockAuthConfigs = [
        { app: 'Google Drive', authConfigId: 'gd_config_1' },
        { app: 'Slack', authConfigId: 'slack_config_1' },
        { app: 'Jira', authConfigId: 'jira_config_1' },
      ];
      const mockUserConnections = [
        {
          userId,
          authConfigId: 'gd_config_1',
          connectedAccountId: 'gd_acc_1',
          status: 'active',
          integrationId: 'gd_int_1',
        },
        {
          userId,
          authConfigId: 'slack_config_1',
          connectedAccountId: 'slack_acc_1',
          status: 'pending',
          integrationId: 'slack_int_1',
        },
      ];

      AuthConfigMock.find.mockImplementation(() => createLeanMock(mockAuthConfigs));
      ComposioAuthMock.find.mockImplementation(() => createLeanMock(mockUserConnections));

      const result = await composioIntegrationService.getUserAvailableApps(userId);

      expect(result.success).toBe(true);
      expect(result.apps).toHaveLength(3);
      expect(result.connectedApps).toHaveLength(1);
      expect(result.availableForConnection).toHaveLength(2);

      expect(result.apps).toEqual(
        expect.arrayContaining([
          {
            app: 'Google Drive',
            authConfigId: 'gd_config_1',
            isConnected: true,
            connectionStatus: 'active',
            connectedAccountId: 'gd_acc_1',
            integrationId: 'gd_int_1',
          },
          {
            app: 'Slack',
            authConfigId: 'slack_config_1',
            isConnected: false,
            connectionStatus: 'pending',
            connectedAccountId: 'slack_acc_1',
            integrationId: 'slack_int_1',
          },
          {
            app: 'Jira',
            authConfigId: 'jira_config_1',
            isConnected: false,
            connectionStatus: 'not_connected',
            connectedAccountId: undefined,
            integrationId: undefined,
          },
        ])
      );
      expect(AuthConfigMock.find).toHaveBeenCalledWith({});
      expect(ComposioAuthMock.find).toHaveBeenCalledWith({ userId });
      expect(mockLogger.info).toHaveBeenCalledWith(`Getting available apps for user ${userId}`);
    });

    it('should return empty arrays if no auth configs or user connections exist', async () => {
      AuthConfigMock.find.mockImplementation(() => createLeanMock([]));
      ComposioAuthMock.find.mockImplementation(() => createLeanMock([]));

      const result = await composioIntegrationService.getUserAvailableApps(userId);

      expect(result.success).toBe(true);
      expect(result.apps).toEqual([]);
      expect(result.connectedApps).toEqual([]);
      expect(result.availableForConnection).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const errorMessage = 'Database error';
      AuthConfigMock.find.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await composioIntegrationService.getUserAvailableApps(userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.apps).toEqual([]);
      expect(result.connectedApps).toEqual([]);
      expect(result.availableForConnection).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting user available apps:', expect.any(Error));
    });
  });

  describe('getUserAvailableTools', () => {
    const mockUserAppsResult = {
      success: true,
      apps: [
        { app: 'Google Drive', authConfigId: 'gd_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'gd_acc_1', integrationId: 'gd_int_1' },
        { app: 'Slack', authConfigId: 'slack_config_1', isConnected: false, connectionStatus: 'not_connected' },
        { app: 'Jira', authConfigId: 'jira_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'jira_acc_1', integrationId: 'jira_int_1' },
      ],
      connectedApps: [
        { app: 'Google Drive', authConfigId: 'gd_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'gd_acc_1', integrationId: 'gd_int_1' },
        { app: 'Jira', authConfigId: 'jira_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'jira_acc_1', integrationId: 'jira_int_1' },
      ],
      availableForConnection: [
        { app: 'Slack', authConfigId: 'slack_config_1', isConnected: false, connectionStatus: 'not_connected' },
      ],
    };

    beforeEach(() => {
      // Mock getUserAvailableApps for this suite
      vi.spyOn(composioIntegrationService, 'getUserAvailableApps').mockResolvedValue(mockUserAppsResult);
    });

    it('should return tools for all connected apps and local tools', async () => {
      mockComposioInstance.getTools
        .mockResolvedValueOnce([
          { name: 'Create Document', description: 'Creates a new document', parameters: { title: { name: 'title', type: 'string' } }, slug: 'create_doc' },
        ])
        .mockResolvedValueOnce([
          { name: 'Create Issue', description: 'Creates a new Jira issue', parameters: { summary: { name: 'summary', type: 'string' } }, slug: 'create_issue' },
        ]);

      const mockLocalTools = [
        { name: 'Local Tool 1', description: 'Desc 1', slug: 'local_tool_1', appName: 'Google Drive' },
        { name: 'Local Tool 2', description: 'Desc 2', slug: 'local_tool_2', appName: 'Slack' },
      ];
      ToolMock.find.mockImplementation(() => ({
        limit: vi.fn(() => createLeanMock(mockLocalTools)),
      }));

      const result = await composioIntegrationService.getUserAvailableTools(userId);

      expect(result.success).toBe(true);
      expect(result.toolsByApp).toEqual({
        'Google Drive': [{ name: 'Create Document', description: 'Creates a new document', app: 'Google Drive', parameters: { title: { name: 'title', type: 'string' } }, slug: 'create_doc' }],
        'Jira': [{ name: 'Create Issue', description: 'Creates a new Jira issue', app: 'Jira', parameters: { summary: { name: 'summary', type: 'string' } }, slug: 'create_issue' }],
      });
      expect(result.connectedApps).toEqual(['Google Drive', 'Jira']);
      expect(result.localTools).toEqual([
        { name: 'Local Tool 1', description: 'Desc 1', slug: 'local_tool_1' },
        { name: 'Local Tool 2', description: 'Desc 2', slug: 'local_tool_2' },
      ]);
      expect(result.totalTools).toBe(2);
      expect(mockComposioInstance.getTools).toHaveBeenCalledTimes(2);
      expect(mockComposioInstance.getTools).toHaveBeenCalledWith({ apps: ['Google Drive'] }, userId);
      expect(mockComposioInstance.getTools).toHaveBeenCalledWith({ apps: ['Jira'] }, userId);
      expect(ToolMock.find).toHaveBeenCalledWith({});
      expect(mockLogger.info).toHaveBeenCalledWith(`Getting available tools for user ${userId}`, { appNames: null });
    });

    it('should filter tools by provided appNames', async () => {
      mockComposioInstance.getTools
        .mockResolvedValueOnce([
          { name: 'Create Document', description: 'Creates a new document', parameters: {}, slug: 'create_doc' },
        ]);

      const mockLocalTools = [
        { name: 'Local Tool 1', description: 'Desc 1', slug: 'local_tool_1', appName: 'Google Drive' },
      ];
      ToolMock.find.mockImplementation(() => ({
        limit: vi.fn(() => createLeanMock(mockLocalTools)),
      }));

      const result = await composioIntegrationService.getUserAvailableTools(userId, ['google drive']);

      expect(result.success).toBe(true);
      expect(result.toolsByApp).toEqual({
        'Google Drive': [{ name: 'Create Document', description: 'Creates a new document', app: 'Google Drive', parameters: {}, slug: 'create_doc' }],
      });
      expect(result.connectedApps).toEqual(['Google Drive']);
      expect(result.localTools).toEqual([
        { name: 'Local Tool 1', description: 'Desc 1', slug: 'local_tool_1' },
      ]);
      expect(result.totalTools).toBe(1);
      expect(mockComposioInstance.getTools).toHaveBeenCalledTimes(1);
      expect(mockComposioInstance.getTools).toHaveBeenCalledWith({ apps: ['Google Drive'] }, userId);
      expect(ToolMock.find).toHaveBeenCalledWith({ appName: { $in: ['google drive'] } });
      expect(mockLogger.info).toHaveBeenCalledWith(`Getting available tools for user ${userId}`, { appNames: ['google drive'] });
    });

    it('should handle errors from getUserAvailableApps', async () => {
      composioIntegrationService.getUserAvailableApps.mockResolvedValueOnce({ success: false, error: 'User apps error' });

      const result = await composioIntegrationService.getUserAvailableTools(userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User apps error');
      expect(result.toolsByApp).toEqual({});
      expect(result.connectedApps).toEqual([]);
      expect(result.localTools).toEqual([]);
      expect(result.totalTools).toBe(0);
      expect(mockComposioInstance.getTools).not.toHaveBeenCalled();
      expect(ToolMock.find).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting user available tools:', expect.any(Error));
    });

    it('should handle errors from composio.getTools gracefully', async () => {
      mockComposioInstance.getTools
        .mockRejectedValueOnce(new Error('Composio API error'))
        .mockResolvedValueOnce([
          { name: 'Create Issue', description: 'Creates a new Jira issue', parameters: {}, slug: 'create_issue' },
        ]);

      const mockLocalTools = [
        { name: 'Local Tool 1', description: 'Desc 1', slug: 'local_tool_1', appName: 'Google Drive' },
      ];
      ToolMock.find.mockImplementation(() => ({
        limit: vi.fn(() => createLeanMock(mockLocalTools)),
      }));

      const result = await composioIntegrationService.getUserAvailableTools(userId);

      expect(result.success).toBe(true);
      expect(result.toolsByApp).toEqual({
        'Google Drive': [], // Tools for Google Drive failed
        'Jira': [{ name: 'Create Issue', description: 'Creates a new Jira issue', app: 'Jira', parameters: {}, slug: 'create_issue' }],
      });
      expect(result.connectedApps).toEqual(['Google Drive', 'Jira']);
      expect(result.localTools).toEqual([
        { name: 'Local Tool 1', description: 'Desc 1', slug: 'local_tool_1' },
      ]);
      expect(result.totalTools).toBe(1);
      expect(mockLogger.warn).toHaveBeenCalledWith('Error getting tools for app Google Drive:', expect.any(Error));
      expect(mockLogger.error).not.toHaveBeenCalledWith('Error getting user available tools:', expect.any(Error)); // Overall success
    });

    it('should handle errors from local Tool.find', async () => {
      mockComposioInstance.getTools
        .mockResolvedValueOnce([
          { name: 'Create Document', description: 'Creates a new document', parameters: {}, slug: 'create_doc' },
        ])
        .mockResolvedValueOnce([
          { name: 'Create Issue', description: 'Creates a new Jira issue', parameters: {}, slug: 'create_issue' },
        ]);

      ToolMock.find.mockImplementation(() => {
        throw new Error('Local DB error');
      });

      const result = await composioIntegrationService.getUserAvailableTools(userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Local DB error');
      expect(result.toolsByApp).toEqual({});
      expect(result.connectedApps).toEqual([]);
      expect(result.localTools).toEqual([]);
      expect(result.totalTools).toBe(0);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting user available tools:', expect.any(Error));
    });

    it('should return empty tools if no connected apps', async () => {
      composioIntegrationService.getUserAvailableApps.mockResolvedValueOnce({
        success: true,
        apps: [],
        connectedApps: [],
        availableForConnection: [],
      });

      const result = await composioIntegrationService.getUserAvailableTools(userId);

      expect(result.success).toBe(true);
      expect(result.toolsByApp).toEqual({});
      expect(result.connectedApps).toEqual([]);
      expect(result.localTools).toEqual([]);
      expect(result.totalTools).toBe(0);
      expect(mockComposioInstance.getTools).not.toHaveBeenCalled();
    });
  });

  describe('checkAppConnections', () => {
    const mockUserAppsResult = {
      success: true,
      apps: [
        { app: 'Google Drive', authConfigId: 'gd_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'gd_acc_1' },
        { app: 'Slack', authConfigId: 'slack_config_1', isConnected: false, connectionStatus: 'not_connected' },
        { app: 'Jira', authConfigId: 'jira_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'jira_acc_1' },
        { app: 'Salesforce', authConfigId: 'sf_config_1', isConnected: false, connectionStatus: 'pending' },
      ],
      connectedApps: [
        { app: 'Google Drive', authConfigId: 'gd_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'gd_acc_1' },
        { app: 'Jira', authConfigId: 'jira_config_1', isConnected: true, connectionStatus: 'active', connectedAccountId: 'jira_acc_1' },
      ],
      availableForConnection: [
        { app: 'Slack', authConfigId: 'slack_config_1', isConnected: false, connectionStatus: 'not_connected' },
        { app: 'Salesforce', authConfigId: 'sf_config_1', isConnected: false, connectionStatus: 'pending' },
      ],
    };

    beforeEach(() => {
      vi.spyOn(composioIntegrationService, 'getUserAvailableApps').mockResolvedValue(mockUserAppsResult);
    });

    it('should return all apps connected if all required apps are connected', async () => {
      const requiredApps = ['Google Drive', 'Jira'];
      const result = await composioIntegrationService.checkAppConnections(userId, requiredApps);

      expect(result.success).toBe(true);
      expect(result.allConnected).toBe(true);
      expect(result.missingConnections).toEqual([]);
      expect(result.connectedApps).toEqual(['Google Drive', 'Jira']);
      expect(result.connectionStatus).toHaveLength(2);
      expect(result.connectionStatus).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ app: 'Google Drive', isConnected: true, status: 'active' }),
          expect.objectContaining({ app: 'Jira', isConnected: true, status: 'active' }),
        ])
      );
    });

    it('should return some apps missing if not all required apps are connected', async () => {
      const requiredApps = ['Google Drive', 'Slack', 'Salesforce'];
      const result = await composioIntegrationService.checkAppConnections(userId, requiredApps);

      expect(result.success).toBe(true);
      expect(result.allConnected).toBe(false);
      expect(result.missingConnections).toEqual(['Slack', 'Salesforce']);
      expect(result.connectedApps).toEqual(['Google Drive']);
      expect(result.connectionStatus).toHaveLength(3);
      expect(result.connectionStatus).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ app: 'Google Drive', isConnected: true, status: 'active' }),
          expect.objectContaining({ app: 'Slack', isConnected: false, status: 'not_connected' }),
          expect.objectContaining({ app: 'Salesforce', isConnected: false, status: 'pending' }),
        ])
      );
    });

    it('should treat platform apps as always connected', async () => {
      const requiredApps = ['Google Drive', 'chat', 'research', 'Slack'];
      const result = await composioIntegrationService.checkAppConnections(userId, requiredApps);

      expect(result.success).toBe(true);
      expect(result.allConnected).toBe(false); // Slack is not connected
      expect(result.missingConnections).toEqual(['Slack']);
      expect(result.connectedApps).toEqual(['Google Drive', 'chat', 'research']);
      expect(result.connectionStatus).toHaveLength(4);
      expect(result.connectionStatus).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ app: 'Google Drive', isConnected: true, status: 'active' }),
          expect.objectContaining({ app: 'chat', isConnected: true, status: 'active' }),
          expect.objectContaining({ app: 'research', isConnected: true, status: 'active' }),
          expect.objectContaining({ app: 'Slack', isConnected: false, status: 'not_connected' }),
        ])
      );
    });

    it('should handle empty requiredApps array', async () => {
      const requiredApps = [];
      const result = await composioIntegrationService.checkAppConnections(userId, requiredApps);

      expect(result.success).toBe(true);
      expect(result.allConnected).toBe(true);
      expect(result.missingConnections).toEqual([]);
      expect(result.connectedApps).toEqual([]);
      expect(result.connectionStatus).toEqual([]);
    });

    it('should handle errors from getUserAvailableApps', async () => {
      composioIntegrationService.getUserAvailableApps.mockResolvedValueOnce({ success: false, error: 'User apps error' });
      const requiredApps = ['Google Drive'];

      const result = await composioIntegrationService.checkAppConnections(userId, requiredApps);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User apps error');
      expect(result.allConnected).toBe(false);
      expect(result.connectionStatus).toEqual([]);
      expect(result.missingConnections).toEqual(requiredApps);
      expect(result.connectedApps).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Error checking app connections:', expect.any(Error));
    });
  });

  describe('getAvailableAppsForDetection', () => {
    it('should return a combined list of available apps from auth configs, local tools, and platform apps', async () => {
      const mockAuthConfigs = [
        { app: 'Google Drive', authConfigId: 'gd_config_1' },
        { app: 'Slack', authConfigId: 'slack_config_1' },
      ];
      const mockToolApps = ['Jira', 'Confluence'];

      AuthConfigMock.find.mockImplementation(() => createLeanMock(mockAuthConfigs));
      ToolMock.distinct.mockResolvedValue(mockToolApps);

      const result = await composioIntegrationService.getAvailableAppsForDetection();

      expect(result.success).toBe(true);
      expect(result.availableApps).toEqual(expect.arrayContaining([
        'google drive', 'slack', 'jira', 'confluence', 'chat', 'research', 'agents', 'data', 'apps', 'google_cloud', 'google_workspace'
      ]));
      expect(result.availableApps.length).toBeGreaterThanOrEqual(mockAuthConfigs.length + mockToolApps.length + 7); // 7 platform apps
      expect(result.authConfigApps).toEqual(['google drive', 'slack']);
      expect(result.toolApps).toEqual(['Jira', 'Confluence']);
      expect(AuthConfigMock.find).toHaveBeenCalledWith({});
      expect(ToolMock.distinct).toHaveBeenCalledWith('appName');
    });

    it('should handle empty auth configs and local tools', async () => {
      AuthConfigMock.find.mockImplementation(() => createLeanMock([]));
      ToolMock.distinct.mockResolvedValue([]);

      const result = await composioIntegrationService.getAvailableAppsForDetection();

      expect(result.success).toBe(true);
      expect(result.availableApps).toEqual(expect.arrayContaining([
        'chat', 'research', 'agents', 'data', 'apps', 'google_cloud', 'google_workspace'
      ]));
      expect(result.availableApps).toHaveLength(7); // Only platform apps
      expect(result.authConfigApps).toEqual([]);
      expect(result.toolApps).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      const errorMessage = 'DB error';
      AuthConfigMock.find.mockImplementation(() => {
        throw new Error(errorMessage);
      });

      const result = await composioIntegrationService.getAvailableAppsForDetection();

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(result.availableApps).toEqual([]);
      expect(result.authConfigApps).toEqual([]);
      expect(result.toolApps).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith('Error getting available apps for detection:', expect.any(Error));
    });
  });

  describe('validateDetectedApps', () => {
    const mockAvailableAppsResult = {
      success: true,
      availableApps: ['google drive', 'slack', 'jira', 'chat', 'research'],
      authConfigApps: ['google drive', 'slack', 'jira'],
      toolApps: [],
    };

    beforeEach(() => {
      vi.spyOn(composioIntegrationService, 'getAvailableAppsForDetection').mockResolvedValue(mockAvailableAppsResult);
      vi.spyOn(composioIntegrationService, 'checkAppConnections').mockResolvedValue({
        success: true,
        allConnected: true,
        connectionStatus: [
          { app: 'Google Drive', isConnected: true, status: 'active' },
          { app: 'Jira', isConnected: true, status: 'active' },
          { app: 'Chat', isConnected: true, status: 'active' },
        ],
        missingConnections: [],
        connectedApps: ['Google Drive', 'Jira', 'Chat'],
      });
    });

    it('should validate detected apps and check connections if userId is provided', async () => {
      const detectedApps = ['Google Drive', 'Jira', 'Unknown App', 'Chat'];
      const result = await composioIntegrationService.validateDetectedApps(detectedApps, userId);

      expect(result.success).toBe(true);
      expect(result.validApps).toEqual(['Google Drive', 'Jira', 'Chat']);
      expect(result.invalidApps).toEqual(['Unknown App']);
      expect(result.availableApps).toEqual(mockAvailableAppsResult.availableApps);
      expect(result.connectionStatus).not.toBeNull();
      expect(result.connectionStatus.allConnected).toBe(true);
      expect(composioIntegrationService.getAvailableAppsForDetection).toHaveBeenCalled();
      expect(composioIntegrationService.checkAppConnections).toHaveBeenCalledWith(userId, ['Google Drive', 'Jira', 'Chat']);
    });

    it('should validate detected apps without checking connections if userId is not provided', async () => {
      const detectedApps = ['Google Drive', 'Unknown App', 'Slack'];
      const result = await composioIntegrationService.validateDetectedApps(detectedApps);

      expect(result.success).toBe(true);
      expect(result.validApps).toEqual(['Google Drive', 'Slack']);
      expect(result.invalidApps).toEqual(['Unknown App']);
      expect(result.availableApps).toEqual(mockAvailableAppsResult.availableApps);
      expect(result.connectionStatus).toBeNull();
      expect(composioIntegrationService.getAvailableAppsForDetection).toHaveBeenCalled();
      expect(composioIntegrationService.checkAppConnections).not.toHaveBeenCalled();
    });

    it('should handle empty detectedApps array', async () => {
      const detectedApps = [];
      const result = await composioIntegrationService.validateDetectedApps(detectedApps, userId);

      expect(result.success).toBe(true);
      expect(result.validApps).toEqual([]);
      expect(result.invalidApps).toEqual([]);
      expect(result.availableApps).toEqual(mockAvailableAppsResult.availableApps);
      expect(result.connectionStatus).toBeNull(); // No valid apps to check connections for
      expect(composioIntegrationService.checkAppConnections).not.toHaveBeenCalled();
    });

    it('should handle errors from getAvailableAppsForDetection', async () => {
      composioIntegrationService.getAvailableAppsForDetection.mockResolvedValueOnce({ success: false, error: 'Detection error' });
      const detectedApps = ['Google Drive'];

      const result = await composioIntegrationService.validateDetectedApps(detectedApps, userId);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Detection error');
      expect(result.validApps).toEqual([]);
      expect(result.invalidApps).toEqual(detectedApps);
      expect(result.availableApps).toEqual([]);
      expect(result.connectionStatus).toBeNull();
      expect(composioIntegrationService.checkAppConnections).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error validating detected apps:', expect.any(Error));
    });

    it('should handle errors from checkAppConnections', async () => {
      composioIntegrationService.checkAppConnections.mockResolvedValueOnce({ success: false, error: 'Connection check error' });
      const detectedApps = ['Google Drive'];

      const result = await composioIntegrationService.validateDetectedApps(detectedApps, userId);

      expect(result.success).toBe(true); // Overall validation is still successful
      expect(result.validApps).toEqual(['Google Drive']);
      expect(result.invalidApps).toEqual([]);
      expect(result.availableApps).toEqual(mockAvailableAppsResult.availableApps);
      expect(result.connectionStatus).toBeNull(); // Connection check failed, so null
      expect(mockLogger.error).toHaveBeenCalledWith('Error validating detected apps:', expect.any(Error)); // Error from checkAppConnections is caught and logged, but doesn't fail the outer method.
    });
  });

  describe('getConnectionUrl', () => {
    const appName = 'Google Drive';
    const authConfigId = 'gd_config_1';
    const connectedAccountId = 'new_gd_acc_id';
    const integrationId = 'new_gd_int_id';
    const redirectUrl = 'https://composio.dev/redirect/new';

    it('should return a new connection URL if the app is not already connected', async () => {
      AuthConfigMock.findOne.mockImplementation(() => createLeanMock({ app: appName, authConfigId }));
      ComposioAuthMock.findOne.mockImplementation(() => createLeanMock(null)); // Not connected

      mockComposioInstance.connectedAccounts.initiate.mockResolvedValueOnce({
        id: connectedAccountId,
        integrationId,
        redirectUrl,
      });

      const result = await composioIntegrationService.getConnectionUrl(userId, appName);

      expect(result.success).toBe(true);
      expect(result.alreadyConnected).toBe(false);
      expect(result.connectionUrl).toBe(redirectUrl);
      expect(result.connectedAccountId).toBe(connectedAccountId);
      expect(result.authConfig).toEqual({ app: appName, authConfigId });
      expect(AuthConfigMock.findOne).toHaveBeenCalledWith({ app: { $regex: new RegExp(appName, 'i') } });
      expect(ComposioAuthMock.findOne).toHaveBeenCalledWith({
        userId,
        authConfigId,
        status: 'active',
      });
      expect(mockComposioInstance.connectedAccounts.initiate).toHaveBeenCalledWith(userId, authConfigId);
      expect(ComposioAuthMock).toHaveBeenCalledWith({
        userId,
        authConfigId,
        connectedAccountId,
        status: 'PENDING',
        integrationId,
        redirectUrl,
        toolkit: { slug: appName },
      });
      expect(ComposioAuthMock().save).toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return alreadyConnected status if the app is already connected', async () => {
      const existingConnection = {
        userId,
        authConfigId,
        connectedAccountId: 'existing_gd_acc_id',
        status: 'active',
        integrationId: 'existing_gd_int_id',
      };
      AuthConfigMock.findOne.mockImplementation(() => createLeanMock({ app: appName, authConfigId }));
      ComposioAuthMock.findOne.mockImplementation(() => createLeanMock(existingConnection)); // Already connected

      const result = await composioIntegrationService.getConnectionUrl(userId, appName);

      expect(result.success).toBe(true);
      expect(result.alreadyConnected).toBe(true);
      expect(result.message).toBe(`Already connected to ${appName}`);
      expect(result.connection).toEqual(existingConnection);
      expect(result.connectionUrl).toBeUndefined();
      expect(mockComposioInstance.connectedAccounts.initiate).not.toHaveBeenCalled();
      expect(ComposioAuthMock().save).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should return an error if the app is not available for connection (no auth config)', async () => {
      AuthConfigMock.findOne.mockImplementation(() => createLeanMock(null)); // No auth config found

      const result = await composioIntegrationService.getConnectionUrl(userId, appName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(`App ${appName} is not available for connection`);
      expect(mockComposioInstance.connectedAccounts.initiate).not.toHaveBeenCalled();
      expect(ComposioAuthMock().save).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(`Error getting connection URL for ${appName}:`, expect.any(Error));
    });

    it('should handle errors during Composio initiate call', async () => {
      const errorMessage = 'Composio API failed';
      AuthConfigMock.findOne.mockImplementation(() => createLeanMock({ app: appName, authConfigId }));
      ComposioAuthMock.findOne.mockImplementation(() => createLeanMock(null));
      mockComposioInstance.connectedAccounts.initiate.mockRejectedValueOnce(new Error(errorMessage));

      const result = await composioIntegrationService.getConnectionUrl(userId, appName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(errorMessage);
      expect(ComposioAuthMock().save).not.toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(`Error getting connection URL for ${appName}:`, expect.any(Error));
    });

    it('should handle errors during saving ComposioAuth record', async () => {
      const saveErrorMessage = 'DB save failed';
      AuthConfigMock.findOne.mockImplementation(() => createLeanMock({ app: appName, authConfigId }));
      ComposioAuthMock.findOne.mockImplementation(() => createLeanMock(null));
      mockComposioInstance.connectedAccounts.initiate.mockResolvedValueOnce({
        id: connectedAccountId,
        integrationId,
        redirectUrl,
      });
      ComposioAuthMock.mockImplementation((data) => ({
        ...data,
        save: vi.fn().mockRejectedValueOnce(new Error(saveErrorMessage)),
      }));

      const result = await composioIntegrationService.getConnectionUrl(userId, appName);

      expect(result.success).toBe(false);
      expect(result.error).toBe(saveErrorMessage);
      expect(ComposioAuthMock().save).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(`Error getting connection URL for ${appName}:`, expect.any(Error));
    });
  });
});