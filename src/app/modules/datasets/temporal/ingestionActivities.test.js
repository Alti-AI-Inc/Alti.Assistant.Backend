import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  scanHFHubActivity,
  downloadAndArchiveActivity,
  indexRAGActivity,
  purgeCorruptDatasetActivity
} from './ingestionActivities.js';

// Mock external dependencies
const mockDatasetsCrawlerService = {
  scanHuggingFaceHub: vi.fn()
};

const mockDatasetsService = {
  getHFDatasetInfo: vi.fn(),
  archiveDatasetToGCSCore: vi.fn(),
  indexDatasetForRAGCore: vi.fn()
};

const mockDatasetSave = vi.fn();
const mockDatasetFindOne = vi.fn();
const mockDataset = vi.fn(() => ({
  datasetId: 'mock-new-dataset',
  name: 'Mock New Dataset',
  author: 'Mock Author',
  description: 'Mock Description',
  downloads: 100,
  likes: 10,
  tags: ['mock', 'test'],
  configs: [],
  splits: [],
  status: 'pending',
  save: mockDatasetSave
}));

const mockDatasetQueueSave = vi.fn();
const mockDatasetQueueFindOne = vi.fn();
const mockDatasetQueue = vi.fn(() => ({
  datasetId: 'mock-queued-dataset',
  status: 'pending',
  save: mockDatasetQueueSave
}));

const mockFileDelete = vi.fn();
const mockBucketGetFiles = vi.fn();
const mockStorageBucket = vi.fn(() => ({
  getFiles: mockBucketGetFiles
}));
const mockStorage = vi.fn(() => ({
  bucket: mockStorageBucket
}));

const mockPathJoin = vi.fn();

const mockConfig = {
  google: {
    google_application_credentials: 'mock-gcp-key.json'
  },
  gcs: {
    knowledge_bank_bucket: 'mock-gcs-bucket'
  }
};

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn()
};

vi.mock('../datasetsCrawler.service.js', () => ({
  DatasetsCrawlerService: mockDatasetsCrawlerService
}));

vi.mock('../datasets.service.js', () => ({
  DatasetsService: mockDatasetsService
}));

vi.mock('../datasets.model.js', () => ({
  default: {
    findOne: mockDatasetFindOne,
    // Mock the constructor directly for `new Dataset(...)`
    __esModule: true,
    default: mockDataset
  }
}));

vi.mock('../datasetQueue.model.js', () => ({
  default: {
    findOne: mockDatasetQueueFindOne,
    __esModule: true,
    default: mockDatasetQueue
  }
}));

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorage
}));

vi.mock('path', () => ({
  default: {
    join: mockPathJoin
  }
}));

vi.mock('../../../../../config/index.js', () => ({
  default: mockConfig
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger
}));

