import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import ComposioRepository from './composio-repository.model.js';
import { ComposioCatalogService } from './composio-catalog.service.js';

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn()
  }
}));

vi.mock('child_process', () => ({
  execFile: vi.fn()
}));

const mockLean = vi.fn();
const mockLimit = vi.fn().mockImplementation(() => ({ lean: mockLean }));
const mockSkip = vi.fn().mockImplementation(() => ({ limit: mockLimit }));
const mockSort = vi.fn().mockImplementation(() => ({ skip: mockSkip }));
const mockFind = vi.fn().mockImplementation(() => ({ sort: mockSort }));
const mockCountDocuments = vi.fn();
const mockAggregate = vi.fn();

vi.mock('./composio-repository.model.js', () => {
  return {
    default: {
      find: mockFind,
      countDocuments: mockCountDocuments,
      aggregate: mockAggregate
    }
  };
});

describe('ComposioCatalogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchComposioCatalog', () => {
    it('should search catalog with default options and no query', async () => {
      const mockRepos = [
        { name: 'repo1', stars: 10, license: 'MIT', language: 'JavaScript' },
        { name: 'repo2', stars: 5, license: 'Apache 2.0', language: 'Python' }
      ];
      mockLean.mockResolvedValue(mockRepos);
      mockCountDocuments.mockResolvedValue(2);

      const result = await ComposioCatalogService.searchComposioCatalog();

      expect(ComposioRepository.find).toHaveBeenCalledWith({});
      expect(mockSort).toHaveBeenCalledWith({ stars: -1 });
      expect(mockSkip).toHaveBeenCalledWith(0);
      expect(mockLimit).toHaveBeenCalledWith(20);
      expect(result.success).toBe(true);
      expect(result.total).toBe(2);
      expect(result.results).toHaveLength(2);
      expect(result.results[0].org).toBe('ComposioHQ');
      expect(result.results[0].domain).toBe('github.com/ComposioHQ');
    });

    it('should filter by license MIT', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      await ComposioCatalogService.searchComposioCatalog('', { license: 'mit' });

      expect(ComposioRepository.find).toHaveBeenCalledWith({ license: 'MIT' });
    });

    it('should filter by license Apache 2.0 for non-mit values', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      await ComposioCatalogService.searchComposioCatalog('', { license: 'apache2' });

      expect(ComposioRepository.find).toHaveBeenCalledWith({ license: 'Apache 2.0' });
    });

    it('should filter by language with regex prefix', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      await ComposioCatalogService.searchComposioCatalog('', { language: 'js' });

      expect(ComposioRepository.find).toHaveBeenCalledWith({
        language: /^js/i
      });
    });

    it('should perform full-text search when query contains non-stopwords', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      await ComposioCatalogService.searchComposioCatalog('find python tool');

      expect(ComposioRepository.find).toHaveBeenCalledWith(
        { $text: { $search: 'python tool' } },
        { score: { $meta: 'textScore' } }
      );
      expect(mockSort).toHaveBeenCalledWith({ score: { $meta: 'textScore' }, stars: -1 });
    });

    it('should fallback to regex search when query contains only stopwords', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      await ComposioCatalogService.searchComposioCatalog('show me the');

      expect(ComposioRepository.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'show\\{FILE_CONTENT}me\\{FILE_CONTENT}the', $options: 'i' } },
          { description: { $regex: 'show\\{FILE_CONTENT}me\\{FILE_CONTENT}the', $options: 'i' } }
        ]
      });
      expect(mockSort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should apply custom pagination and sorting options', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      await ComposioCatalogService.searchComposioCatalog('', {
        sortBy: 'forks',
        limit: '5',
        page: '3'
      });

      expect(mockSort).toHaveBeenCalledWith({ forks: -1 });
      expect(mockSkip).toHaveBeenCalledWith(10);
      expect(mockLimit).toHaveBeenCalledWith(5);
    });

    it('should throw an error if the database query fails', async () => {
      mockCountDocuments.mockRejectedValue(new Error('DB Connection Error'));

      await expect(ComposioCatalogService.searchComposioCatalog()).rejects.toThrow(
        'Failed to query Composio catalog in MongoDB: DB Connection Error'
      );
    });
  });

  describe('importComposioSubmodule', () => {
    it('should throw an error if repository name is missing or invalid', async () => {
      await expect(ComposioCatalogService.importComposioSubmodule(null)).rejects.toThrow(
        'Repository name is required for import.'
      );
      await expect(ComposioCatalogService.importComposioSubmodule('')).rejects.toThrow(
        'Repository name is required for import.'
      );
    });

    it('should return failure if repository is not found in catalog', async () => {
      mockLean.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);

      const result = await ComposioCatalogService.importComposioSubmodule('non-existent');

      expect(result).toEqual({
        success: false,
        message: 'Repository "non-existent" was not found in the scanned Composio catalog.'
      });
    });

    it('should return failure with suggestions if no exact match is found', async () => {
      mockLean.mockResolvedValue([
        { name: 'composio-sdk-python' },
        { name: 'composio-sdk-js' }
      ]);
      mockCountDocuments.mockResolvedValue(2);

      const result = await ComposioCatalogService.importComposioSubmodule('composio-sdk');

      expect(result).toEqual({
        success: false,
        message: 'Repository "composio-sdk" did not match exactly.',
        suggestions: ['composio-sdk-python', 'composio-sdk-js']
      });
    });

    it('should return failure if repository name format is invalid', async () => {
      mockLean.mockResolvedValue([
        { name: 'composio; rm -rf /' }
      ]);
      mockCountDocuments.mockResolvedValue(1);

      const result = await ComposioCatalogService.importComposioSubmodule('composio; rm -rf /');

      expect(result).toEqual({
        success: false,
        message: 'Invalid repository name format.'
      });
    });

    it('should return failure if repository clone URL format is invalid', async () => {
      mockLean.mockResolvedValue([
        { name: 'composio-sdk', clone_url: 'ftp://invalid-url.com' }
      ]);
      mockCountDocuments.mockResolvedValue(1);

      const result = await ComposioCatalogService.importComposioSubmodule('composio-sdk');

      expect(result).toEqual({
        success: false,
        message: 'Invalid repository clone URL format.'
      });
    });

    it('should return failure if resolved path escapes the boundary', async () => {
      mockLean.mockResolvedValue([
        { name: 'composio-sdk', clone_url: 'https://github.com/ComposioHQ/composio-sdk.git' }
      ]);
      mockCountDocuments.mockResolvedValue(1);

      const pathResolveSpy = vi.spyOn(path, 'resolve')
        .mockReturnValueOnce('/outside/workspace/external/composio/composio-sdk') // resolvedSubmodulePath
        .mockReturnValueOnce('/workspace/external/composio'); // localComposioPath

      const result = await ComposioCatalogService.importComposioSubmodule('composio-sdk');

      expect(result).toEqual({
        success: false,
        message: 'Invalid repository path resolution.'
      });

      pathResolveSpy.mockRestore();
    });

    it('should successfully import submodule and create directory if it does not exist', async () => {
      mockLean.mockResolvedValue([
        { name: 'composio-sdk', clone_url: 'https://github.com/ComposioHQ/composio-sdk.git' }
      ]);
      mockCountDocuments.mockResolvedValue(1);

      fs.existsSync.mockReturnValue(false);
      execFile.mockImplementation((cmd, args, opts, callback) => {
        callback(null, 'Cloning into...', '');
      });

      const result = await ComposioCatalogService.importComposioSubmodule('composio-sdk');

      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.mkdirSync).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['submodule', 'add', 'https://github.com/ComposioHQ/composio-sdk.git', 'external/composio/composio-sdk'],
        expect.any(Object),
        expect.any(Function)
      );
      expect(result).toEqual({
        success: true,
        message: 'Successfully imported Composio repository "composio-sdk" as a submodule!',
        path: 'external/composio/composio-sdk',
        clone_url: 'https://github.com/ComposioHQ/composio-sdk.git',
        output: 'Cloning into...'
      });
    });

    it('should return failure if git command execution fails', async () => {
      mockLean.mockResolvedValue([
        { name: 'composio-sdk', clone_url: 'https://github.com/ComposioHQ/composio-sdk.git' }
      ]);
      mockCountDocuments.mockResolvedValue(1);

      fs.existsSync.mockReturnValue(true);
      execFile.mockImplementation((cmd, args, opts, callback) => {
        callback(new Error('Git command failed'), '', 'Permission denied');
      });

      const result = await ComposioCatalogService.importComposioSubmodule('composio-sdk');

      expect(result).toEqual({
        success: false,
        message: 'Git command failed: Git command failed',
        details: 'Permission denied'
      });
    });
  });

  describe('getComposioStats', () => {
    it('should return calculated statistics successfully', async () => {
      mockCountDocuments.mockResolvedValue(15);
      mockAggregate
        .mockResolvedValueOnce([{ totalStars: 150, totalForks: 45, avgStars: 10 }]) // Stars/Forks
        .mockResolvedValueOnce([{ _id: 'Python', count: 10 }, { _id: 'JavaScript', count: 5 }]) // Languages
        .mockResolvedValueOnce([{ _id: 'MIT', count: 12 }, { _id: 'Apache 2.0', count: 3 }]); // Licenses

      const result = await ComposioCatalogService.getComposioStats();

      expect(ComposioRepository.countDocuments).toHaveBeenCalledWith({});
      expect(result).toEqual({
        success: true,
        stats: {
          totalRepositories: 15,
          totalStars: 150,
          totalForks: 45,
          averageStars: 10,
          languages: [
            { name: 'Python', count: 10 },
            { name: 'JavaScript', count: 5 }
          ],
          licenses: [
            { name: 'MIT', count: 12 },
            { name: 'Apache 2.0', count: 3 }
          ]
        }
      });
    });

    it('should handle empty aggregation results gracefully', async () => {
      mockCountDocuments.mockResolvedValue(0);
      mockAggregate
        .mockResolvedValueOnce([]) // Stars/Forks empty
        .mockResolvedValueOnce([]) // Languages empty
        .mockResolvedValueOnce([]); // Licenses empty

      const result = await ComposioCatalogService.getComposioStats();

      expect(result).toEqual({
        success: true,
        stats: {
          totalRepositories: 0,
          totalStars: 0,
          totalForks: 0,
          averageStars: 0,
          languages: [],
          licenses: []
        }
      });
    });

    it('should throw an error if aggregation fails', async () => {
      mockCountDocuments.mockResolvedValue(5);
      mockAggregate.mockRejectedValue(new Error('Aggregation Error'));

      await expect(ComposioCatalogService.getComposioStats()).rejects.toThrow(
        'Failed to calculate Composio catalog stats: Aggregation Error'
      );
    });
  });
});