import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { Storage } from '@google-cloud/storage';
import { connectToMongoDB } from '../utils/mongodb-connection.js';
import config from '../../../../../config/index.js';
import {
  withTenantPipeline,
  withTenantFilter,
} from '../../../helpers/tenantQuery.js';

// Mock external dependencies
vi.mock('mongoose', async (importOriginal) => {
  const actualMongoose = await importOriginal();
  const mockModel = {
    save: vi.fn(),
    find: vi.fn().mockReturnThis(),
    findOne: vi.fn().mockReturnThis(),
    countDocuments: vi.fn(),
    aggregate: vi.fn(),
    findOneAndUpdate: vi.fn(),
    findOneAndDelete: vi.fn(),
    sort: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    lean: vi.fn(),
    skip: vi.fn().mockReturnThis(),
  };
  return {
    ...actualMongoose,
    default: {
      ...actualMongoose.default,
      Schema: vi.fn(() => ({
        index: vi.fn(),
      })),
      model: vi.fn(() => {
        // Mock the constructor for new ResearchResult()
        const ResearchResultConstructor = vi.fn((data) => {
          mockModel.save.mockResolvedValueOnce({ _id: 'mockId123', ...data });
          return { ...data, save: mockModel.save };
        });
        // Attach static methods to the constructor for ResearchResult.find(), etc.
        Object.assign(ResearchResultConstructor, mockModel);
        return ResearchResultConstructor;
      }),
    },
  };
});

vi.mock('@google-cloud/storage', () => {
  const mockFile = {
    save: vi.fn(),
  };
  const mockBucket = {
    file: vi.fn(() => mockFile),
  };
  const mockStorage = {
    bucket: vi.fn(() => mockBucket),
  };
  return {
    Storage: vi.fn(() => mockStorage),
  };
});

vi.mock('../utils/mongodb-connection.js', () => ({
  connectToMongoDB: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'mock-project-id',
    },
    database_local: 'mongodb://mock-db-uri/test',
  },
}));

vi.mock('../../../helpers/tenantQuery.js', () => ({
  withTenantPipeline: vi.fn((req, pipeline) => {
    const tenantFilter = req?.user?.tenantId ? { tenantId: req.user.tenantId } : {};
    return [{ $match: tenantFilter }, ...pipeline];
  }),
  withTenantFilter: vi.fn((req, query) => {
    const tenantFilter = req?.user?.tenantId ? { tenantId: req.user.tenantId } : {};
    return { ...query, ...tenantFilter };
  }),
}));

// Import the module under test AFTER mocks are defined
const {
  saveResearchResult,
  getResearchResultsByQuery,
  getRecentResearchResults,
  getResearchResultById,
  getResearchResultsByConversation,
  deleteResearchResult,
  getResearchStatistics,
  addTagsToResult,
  searchResearchResults,
  publishDeepResearchToGCS,
  ResearchResult, // Also export ResearchResult to access its mocked methods
} = await import('./researchStorageService.js');

