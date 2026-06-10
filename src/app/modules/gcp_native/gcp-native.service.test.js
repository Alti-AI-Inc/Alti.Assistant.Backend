import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import { spawn } from 'child_process';
import GoogleRepository from './gcp-repository.model.js';
import { GcpNativeService } from './gcp-native.service.js';

// Mock dependencies
vi.mock('./gcp-repository.model.js', () => ({
  default: {
    find: vi.fn(),
    countDocuments: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

const mockRepoData = [
  { name: 'cloud-sdk', description: 'Google Cloud SDK', license: 'Apache 2.0', language: 'Python', stars: 1000, clone_url: 'https://github.com/GoogleCloudPlatform/cloud-sdk.git', org: 'GoogleCloudPlatform' },
  { name: 'google-auth-library-python', description: 'Google Auth Library for Python', license: 'Apache 2.0', language: 'Python', stars: 500, clone_url: 'https://github.com/google/google-auth-library-python.git', org: 'google' },
  { name: 'terraform-provider-google', description: 'Terraform Google Provider', license: 'MIT', language: 'Go', stars: 2000, clone_url: 'https://github.com/hashicorp/terraform-provider-google.git', org: 'hashicorp' },
];

describe('GcpNativeService', () => {
  let mockQueryBuilder;

  beforeEach(() => {
    mockQueryBuilder = {
      sort: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue(mockRepoData),
    };
    GoogleRepository.find.mockReturnValue(mockQueryBuilder);
    GoogleRepository.countDocuments.mockResolvedValue(mockRepoData.length);
    fs.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchGcpCatalog', () => {
    it('should perform a search with default options', async () => {
      const result = await GcpNativeService.searchGcpCatalog();

      expect(GoogleRepository.find).toHaveBeenCalledWith({});
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(0);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(20);
      expect(result.success).toBe(true);
      expect(result.total).toBe(mockRepoData.length);
      expect(result.results.length).toBe(mockRepoData.length);
      expect(result.results[0].domain).toBe('github.com/GoogleCloudPlatform');
      expect(result.results[1].domain).toBe('github.com/google');
    });

    it('should handle full-text search with stop words filtering', async () => {
      const query = 'show me the cloud sdk';
      await GcpNativeService.searchGcpCatalog(query);

      expect(GoogleRepository.find).toHaveBeenCalledWith(
        { $text: { $search: 'cloud sdk' } },
        { score: { $meta: 'textScore' } }
      );
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ score: { $meta: 'textScore' }, stars: -1 });
    });

    it('should fall back to regex search if query only contains stop words', async () => {
      const query = 'show me the';
      await GcpNativeService.searchGcpCatalog(query);

      const expectedRegex = new RegExp('show me the', 'i');
      expect(GoogleRepository.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: expectedRegex, $options: 'i' } },
          { description: { $regex: expectedRegex, $options: 'i' } },
        ],
      });
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should correctly escape special characters in regex search', async () => {
        const query = 'sdk-(';
        await GcpNativeService.searchGcpCatalog(query);
  
        const escapedQuery = 'sdk-\\(|)'; // Note: The logic escapes '(' but not ')'
        const expectedRegex = new RegExp(escapedQuery, 'i');
        expect(GoogleRepository.find).toHaveBeenCalledWith(
          expect.objectContaining({
            $or: [
              { name: { $regex: expect.any(RegExp), $options: 'i' } },
              { description: { $regex: expect.any(RegExp), $options: 'i' } },
            ],
          })
        );
        // Check the actual regex string passed
        const findCall = GoogleRepository.find.mock.calls[0][0];
        expect(findCall.$or[0].name.$regex.source).toContain('sdk-\\\(');
      });

    it('should filter by license', async () => {
      await GcpNativeService.searchGcpCatalog('', { license: 'mit' });
      expect(GoogleRepository.find).toHaveBeenCalledWith({ license: 'MIT' });

      await GcpNativeService.searchGcpCatalog('', { license: 'Apache 2.0' });
      expect(GoogleRepository.find).toHaveBeenCalledWith({ license: 'Apache 2.0' });
    });

    it('should filter by language with a case-insensitive prefix regex', async () => {
      await GcpNativeService.searchGcpCatalog('', { language: 'py' });
      expect(GoogleRepository.find).toHaveBeenCalledWith({ language: /^py/i });
    });

    it('should handle pagination correctly', async () => {
      await GcpNativeService.searchGcpCatalog('', { page: 3, limit: 50 });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(100); // (3 - 1) * 50
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
    });

    it('should sort by a specified valid field', async () => {
      await GcpNativeService.searchGcpCatalog('', { sortBy: 'name' });
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ name: -1 });
    });

    it('should default to sorting by stars if sortBy is invalid', async () => {
      await GcpNativeService.searchGcpCatalog('', { sortBy: 'invalidField' });
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should throw an error if the database query fails', async () => {
      const dbError = new Error('DB connection lost');
      GoogleRepository.countDocuments.mockRejectedValue(dbError);

      await expect(GcpNativeService.searchGcpCatalog()).rejects.toThrow(
        `Failed to query Google/GCP catalog in MongoDB: ${dbError.message}`
      );
    });

    it('should correctly map org and domain for results', async () => {
        const customData = [
            { name: 'repo1', org: 'google' },
            { name: 'repo2', org: 'GoogleCloudPlatform' },
            { name: 'repo3' } // org is undefined
        ];
        mockQueryBuilder.lean.mockResolvedValue(customData);
        const result = await GcpNativeService.searchGcpCatalog();

        expect(result.results[0]).toEqual(expect.objectContaining({ org: 'google', domain: 'github.com/google' }));
        expect(result.results[1]).toEqual(expect.objectContaining({ org: 'GoogleCloudPlatform', domain: 'github.com/GoogleCloudPlatform' }));
        expect(result.results[2]).toEqual(expect.objectContaining({ org: 'GoogleCloudPlatform', domain: 'github.com/GoogleCloudPlatform' }));
    });
  });

  describe('importGcpSubmodule', () => {
    let mockSpawnInstance;

    beforeEach(() => {
      // Mock the search function within the service to control its output for these tests
      vi.spyOn(GcpNativeService, 'searchGcpCatalog').mockResolvedValue({
        success: true,
        results: [mockRepoData[0]],
      });

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

      const result = await GcpNativeService.importGcpSubmodule('cloud-sdk');

      expect(GcpNativeService.searchGcpCatalog).toHaveBeenCalledWith('cloud-sdk');
      expect(spawn).toHaveBeenCalledWith(
        'git',
        ['submodule', 'add', mockRepoData[0].clone_url, 'external/gcp/cloud-sdk'],
        { cwd: expect.any(String) }
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

        await GcpNativeService.importGcpSubmodule('cloud-sdk');

        expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('external/gcp'));
        expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('external/gcp'), { recursive: true });
    });

    it('should return failure if repository is not found in catalog', async () => {
      GcpNativeService.searchGcpCatalog.mockResolvedValue({ success: true, results: [] });

      const result = await GcpNativeService.importGcpSubmodule('non-existent-repo');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Repository "non-existent-repo" was not found in the scanned GCP catalog.');
      expect(spawn).not.toHaveBeenCalled();
    });

    it('should return failure and suggestions if no exact match is found', async () => {
      GcpNativeService.searchGcpCatalog.mockResolvedValue({ success: true, results: [mockRepoData[0]] });

      const result = await GcpNativeService.importGcpSubmodule('cloud-sd'); // Partial name

      expect(result.success).toBe(false);
      expect(result.message).toBe('Repository "cloud-sd" did not match exactly.');
      expect(result.suggestions).toEqual([mockRepoData[0].name]);
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

      const result = await GcpNativeService.importGcpSubmodule('cloud-sdk');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Git command failed with exit code 1');
      expect(result.details).toContain(stderrMessage);
    });

    it('should handle spawn process error', async () => {
        const spawnError = new Error('spawn ENOENT');
        mockSpawnInstance.on.mockImplementation((event, callback) => {
            if (event === 'error') callback(spawnError);
        });

        const result = await GcpNativeService.importGcpSubmodule('cloud-sdk');

        expect(result.success).toBe(false);
        expect(result.message).toBe(`Failed to start git process: ${spawnError.message}`);
    });

    it('should throw an error if repoName is not provided', async () => {
        await expect(GcpNativeService.importGcpSubmodule('')).rejects.toThrow('Repository name is required for import.');
        await expect(GcpNativeService.importGcpSubmodule(null)).rejects.toThrow('Repository name is required for import.');
    });

    it('should sanitize repository name to prevent path traversal', async () => {
        const maliciousRepo = { name: '../../evil-repo', clone_url: 'some_url' };
        GcpNativeService.searchGcpCatalog.mockResolvedValue({ success: true, results: [maliciousRepo] });
        mockSpawnInstance.on.mockImplementation((event, callback) => {
            if (event === 'close') callback(0);
        });

        await GcpNativeService.importGcpSubmodule('../../evil-repo');

        expect(spawn).toHaveBeenCalledWith(
            'git',
            ['submodule', 'add', 'some_url', 'external/gcp/..evil-repo'], // Sanitized path
            expect.any(Object)
        );
    });

    it('should return failure if sanitized repository name is empty', async () => {
        const maliciousRepo = { name: '.././', clone_url: 'some_url' };
        GcpNativeService.searchGcpCatalog.mockResolvedValue({ success: true, results: [maliciousRepo] });

        const result = await GcpNativeService.importGcpSubmodule('.././');

        expect(result.success).toBe(false);
        expect(result.message).toBe('Sanitized repository name is empty after cleaning: ".././"');
        expect(spawn).not.toHaveBeenCalled();
    });
  });
});