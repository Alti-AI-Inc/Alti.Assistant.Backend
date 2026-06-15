import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Readable } from 'stream';
import { DatasetsService } from './datasets.service.js';
import Dataset from './datasets.model.js';
import config from '../../../../config/index.js';
import { rag } from '../knowledge/knowledge.service.js';

// Mock external dependencies
vi.mock('axios');
vi.mock('@google-cloud/storage');
vi.mock('path');
vi.mock('fs', () => ({
  default: {
    promises: {
      mkdir: vi.fn(),
      readFile: vi.fn(),
    },
    createWriteStream: vi.fn(),
  },
}));
vi.mock('hyparquet', () => ({
  parquetReadObjects: vi.fn(),
}));
vi.mock('hyparquet-compressors', () => ({
  compressors: {}, // Mock as empty or specific compressors if needed
}));
vi.mock('../knowledge/knowledge.service.js', () => ({
  rag: {
    initialize: vi.fn(),
    addDocumentFromBuffer: vi.fn(),
  },
}));

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      google_application_credentials: 'mock-gcp-key.json',
    },
    gcs: {
      knowledge_bank_bucket: 'mock-alti-assistant-datasets',
      datasetStorageClass: 'ARCHIVE',
    },
    shelfHfRagIndexing: false,
  },
}));

// Mock Dataset model
vi.mock('./datasets.model.js', () => ({
  default: {
    findOne: vi.fn(),
    find: vi.fn(),
    // Mocking the instance methods for new Dataset() and existing ones
    prototype: {
      save: vi.fn(),
    },
  },
}));

// Store original process.env to restore it later
const originalProcessEnv = process.env;

