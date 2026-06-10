import { describe, it, expect, vi, beforeEach } from 'vitest';
import httpStatus from 'http-status';
import { ComposioCatalogController } from './composio-catalog.controller.js';
import { ComposioCatalogService } from './composio-catalog.service.js';

vi.mock('./composio-catalog.service.js', () => ({
  ComposioCatalogService: {
    searchComposioCatalog: vi.fn(),
    getComposioStats: vi.fn(),
    importComposioSubmodule: vi.fn(),
  },
}));

const getMockRes = () => {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
};

describe('ComposioCatalogController', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    mockRes = getMockRes();
    mockNext = vi.fn();
    vi.clearAllMocks();
  });

  describe('getRepositories', () => {
    it('should call searchComposioCatalog with all provided query parameters and return results', async () => {
      mockReq = {
        query: {
          query: 'search-term',
          license: 'MIT',
          language: 'JavaScript',
          sortBy: 'stars',
          limit: '25',
          page: '3',
        },
      };
      const mockResult = { results: [{ name: 'repo1' }], totalResults: 1, page: 3, limit: 25, totalPages: 1 };
      ComposioCatalogService.searchComposioCatalog.mockResolvedValue(mockResult);

      await ComposioCatalogController.getRepositories(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.searchComposioCatalog).toHaveBeenCalledWith('search-term', {
        license: 'MIT',
        language: 'JavaScript',
        limit: 25,
        page: 3,
        sortBy: 'stars',
      });
      expect(mockRes.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use default values for limit and page when they are not provided', async () => {
      mockReq = {
        query: {
          query: 'another-term',
        },
      };
      const mockResult = { results: [], totalResults: 0 };
      ComposioCatalogService.searchComposioCatalog.mockResolvedValue(mockResult);

      await ComposioCatalogController.getRepositories(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.searchComposioCatalog).toHaveBeenCalledWith('another-term', {
        license: undefined,
        language: undefined,
        limit: 10, // Default value
        page: 1,   // Default value
        sortBy: undefined,
      });
      expect(mockRes.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
    });

    it('should use default values for limit and page when provided values are invalid', async () => {
      mockReq = {
        query: {
          limit: 'abc',
          page: 'xyz',
        },
      };
      const mockResult = { results: [], totalResults: 0 };
      ComposioCatalogService.searchComposioCatalog.mockResolvedValue(mockResult);

      await ComposioCatalogController.getRepositories(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.searchComposioCatalog).toHaveBeenCalledWith(undefined, {
        license: undefined,
        language: undefined,
        limit: 10, // Default value
        page: 1,   // Default value
        sortBy: undefined,
      });
    });

    it('should call next with an error if ComposioCatalogService.searchComposioCatalog throws', async () => {
      mockReq = { query: {} };
      const error = new Error('Database connection failed');
      ComposioCatalogService.searchComposioCatalog.mockRejectedValue(error);

      await ComposioCatalogController.getRepositories(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('getStats', () => {
    it('should call getComposioStats and return the statistics successfully', async () => {
      mockReq = {};
      const mockStats = { totalRepositories: 120, languages: { JavaScript: 80 }, licenses: { MIT: 90 } };
      ComposioCatalogService.getComposioStats.mockResolvedValue(mockStats);

      await ComposioCatalogController.getStats(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.getComposioStats).toHaveBeenCalledOnce();
      expect(mockRes.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith(mockStats);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with an error if ComposioCatalogService.getComposioStats throws', async () => {
      mockReq = {};
      const error = new Error('Aggregation failed');
      ComposioCatalogService.getComposioStats.mockRejectedValue(error);

      await ComposioCatalogController.getStats(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });

  describe('importSubmodule', () => {
    it('should successfully import a submodule and return OK status', async () => {
      mockReq = { body: { repoName: 'composio/composio-tools' } };
      const mockResult = { success: true, message: "Submodule 'composio/composio-tools' imported successfully." };
      ComposioCatalogService.importComposioSubmodule.mockResolvedValue(mockResult);

      await ComposioCatalogController.importSubmodule(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.importComposioSubmodule).toHaveBeenCalledWith('composio/composio-tools');
      expect(mockRes.status).toHaveBeenCalledWith(httpStatus.OK);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return BAD_REQUEST if the service indicates a failure (e.g., repo not found)', async () => {
      mockReq = { body: { repoName: 'non/existent-repo' } };
      const mockResult = { success: false, message: 'Repository not found.' };
      ComposioCatalogService.importComposioSubmodule.mockResolvedValue(mockResult);

      await ComposioCatalogController.importSubmodule(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.importComposioSubmodule).toHaveBeenCalledWith('non/existent-repo');
      expect(mockRes.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith(mockResult);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it.each([
      { repoName: undefined, case: 'is undefined' },
      { repoName: null, case: 'is null' },
      { repoName: '', case: 'is an empty string' },
      { repoName: '   ', case: 'is only whitespace' },
      { repoName: 12345, case: 'is not a string' },
      { repoName: {}, case: 'is an object' },
    ])('should return BAD_REQUEST without calling the service if repoName $case', async ({ repoName }) => {
      mockReq = { body: { repoName } };

      await ComposioCatalogController.importSubmodule(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.importComposioSubmodule).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(httpStatus.BAD_REQUEST);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        message: 'Repository name is required and must be a non-empty string.',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with an error if ComposioCatalogService.importComposioSubmodule throws', async () => {
      mockReq = { body: { repoName: 'composio/composio-tools' } };
      const error = new Error('Git command failed');
      ComposioCatalogService.importComposioSubmodule.mockRejectedValue(error);

      await ComposioCatalogController.importSubmodule(mockReq, mockRes, mockNext);

      expect(ComposioCatalogService.importComposioSubmodule).toHaveBeenCalledWith('composio/composio-tools');
      expect(mockNext).toHaveBeenCalledWith(error);
      expect(mockRes.status).not.toHaveBeenCalled();
      expect(mockRes.json).not.toHaveBeenCalled();
    });
  });
});