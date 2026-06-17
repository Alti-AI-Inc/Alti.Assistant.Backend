import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
const {
  mockInsertDataset,
  mockInsertTable,
  mockInsertJob,
  mockConfig
} = vi.hoisted(() => {
  const mockInsertDataset = vi.fn();
  const mockInsertTable = vi.fn();
  const mockInsertJob = vi.fn();

  const mockConfig = {
    google: {
      google_application_credentials: 'test_credentials.json',
      gcp_project_id: 'test-project-id'
    }
  };

  return {
    mockInsertDataset,
    mockInsertTable,
    mockInsertJob,
    mockConfig
  };
});

vi.mock('googleapis', () => {
  return {
    google: {
      auth: {
        GoogleAuth: function () {
          return {};
        }
      },
      bigquery: function () {
        return {
          datasets: {
            insert: mockInsertDataset
          },
          tables: {
            insert: mockInsertTable
          },
          jobs: {
            insert: mockInsertJob
          }
        };
      }
    }
  };
});

vi.mock('../../../../config/index.js', () => ({
  default: mockConfig
}));

// Import the service after mocks are set up
import { GcpBigqueryService } from './gcp-bigquery.service.js';

vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn()
  }
}));

describe('GcpBigqueryService', () => {
  const originalEnv = process.env.GCP_PROJECT_ID;

  beforeEach(() => {
    vi.clearAllMocks();
    mockConfig.google.gcp_project_id = 'test-project-id';
    process.env.GCP_PROJECT_ID = 'env-project-id';
  });

  afterEach(() => {
    process.env.GCP_PROJECT_ID = originalEnv;
  });

  describe('createDataset', () => {
    it('should successfully create a dataset', async () => {
      mockInsertDataset.mockResolvedValueOnce({
        data: {
          datasetReference: { datasetId: 'my_dataset' },
          location: 'EU'
        }
      });

      const result = await GcpBigqueryService.createDataset('my_dataset', 'EU');

      expect(result).toEqual({
        success: true,
        projectId: 'test-project-id',
        datasetId: 'my_dataset',
        location: 'EU'
      });
      expect(mockInsertDataset).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        requestBody: {
          datasetReference: {
            projectId: 'test-project-id',
            datasetId: 'my_dataset'
          },
          location: 'EU'
        }
      });
    });

    it('should default to US location if not provided', async () => {
      mockInsertDataset.mockResolvedValueOnce({
        data: {
          datasetReference: { datasetId: 'my_dataset' },
          location: 'US'
        }
      });

      const result = await GcpBigqueryService.createDataset('my_dataset');

      expect(result.location).toBe('US');
      expect(mockInsertDataset).toHaveBeenCalledWith(expect.objectContaining({
        requestBody: expect.objectContaining({
          location: 'US'
        })
      }));
    });

    it('should fallback to process.env.GCP_PROJECT_ID if config is missing', async () => {
      mockConfig.google.gcp_project_id = undefined;
      mockInsertDataset.mockResolvedValueOnce({
        data: {
          datasetReference: { datasetId: 'my_dataset' },
          location: 'US'
        }
      });

      const result = await GcpBigqueryService.createDataset('my_dataset');
      expect(result.projectId).toBe('env-project-id');
    });

    it('should throw an error if GCP Project ID is not configured', async () => {
      mockConfig.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpBigqueryService.createDataset('my_dataset'))
        .rejects
        .toThrow('GCP Project ID is not configured.');
    });

    it('should throw and log error if BigQuery API call fails', async () => {
      mockInsertDataset.mockRejectedValueOnce(new Error('API Failure'));

      await expect(GcpBigqueryService.createDataset('my_dataset'))
        .rejects
        .toThrow('BigQuery Dataset creation failed: API Failure');
    });
  });

  describe('createTable', () => {
    const schemaFields = [
      { name: 'id', type: 'INTEGER' },
      { name: 'name', type: 'STRING' }
    ];

    it('should successfully create a table', async () => {
      mockInsertTable.mockResolvedValueOnce({
        data: {
          tableReference: { tableId: 'my_table' },
          numBytes: '1024',
          schema: { fields: schemaFields }
        }
      });

      const result = await GcpBigqueryService.createTable('my_dataset', 'my_table', schemaFields);

      expect(result).toEqual({
        success: true,
        projectId: 'test-project-id',
        datasetId: 'my_dataset',
        tableId: 'my_table',
        numBytes: 1024,
        schema: { fields: schemaFields }
      });
      expect(mockInsertTable).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        datasetId: 'my_dataset',
        requestBody: {
          tableReference: {
            projectId: 'test-project-id',
            datasetId: 'my_dataset',
            tableId: 'my_table'
          },
          schema: {
            fields: schemaFields
          }
        }
      });
    });

    it('should default numBytes to 0 if not returned or empty', async () => {
      mockInsertTable.mockResolvedValueOnce({
        data: {
          tableReference: { tableId: 'my_table' },
          schema: { fields: schemaFields }
        }
      });

      const result = await GcpBigqueryService.createTable('my_dataset', 'my_table', schemaFields);
      expect(result.numBytes).toBe(0);
    });

    it('should throw an error if GCP Project ID is not configured', async () => {
      mockConfig.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpBigqueryService.createTable('my_dataset', 'my_table', schemaFields))
        .rejects
        .toThrow('GCP Project ID is not configured.');
    });

    it('should throw and log error if BigQuery API call fails', async () => {
      mockInsertTable.mockRejectedValueOnce(new Error('API Failure'));

      await expect(GcpBigqueryService.createTable('my_dataset', 'my_table', schemaFields))
        .rejects
        .toThrow('BigQuery Table creation failed: API Failure');
    });
  });

  describe('loadCsvFromGcs', () => {
    const gcsUri = 'gs://my-bucket/data.csv';

    it('should successfully trigger a CSV load job', async () => {
      mockInsertJob.mockResolvedValueOnce({
        data: {
          jobReference: { jobId: 'job_abc123' },
          status: { state: 'RUNNING' },
          configuration: { load: { sourceUris: [gcsUri] } }
        }
      });

      const result = await GcpBigqueryService.loadCsvFromGcs('my_dataset', 'my_table', gcsUri);

      expect(result).toEqual({
        success: true,
        jobId: 'job_abc123',
        state: 'RUNNING',
        configuration: { load: { sourceUris: [gcsUri] } }
      });
      expect(mockInsertJob).toHaveBeenCalledWith({
        projectId: 'test-project-id',
        requestBody: {
          configuration: {
            load: {
              sourceUris: [gcsUri],
              destinationTable: {
                projectId: 'test-project-id',
                datasetId: 'my_dataset',
                tableId: 'my_table'
              },
              sourceFormat: 'CSV',
              skipLeadingRows: 1,
              writeDisposition: 'WRITE_APPEND'
            }
          }
        }
      });
    });

    it('should throw an error if GCP Project ID is not configured', async () => {
      mockConfig.google.gcp_project_id = undefined;
      delete process.env.GCP_PROJECT_ID;

      await expect(GcpBigqueryService.loadCsvFromGcs('my_dataset', 'my_table', gcsUri))
        .rejects
        .toThrow('GCP Project ID is not configured.');
    });

    it('should throw and log error if BigQuery API call fails', async () => {
      mockInsertJob.mockRejectedValueOnce(new Error('API Failure'));

      await expect(GcpBigqueryService.loadCsvFromGcs('my_dataset', 'my_table', gcsUri))
        .rejects
        .toThrow('BigQuery GCS CSV load failed: API Failure');
    });
  });
});