describe('Temporal Ingestion Activities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations for models
    mockDatasetFindOne.mockResolvedValue(null);
    mockDatasetQueueFindOne.mockResolvedValue(null);
    mockDatasetSave.mockResolvedValue(true);
    mockDatasetQueueSave.mockResolvedValue(true);
    mockFileDelete.mockResolvedValue(true);
    mockBucketGetFiles.mockResolvedValue([[]]); // Default to no files
  });

  describe('scanHFHubActivity', () => {
    it('should successfully scan Hugging Face Hub and return report', async () => {
      const mockReport = {
        scannedCount: 100,
        newDatasetsCount: 10,
        queuedDatasetsCount: 5
      };
      mockDatasetsCrawlerService.scanHuggingFaceHub.mockResolvedValue(mockReport);

      const result = await scanHFHubActivity(200);

      expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Activity] Scanning Hugging Face Hub (Limit: 200)');
      expect(mockDatasetsCrawlerService.scanHuggingFaceHub).toHaveBeenCalledWith(200);
      expect(result).toEqual(mockReport);
    });

    it('should use default maxDatasetsToScan if not provided', async () => {
      const mockReport = {
        scannedCount: 500,
        newDatasetsCount: 50,
        queuedDatasetsCount: 25
      };
      mockDatasetsCrawlerService.scanHuggingFaceHub.mockResolvedValue(mockReport);

      const result = await scanHFHubActivity();

      expect(mockLogger.info).toHaveBeenCalledWith('[Temporal Activity] Scanning Hugging Face Hub (Limit: 500)');
      expect(mockDatasetsCrawlerService.scanHuggingFaceHub).toHaveBeenCalledWith(500);
      expect(result).toEqual(mockReport);
    });

    it('should log error and re-throw if scan fails', async () => {
      const errorMessage = 'HF Hub API error';
      mockDatasetsCrawlerService.scanHuggingFaceHub.mockRejectedValue(new Error(errorMessage));

      await expect(scanHFHubActivity()).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Activity] HF Hub scan failed: ${errorMessage}`);
    });
  });

  describe('downloadAndArchiveActivity', () => {
    const mockDatasetId = 'HuggingFaceH4/ultrachat_200k';
    const mockHFInfo = {
      datasetId: mockDatasetId,
      name: 'ultrachat_200k',
      author: 'HuggingFaceH4',
      description: 'A chat dataset',
      downloads: 1000,
      likes: 100,
      tags: ['chat', 'llm'],
      configs: [],
      splits: []
    };
    const mockArchivedDataset = {
      datasetId: mockDatasetId,
      sizeBytes: 123456789,
      gcsPaths: ['gs://mock-bucket/datasets/ultrachat_200k/file1.parquet']
    };

    it('should successfully download and archive a new dataset', async () => {
      mockDatasetsService.getHFDatasetInfo.mockResolvedValue(mockHFInfo);
      mockDatasetFindOne.mockResolvedValue(null); // No existing dataset
      mockDatasetSave.mockImplementation(function () {
        Object.assign(this, mockArchivedDataset); // Simulate saving updates sizeBytes and gcsPaths
        return Promise.resolve(this);
      });
      mockDatasetsService.archiveDatasetToGCSCore.mockResolvedValue(true);

      const result = await downloadAndArchiveActivity(mockDatasetId);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Temporal Activity] Downloading and Archiving dataset to GCS: ${mockDatasetId}`);
      expect(mockDatasetsService.getHFDatasetInfo).toHaveBeenCalledWith(mockDatasetId);
      expect(mockDatasetFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockDataset).toHaveBeenCalledWith(expect.objectContaining({
        datasetId: mockHFInfo.datasetId,
        status: 'pending'
      }));
      expect(mockDatasetSave).toHaveBeenCalledTimes(2); // One for initial save, one for archiveDatasetToGCSCore (which updates the object)
      expect(mockDatasetsService.archiveDatasetToGCSCore).toHaveBeenCalledWith(mockDatasetId, expect.any(Object));
      expect(result).toEqual({
        success: true,
        datasetId: mockDatasetId,
        sizeBytes: mockArchivedDataset.sizeBytes,
        gcsPaths: mockArchivedDataset.gcsPaths
      });
    });

    it('should successfully download and archive an existing dataset', async () => {
      const existingDataset = {
        datasetId: mockDatasetId,
        name: 'old_name',
        status: 'failed',
        error: 'previous error',
        save: mockDatasetSave
      };
      mockDatasetsService.getHFDatasetInfo.mockResolvedValue(mockHFInfo);
      mockDatasetFindOne.mockResolvedValue(existingDataset); // Existing dataset
      mockDatasetSave.mockImplementation(function () {
        Object.assign(this, mockArchivedDataset); // Simulate saving updates sizeBytes and gcsPaths
        return Promise.resolve(this);
      });
      mockDatasetsService.archiveDatasetToGCSCore.mockResolvedValue(true);

      const result = await downloadAndArchiveActivity(mockDatasetId);

      expect(mockDatasetFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockDataset).not.toHaveBeenCalled(); // Should not call constructor for existing
      expect(existingDataset.status).toBe('pending');
      expect(existingDataset.error).toBe('');
      expect(mockDatasetSave).toHaveBeenCalledTimes(2); // One for status update, one for archiveDatasetToGCSCore (which updates the object)
      expect(mockDatasetsService.archiveDatasetToGCSCore).toHaveBeenCalledWith(mockDatasetId, existingDataset);
      expect(result).toEqual({
        success: true,
        datasetId: mockDatasetId,
        sizeBytes: mockArchivedDataset.sizeBytes,
        gcsPaths: mockArchivedDataset.gcsPaths
      });
    });

    it('should log error and re-throw if getHFDatasetInfo fails', async () => {
      const errorMessage = 'Failed to get HF info';
      mockDatasetsService.getHFDatasetInfo.mockRejectedValue(new Error(errorMessage));

      await expect(downloadAndArchiveActivity(mockDatasetId)).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Activity] Failed to archive dataset ${mockDatasetId}: ${errorMessage}`);
    });

    it('should log error and re-throw if dataset save fails', async () => {
      const errorMessage = 'DB save error';
      mockDatasetsService.getHFDatasetInfo.mockResolvedValue(mockHFInfo);
      mockDatasetSave.mockRejectedValue(new Error(errorMessage));

      await expect(downloadAndArchiveActivity(mockDatasetId)).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Activity] Failed to archive dataset ${mockDatasetId}: ${errorMessage}`);
    });

    it('should log error and re-throw if archiveDatasetToGCSCore fails', async () => {
      const errorMessage = 'GCS upload error';
      mockDatasetsService.getHFDatasetInfo.mockResolvedValue(mockHFInfo);
      mockDatasetSave.mockResolvedValue(true);
      mockDatasetsService.archiveDatasetToGCSCore.mockRejectedValue(new Error(errorMessage));

      await expect(downloadAndArchiveActivity(mockDatasetId)).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Activity] Failed to archive dataset ${mockDatasetId}: ${errorMessage}`);
    });
  });

  describe('indexRAGActivity', () => {
    const mockDatasetId = 'HuggingFaceH4/ultrachat_200k';
    const mockIndexedDataset = {
      datasetId: mockDatasetId,
      status: 'indexed',
      save: mockDatasetSave
    };

    it('should successfully index dataset for RAG', async () => {
      mockDatasetFindOne.mockResolvedValue(mockIndexedDataset);
      mockDatasetsService.indexDatasetForRAGCore.mockResolvedValue(true);

      const result = await indexRAGActivity(mockDatasetId);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Temporal Activity] Indexing dataset into pgvector RAG: ${mockDatasetId}`);
      expect(mockDatasetFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockDatasetsService.indexDatasetForRAGCore).toHaveBeenCalledWith(mockDatasetId, mockIndexedDataset);
      expect(result).toEqual({
        success: true,
        datasetId: mockDatasetId,
        status: mockIndexedDataset.status
      });
    });

    it('should throw error if dataset not found', async () => {
      mockDatasetFindOne.mockResolvedValue(null);

      await expect(indexRAGActivity(mockDatasetId)).rejects.toThrow(`Dataset ${mockDatasetId} not found in catalog.`);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Activity] Failed to index dataset ${mockDatasetId}: Dataset ${mockDatasetId} not found in catalog.`);
    });

    it('should log error and re-throw if indexDatasetForRAGCore fails', async () => {
      const errorMessage = 'Indexing failed';
      mockDatasetFindOne.mockResolvedValue(mockIndexedDataset);
      mockDatasetsService.indexDatasetForRAGCore.mockRejectedValue(new Error(errorMessage));

      await expect(indexRAGActivity(mockDatasetId)).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Activity] Failed to index dataset ${mockDatasetId}: ${errorMessage}`);
    });
  });

  describe('purgeCorruptDatasetActivity', () => {
    const mockDatasetId = 'HuggingFaceH4/corrupt_dataset';
    const mockGCSFile1 = { name: `datasets/${mockDatasetId}/file1.parquet`, delete: mockFileDelete };
    const mockGCSFile2 = { name: `datasets/${mockDatasetId}/file2.json`, delete: mockFileDelete };

    beforeEach(() => {
      mockPathJoin.mockReturnValue('mock-gcp-key.json');
    });

    it('should successfully purge GCS files, update queue and dataset status', async () => {
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };
      const mockDatasetItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetSave };

      mockBucketGetFiles.mockResolvedValue([[mockGCSFile1, mockGCSFile2]]);
      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetFindOne.mockResolvedValue(mockDatasetItem);

      const result = await purgeCorruptDatasetActivity(mockDatasetId);

      expect(mockLogger.info).toHaveBeenCalledWith(`[Temporal Saga Activity] Purging corrupt or failed dataset: ${mockDatasetId}`);
      expect(mockStorage).toHaveBeenCalledWith({ keyFilename: 'mock-gcp-key.json' });
      expect(mockStorageBucket).toHaveBeenCalledWith('mock-gcs-bucket');
      expect(mockBucketGetFiles).toHaveBeenCalledWith({ prefix: `datasets/${mockDatasetId}/` });
      expect(mockFileDelete).toHaveBeenCalledWith();
      expect(mockFileDelete).toHaveBeenCalledTimes(2);

      expect(mockDatasetQueueFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockQueueItem.status).toBe('failed');
      expect(mockQueueItem.error).toBe('Ingestion failed during execution, Saga compensation triggered.');
      expect(mockDatasetQueueSave).toHaveBeenCalled();

      expect(mockDatasetFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockDatasetItem.status).toBe('failed');
      expect(mockDatasetItem.error).toBe('Archival aborted/rolled back by Saga transaction manager.');
      expect(mockDatasetSave).toHaveBeenCalled();

      expect(result).toEqual({
        success: true,
        datasetId: mockDatasetId,
        purged: true
      });
    });

    it('should handle no GCS files gracefully', async () => {
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };
      const mockDatasetItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetSave };

      mockBucketGetFiles.mockResolvedValue([[]]); // No files
      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetFindOne.mockResolvedValue(mockDatasetItem);

      const result = await purgeCorruptDatasetActivity(mockDatasetId);

      expect(mockBucketGetFiles).toHaveBeenCalledWith({ prefix: `datasets/${mockDatasetId}/` });
      expect(mockFileDelete).not.toHaveBeenCalled();
      expect(mockDatasetQueueSave).toHaveBeenCalled();
      expect(mockDatasetSave).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should log warning and continue if GCS getFiles fails', async () => {
      const errorMessage = 'GCS getFiles error';
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };
      const mockDatasetItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetSave };

      mockBucketGetFiles.mockRejectedValue(new Error(errorMessage));
      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetFindOne.mockResolvedValue(mockDatasetItem);

      const result = await purgeCorruptDatasetActivity(mockDatasetId);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining(`[Temporal Saga] GCS purge error (non-fatal, bucket might be uninitialized or files already gone): ${errorMessage}`));
      expect(mockFileDelete).not.toHaveBeenCalled();
      expect(mockDatasetQueueSave).toHaveBeenCalled();
      expect(mockDatasetSave).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should log warning and continue if GCS file.delete fails', async () => {
      const errorMessage = 'GCS delete file error';
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };
      const mockDatasetItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetSave };

      mockBucketGetFiles.mockResolvedValue([[mockGCSFile1]]);
      mockFileDelete.mockRejectedValue(new Error(errorMessage));
      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetFindOne.mockResolvedValue(mockDatasetItem);

      const result = await purgeCorruptDatasetActivity(mockDatasetId);

      expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining(`[Temporal Saga] GCS purge error (non-fatal, bucket might be uninitialized or files already gone): ${errorMessage}`));
      expect(mockFileDelete).toHaveBeenCalledTimes(1); // Still attempted
      expect(mockDatasetQueueSave).toHaveBeenCalled();
      expect(mockDatasetSave).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should not fail if DatasetQueue item is not found', async () => {
      const mockDatasetItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetSave };

      mockBucketGetFiles.mockResolvedValue([[]]);
      mockDatasetQueueFindOne.mockResolvedValue(null); // No queue item
      mockDatasetFindOne.mockResolvedValue(mockDatasetItem);

      const result = await purgeCorruptDatasetActivity(mockDatasetId);

      expect(mockDatasetQueueFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockDatasetQueueSave).not.toHaveBeenCalled(); // No item to save
      expect(mockDatasetSave).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should not fail if Dataset item is not found', async () => {
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };

      mockBucketGetFiles.mockResolvedValue([[]]);
      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetFindOne.mockResolvedValue(null); // No dataset item

      const result = await purgeCorruptDatasetActivity(mockDatasetId);

      expect(mockDatasetFindOne).toHaveBeenCalledWith({ datasetId: mockDatasetId });
      expect(mockDatasetSave).not.toHaveBeenCalled(); // No item to save
      expect(mockDatasetQueueSave).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should log error and re-throw if updating DatasetQueue fails', async () => {
      const errorMessage = 'Queue save error';
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };

      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetQueueSave.mockRejectedValue(new Error(errorMessage));

      await expect(purgeCorruptDatasetActivity(mockDatasetId)).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Saga Activity] Saga rollback failed: ${errorMessage}`);
    });

    it('should log error and re-throw if updating Dataset fails', async () => {
      const errorMessage = 'Dataset save error';
      const mockQueueItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetQueueSave };
      const mockDatasetItem = { datasetId: mockDatasetId, status: 'pending', save: mockDatasetSave };

      mockDatasetQueueFindOne.mockResolvedValue(mockQueueItem);
      mockDatasetFindOne.mockResolvedValue(mockDatasetItem);
      mockDatasetSave.mockRejectedValue(new Error(errorMessage));

      await expect(purgeCorruptDatasetActivity(mockDatasetId)).rejects.toThrow(errorMessage);
      expect(mockLogger.error).toHaveBeenCalledWith(`[Temporal Saga Activity] Saga rollback failed: ${errorMessage}`);
    });
  });
});