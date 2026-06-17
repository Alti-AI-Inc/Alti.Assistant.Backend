import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { spawn } from 'child_process';
import GoogleRepository from './gcp-repository.model.js';
import { GcpNativeService } from './gcp-native.service.js';
import path from 'path';

// Mock dependencies
vi.mock('./gcp-repository.model.js', () => ({
  default: {
    aggregate: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', async () => {
  const actualFs = await vi.importActual('fs');
  const mockExistsSync = vi.fn();
  const mockMkdirSync = vi.fn();
  return {
    ...actualFs,
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    default: {
      ...actualFs,
      existsSync: mockExistsSync,
      mkdirSync: mockMkdirSync,
    },
  };
});

vi.mock('../workspace/workspace.service.js', () => ({
  WorkspaceService: {
    findById: vi.fn().mockResolvedValue({
      submoduleCount: 0,
      submoduleLimit: 10,
    }),
    incrementSubmoduleCount: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../notification/notification.service.js', () => ({
  NotificationService: {
    send: vi.fn(),
    createForAdmins: vi.fn().mockResolvedValue(true),
    sendNotificationService: vi.fn().mockResolvedValue(true),
    sendNotification: vi.fn().mockResolvedValue(true),
  },
}));

vi.mock('../../../shared/auditLogger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    log: vi.fn(),
  },
}));

const mockRepoData = [
  { name: 'cloud-sdk', description: 'Google Cloud SDK', license: 'Apache 2.0', language: 'Python', stars: 1000, clone_url: 'https://github.com/GoogleCloudPlatform/cloud-sdk.git', org: 'GoogleCloudPlatform' },
  { name: 'google-auth-library-python', description: 'Google Auth Library for Python', license: 'Apache 2.0', language: 'Python', stars: 500, clone_url: 'https://github.com/google/google-auth-library-python.git', org: 'google' },
  { name: 'terraform-provider-google', description: 'Terraform Google Provider', license: 'MIT', language: 'Go', stars: 2000, clone_url: 'https://github.com/hashicorp/terraform-provider-google.git', org: 'hashicorp' },
];

const mockUser = {
  userId: 'usr_123',
  workspaceId: 'ws_123',
  role: 'admin',
};

