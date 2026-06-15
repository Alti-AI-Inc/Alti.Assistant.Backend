import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import { execFile } from 'child_process';

// Mock LangchainRepository before importing the service to handle the IIFE
const mockCollection = {
  createIndex: vi.fn().mockResolvedValue(true),
};

const mockQueryBuilder = {
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  lean: vi.fn().mockResolvedValue([]),
};

const {
  mockLangchainRepository
} = vi.hoisted(() => {
  const mockLangchainRepository = {
    collection: mockCollection,
    find: vi.fn().mockReturnValue(mockQueryBuilder),
    countDocuments: vi.fn().mockResolvedValue(0),
    aggregate: vi.fn().mockResolvedValue([
      {
        overallStats: [{ totalStars: 100, totalForks: 50, avgStars: 10, totalRepositories: 10 }],
        languages: [{ _id: 'JavaScript', count: 5 }],
        licenses: [{ _id: 'MIT', count: 5 }]
      }
    ]),
  };

  return {
    mockLangchainRepository
  };
});

vi.mock('./langchain-repository.model.js', () => ({
  default: mockLangchainRepository
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
  }
}));

// Mock child_process
vi.mock('child_process', () => ({
  execFile: vi.fn().mockImplementation((cmd, args, opts, cb) => {
    cb(null, 'stdout output', '');
  })
}));

// Now import the service
import { LangchainService } from './langchain.service.js';

