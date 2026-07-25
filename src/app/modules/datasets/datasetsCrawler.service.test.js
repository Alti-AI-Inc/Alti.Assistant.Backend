import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import Dataset from './datasets.model.js';
import DatasetQueue from './datasetQueue.model.js';
import { DatasetsService } from './datasets.service.js';
import { temporalClientCoordinator } from '../workflow_automation/services/temporal/client.js';
import { runDatasetIngestionWorkflow } from './temporal/ingestionWorkflow.js';
import { DatasetsCrawlerService } from './datasetsCrawler.service.js';

vi.mock('axios', () => ({
  default: {
    get: vi.fn()
  }
}));

vi.mock('./datasets.model.js', () => ({
  default: {
    aggregate: vi.fn(),
    findOneAndUpdate: vi.fn()
  }
}));

vi.mock('./datasetQueue.model.js', () => ({
  default: {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
    aggregate: vi.fn(),
    countDocuments: vi.fn()
  }
}));

vi.mock('./datasets.service.js', () => ({
  DatasetsService: {
    getHFDatasetInfo: vi.fn(),
    archiveDatasetToGCSCore: vi.fn(),
    indexDatasetForRAGCore: vi.fn()
  }
}));

vi.mock('../workflow_automation/services/temporal/client.js', () => ({
  temporalClientCoordinator: {
    connect: vi.fn(),
    isMock: true,
    client: {
      workflow: {
        start: vi.fn()
      }
    }
  }
}));

vi.mock('./temporal/ingestionWorkflow.js', () => ({
  runDatasetIngestionWorkflow: vi.fn()
}));