describe('GcpNativeService', () => {
  beforeEach(() => {
    GoogleRepository.aggregate.mockResolvedValue([
      {
        metadata: [{ total: mockRepoData.length }],
        data: mockRepoData,
      }
    ]);
    fs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchGcpCatalog', () => {
    it('should perform a search with default options', async () => {
      const result = await GcpNativeService.searchGcpCatalog('', {}, mockUser);

      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        { $match: {} },
        { $sort: { stars: -1 } },
        { $facet: { metadata: [{ $count: 'total' }], data: [{ $skip: 0 }, { $limit: 20 }] } }
      ]);
      expect(result.success).toBe(true);
      expect(result.total).toBe(mockRepoData.length);
      expect(result.results.length).toBe(mockRepoData.length);
      expect(result.results[0].domain).toBe('github.com/GoogleCloudPlatform');
      expect(result.results[1].domain).toBe('github.com/google');
    });

    it('should handle full-text search with stop words filtering', async () => {
      const query = 'show me the cloud sdk';
      await GcpNativeService.searchGcpCatalog(query, {}, mockUser);

      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        expect.objectContaining({ $match: { $text: { $search: 'sdk' } } }),
        expect.objectContaining({ $sort: { score: { $meta: 'textScore' }, stars: -1 } }),
        expect.any(Object)
      ]);
    });

    it('should fall back to regex search if query only contains stop words', async () => {
      const query = 'show me the';
      await GcpNativeService.searchGcpCatalog(query, {}, mockUser);

      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        expect.objectContaining({
          $match: {
            $or: [
              { name: { $regex: 'show me the', $options: 'i' } },
              { description: { $regex: 'show me the', $options: 'i' } },
            ],
          }
        }),
        expect.objectContaining({ $sort: { stars: -1 } }),
        expect.any(Object)
      ]);
    });

    it('should correctly escape special characters in regex search', async () => {
      const query = 'show me the (';
      await GcpNativeService.searchGcpCatalog(query, {}, mockUser);

      const aggregateCall = GoogleRepository.aggregate.mock.calls[0][0];
      expect(aggregateCall[0].$match.$or[0].name.$regex).toBe('show me the \\(');
    });

    it('should filter by license', async () => {
      await GcpNativeService.searchGcpCatalog('', { license: 'mit' }, mockUser);
      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        { $match: { license: 'MIT' } },
        expect.any(Object),
        expect.any(Object)
      ]);

      await GcpNativeService.searchGcpCatalog('', { license: 'Apache 2.0' }, mockUser);
      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        { $match: { license: 'Apache 2.0' } },
        expect.any(Object),
        expect.any(Object)
      ]);
    });

    it('should filter by language with a case-insensitive prefix regex', async () => {
      await GcpNativeService.searchGcpCatalog('', { language: 'py' }, mockUser);
      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        { $match: { language: /^py/i } },
        expect.any(Object),
        expect.any(Object)
      ]);
    });

    it('should handle pagination correctly', async () => {
      await GcpNativeService.searchGcpCatalog('', { page: 3, limit: 50 }, mockUser);
      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        expect.any(Object),
        expect.any(Object),
        { $facet: { metadata: [{ $count: 'total' }], data: [{ $skip: 100 }, { $limit: 50 }] } }
      ]);
    });

    it('should sort by a specified valid field', async () => {
      await GcpNativeService.searchGcpCatalog('', { sortBy: 'name' }, mockUser);
      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        expect.any(Object),
        { $sort: { name: -1 } },
        expect.any(Object)
      ]);
    });

    it('should default to sorting by stars if sortBy is invalid', async () => {
      await GcpNativeService.searchGcpCatalog('', { sortBy: 'invalidField' }, mockUser);
      expect(GoogleRepository.aggregate).toHaveBeenCalledWith([
        expect.any(Object),
        { $sort: { stars: -1 } },
        expect.any(Object)
      ]);
    });

    it('should throw an error if the database query fails', async () => {
      const dbError = new Error('DB connection lost');
      GoogleRepository.aggregate.mockRejectedValue(dbError);

      await expect(GcpNativeService.searchGcpCatalog('', {}, mockUser)).rejects.toThrow(
        'Failed to query Google/GCP catalog.'
      );
    });

    it('should correctly map org and domain for results', async () => {
      const customData = [
        { name: 'repo1', org: 'google' },
        { name: 'repo2', org: 'GoogleCloudPlatform' },
        { name: 'repo3' } // org is undefined
      ];
      GoogleRepository.aggregate.mockResolvedValueOnce([
        {
          metadata: [{ total: customData.length }],
          data: customData
        }
      ]);
      const result = await GcpNativeService.searchGcpCatalog('', {}, mockUser);

      expect(result.results[0]).toEqual(expect.objectContaining({ org: 'google', domain: 'github.com/google' }));
      expect(result.results[1]).toEqual(expect.objectContaining({ org: 'GoogleCloudPlatform', domain: 'github.com/GoogleCloudPlatform' }));
      expect(result.results[2]).toEqual(expect.objectContaining({ org: 'GoogleCloudPlatform', domain: 'github.com/GoogleCloudPlatform' }));
    });
  });

  describe('importGcpSubmodule', () => {
    let mockSpawnInstance;

    beforeEach(() => {
      mockSpawnInstance = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        on: vi.fn(),
      };
      spawn.mockReturnValue(mockSpawnInstance);
    });

    it('should successfully import a repository', async () => {
      mockSpawnInstance.on.mockImplementation((event, callback) => {
        if (event === 'close') {
          callback(0); // Success code
        }
      });

      const result = await GcpNativeService.importGcpSubmodule('cloud-sdk', mockUser);

      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['submodule', 'add', '--force', mockRepoData[0].clone_url, 'external/gcp/cloud-sdk'],
        { cwd: expect.any(String), stdio: 'pipe' }
      );
      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully imported');
      expect(result.path).toBe('external/gcp/cloud-sdk');
    });

    it('should create the gcp directory if it does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      mockSpawnInstance.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      });

      await GcpNativeService.importGcpSubmodule('cloud-sdk', mockUser);

      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining(path.join('external', 'gcp')));
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining(path.join('external', 'gcp')), { recursive: true });
    });

    it('should return failure if repository is not found in catalog', async () => {
      GoogleRepository.aggregate.mockResolvedValueOnce([
        { metadata: [{ total: 0 }], data: [] }
      ]);

      const result = await GcpNativeService.importGcpSubmodule('non-existent-repo', mockUser);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Repository "non-existent-repo" was not found in the scanned GCP catalog.');
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should return failure and suggestions if no exact match is found', async () => {
      const result = await GcpNativeService.importGcpSubmodule('cloud-sd', mockUser); // Partial name

      expect(result.success).toBe(false);
      expect(result.message).toBe('Repository "cloud-sd" did not match exactly.');
      expect(result.suggestions).toEqual(mockRepoData.map(r => r.name));
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should handle git command failure', async () => {
      const stderrMessage = 'fatal: repository not found';
      mockSpawnInstance.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(1); // Failure code
      });
      mockSpawnInstance.stderr.on.mockImplementation((event, callback) => {
        if (event === 'data') callback(stderrMessage);
      });

      const result = await GcpNativeService.importGcpSubmodule('cloud-sdk', mockUser);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Git command failed with exit code 1');
      expect(result.details).toContain(stderrMessage);
    });

    it('should handle spawn process error', async () => {
      const spawnError = new Error('spawn ENOENT');
      mockSpawnInstance.on.mockImplementation((event, callback) => {
        if (event === 'error') callback(spawnError);
      });

      const result = await GcpNativeService.importGcpSubmodule('cloud-sdk', mockUser);

      expect(result.success).toBe(false);
      expect(result.message).toBe(`Failed to start git process: ${spawnError.message}`);
    });

    it('should throw an error if repoName is not provided', async () => {
      await expect(GcpNativeService.importGcpSubmodule('', mockUser)).rejects.toThrow('Repository name is required for import.');
      await expect(GcpNativeService.importGcpSubmodule(null, mockUser)).rejects.toThrow('Repository name is required for import.');
    });

    it('should sanitize repository name to prevent path traversal', async () => {
      const maliciousRepo = { name: '../../evil-repo', clone_url: 'some_url' };
      GoogleRepository.aggregate.mockResolvedValueOnce([
        { metadata: [{ total: 1 }], data: [maliciousRepo] }
      ]);
      mockSpawnInstance.on.mockImplementation((event, callback) => {
        if (event === 'close') callback(0);
      });

      await GcpNativeService.importGcpSubmodule('../../evil-repo', mockUser);

      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['submodule', 'add', '--force', 'some_url', 'external/gcp/....evil-repo'],
        expect.any(Object)
      );
    });

    it('should return failure if sanitized repository name is empty', async () => {
      const maliciousRepo = { name: '///', clone_url: 'some_url' };
      GoogleRepository.aggregate.mockResolvedValueOnce([
        { metadata: [{ total: 1 }], data: [maliciousRepo] }
      ]);

      const result = await GcpNativeService.importGcpSubmodule('///', mockUser);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Sanitized repository name is empty after cleaning: "///"');
      expect(spawn).not.toHaveBeenCalled();
    });
  });
});