describe('LangchainService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset default mock behaviors
    mockLangchainRepository.find.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.sort.mockReturnThis();
    mockQueryBuilder.skip.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.lean.mockResolvedValue([]);
    mockLangchainRepository.countDocuments.mockResolvedValue(0);
  });

  describe('IIFE Index Creation', () => {
    it('should have attempted to create indexes on startup', () => {
      expect(mockCollection.createIndex).toHaveBeenCalled();
    });
  });

  describe('searchLangchainCatalog', () => {
    it('should query with default options when no parameters are provided', async () => {
      mockLangchainRepository.countDocuments.mockResolvedValue(1);
      mockQueryBuilder.lean.mockResolvedValue([{ name: 'test-repo', stars: 10 }]);

      const result = await LangchainService.searchLangchainCatalog();

      expect(result.success).toBe(true);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.results[0]).toEqual({
        name: 'test-repo',
        stars: 10,
        org: 'langchain-ai',
        domain: 'github.com/langchain-ai'
      });
      expect(mockLangchainRepository.find).toHaveBeenCalledWith({});
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should filter by license MIT (case-insensitive)', async () => {
      await LangchainService.searchLangchainCatalog('', { license: 'mit' });
      expect(mockLangchainRepository.find).toHaveBeenCalledWith({ license: 'MIT' });
    });

    it('should filter by license Apache 2.0 for non-mit values', async () => {
      await LangchainService.searchLangchainCatalog('', { license: 'apache' });
      expect(mockLangchainRepository.find).toHaveBeenCalledWith({ license: 'Apache 2.0' });
    });

    it('should filter by language using a safe regex', async () => {
      await LangchainService.searchLangchainCatalog('', { language: 'js' });
      expect(mockLangchainRepository.find).toHaveBeenCalledWith({
        language: /^[j][s]/i
      });
    });

    it('should perform text search when query contains non-stop words', async () => {
      await LangchainService.searchLangchainCatalog('python agent');
      expect(mockLangchainRepository.find).toHaveBeenCalledWith(
        { $text: { $search: 'python agent' } },
        { score: { $meta: 'textScore' } }
      );
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({
        score: { $meta: 'textScore' },
        stars: -1
      });
    });

    it('should fallback to regex search when query contains only stop words', async () => {
      await LangchainService.searchLangchainCatalog('show me the');
      expect(mockLangchainRepository.find).toHaveBeenCalledWith({
        $or: [
          { name: { $regex: 'show me the', $options: 'i' } },
          { description: { $regex: 'show me the', $options: 'i' } }
        ]
      });
      expect(mockQueryBuilder.sort).toHaveBeenCalledWith({ stars: -1 });
    });

    it('should apply pagination parameters correctly', async () => {
      await LangchainService.searchLangchainCatalog('', { limit: 5, page: 3 });
      expect(mockQueryBuilder.skip).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(5);
    });

    it('should throw a customized error if the database query fails', async () => {
      mockLangchainRepository.countDocuments.mockRejectedValue(new Error('DB Error'));
      await expect(LangchainService.searchLangchainCatalog()).rejects.toThrow(
        'Failed to query LangChain catalog in MongoDB: DB Error'
      );
    });
  });

  describe('importLangchainSubmodule', () => {
    it('should throw an error if repoName is not provided', async () => {
      await expect(LangchainService.importLangchainSubmodule()).rejects.toThrow(
        'Repository name is required for import.'
      );
    });

    it('should return failure if repository is not found in catalog', async () => {
      const spySearch = vi.spyOn(LangchainService, 'searchLangchainCatalog')
        .mockResolvedValue({ success: true, results: [] });

      const result = await LangchainService.importLangchainSubmodule('non-existent');
      expect(result).toEqual({
        success: false,
        message: 'Repository "non-existent" was not found in the scanned LangChain catalog.'
      });
      spySearch.mockRestore();
    });

    it('should return failure with suggestions if no exact match is found', async () => {
      const spySearch = vi.spyOn(LangchainService, 'searchLangchainCatalog')
        .mockResolvedValue({
          success: true,
          results: [{ name: 'langchain-js-alternative' }]
        });

      const result = await LangchainService.importLangchainSubmodule('langchain-js');
      expect(result).toEqual({
        success: false,
        message: 'Repository "langchain-js" did not match exactly.',
        suggestions: ['langchain-js-alternative']
      });
      spySearch.mockRestore();
    });

    it('should return failure if sanitized repository name is empty', async () => {
      const spySearch = vi.spyOn(LangchainService, 'searchLangchainCatalog')
        .mockResolvedValue({
          success: true,
          results: [{ name: '???', clone_url: 'https://github.com/langchain-ai/???' }]
        });

      const result = await LangchainService.importLangchainSubmodule('???');
      expect(result).toEqual({
        success: false,
        message: 'Repository name "???" is invalid or empty after sanitization.'
      });
      spySearch.mockRestore();
    });

    it('should return failure if clone URL is invalid', async () => {
      const spySearch = vi.spyOn(LangchainService, 'searchLangchainCatalog')
        .mockResolvedValue({
          success: true,
          results: [{ name: 'langchain-js', clone_url: 'invalid-git-url' }]
        });

      const result = await LangchainService.importLangchainSubmodule('langchain-js');
      expect(result).toEqual({
        success: false,
        message: 'Invalid Git clone URL "invalid-git-url" for repository "langchain-js".'
      });
      spySearch.mockRestore();
    });

    it('should create directory if it does not exist and execute git submodule add successfully', async () => {
      const spySearch = vi.spyOn(LangchainService, 'searchLangchainCatalog')
        .mockResolvedValue({
          success: true,
          results: [{ name: 'langchain-js', clone_url: 'https://github.com/langchain-ai/langchain-js' }]
        });

      fs.existsSync.mockReturnValue(false);

      const result = await LangchainService.importLangchainSubmodule('langchain-js');

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(execFile).toHaveBeenCalledWith(
        'git',
        ['submodule', 'add', 'https://github.com/langchain-ai/langchain-js', 'external/langchain/langchain-js'],
        expect.any(Object),
        expect.any(Function)
      );
      expect(result.success).toBe(true);
      expect(result.path).toBe('external/langchain/langchain-js');
      spySearch.mockRestore();
    });

    it('should handle git command failures gracefully', async () => {
      const spySearch = vi.spyOn(LangchainService, 'searchLangchainCatalog')
        .mockResolvedValue({
          success: true,
          results: [{ name: 'langchain-js', clone_url: 'https://github.com/langchain-ai/langchain-js' }]
        });

      fs.existsSync.mockReturnValue(true);
      execFile.mockImplementationOnce((cmd, args, opts, cb) => {
        cb(new Error('Git error'), '', 'stderr output');
      });

      const result = await LangchainService.importLangchainSubmodule('langchain-js');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Git command failed: Git error');
      expect(result.details).toBe('stderr output');
      spySearch.mockRestore();
    });
  });

  describe('getLangchainStats', () => {
    it('should return formatted statistics from aggregation', async () => {
      mockLangchainRepository.aggregate.mockResolvedValue([
        {
          overallStats: [{ totalStars: 500, totalForks: 200, avgStars: 50, totalRepositories: 10 }],
          languages: [{ _id: 'Python', count: 8 }, { _id: 'TypeScript', count: 2 }],
          licenses: [{ _id: 'MIT', count: 10 }]
        }
      ]);

      const result = await LangchainService.getLangchainStats();

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        totalRepositories: 10,
        totalStars: 500,
        totalForks: 200,
        averageStars: 50,
        languages: [
          { name: 'Python', count: 8 },
          { name: 'TypeScript', count: 2 }
        ],
        licenses: [
          { name: 'MIT', count: 10 }
        ]
      });
    });

    it('should handle empty aggregation results gracefully', async () => {
      mockLangchainRepository.aggregate.mockResolvedValue([
        {
          overallStats: [],
          languages: [],
          licenses: []
        }
      ]);

      const result = await LangchainService.getLangchainStats();

      expect(result.success).toBe(true);
      expect(result.stats).toEqual({
        totalRepositories: 0,
        totalStars: 0,
        totalForks: 0,
        averageStars: 0,
        languages: [],
        licenses: []
      });
    });

    it('should throw a customized error if aggregation fails', async () => {
      mockLangchainRepository.aggregate.mockRejectedValue(new Error('Aggregation failed'));
      await expect(LangchainService.getLangchainStats()).rejects.toThrow(
        'Failed to calculate LangChain catalog stats: Aggregation failed'
      );
    });
  });
});