describe('DatasetsCrawlerService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    // Reset environment variables
    delete process.env.HF_CRAWLER_MAX_SIZE_GB;
    delete process.env.HF_CRAWLER_GCS_CAP_TB;
  });

  afterEach(() => {
    vi.useRealTimers();
    DatasetsCrawlerService.stopWorker();
  });

  describe('extractLicense', () => {
    it('should extract string license and normalize it', () => {
      const item = { cardData: { license: ' MIT ' } };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('mit');
    });

    it('should extract array license with exactly one allowed license', () => {
      const item = { cardData: { license: ['mit', 'gpl-3.0'] } };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('mit');
    });

    it('should return unspecified for array license with multiple allowed licenses', () => {
      const item = { cardData: { license: ['mit', 'apache-2.0'] } };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('unspecified');
    });

    it('should return unspecified for array license with zero allowed licenses', () => {
      const item = { cardData: { license: ['gpl-3.0', 'bsd-3-clause'] } };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('unspecified');
    });

    it('should extract object license with type', () => {
      const item = { cardData: { license: { type: 'Apache-2.0' } } };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('apache-2.0');
    });

    it('should fallback to tags list search', () => {
      const item = { tags: ['dataset', 'license:mit', 'text'] };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('mit');
    });

    it('should return unspecified if no license is found', () => {
      const item = { tags: ['dataset'] };
      expect(DatasetsCrawlerService.extractLicense(item)).toBe('unspecified');
    });
  });

  describe('scanHuggingFaceHub', () => {
    it('should scan and queue eligible datasets', async () => {
      const mockDatasets = [
        {
          id: 'org/dataset-ok',
          downloads: 100,
          likes: 10,
          cardData: { license: 'mit', dataset_info: { dataset_size: 1000 } }
        },
        {
          id: 'org/dataset-gated',
          gated: true,
          downloads: 50,
          likes: 5
        },
        {
          id: 'org/dataset-media',
          tags: ['task_categories:image-classification'],
          cardData: { license: 'mit' }
        },
        {
          id: 'org/dataset-large',
          cardData: { license: 'mit', dataset_info: { dataset_size: 10 * 1024 * 1024 * 1024 } } // 10GB
        }
      ];

      axios.get.mockResolvedValueOnce({
        data: mockDatasets,
        headers: {}
      });

      DatasetQueue.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      const result = await DatasetsCrawlerService.scanHuggingFaceHub(10);

      expect(result.success).toBe(true);
      expect(result.stats.discovered).toBe(4);
      expect(result.stats.queued).toBe(1); // Only dataset-ok is pending
      expect(result.stats.skippedGated).toBe(1);
      expect(result.stats.skippedSize).toBe(1);
      expect(DatasetQueue.findOneAndUpdate).toHaveBeenCalledTimes(4);
    });

    it('should handle pagination via Link header', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: [{ id: 'ds-1', cardData: { license: 'mit' } }],
          headers: { link: '<https://huggingface.co/api/datasets?page=2>; rel="next"' }
        })
        .mockResolvedValueOnce({
          data: [{ id: 'ds-2', cardData: { license: 'mit' } }],
          headers: {}
        });

      DatasetQueue.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([])
      });

      const result = await DatasetsCrawlerService.scanHuggingFaceHub(2);

      expect(result.success).toBe(true);
      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(result.stats.discovered).toBe(2);
    });

    it('should handle existing queue items and preserve completed status', async () => {
      const mockDatasets = [
        { id: 'ds-existing', cardData: { license: 'mit' } }
      ];

      axios.get.mockResolvedValueOnce({
        data: mockDatasets,
        headers: {}
      });

      DatasetQueue.find.mockReturnValue({
        lean: vi.fn().mockResolvedValue([{ datasetId: 'ds-existing', status: 'completed' }])
      });

      const result = await DatasetsCrawlerService.scanHuggingFaceHub(1);

      expect(result.success).toBe(true);
      expect(result.stats.discovered).toBe(0); // Already exists
      expect(result.stats.queued).toBe(0);
      expect(DatasetQueue.findOneAndUpdate).toHaveBeenCalledWith(
        { datasetId: 'ds-existing' },
        expect.objectContaining({ '$set': expect.objectContaining({ status: 'completed' }) }),
        expect.any(Object)
      );
    });

    it('should throw error on API failure', async () => {
      axios.get.mockRejectedValue(new Error('Network Error'));

      await expect(DatasetsCrawlerService.scanHuggingFaceHub()).rejects.toThrow('HF Discovery Scanner failed: Network Error');
    });
  });

  describe('Worker Loops', () => {
    describe('Legacy Worker Loop (runWorkerLoop)', () => {
      it('should halt if GCS capacity is exceeded', async () => {
        process.env.HF_CRAWLER_GCS_CAP_TB = '1'; // 1 TB limit
        Dataset.aggregate.mockResolvedValue([{ total: 2 * 1024 * 1024 * 1024 * 1024 }]); // 2 TB used

        temporalClientCoordinator.connect.mockResolvedValue();
        temporalClientCoordinator.isMock = true;

        const startResult = DatasetsCrawlerService.startWorker();
        expect(startResult.success).toBe(true);

        // Allow async IIFE to run
        await vi.runAllTimersAsync();

        expect(Dataset.aggregate).toHaveBeenCalled();
        expect(DatasetQueue.findOne).not.toHaveBeenCalled();
      });

      it('should process pending queue item successfully', async () => {
        Dataset.aggregate.mockResolvedValue([{ total: 0 }]);
        
        const mockQueueItem = {
          datasetId: 'test/dataset',
          downloads: 500,
          status: 'pending',
          save: vi.fn().mockImplementation(function() {
            // Stop worker loop on save to prevent infinite loop in test
            DatasetsCrawlerService.stopWorker();
            return Promise.resolve(this);
          })
        };

        DatasetQueue.findOne.mockReturnValue({
          sort: vi.fn().mockResolvedValue(mockQueueItem)
        });

        DatasetsService.getHFDatasetInfo.mockResolvedValue({
          datasetId: 'test/dataset',
          name: 'dataset',
          author: 'test',
          description: 'desc',
          downloads: 500,
          likes: 50,
          tags: [],
          configs: [],
          splits: []
        });

        Dataset.findOneAndUpdate.mockResolvedValue({ sizeBytes: 5000 });
        DatasetsService.archiveDatasetToGCSCore.mockResolvedValue();
        DatasetsService.indexDatasetForRAGCore.mockResolvedValue();

        temporalClientCoordinator.connect.mockResolvedValue();
        temporalClientCoordinator.isMock = true;

        DatasetsCrawlerService.startWorker();
        await vi.runAllTimersAsync();

        expect(mockQueueItem.status).toBe('completed');
        expect(mockQueueItem.sizeBytes).toBe(5000);
        expect(mockQueueItem.save).toHaveBeenCalled();
      });

      it('should handle indexing failure and schedule retry', async () => {
        Dataset.aggregate.mockResolvedValue([{ total: 0 }]);
        
        const mockQueueItem = {
          datasetId: 'test/dataset',
          downloads: 500,
          status: 'pending',
          retryCount: 0,
          save: vi.fn().mockImplementation(function() {
            DatasetsCrawlerService.stopWorker();
            return Promise.resolve(this);
          })
        };

        DatasetQueue.findOne.mockReturnValue({
          sort: vi.fn().mockResolvedValue(mockQueueItem)
        });

        DatasetsService.getHFDatasetInfo.mockResolvedValue({ datasetId: 'test/dataset' });
        Dataset.findOneAndUpdate.mockResolvedValue({ sizeBytes: 5000 });
        DatasetsService.archiveDatasetToGCSCore.mockResolvedValue();
        DatasetsService.indexDatasetForRAGCore.mockRejectedValue(new Error('Indexing Error'));

        temporalClientCoordinator.connect.mockResolvedValue();
        temporalClientCoordinator.isMock = true;

        DatasetsCrawlerService.startWorker();
        await vi.runAllTimersAsync();

        expect(mockQueueItem.status).toBe('pending'); // Scheduled retry
        expect(mockQueueItem.retryCount).toBe(1);
        expect(mockQueueItem.error).toContain('Indexing Failed: Indexing Error');
      });

      it('should handle rate limiting (429) and apply backoff', async () => {
        Dataset.aggregate.mockResolvedValue([{ total: 0 }]);
        
        const mockQueueItem = {
          datasetId: 'test/dataset',
          downloads: 500,
          status: 'pending',
          save: vi.fn().mockImplementation(function() {
            DatasetsCrawlerService.stopWorker();
            return Promise.resolve(this);
          })
        };

        DatasetQueue.findOne.mockReturnValue({
          sort: vi.fn().mockResolvedValue(mockQueueItem)
        });

        DatasetsService.getHFDatasetInfo.mockRejectedValue(new Error('Rate limit exceeded (429)'));

        temporalClientCoordinator.connect.mockResolvedValue();
        temporalClientCoordinator.isMock = true;

        DatasetsCrawlerService.startWorker();
        await vi.runAllTimersAsync();

        expect(mockQueueItem.status).toBe('pending');
        expect(mockQueueItem.error).toContain('Rate Limit');
      });
    });

    describe('Temporal Worker Loop (runTemporalWorkerLoop)', () => {
      it('should dispatch pending queue item to Temporal workflow', async () => {
        Dataset.aggregate.mockResolvedValue([{ total: 0 }]);

        const mockQueueItem = {
          datasetId: 'test/dataset-temp',
          downloads: 1000,
          status: 'pending',
          save: vi.fn().mockImplementation(function() {
            DatasetsCrawlerService.stopWorker();
            return Promise.resolve(this);
          })
        };

        DatasetQueue.findOne.mockReturnValue({
          sort: vi.fn().mockResolvedValue(mockQueueItem)
        });

        temporalClientCoordinator.connect.mockResolvedValue();
        temporalClientCoordinator.isMock = false; // Live cluster mode

        DatasetsCrawlerService.startWorker();
        await vi.runAllTimersAsync();

        expect(temporalClientCoordinator.client.workflow.start).toHaveBeenCalledWith(
          runDatasetIngestionWorkflow,
          expect.objectContaining({
            args: ['test/dataset-temp'],
            taskQueue: 'inso-workflows-queue'
          })
        );
        expect(mockQueueItem.status).toBe('downloading');
      });

      it('should handle Temporal launch failure gracefully', async () => {
        Dataset.aggregate.mockResolvedValue([{ total: 0 }]);

        const mockQueueItem = {
          datasetId: 'test/dataset-fail',
          downloads: 1000,
          status: 'pending',
          save: vi.fn().mockImplementation(function() {
            DatasetsCrawlerService.stopWorker();
            return Promise.resolve(this);
          })
        };

        DatasetQueue.findOne.mockReturnValue({
          sort: vi.fn().mockResolvedValue(mockQueueItem)
        });

        temporalClientCoordinator.connect.mockResolvedValue();
        temporalClientCoordinator.isMock = false;
        temporalClientCoordinator.client.workflow.start.mockRejectedValue(new Error('Temporal Down'));

        DatasetsCrawlerService.startWorker();
        await vi.runAllTimersAsync();

        expect(mockQueueItem.status).toBe('failed');
        expect(mockQueueItem.error).toContain('Temporal Launch Error: Temporal Down');
      });
    });
  });

  describe('startWorker and stopWorker', () => {
    it('should start worker and prevent duplicate runs', () => {
      const res1 = DatasetsCrawlerService.startWorker();
      expect(res1.success).toBe(true);
      expect(res1.message).toBe('Continuous sequential background queue worker started.');

      const res2 = DatasetsCrawlerService.startWorker();
      expect(res2.success).toBe(true);
      expect(res2.message).toBe('Continuous worker loop is already running.');
    });

    it('should stop worker and handle already stopped state', () => {
      const res1 = DatasetsCrawlerService.stopWorker();
      expect(res1.success).toBe(true);
      expect(res1.message).toBe('Continuous worker loop is already stopped.');

      DatasetsCrawlerService.startWorker();
      const res2 = DatasetsCrawlerService.stopWorker();
      expect(res2.success).toBe(true);
      expect(res2.message).toContain('Continuous worker loop stop signal dispatched.');
    });
  });

  describe('getCrawlerStats', () => {
    it('should compile real-time metrics correctly', async () => {
      const mockAggregation = [
        { _id: 'completed', count: 5, totalBytes: 50000 },
        { _id: 'pending', count: 10, totalBytes: 0 },
        { _id: 'failed', count: 2, totalBytes: 0 }
      ];

      DatasetQueue.aggregate.mockResolvedValue(mockAggregation);

      const stats = await DatasetsCrawlerService.getCrawlerStats();

      expect(stats.completed).toBe(5);
      expect(stats.pending).toBe(10);
      expect(stats.failed).toBe(2);
      expect(stats.totalBytesDownloaded).toBe(50000);
    });

    it('should throw error if aggregation fails', async () => {
      DatasetQueue.aggregate.mockRejectedValue(new Error('DB Error'));

      await expect(DatasetsCrawlerService.getCrawlerStats()).rejects.toThrow('Failed to compile crawler stats: DB Error');
    });
  });

  describe('getQueueList', () => {
    it('should query queue list with pagination and sorting', async () => {
      const mockList = [{ datasetId: 'ds-1', downloads: 100 }];
      
      DatasetQueue.find.mockReturnValue({
        sort: vi.fn().mockReturnValue({
          skip: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              lean: vi.fn().mockResolvedValue(mockList)
            })
          })
        })
      });

      DatasetQueue.countDocuments.mockResolvedValue(1);

      const result = await DatasetsCrawlerService.getQueueList({ status: 'pending' }, 10, 0);

      expect(result.total).toBe(1);
      expect(result.data).toEqual(mockList);
      expect(DatasetQueue.find).toHaveBeenCalledWith({ status: 'pending' });
    });

    it('should throw error if query fails', async () => {
      DatasetQueue.find.mockImplementation(() => {
        throw new Error('Query Failed');
      });

      await expect(DatasetsCrawlerService.getQueueList()).rejects.toThrow('Failed to retrieve queue list: Query Failed');
    });
  });
});