describe('DatasetsService', () => {
  let axios;
  let Storage;
  let mockBucket;
  let mockFile;
  let mockDatasetInstance;
  let fs;
  let path;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Re-mock process.env for each test to ensure isolation
    process.env = { ...originalProcessEnv, HF_CRAWLER_MAX_SIZE_GB: '2' };

    axios = (await import('axios')).default;
    Storage = (await import('@google-cloud/storage')).Storage;
    fs = (await import('fs')).default;
    path = (await import('path')).default;

    // Mock GCS Storage
    mockFile = {
      createWriteStream: vi.fn().mockImplementation(() => {
        const writable = new Readable({ read() {} }); // Mock a writable stream
        writable.pipe = vi.fn().mockImplementation(() => writable);
        writable.on = vi.fn().mockImplementation((event, cb) => {
          if (event === 'finish') {
            setTimeout(cb, 10); // Simulate async finish
          } else if (event === 'error') {
            // No-op for error by default, can be overridden
          }
          return writable;
        });
        return writable;
      }),
      download: vi.fn().mockImplementation(() => [Buffer.from('mock parquet content')]),
    };
    mockBucket = {
      exists: vi.fn().mockImplementation(() => [true]),
      create: vi.fn(),
      file: vi.fn().mockImplementation(() => mockFile),
    };
    Storage.mockImplementation(() => ({
      bucket: vi.fn().mockImplementation(() => mockBucket),
    }));

    // Mock Dataset instance
    mockDatasetInstance = {
      datasetId: 'mock/dataset',
      name: 'dataset',
      author: 'mock',
      description: 'Mock description',
      downloads: 100,
      likes: 10,
      tags: ['tag1'],
      configs: ['default'],
      splits: {
        default: [{ split: 'train', numBytes: 1000, numExamples: 100 }],
      },
      status: 'pending',
      gcsBucket: null,
      gcsPaths: [],
      sizeBytes: 0,
      rowCount: 0,
      features: {},
      error: '',
      save: vi.fn(function () {
        return Promise.resolve(this);
      }),
    };
    Dataset.findOne.mockResolvedValue(mockDatasetInstance);
    Dataset.find.mockReturnValue({
      sort: vi.fn().mockReturnThis(),
      lean: vi.fn().mockResolvedValue([mockDatasetInstance]),
    });
    Dataset.prototype.save.mockImplementation(function () {
      return Promise.resolve(this);
    });
    // Mock the constructor for `new Dataset()` calls
    Dataset.mockImplementation(function (data) {
      Object.assign(this, { ...mockDatasetInstance, ...data });
      this.save = vi.fn(function () {
        return Promise.resolve(this);
      });
    });

    // Mock path
    path.join.mockImplementation((...args) => args.join('/'));
    path.basename = vi.fn().mockImplementation(p => p.split('/').pop());

    // Mock fs.promises
    fs.promises.mkdir.mockResolvedValue(undefined);
    fs.promises.readFile.mockResolvedValue(Buffer.from('local parquet content'));

    // Mock fs.createWriteStream for local fallback
    fs.createWriteStream.mockImplementation(() => {
      const writable = new Readable({ read() {} }); // Mock a writable stream
      writable.pipe = vi.fn().mockImplementation(() => writable);
      writable.on = vi.fn().mockImplementation((event, cb) => {
        if (event === 'finish') {
          setTimeout(cb, 10); // Simulate async finish
        } else if (event === 'error') {
          // No-op for error by default, can be overridden
        }
        return writable;
      });
      return writable;
    });
  });

  afterEach(() => {
    process.env = originalProcessEnv; // Restore original process.env
  });

  describe('searchHFDatasets', () => {
    it('should return mapped dataset data on success', async () => {
      axios.get.mockResolvedValueOnce({
        data: [
          {
            id: 'org/dataset-name',
            author: 'org',
            downloads: 100,
            likes: 10,
            tags: ['nlp'],
            cardData: { dataset_info: { description: 'A test dataset' } },
          },
        ],
      });

      const result = await DatasetsService.searchHFDatasets('test');
      expect(result).toEqual([
        {
          datasetId: 'org/dataset-name',
          name: 'dataset-name',
          author: 'org',
          downloads: 100,
          likes: 10,
          tags: ['nlp'],
          description: 'A test dataset',
        },
      ]);
      expect(axios.get).toHaveBeenCalledWith('https://huggingface.co/api/datasets', expect.any(Object));
    });

    it('should handle empty query and default limit', async () => {
      axios.get.mockResolvedValueOnce({ data: [] });
      const result = await DatasetsService.searchHFDatasets();
      expect(result).toEqual([]);
      expect(axios.get).toHaveBeenCalledWith(
        'https://huggingface.co/api/datasets',
        expect.objectContaining({
          params: { search: '', limit: 10, sort: 'downloads', direction: '-1' },
        })
      );
    });

    it('should throw an error if axios call fails', async () => {
      axios.get.mockRejectedValueOnce(new Error('Network error'));
      await expect(DatasetsService.searchHFDatasets('test')).rejects.toThrow('Failed to search Hugging Face Hub: Network error');
    });

    it('should handle missing optional fields gracefully', async () => {
      axios.get.mockResolvedValueOnce({
        data: [
          {
            id: 'another/dataset',
            // Missing author, downloads, likes, tags, cardData
          },
        ],
      });

      const result = await DatasetsService.searchHFDatasets('another');
      expect(result).toEqual([
        {
          datasetId: 'another/dataset',
          name: 'dataset',
          author: 'anonymous',
          downloads: 0,
          likes: 0,
          tags: [],
          description: 'No description available.',
        },
      ]);
    });
  });

  describe('getHFDatasetInfo', () => {
    it('should return detailed dataset info with splits and configs', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            id: 'org/dataset-name',
            author: 'org',
            description: 'Detailed description',
            downloads: 200,
            likes: 20,
            tags: ['ml'],
            createdAt: '2023-01-01T00:00:00Z',
          },
        })
        .mockResolvedValueOnce({
          data: {
            splits: [
              { config: 'default', split: 'train', num_bytes: 1000, num_examples: 100 },
              { config: 'default', split: 'validation', num_bytes: 200, num_examples: 20 },
              { config: 'other_config', split: 'test', num_bytes: 500, num_examples: 50 },
            ],
          },
        });

      const result = await DatasetsService.getHFDatasetInfo('org/dataset-name');
      expect(result).toEqual({
        datasetId: 'org/dataset-name',
        name: 'dataset-name',
        author: 'org',
        description: 'Detailed description',
        downloads: 200,
        likes: 20,
        tags: ['ml'],
        configs: ['default', 'other_config'],
        splits: {
          default: [
            { split: 'train', numBytes: 1000, numExamples: 100 },
            { split: 'validation', numBytes: 200, numExamples: 20 },
          ],
          other_config: [{ split: 'test', numBytes: 500, numExamples: 50 }],
        },
        createdAt: '2023-01-01T00:00:00Z',
      });
      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(axios.get).toHaveBeenCalledWith('https://huggingface.co/api/datasets/org/dataset-name', expect.any(Object));
      expect(axios.get).toHaveBeenCalledWith('https://datasets-server.huggingface.co/splits?dataset=org/dataset-name');
    });

    it('should return info without splits if splits API fails', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            id: 'org/dataset-name',
            description: 'No splits',
          },
        })
        .mockRejectedValueOnce(new Error('Splits API error')); // Mock splits API failure

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await DatasetsService.getHFDatasetInfo('org/dataset-name');
      expect(result).toEqual(
        expect.objectContaining({
          datasetId: 'org/dataset-name',
          description: 'No splits',
          configs: [],
          splits: {},
        })
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not load splits'));
      consoleWarnSpy.mockRestore();
    });

    it('should throw an error if main HF API call fails', async () => {
      axios.get.mockRejectedValueOnce(new Error('Main API error'));
      await expect(DatasetsService.getHFDatasetInfo('org/dataset-name')).rejects.toThrow('Failed to fetch dataset details: Main API error');
    });

    it('should handle missing optional fields in main metadata', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            id: 'simple/dataset',
            // Missing author, description, downloads, likes, tags, createdAt
          },
        })
        .mockResolvedValueOnce({ data: { splits: [] } }); // No splits

      const result = await DatasetsService.getHFDatasetInfo('simple/dataset');
      expect(result).toEqual(
        expect.objectContaining({
          datasetId: 'simple/dataset',
          name: 'dataset',
          author: 'anonymous',
          description: 'No description provided.',
          downloads: 0,
          likes: 0,
          tags: [],
          configs: [],
          splits: {},
          createdAt: undefined, // Or null, depending on HF API
        })
      );
    });
  });

  describe('getHFDatasetRows', () => {
    it('should return dataset rows for a given dataset, config, and split', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          features: [{ name: 'text', type: { dtype: 'string' } }],
          rows: [{ row_idx: 0, row: { text: 'Hello world' } }],
        },
      });

      const result = await DatasetsService.getHFDatasetRows('org/dataset-name', 'default', 'train', 0, 10);
      expect(result).toEqual({
        features: [{ name: 'text', type: { dtype: 'string' } }],
        rows: [{ row_idx: 0, row: { text: 'Hello world' } }],
      });
      expect(axios.get).toHaveBeenCalledWith(
        'https://datasets-server.huggingface.co/rows',
        expect.objectContaining({
          params: { dataset: 'org/dataset-name', config: 'default', split: 'train', offset: 0, limit: 100 },
        })
      );
    });

    it('should resolve canonical ID if datasetId does not contain a slash', async () => {
      axios.get
        .mockResolvedValueOnce({ data: { id: 'resolved/dataset-id' } }) // For canonical ID resolution
        .mockResolvedValueOnce({ data: { features: [], rows: [] } }); // For rows

      const result = await DatasetsService.getHFDatasetRows('dataset-id-short');
      expect(result).toEqual({ features: [], rows: [] });
      expect(axios.get).toHaveBeenCalledWith('https://huggingface.co/api/datasets/dataset-id-short', expect.any(Object));
      expect(axios.get).toHaveBeenCalledWith(
        'https://datasets-server.huggingface.co/rows',
        expect.objectContaining({
          params: expect.objectContaining({ dataset: 'resolved/dataset-id' }),
        })
      );
    });

    it('should proceed with original ID if canonical ID resolution fails', async () => {
      axios.get
        .mockRejectedValueOnce(new Error('Canonical ID resolution failed')) // For canonical ID resolution
        .mockResolvedValueOnce({ data: { features: [], rows: [] } }); // For rows

      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await DatasetsService.getHFDatasetRows('dataset-id-short');
      expect(result).toEqual({ features: [], rows: [] });
      expect(axios.get).toHaveBeenCalledWith(
        'https://datasets-server.huggingface.co/rows',
        expect.objectContaining({
          params: expect.objectContaining({ dataset: 'dataset-id-short' }),
        })
      );
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not resolve canonical ID'));
      consoleWarnSpy.mockRestore();
    });

    it('should throw an error if fetching rows fails', async () => {
      axios.get.mockRejectedValueOnce(new Error('Rows API error'));
      await expect(DatasetsService.getHFDatasetRows('org/dataset-name')).rejects.toThrow('Failed to preview dataset rows from Hugging Face server: Rows API error');
    });
  });

  describe('archiveDatasetToGCSCore', () => {
    let consoleErrorSpy;
    let consoleLogSpy;
    let consoleWarnSpy;

    beforeEach(() => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Mock getHFDatasetRows for internal call
      vi.spyOn(DatasetsService, 'getHFDatasetRows').mockResolvedValue({
        features: [{ name: 'col1' }],
        rows: [{ col1: 'val1' }],
      });
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
      vi.restoreAllMocks(); // Restore DatasetsService.getHFDatasetRows
    });

    it('should successfully archive dataset to GCS', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            parquet_files: [
              { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 1000 },
            ],
          },
        })
        .mockImplementationOnce(() => ({
          data: new Readable({
            read() {
              this.push('mock data');
              this.push(null);
            },
          }),
        })); // Mock stream for axios download

      await DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance);

      expect(mockDatasetInstance.save).toHaveBeenCalledTimes(3); // initial, after download, after indexing
      expect(mockDatasetInstance.status).toBe('archived');
      expect(mockDatasetInstance.gcsBucket).toBe('mock-alti-assistant-datasets');
      expect(mockDatasetInstance.gcsPaths).toEqual(['gs://mock-alti-assistant-datasets/datasets/mock/dataset/default/train/file1.parquet']);
      expect(mockDatasetInstance.sizeBytes).toBe(1000);
      expect(mockDatasetInstance.rowCount).toBe(100);
      expect(mockDatasetInstance.features).toEqual([{ name: 'col1' }]);

      expect(Storage).toHaveBeenCalledWith({ keyFilename: 'mock-gcp-key.json' });
      expect(mockBucket.file).toHaveBeenCalledWith('datasets/mock/dataset/default/train/file1.parquet');
      expect(mockFile.createWriteStream).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            storageClass: 'ARCHIVE',
          }),
        })
      );
      expect(axios.get).toHaveBeenCalledWith('https://datasets-server.huggingface.co/parquet?dataset=mock/dataset');
      expect(axios).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: 'http://example.com/file1.parquet',
          responseType: 'stream',
        })
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully uploaded to GCS'));
    });

    it('should use local fallback if GCS connection fails', async () => {
      // Mock GCS bucket.exists to throw an error, simulating connection failure
      mockBucket.exists.mockRejectedValueOnce(new Error('GCS connection failed'));

      axios.get
        .mockResolvedValueOnce({
          data: {
            parquet_files: [
              { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 1000 },
            ],
          },
        })
        .mockImplementationOnce(() => ({
          data: new Readable({
            read() {
              this.push('mock data');
              this.push(null);
            },
          }),
        }));

      await DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance);

      expect(mockDatasetInstance.status).toBe('archived');
      expect(mockDatasetInstance.gcsBucket).toBe('local');
      expect(mockDatasetInstance.gcsPaths[0]).toMatch(/^local:\/\/.+\/storage\/datasets\/mock_dataset\/default\/train\/file1.parquet$/);
      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.createWriteStream).toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('GCS Connection failed'));
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Successfully saved locally'));
    });

    it('should use local fallback if getGcsBucket returns null bucket (Storage init fails)', async () => {
      // Mock Storage constructor to throw an error, simulating initialization failure
      Storage.mockImplementationOnce(() => {
        throw new Error('Storage init failed');
      });

      axios.get
        .mockResolvedValueOnce({
          data: {
            parquet_files: [
              { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 1000 },
            ],
          },
        })
        .mockImplementationOnce(() => ({
          data: new Readable({
            read() {
              this.push('mock data');
              this.push(null);
            },
          }),
        }));

      await DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance);

      expect(mockDatasetInstance.status).toBe('archived');
      expect(mockDatasetInstance.gcsBucket).toBe('local');
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('GCS Connection failed'));
    });

    it('should create bucket if it does not exist', async () => {
      mockBucket.exists.mockResolvedValueOnce([false]); // Bucket does not exist

      axios.get
        .mockResolvedValueOnce({
          data: {
            parquet_files: [
              { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 1000 },
            ],
          },
        })
        .mockImplementationOnce(() => ({
          data: new Readable({
            read() {
              this.push('mock data');
              this.push(null);
            },
          }),
        }));

      await DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance);

      expect(mockBucket.create).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('GCS Bucket "mock-alti-assistant-datasets" does not exist. Attempting to create...'));
      expect(mockDatasetInstance.status).toBe('archived');
    });

    it('should throw error if no parquet files found', async () => {
      axios.get.mockResolvedValueOnce({ data: { parquet_files: [] } });

      await expect(DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance)).rejects.toThrow('No Parquet files found for this dataset on Hugging Face server.');
      expect(mockDatasetInstance.status).toBe('failed');
      expect(mockDatasetInstance.error).toBe('No Parquet files found for this dataset on Hugging Face server.');
      expect(mockDatasetInstance.save).toHaveBeenCalledTimes(2); // initial, then failed
    });

    it('should throw error if dataset size exceeds limit', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          parquet_files: [
            { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 3 * 1024 * 1024 * 1024 }, // 3GB
          ],
        },
      });

      await expect(DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance)).rejects.toThrow(/Dataset actual size \(3.00 GB\) exceeds max size limit \(2.00 GB\)/);
      expect(mockDatasetInstance.status).toBe('failed');
      expect(mockDatasetInstance.error).toMatch(/Dataset actual size/);
    });

    it('should handle error during parquet file list fetch', async () => {
      axios.get.mockRejectedValueOnce(new Error('Parquet list error'));

      await expect(DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance)).rejects.toThrow('Hugging Face datasets-server does not expose Parquet files for this dataset: Parquet list error');
      expect(mockDatasetInstance.status).toBe('failed');
      expect(mockDatasetInstance.error).toBe('Hugging Face datasets-server does not expose Parquet files for this dataset: Parquet list error');
    });

    it('should handle stream piping error', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            parquet_files: [
              { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 1000 },
            ],
          },
        })
        .mockImplementationOnce(() => {
          const mockStream = new Readable({
            read() {
              this.push('mock data');
              this.push(null);
            },
          });
          // Simulate an error during piping
          setTimeout(() => mockStream.emit('error', new Error('Stream pipe error')), 5);
          return { data: mockStream };
        });

      await expect(DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance)).rejects.toThrow('Stream pipe error');
      expect(mockDatasetInstance.status).toBe('failed');
      expect(mockDatasetInstance.error).toBe('Stream pipe error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Piping stream failed'));
    });

    it('should warn and continue if getHFDatasetRows fails', async () => {
      vi.spyOn(DatasetsService, 'getHFDatasetRows').mockRejectedValueOnce(new Error('Preview error'));

      axios.get
        .mockResolvedValueOnce({
          data: {
            parquet_files: [
              { url: 'http://example.com/file1.parquet', filename: 'file1.parquet', config: 'default', split: 'train', size: 1000 },
            ],
          },
        })
        .mockImplementationOnce(() => ({
          data: new Readable({
            read() {
              this.push('mock data');
              this.push(null);
            },
          }),
        }));

      await DatasetsService.archiveDatasetToGCSCore('mock/dataset', mockDatasetInstance);

      expect(mockDatasetInstance.status).toBe('archived'); // Should still succeed
      expect(mockDatasetInstance.features).toEqual({}); // Features should be empty
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Could not extract column features'));
    });
  });

  describe('archiveDatasetToGCS', () => {
    let getHFDatasetInfoSpy;
    let archiveDatasetToGCSCoreSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      getHFDatasetInfoSpy = vi.spyOn(DatasetsService, 'getHFDatasetInfo').mockResolvedValue({
        datasetId: 'mock/dataset',
        name: 'dataset',
        author: 'mock',
        description: 'Mock description',
        downloads: 100,
        likes: 10,
        tags: ['tag1'],
        configs: ['default'],
        splits: {
          default: [{ split: 'train', numBytes: 1000, numExamples: 100 }],
        },
        createdAt: '2023-01-01T00:00:00Z',
      });
      archiveDatasetToGCSCoreSpy = vi.spyOn(DatasetsService, 'archiveDatasetToGCSCore').mockResolvedValue(undefined);
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      getHFDatasetInfoSpy.mockRestore();
      archiveDatasetToGCSCoreSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should create a new dataset record and initiate archival', async () => {
      Dataset.findOne.mockResolvedValueOnce(null); // No existing dataset

      const result = await DatasetsService.archiveDatasetToGCS('mock/dataset');

      expect(getHFDatasetInfoSpy).toHaveBeenCalledWith('mock/dataset');
      expect(Dataset.findOne).toHaveBeenCalledWith({ datasetId: 'mock/dataset' });
      expect(Dataset).toHaveBeenCalledWith(
        expect.objectContaining({
          datasetId: 'mock/dataset',
          status: 'pending',
        })
      );
      expect(mockDatasetInstance.save).toHaveBeenCalledTimes(1); // Initial save
      expect(archiveDatasetToGCSCoreSpy).toHaveBeenCalledWith('mock/dataset', mockDatasetInstance);
      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('GCS Archival job initiated'),
        dataset: mockDatasetInstance,
      });
      // Ensure the core function is called asynchronously
      expect(archiveDatasetToGCSCoreSpy).toHaveBeenCalled();
    });

    it('should update an existing dataset record and initiate archival', async () => {
      const existingDataset = { ...mockDatasetInstance, status: 'failed', error: 'old error', save: vi.fn() };
      Dataset.findOne.mockResolvedValueOnce(existingDataset);

      const result = await DatasetsService.archiveDatasetToGCS('mock/dataset');

      expect(getHFDatasetInfoSpy).toHaveBeenCalledWith('mock/dataset');
      expect(Dataset.findOne).toHaveBeenCalledWith({ datasetId: 'mock/dataset' });
      expect(existingDataset.status).toBe('pending');
      expect(existingDataset.error).toBe('');
      expect(existingDataset.save).toHaveBeenCalledTimes(1); // Initial save
      expect(archiveDatasetToGCSCoreSpy).toHaveBeenCalledWith('mock/dataset', existingDataset);
      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('GCS Archival job initiated'),
        dataset: existingDataset,
      });
    });

    it('should handle errors from getHFDatasetInfo', async () => {
      getHFDatasetInfoSpy.mockRejectedValueOnce(new Error('Info fetch failed'));

      await expect(DatasetsService.archiveDatasetToGCS('mock/dataset')).rejects.toThrow('Info fetch failed');
      expect(Dataset.findOne).not.toHaveBeenCalled(); // Should fail before this
      expect(archiveDatasetToGCSCoreSpy).not.toHaveBeenCalled();
    });

    it('should catch and log errors from archiveDatasetToGCSCore without re-throwing', async () => {
      archiveDatasetToGCSCoreSpy.mockRejectedValueOnce(new Error('Core archival failed'));

      const result = await DatasetsService.archiveDatasetToGCS('mock/dataset');

      // The outer function should still return success, as the core process is async
      expect(result.success).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // Error is handled inside Core, so it shouldn't be re-logged here.
      // The error is caught by the async IIFE, so it won't propagate to the caller of archiveDatasetToGCS
    });
  });

  describe('indexDatasetForRAGCore', () => {
    let consoleErrorSpy;
    let consoleLogSpy;
    let consoleWarnSpy;
    let parquetReadObjects;

    beforeEach(async () => {
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      rag.initialize.mockResolvedValue(undefined);
      rag.addDocumentFromBuffer.mockResolvedValue({ chunkCount: 5 });
      parquetReadObjects = (await import('hyparquet')).parquetReadObjects;
      // Mock parquetReadObjects to return some rows
      parquetReadObjects.mockResolvedValue([
        { col1: 'value1', col2: 'value2' },
        { col1: 'value3', col2: 'value4' },
      ]);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
      consoleLogSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should skip indexing if shelfHfRagIndexing is true', async () => {
      config.shelfHfRagIndexing = true;
      const dataset = { ...mockDatasetInstance, status: 'archived', save: vi.fn() };

      await DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset);

      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Hugging Face dataset RAG indexing is currently shelved'));
      expect(dataset.status).toBe('archived');
      expect(dataset.error).toBe('RAG indexing shelved by configuration');
      expect(dataset.save).toHaveBeenCalled();
      expect(rag.initialize).not.toHaveBeenCalled();
    });

    it('should successfully index dataset from GCS', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'mock-alti-assistant-datasets',
        gcsPaths: ['gs://mock-alti-assistant-datasets/datasets/mock/dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };

      await DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset);

      expect(rag.initialize).toHaveBeenCalled();
      expect(mockBucket.file).toHaveBeenCalledWith('datasets/mock/dataset/default/train/file1.parquet');
      expect(mockFile.download).toHaveBeenCalled();
      expect(parquetReadObjects).toHaveBeenCalled();
      expect(rag.addDocumentFromBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'mock_dataset_default_train.txt',
        'txt',
        expect.objectContaining({
          datasetId: 'mock/dataset',
          config: 'default',
          split: 'train',
          gcsPath: 'datasets/mock/dataset/default/train/file1.parquet',
        })
      );
      expect(dataset.status).toBe('indexed');
      expect(dataset.error).toBe('');
      expect(dataset.save).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('RAG Indexing successfully completed'));
    });

    it('should successfully index dataset from local storage', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'local',
        gcsPaths: ['local:///path/to/storage/datasets/mock_dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };

      await DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset);

      expect(rag.initialize).toHaveBeenCalled();
      expect(fs.promises.readFile).toHaveBeenCalledWith('/path/to/storage/datasets/mock_dataset/default/train/file1.parquet');
      expect(parquetReadObjects).toHaveBeenCalled();
      expect(rag.addDocumentFromBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        'mock_dataset_default_train.txt',
        'txt',
        expect.objectContaining({
          datasetId: 'mock/dataset',
          config: 'default',
          split: 'train',
          gcsPath: 'local/mock/dataset/default/train/file1.parquet',
        })
      );
      expect(dataset.status).toBe('indexed');
      expect(dataset.save).toHaveBeenCalled();
    });

    it('should handle empty content from parquetReadObjects', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'mock-alti-assistant-datasets',
        gcsPaths: ['gs://mock-alti-assistant-datasets/datasets/mock/dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };
      parquetReadObjects.mockResolvedValue([]); // No rows

      await DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset);

      expect(rag.initialize).toHaveBeenCalled();
      expect(rag.addDocumentFromBuffer).not.toHaveBeenCalled(); // Should skip adding document
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('No valid content found'));
      expect(dataset.status).toBe('indexed'); // Still marked as indexed if no errors
      expect(dataset.save).toHaveBeenCalled();
    });

    it('should handle error during GCS download', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'mock-alti-assistant-datasets',
        gcsPaths: ['gs://mock-alti-assistant-datasets/datasets/mock/dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };
      mockFile.download.mockRejectedValueOnce(new Error('GCS download failed'));

      await expect(DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset)).rejects.toThrow('GCS download failed');
      expect(dataset.status).toBe('failed');
      expect(dataset.error).toBe('GCS download failed');
      expect(dataset.save).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('RAG Indexing failed'));
    });

    it('should handle error during local file read', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'local',
        gcsPaths: ['local:///path/to/storage/datasets/mock_dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };
      fs.promises.readFile.mockRejectedValueOnce(new Error('Local read failed'));

      await expect(DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset)).rejects.toThrow('Local read failed');
      expect(dataset.status).toBe('failed');
      expect(dataset.error).toBe('Local read failed');
      expect(dataset.save).toHaveBeenCalled();
    });

    it('should handle error during parquetReadObjects', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'mock-alti-assistant-datasets',
        gcsPaths: ['gs://mock-alti-assistant-datasets/datasets/mock/dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };
      parquetReadObjects.mockRejectedValueOnce(new Error('Parquet parse error'));

      await expect(DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset)).rejects.toThrow('Parquet parse error');
      expect(dataset.status).toBe('failed');
      expect(dataset.error).toBe('Parquet parse error');
      expect(dataset.save).toHaveBeenCalled();
    });

    it('should correctly format text for addDocumentFromBuffer with various data types', async () => {
      config.shelfHfRagIndexing = false;
      const dataset = {
        ...mockDatasetInstance,
        status: 'archived',
        gcsBucket: 'mock-alti-assistant-datasets',
        gcsPaths: ['gs://mock-alti-assistant-datasets/datasets/mock/dataset/default/train/file1.parquet'],
        save: vi.fn(),
      };
      parquetReadObjects.mockResolvedValue([
        {
          text_col: 'This is some text.',
          num_col: 123,
          bool_col: true,
          null_col: null,
          undefined_col: undefined,
          empty_str_col: '',
          binary_col: Buffer.from('binary data'),
          large_array_col: Array(101).fill('item'),
          object_col: { key: 'value', nested_binary: Buffer.from('nested') },
          bigint_col: BigInt(9007199254740991),
          long_text_col: 'a'.repeat(1500),
        },
      ]);

      await DatasetsService.indexDatasetForRAGCore('mock/dataset', dataset);

      expect(rag.addDocumentFromBuffer).toHaveBeenCalledWith(
        expect.stringContaining(
          'Dataset: mock/dataset\n' +
          'Config: default\n' +
          'Split: train\n' +
          'Row: 1\n' +
          'text_col: This is some text.\n' +
          'num_col: 123\n' +
          'bool_col: true\n' +
          'binary_col: [Binary Data: 11 bytes]\n' +
          'large_array_col: [Large Array: 101 items]\n' +
          'object_col: [Object containing binary fields]\n' +
          'bigint_col: 9007199254740991\n' +
          'long_text_col: ' + 'a'.repeat(1000) + '... (truncated)'
        ),
        expect.any(String),
        expect.any(String),
        expect.any(Object)
      );
    });
  });

  describe('indexDatasetForRAG', () => {
    let findOneSpy;
    let indexDatasetForRAGCoreSpy;
    let consoleErrorSpy;

    beforeEach(() => {
      findOneSpy = vi.spyOn(Dataset, 'findOne').mockResolvedValue({
        ...mockDatasetInstance,
        status: 'archived',
        save: vi.fn(),
      });
      indexDatasetForRAGCoreSpy = vi.spyOn(DatasetsService, 'indexDatasetForRAGCore').mockResolvedValue(undefined);
      consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      config.shelfHfRagIndexing = false; // Ensure not shelved by default
    });

    afterEach(() => {
      findOneSpy.mockRestore();
      indexDatasetForRAGCoreSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });

    it('should return shelved message if shelfHfRagIndexing is true', async () => {
      config.shelfHfRagIndexing = true;
      const result = await DatasetsService.indexDatasetForRAG('mock/dataset');
      expect(result).toEqual({
        success: false,
        message: expect.stringContaining('RAG vector indexing is currently shelved'),
      });
      expect(findOneSpy).not.toHaveBeenCalled();
      expect(indexDatasetForRAGCoreSpy).not.toHaveBeenCalled();
    });

    it('should throw error if dataset not found', async () => {
      findOneSpy.mockResolvedValueOnce(null);
      await expect(DatasetsService.indexDatasetForRAG('mock/dataset')).rejects.toThrow('Dataset not found in local catalog.');
      expect(indexDatasetForRAGCoreSpy).not.toHaveBeenCalled();
    });

    it('should throw error if dataset status is not archived', async () => {
      findOneSpy.mockResolvedValueOnce({ ...mockDatasetInstance, status: 'downloading', save: vi.fn() });
      await expect(DatasetsService.indexDatasetForRAG('mock/dataset')).rejects.toThrow('Dataset is in status "downloading". It must be fully "archived" to GCS before starting vector indexing.');
      expect(indexDatasetForRAGCoreSpy).not.toHaveBeenCalled();
    });

    it('should update status to indexing and initiate core process', async () => {
      const dataset = { ...mockDatasetInstance, status: 'archived', save: vi.fn() };
      findOneSpy.mockResolvedValueOnce(dataset);

      const result = await DatasetsService.indexDatasetForRAG('mock/dataset');

      expect(dataset.status).toBe('indexing');
      expect(dataset.save).toHaveBeenCalledTimes(1);
      expect(indexDatasetForRAGCoreSpy).toHaveBeenCalledWith('mock/dataset', dataset);
      expect(result).toEqual({
        success: true,
        message: expect.stringContaining('RAG indexing process initiated'),
        dataset: dataset,
      });
      // Ensure the core function is called asynchronously
      expect(indexDatasetForRAGCoreSpy).toHaveBeenCalled();
    });

    it('should catch and log errors from indexDatasetForRAGCore without re-throwing', async () => {
      const dataset = { ...mockDatasetInstance, status: 'archived', save: vi.fn() };
      findOneSpy.mockResolvedValueOnce(dataset);
      indexDatasetForRAGCoreSpy.mockRejectedValueOnce(new Error('Core indexing failed'));

      const result = await DatasetsService.indexDatasetForRAG('mock/dataset');

      // The outer function should still return success, as the core process is async
      expect(result.success).toBe(true);
      expect(consoleErrorSpy).not.toHaveBeenCalled(); // Error is handled inside Core, so it shouldn't be re-logged here.
    });
  });

  describe('getLocalCatalog', () => {
    it('should return a list of local datasets', async () => {
      const mockDatasets = [
        { _id: '1', datasetId: 'ds1', updatedAt: new Date() },
        { _id: '2', datasetId: 'ds2', updatedAt: new Date() },
      ];
      Dataset.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockDatasets),
      });

      const result = await DatasetsService.getLocalCatalog();
      expect(result).toEqual(mockDatasets);
      expect(Dataset.find).toHaveBeenCalledWith({});
      expect(Dataset.find().sort).toHaveBeenCalledWith({ updatedAt: -1 });
      expect(Dataset.find().sort().lean).toHaveBeenCalled();
    });

    it('should apply filter if provided', async () => {
      const mockDatasets = [{ _id: '1', datasetId: 'ds1', status: 'archived', updatedAt: new Date() }];
      Dataset.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue(mockDatasets),
      });

      const filter = { status: 'archived' };
      const result = await DatasetsService.getLocalCatalog(filter);
      expect(result).toEqual(mockDatasets);
      expect(Dataset.find).toHaveBeenCalledWith(filter);
    });

    it('should return empty array if no datasets found', async () => {
      Dataset.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockResolvedValue([]),
      });

      const result = await DatasetsService.getLocalCatalog();
      expect(result).toEqual([]);
    });

    it('should throw an error if database query fails', async () => {
      Dataset.find.mockReturnValue({
        sort: vi.fn().mockReturnThis(),
        lean: vi.fn().mockRejectedValue(new Error('DB error')),
      });

      await expect(DatasetsService.getLocalCatalog()).rejects.toThrow('Failed to retrieve local datasets catalog: DB error');
    });
  });
});