describe('researchStorageService', () => {
  let consoleErrorSpy;
  let consoleWarnSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset mock implementations for ResearchResult methods
    ResearchResult.save.mockReset();
    ResearchResult.find.mockReset().mockReturnThis();
    ResearchResult.findOne.mockReset().mockReturnThis();
    ResearchResult.countDocuments.mockReset();
    ResearchResult.aggregate.mockReset();
    ResearchResult.findOneAndUpdate.mockReset();
    ResearchResult.findOneAndDelete.mockReset();
    ResearchResult.sort.mockReset().mockReturnThis();
    ResearchResult.limit.mockReset().mockReturnThis();
    ResearchResult.select.mockReset().mockReturnThis();
    ResearchResult.lean.mockReset();
    ResearchResult.skip.mockReset().mockReturnThis();

    // Default lean() to resolve with an empty array or null
    ResearchResult.lean.mockResolvedValue([]);
    ResearchResult.findOne.mockReturnThis(); // Ensure findOne is chainable
    ResearchResult.lean.mockResolvedValue(null); // Default for findOne().lean()
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('should initialize MongoDB connection on import', () => {
    expect(connectToMongoDB).toHaveBeenCalledWith(config.database_local);
  });

  it('should initialize GCS Storage client on import', () => {
    expect(Storage).toHaveBeenCalledWith({
      projectId: 'mock-project-id',
      keyFilename: 'alti_gcp.json',
    });
  });

  describe('saveResearchResult', () => {
    it('should save a research result successfully', async () => {
      const mockResultData = {
        query: 'test query',
        answer: 'test answer',
        classification: 'search',
        userId: 'user123',
        conversationId: 'conv456',
      };
      const savedResult = { _id: 'mockId123', ...mockResultData };

      ResearchResult.save.mockResolvedValue(savedResult);

      const result = await saveResearchResult(mockResultData);

      expect(ResearchResult).toHaveBeenCalledWith(mockResultData);
      expect(ResearchResult.save).toHaveBeenCalledTimes(1);
      expect(result).toEqual(savedResult);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if saving fails', async () => {
      const mockResultData = {
        query: 'test query',
        answer: 'test answer',
        classification: 'search',
        userId: 'user123',
        conversationId: 'conv456',
      };
      const mockError = new Error('Failed to save');

      ResearchResult.save.mockRejectedValue(mockError);

      await expect(saveResearchResult(mockResultData)).rejects.toThrow(mockError);
      expect(ResearchResult).toHaveBeenCalledWith(mockResultData);
      expect(ResearchResult.save).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error saving research result:', mockError);
    });
  });

  describe('getResearchResultsByQuery', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockResults = [
      { _id: 'r1', query: 'test', classification: 'search' },
      { _id: 'r2', query: 'test', classification: 'direct' },
    ];

    it('should retrieve research results by query with tenant filter', async () => {
      ResearchResult.lean.mockResolvedValue(mockResults);

      const results = await getResearchResultsByQuery('test query', 5, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { $text: { $search: 'test query' } });
      expect(ResearchResult.find).toHaveBeenCalledWith({ $text: { $search: 'test query' }, tenantId: 'tenant123' });
      expect(ResearchResult.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(ResearchResult.limit).toHaveBeenCalledWith(5);
      expect(ResearchResult.lean).toHaveBeenCalledTimes(1);
      expect(results).toEqual(mockResults);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should use default limit if not provided', async () => {
      ResearchResult.lean.mockResolvedValue(mockResults);
      await getResearchResultsByQuery('test query', undefined, mockReq);
      expect(ResearchResult.limit).toHaveBeenCalledWith(10);
    });

    it('should throw an error if retrieval fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.lean.mockRejectedValue(mockError);

      await expect(getResearchResultsByQuery('test query', 5, mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving research results by query:', mockError);
    });
  });

  describe('getRecentResearchResults', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockResults = [
      { _id: 'r1', query: 'recent1', classification: 'search', timestamp: new Date() },
      { _id: 'r2', query: 'recent2', classification: 'direct', timestamp: new Date() },
    ];

    it('should retrieve recent research results with tenant filter', async () => {
      ResearchResult.lean.mockResolvedValue(mockResults);

      const results = await getRecentResearchResults(5, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {});
      expect(ResearchResult.find).toHaveBeenCalledWith({ tenantId: 'tenant123' });
      expect(ResearchResult.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(ResearchResult.limit).toHaveBeenCalledWith(5);
      expect(ResearchResult.select).toHaveBeenCalledWith('query classification timestamp metadata.processingTime');
      expect(ResearchResult.lean).toHaveBeenCalledTimes(1);
      expect(results).toEqual(mockResults);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should use default limit if not provided', async () => {
      ResearchResult.lean.mockResolvedValue(mockResults);
      await getRecentResearchResults(undefined, mockReq);
      expect(ResearchResult.limit).toHaveBeenCalledWith(20);
    });

    it('should throw an error if retrieval fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.lean.mockRejectedValue(mockError);

      await expect(getRecentResearchResults(5, mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving recent research results:', mockError);
    });
  });

  describe('getResearchResultById', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockResult = { _id: 'mockId', query: 'single result' };

    it('should retrieve a research result by ID with tenant filter', async () => {
      ResearchResult.lean.mockResolvedValue(mockResult);

      const result = await getResearchResultById('mockId', mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: 'mockId' });
      expect(ResearchResult.findOne).toHaveBeenCalledWith({ _id: 'mockId', tenantId: 'tenant123' });
      expect(ResearchResult.lean).toHaveBeenCalledTimes(1);
      expect(result).toEqual(mockResult);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return null if result not found', async () => {
      ResearchResult.lean.mockResolvedValue(null);

      const result = await getResearchResultById('nonExistentId', mockReq);

      expect(result).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if retrieval fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.lean.mockRejectedValue(mockError);

      await expect(getResearchResultById('mockId', mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving research result by ID:', mockError);
    });
  });

  describe('getResearchResultsByConversation', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockResults = [
      { _id: 'r1', conversationId: 'conv1', query: 'q1' },
      { _id: 'r2', conversationId: 'conv1', query: 'q2' },
    ];

    it('should retrieve research results by conversation ID with tenant filter', async () => {
      ResearchResult.lean.mockResolvedValue(mockResults);

      const results = await getResearchResultsByConversation('conv1', mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { conversationId: 'conv1' });
      expect(ResearchResult.find).toHaveBeenCalledWith({ conversationId: 'conv1', tenantId: 'tenant123' });
      expect(ResearchResult.sort).toHaveBeenCalledWith({ timestamp: 1 });
      expect(ResearchResult.lean).toHaveBeenCalledTimes(1);
      expect(results).toEqual(mockResults);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return empty array if no results found', async () => {
      ResearchResult.lean.mockResolvedValue([]);

      const results = await getResearchResultsByConversation('nonExistentConv', mockReq);

      expect(results).toEqual([]);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if retrieval fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.lean.mockRejectedValue(mockError);

      await expect(getResearchResultsByConversation('conv1', mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error retrieving research results by conversation:', mockError);
    });
  });

  describe('deleteResearchResult', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockDeletedResult = { _id: 'mockId', query: 'deleted result' };

    it('should delete a research result by ID with tenant filter', async () => {
      ResearchResult.findOneAndDelete.mockResolvedValue(mockDeletedResult);

      const result = await deleteResearchResult('mockId', mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: 'mockId' });
      expect(ResearchResult.findOneAndDelete).toHaveBeenCalledWith({ _id: 'mockId', tenantId: 'tenant123' });
      expect(result).toEqual(mockDeletedResult);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return null if result not found for deletion', async () => {
      ResearchResult.findOneAndDelete.mockResolvedValue(null);

      const result = await deleteResearchResult('nonExistentId', mockReq);

      expect(result).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if deletion fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.findOneAndDelete.mockRejectedValue(mockError);

      await expect(deleteResearchResult('mockId', mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting research result:', mockError);
    });
  });

  describe('getResearchStatistics', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };

    it('should retrieve research statistics with tenant filter', async () => {
      ResearchResult.countDocuments
        .mockResolvedValueOnce(100) // totalResults
        .mockResolvedValueOnce(50)  // searchResults
        .mockResolvedValueOnce(30); // directResults

      ResearchResult.aggregate
        .mockResolvedValueOnce([{ _id: null, avgTime: 1500 }]) // avgProcessingTime
        .mockResolvedValueOnce([{ _id: 10, count: 5 }, { _id: 11, count: 8 }]); // recentActivity

      const stats = await getResearchStatistics(mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {});
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { classification: 'search' });
      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { classification: 'direct' });

      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({ tenantId: 'tenant123' });
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({ classification: 'search', tenantId: 'tenant123' });
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({ classification: 'direct', tenantId: 'tenant123' });

      expect(withTenantPipeline).toHaveBeenCalledTimes(2);
      expect(ResearchResult.aggregate).toHaveBeenCalledTimes(2);

      expect(stats).toEqual({
        total: 100,
        searchBased: 50,
        directResponse: 30,
        averageProcessingTime: 1500,
        last24Hours: [{ _id: 10, count: 5 }, { _id: 11, count: 8 }],
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should retrieve research statistics without tenant filter if req is null', async () => {
      ResearchResult.countDocuments
        .mockResolvedValueOnce(100)
        .mockResolvedValueOnce(50)
        .mockResolvedValueOnce(30);

      ResearchResult.aggregate
        .mockResolvedValueOnce([{ _id: null, avgTime: 1500 }])
        .mockResolvedValueOnce([{ _id: 10, count: 5 }]);

      const stats = await getResearchStatistics(null);

      expect(withTenantFilter).not.toHaveBeenCalledWith(null, {}); // Should not be called with null req
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({});
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({ classification: 'search' });
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({ classification: 'direct' });

      expect(withTenantPipeline).toHaveBeenCalledTimes(2); // Still called, but req is null
      expect(ResearchResult.aggregate).toHaveBeenCalledTimes(2);

      expect(stats.total).toBe(100);
      expect(stats.averageProcessingTime).toBe(1500);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should handle empty aggregate results gracefully', async () => {
      ResearchResult.countDocuments
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);

      ResearchResult.aggregate
        .mockResolvedValueOnce([]) // No avgTime
        .mockResolvedValueOnce([]); // No recentActivity

      const stats = await getResearchStatistics(mockReq);

      expect(stats.total).toBe(0);
      expect(stats.averageProcessingTime).toBe(0);
      expect(stats.last24Hours).toEqual([]);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if statistics retrieval fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.countDocuments.mockRejectedValue(mockError);

      await expect(getResearchStatistics(mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error getting research statistics:', mockError);
    });
  });

  describe('addTagsToResult', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockUpdatedResult = { _id: 'mockId', tags: ['tag1', 'tag2'] };

    it('should add tags to a research result with tenant filter', async () => {
      ResearchResult.findOneAndUpdate.mockResolvedValue(mockUpdatedResult);

      const result = await addTagsToResult('mockId', ['tag1', 'tag2'], mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, { _id: 'mockId' });
      expect(ResearchResult.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'mockId', tenantId: 'tenant123' },
        { $addToSet: { tags: { $each: ['tag1', 'tag2'] } } },
        { new: true }
      );
      expect(result).toEqual(mockUpdatedResult);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should return null if result not found for tagging', async () => {
      ResearchResult.findOneAndUpdate.mockResolvedValue(null);

      const result = await addTagsToResult('nonExistentId', ['tag1'], mockReq);

      expect(result).toBeNull();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should throw an error if tagging fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.findOneAndUpdate.mockRejectedValue(mockError);

      await expect(addTagsToResult('mockId', ['tag1'], mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error adding tags to research result:', mockError);
    });
  });

  describe('searchResearchResults', () => {
    const mockReq = { user: { tenantId: 'tenant123' } };
    const mockSearchResults = [{ _id: 's1', query: 'search' }];
    const mockTotalCount = 1;

    it('should search research results with tenant filter and basic query', async () => {
      ResearchResult.lean.mockResolvedValue(mockSearchResults);
      ResearchResult.countDocuments.mockResolvedValue(mockTotalCount);

      const filters = { query: 'search term' };
      const result = await searchResearchResults(filters, mockReq);

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {});
      expect(ResearchResult.find).toHaveBeenCalledWith({ $text: { $search: 'search term' }, tenantId: 'tenant123' });
      expect(ResearchResult.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(ResearchResult.skip).toHaveBeenCalledWith(0);
      expect(ResearchResult.limit).toHaveBeenCalledWith(20);
      expect(ResearchResult.lean).toHaveBeenCalledTimes(1);
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith({ $text: { $search: 'search term' }, tenantId: 'tenant123' });
      expect(result).toEqual({
        results: mockSearchResults,
        total: mockTotalCount,
        limit: 20,
        offset: 0,
        hasMore: false,
      });
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should apply all filters including classification, date range, tags, and userId', async () => {
      ResearchResult.lean.mockResolvedValue(mockSearchResults);
      ResearchResult.countDocuments.mockResolvedValue(mockTotalCount);

      const filters = {
        query: 'advanced search',
        classification: 'deep_research',
        startDate: '2023-01-01',
        endDate: '2023-01-31',
        tags: ['tagA', 'tagB'],
        userId: 'specificUser',
        limit: 10,
        offset: 5,
      };
      await searchResearchResults(filters, mockReq);

      const expectedQuery = {
        $text: { $search: 'advanced search' },
        classification: 'deep_research',
        timestamp: {
          $gte: new Date('2023-01-01'),
          $lte: new Date('2023-01-31'),
        },
        tags: { $in: ['tagA', 'tagB'] },
        userId: 'specificUser',
        tenantId: 'tenant123',
      };

      expect(withTenantFilter).toHaveBeenCalledWith(mockReq, {});
      expect(ResearchResult.find).toHaveBeenCalledWith(expectedQuery);
      expect(ResearchResult.sort).toHaveBeenCalledWith({ timestamp: -1 });
      expect(ResearchResult.skip).toHaveBeenCalledWith(5);
      expect(ResearchResult.limit).toHaveBeenCalledWith(10);
      expect(ResearchResult.countDocuments).toHaveBeenCalledWith(expectedQuery);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should calculate hasMore correctly', async () => {
      ResearchResult.lean.mockResolvedValue(mockSearchResults);
      ResearchResult.countDocuments.mockResolvedValue(10); // total
      const filters = { limit: 5, offset: 0 };
      let result = await searchResearchResults(filters, mockReq);
      expect(result.hasMore).toBe(true);

      ResearchResult.countDocuments.mockResolvedValue(10); // total
      const filters2 = { limit: 5, offset: 5 };
      result = await searchResearchResults(filters2, mockReq);
      expect(result.hasMore).toBe(false); // 5 + 5 is not less than 10

      ResearchResult.countDocuments.mockResolvedValue(10); // total
      const filters3 = { limit: 10, offset: 0 };
      result = await searchResearchResults(filters3, mockReq);
      expect(result.hasMore).toBe(false);
    });

    it('should throw an error if search fails', async () => {
      const mockError = new Error('DB error');
      ResearchResult.find.mockRejectedValue(mockError);

      await expect(searchResearchResults({}, mockReq)).rejects.toThrow(mockError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error searching research results:', mockError);
    });
  });

  describe('publishDeepResearchToGCS', () => {
    const mockPdfBuffer = Buffer.from('mock pdf content');
    const mockTopologyData = { nodes: [], edges: [] };
    const mockFilename = 'report.pdf';
    const mockUserId = 'testUser';
    const mockConversationId = 'testConv';
    const DEEP_RESEARCH_BUCKET = 'alti_assistant_reports';

    let mockStorageInstance;
    let mockBucketInstance;
    let mockFileInstance;

    beforeEach(() => {
      mockFileInstance = {
        save: vi.fn().mockResolvedValue(true),
      };
      mockBucketInstance = {
        file: vi.fn(() => mockFileInstance),
      };
      mockStorageInstance = {
        bucket: vi.fn(() => mockBucketInstance),
      };
      Storage.mockImplementation(() => mockStorageInstance);
      // Re-import to ensure the `storage` variable in the module is updated
      // This is a bit tricky with top-level variable initialization.
      // For this test, we'll assume `storage` is correctly initialized based on the mock.
      // If `storage` was null due to an init error, we'd need to mock that specifically.
    });

    it('should publish PDF and topology data to GCS successfully', async () => {
      const result = await publishDeepResearchToGCS(
        mockPdfBuffer,
        mockFilename,
        mockTopologyData,
        mockUserId,
        mockConversationId
      );

      expect(mockStorageInstance.bucket).toHaveBeenCalledWith(DEEP_RESEARCH_BUCKET);

      // PDF upload
      const pdfPath = `${mockUserId}/${mockConversationId}/${mockFilename}`;
      expect(mockBucketInstance.file).toHaveBeenCalledWith(pdfPath);
      expect(mockFileInstance.save).toHaveBeenCalledWith(mockPdfBuffer, {
        metadata: { contentType: 'application/pdf' },
        resumable: false,
      });
      const expectedPdfUrl = `https://storage.googleapis.com/${DEEP_RESEARCH_BUCKET}/${pdfPath}`;

      // Topology upload
      const topologyFilename = mockFilename.replace('.pdf', '_topology.json');
      const topologyPath = `${mockUserId}/${mockConversationId}/${topologyFilename}`;
      expect(mockBucketInstance.file).toHaveBeenCalledWith(topologyPath);
      expect(mockFileInstance.save).toHaveBeenCalledWith(
        Buffer.from(JSON.stringify(mockTopologyData, null, 2)),
        {
          metadata: { contentType: 'application/json' },
          resumable: false,
        }
      );
      const expectedTopologyUrl = `https://storage.googleapis.com/${DEEP_RESEARCH_BUCKET}/${topologyPath}`;

      expect(result).toEqual({
        success: true,
        gcsPdfUrl: expectedPdfUrl,
        gcsTopologyUrl: expectedTopologyUrl,
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should publish only PDF if topologyData is null', async () => {
      const result = await publishDeepResearchToGCS(
        mockPdfBuffer,
        mockFilename,
        null, // No topology data
        mockUserId,
        mockConversationId
      );

      expect(mockStorageInstance.bucket).toHaveBeenCalledWith(DEEP_RESEARCH_BUCKET);

      // PDF upload
      const pdfPath = `${mockUserId}/${mockConversationId}/${mockFilename}`;
      expect(mockBucketInstance.file).toHaveBeenCalledWith(pdfPath);
      expect(mockFileInstance.save).toHaveBeenCalledWith(mockPdfBuffer, expect.any(Object));
      const expectedPdfUrl = `https://storage.googleapis.com/${DEEP_RESEARCH_BUCKET}/${pdfPath}`;

      // Topology upload should not be called
      const topologyFilename = mockFilename.replace('.pdf', '_topology.json');
      const topologyPath = `${mockUserId}/${mockConversationId}/${topologyFilename}`;
      expect(mockBucketInstance.file).not.toHaveBeenCalledWith(topologyPath);

      expect(result).toEqual({
        success: true,
        gcsPdfUrl: expectedPdfUrl,
        gcsTopologyUrl: null,
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should publish only topology data if pdfBuffer is null', async () => {
      const result = await publishDeepResearchToGCS(
        null, // No PDF buffer
        mockFilename,
        mockTopologyData,
        mockUserId,
        mockConversationId
      );

      expect(mockStorageInstance.bucket).toHaveBeenCalledWith(DEEP_RESEARCH_BUCKET);

      // PDF upload should not be called
      const pdfPath = `${mockUserId}/${mockConversationId}/${mockFilename}`;
      expect(mockBucketInstance.file).not.toHaveBeenCalledWith(pdfPath);

      // Topology upload
      const topologyFilename = mockFilename.replace('.pdf', '_topology.json');
      const topologyPath = `${mockUserId}/${mockConversationId}/${topologyFilename}`;
      expect(mockBucketInstance.file).toHaveBeenCalledWith(topologyPath);
      expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), expect.any(Object));
      const expectedTopologyUrl = `https://storage.googleapis.com/${DEEP_RESEARCH_BUCKET}/${topologyPath}`;

      expect(result).toEqual({
        success: true,
        gcsPdfUrl: null,
        gcsTopologyUrl: expectedTopologyUrl,
      });
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should return inactive status if GCS client is not active', async () => {
      // Temporarily set storage to null for this test
      // This requires re-importing the module or directly manipulating the `storage` variable if possible.
      // Given the module structure, the `storage` variable is a top-level `let`.
      // The easiest way to test this is to mock `Storage` to throw an error during initialization,
      // which would cause the `storage` variable to remain null.
      Storage.mockImplementation(() => {
        throw new Error('GCS init error');
      });
      // Re-import the module to trigger the initialization logic with the new mock
      const { publishDeepResearchToGCS: publishDeepResearchToGCS_reimported } = await import('./researchStorageService.js');

      const result = await publishDeepResearchToGCS_reimported(
        mockPdfBuffer,
        mockFilename,
        mockTopologyData,
        mockUserId,
        mockConversationId
      );

      expect(result).toEqual({ success: false, reason: 'GCS client inactive' });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️ Google Cloud Storage client initialization bypassed:',
        'GCS init error'
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'ℹ️ GCS Storage client not active, skipping cloud publishing'
      );
    });

    it('should handle GCS upload errors gracefully', async () => {
      const mockError = new Error('GCS upload failed');
      mockFileInstance.save.mockRejectedValue(mockError);

      const result = await publishDeepResearchToGCS(
        mockPdfBuffer,
        mockFilename,
        mockTopologyData,
        mockUserId,
        mockConversationId
      );

      expect(result).toEqual({ success: false, error: mockError.message });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        '⚠️ GCS Cloud publishing failed (offline sandbox tolerance active):',
        mockError.message
      );
    });
  });
});