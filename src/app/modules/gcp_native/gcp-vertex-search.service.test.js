import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GoogleAuth } from 'google-auth-library';
import { logger } from '../../../shared/logger.js';

// Mock dependencies
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const mockRequest = vi.fn();
const mockGetClient = vi.fn().mockResolvedValue({ request: mockRequest });
vi.mock('google-auth-library', () => ({
  GoogleAuth: vi.fn().mockImplementation(() => ({
    getClient: mockGetClient,
  })),
}));

// Import the service after mocks are defined
import { GcpVertexSearchService } from './gcp-vertex-search.service.js';

describe('GcpVertexSearchService', () => {
  describe('searchDataStore', () => {
    const validDataStoreId = 'projects/test-project/locations/global/dataStores/test-datastore';
    const validWorkspaceProjectId = 'test-project';
    const validQuery = 'What is Alti.Assistant?';

    beforeEach(() => {
      vi.clearAllMocks();
    });

    describe('Input Validation and Security Checks', () => {
      it('should throw an error if dataStoreId is not provided', async () => {
        await expect(
          GcpVertexSearchService.searchDataStore(null, validQuery, { workspaceProjectId: validWorkspaceProjectId })
        ).rejects.toThrow('Discovery Engine Data Store ID is required.');
      });

      it('should throw an error if dataStoreId has an invalid format', async () => {
        const invalidId = 'invalid-format';
        await expect(
          GcpVertexSearchService.searchDataStore(invalidId, validQuery, { workspaceProjectId: validWorkspaceProjectId })
        ).rejects.toThrow('Invalid Discovery Engine Data Store ID format.');
      });

      it('should throw an error if workspaceProjectId is not provided', async () => {
        await expect(
          GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, {})
        ).rejects.toThrow('Workspace Project ID is required for authorization.');
      });

      it('should throw an authorization error if workspaceProjectId does not match the project ID in dataStoreId', async () => {
        const mismatchedProjectId = 'another-project';
        await expect(
          GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, { workspaceProjectId: mismatchedProjectId })
        ).rejects.toThrow('Access to the specified data store is not authorized.');
      });

      it('should log a warning when a project ID mismatch occurs', async () => {
        const mismatchedProjectId = 'another-project';
        await expect(
          GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, { workspaceProjectId: mismatchedProjectId })
        ).rejects.toThrow();

        expect(logger.warn).toHaveBeenCalledWith(
          `Authorization mismatch: Attempted to access data store in project "test-project" from a context expecting project "another-project".`
        );
      });
    });

    describe('Edge Cases', () => {
      it('should return an empty success response without calling the API if the query is empty', async () => {
        const result = await GcpVertexSearchService.searchDataStore(validDataStoreId, '', { workspaceProjectId: validWorkspaceProjectId });
        expect(result).toEqual({
          success: true,
          originalQuery: '',
          results: [],
          totalCount: 0,
          dataStoreId: validDataStoreId,
        });
        expect(mockRequest).not.toHaveBeenCalled();
      });

      it('should return an empty success response without calling the API if the query is null', async () => {
        const result = await GcpVertexSearchService.searchDataStore(validDataStoreId, null, { workspaceProjectId: validWorkspaceProjectId });
        expect(result).toEqual({
          success: true,
          originalQuery: null,
          results: [],
          totalCount: 0,
          dataStoreId: validDataStoreId,
        });
        expect(mockRequest).not.toHaveBeenCalled();
      });
    });

    describe('Successful API Interaction', () => {
      const mockApiResponse = {
        results: [
          {
            document: {
              id: 'doc-1',
              name: 'documents/doc-1',
              derivedStructData: {
                title: 'Document One Title',
                link: 'https://example.com/doc1',
                snippets: [{ snippet: 'This is a snippet for document one.' }],
              },
            },
            relevanceScore: 0.95,
          },
          {
            document: {
              id: 'doc-2',
              name: 'documents/doc-2',
              structData: {
                title: 'Document Two Title',
                description: 'Description for document two.',
                uri: 'https://example.com/doc2',
              },
            },
            relevanceScore: 0.85,
          },
          {
            document: {
              id: 'doc-3',
              name: 'documents/doc-3',
              structData: {}, // No title, link, or snippet
            },
            relevanceScore: 0.75,
          },
        ],
        totalSize: 3,
      };

      it('should call the Discovery Engine API with the correct parameters', async () => {
        mockRequest.mockResolvedValue({ data: mockApiResponse });

        await GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, {
          workspaceProjectId: validWorkspaceProjectId,
          pageSize: 20,
          filter: 'category: "tech"',
        });

        expect(mockGetClient).toHaveBeenCalled();
        expect(mockRequest).toHaveBeenCalledTimes(1);
        expect(mockRequest).toHaveBeenCalledWith({
          url: `https://discoveryengine.googleapis.com/v1beta/${validDataStoreId}/servingConfigs/default_search:search`,
          method: 'POST',
          data: {
            query: validQuery,
            pageSize: 20,
            filter: 'category: "tech"',
            contentSearchSpec: {
              snippetSpec: { returnSnippet: true },
              summarySpec: { summaryResultCount: 3 },
            },
          },
        });
      });

      it('should cap the pageSize at 100 if a larger value is provided', async () => {
        mockRequest.mockResolvedValue({ data: {} });
        await GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, {
          workspaceProjectId: validWorkspaceProjectId,
          pageSize: 200,
        });
        expect(mockRequest).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ pageSize: 100 }),
        }));
      });

      it('should correctly parse a successful API response and format the results', async () => {
        mockRequest.mockResolvedValue({ data: mockApiResponse });

        const result = await GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, {
          workspaceProjectId: validWorkspaceProjectId,
        });

        expect(result.success).toBe(true);
        expect(result.originalQuery).toBe(validQuery);
        expect(result.dataStoreId).toBe(validDataStoreId);
        expect(result.totalCount).toBe(3);
        expect(result.results).toHaveLength(3);

        // Test result from derivedStructData with snippet
        expect(result.results[0]).toEqual({
          id: 'doc-1',
          name: 'documents/doc-1',
          title: 'Document One Title',
          snippet: 'This is a snippet for document one.',
          link: 'https://example.com/doc1',
          relevanceScore: 0.95,
          index: 1,
        });

        // Test result from structData with description fallback for snippet and uri for link
        expect(result.results[1]).toEqual({
          id: 'doc-2',
          name: 'documents/doc-2',
          title: 'Document Two Title',
          snippet: 'Description for document two.',
          link: 'https://example.com/doc2',
          relevanceScore: 0.85,
          index: 2,
        });

        // Test fallbacks for missing fields
        expect(result.results[2]).toEqual({
          id: 'doc-3',
          name: 'documents/doc-3',
          title: 'doc-3', // Fallback to ID
          snippet: '',
          link: '',
          relevanceScore: 0.75,
          index: 3,
        });

        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Querying data store "${validDataStoreId}"`));
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(`Successfully retrieved 3 documents`));
      });
    });

    describe('API Error Handling', () => {
      it('should return a structured error response if the API call fails with a generic error', async () => {
        const genericError = new Error('Network Error');
        mockRequest.mockRejectedValue(genericError);

        const result = await GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, {
          workspaceProjectId: validWorkspaceProjectId,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to query data store. Please check configuration and permissions.');
        expect(result.results).toEqual([]);
        expect(result.dataStoreId).toBe(validDataStoreId);

        expect(logger.error).toHaveBeenCalledWith(
          'GCP Vertex Search Query Error (Code: N/A): Network Error',
          expect.any(Object)
        );
      });

      it('should return a structured error response and log details if the API returns a specific error object', async () => {
        const apiError = {
          response: {
            data: {
              error: {
                code: 403,
                message: 'Permission denied on resource.',
              },
            },
          },
          message: 'Request failed with status code 403',
        };
        mockRequest.mockRejectedValue(apiError);

        const result = await GcpVertexSearchService.searchDataStore(validDataStoreId, validQuery, {
          workspaceProjectId: validWorkspaceProjectId,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('Failed to query data store. Please check configuration and permissions.');

        expect(logger.error).toHaveBeenCalledWith(
          'GCP Vertex Search Query Error (Code: 403): Permission denied on resource.',
          expect.objectContaining({
            error: expect.objectContaining({
              message: 'Request failed with status code 403',
              response: apiError.response.data,
            }),
            dataStoreId: validDataStoreId,
            query: validQuery,
          })
        );
      });
    });
  });
});