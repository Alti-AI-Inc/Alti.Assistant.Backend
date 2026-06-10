import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDatasetIngestionWorkflow } from './ingestionWorkflow.js';

// Mock the activities module that is dynamically imported in mock mode
const mockDownloadAndArchiveActivity = vi.fn();
const mockIndexRAGActivity = vi.fn();
const mockPurgeCorruptDatasetActivity = vi.fn();

vi.mock('./ingestionActivities.js', async () => {
  return {
    downloadAndArchiveActivity: mockDownloadAndArchiveActivity,
    indexRAGActivity: mockIndexRAGActivity,
    purgeCorruptDatasetActivity: mockPurgeCorruptDatasetActivity,
  };
});

// Mock the Temporal workflow module that is dynamically imported in production mode
const mockProxyActivities = vi.fn();

vi.mock('@temporalio/workflow', async () => {
  return {
    proxyActivities: mockProxyActivities,
  };
});

describe('runDatasetIngestionWorkflow', () => {
  const datasetId = 'test-dataset-123';
  let originalEnv;
  let consoleErrorSpy;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    // Spy on console.error to verify logging without polluting test output
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe('Context: Mock/Offline Mode', () => {
    beforeEach(() => {
      process.env.TEMPORAL_MOCK = 'true';
    });

    it('should successfully complete the workflow when all activities succeed', async () => {
      mockDownloadAndArchiveActivity.mockResolvedValue({ success: true });
      mockIndexRAGActivity.mockResolvedValue({ success: true });

      const result = await runDatasetIngestionWorkflow(datasetId);

      expect(result).toEqual({
        success: true,
        datasetId,
        status: 'indexed',
        message: 'Resilient ingestion and RAG vector indexing successfully completed via Temporal.',
      });

      expect(mockDownloadAndArchiveActivity).toHaveBeenCalledOnce();
      expect(mockDownloadAndArchiveActivity).toHaveBeenCalledWith(datasetId);
      expect(mockIndexRAGActivity).toHaveBeenCalledOnce();
      expect(mockIndexRAGActivity).toHaveBeenCalledWith(datasetId);
      expect(mockPurgeCorruptDatasetActivity).not.toHaveBeenCalled();
    });

    it('should fail and trigger rollback if downloadAndArchiveActivity fails', async () => {
      mockDownloadAndArchiveActivity.mockResolvedValue({ success: false });
      mockPurgeCorruptDatasetActivity.mockResolvedValue(undefined);

      await expect(runDatasetIngestionWorkflow(datasetId)).rejects.toThrow(
        `Dataset Ingestion Workflow Failed: Archival step failed for dataset ${datasetId}`
      );

      expect(mockDownloadAndArchiveActivity).toHaveBeenCalledWith(datasetId);
      expect(mockIndexRAGActivity).not.toHaveBeenCalled();
      expect(mockPurgeCorruptDatasetActivity).toHaveBeenCalledOnce();
      expect(mockPurgeCorruptDatasetActivity).toHaveBeenCalledWith(datasetId);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Critical ingestion failure: Archival step failed'));
    });

    it('should fail and trigger rollback if indexRAGActivity throws an error', async () => {
      const indexingError = new Error('Vector DB connection lost');
      mockDownloadAndArchiveActivity.mockResolvedValue({ success: true });
      mockIndexRAGActivity.mockRejectedValue(indexingError);
      mockPurgeCorruptDatasetActivity.mockResolvedValue(undefined);

      await expect(runDatasetIngestionWorkflow(datasetId)).rejects.toThrow(
        `Dataset Ingestion Workflow Failed: ${indexingError.message}`
      );

      expect(mockDownloadAndArchiveActivity).toHaveBeenCalledWith(datasetId);
      expect(mockIndexRAGActivity).toHaveBeenCalledWith(datasetId);
      expect(mockPurgeCorruptDatasetActivity).toHaveBeenCalledOnce();
      expect(mockPurgeCorruptDatasetActivity).toHaveBeenCalledWith(datasetId);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Critical ingestion failure: ${indexingError.message}`));
    });

    it('should still throw the main error if the compensating rollback activity also fails', async () => {
      const archivalErrorMessage = `Archival step failed for dataset ${datasetId}`;
      const purgeError = new Error('GCS purge failed');
      
      mockDownloadAndArchiveActivity.mockResolvedValue({ success: false });
      mockPurgeCorruptDatasetActivity.mockRejectedValue(purgeError);

      await expect(runDatasetIngestionWorkflow(datasetId)).rejects.toThrow(
        `Dataset Ingestion Workflow Failed: ${archivalErrorMessage}`
      );

      expect(mockPurgeCorruptDatasetActivity).toHaveBeenCalledWith(datasetId);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Critical ingestion failure: ${archivalErrorMessage}`));
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining(`Failed to execute purge compensating rollback: ${purgeError.message}`));
    });
  });

  describe('Context: Production/Temporal Mode', () => {
    let proxiedActivities;

    beforeEach(() => {
      // Ensure we are not in mock mode
      delete process.env.TEMPORAL_MOCK;
      delete process.env.OFFLINE_MODE;

      proxiedActivities = {
        downloadAndArchiveActivity: vi.fn(),
        indexRAGActivity: vi.fn(),
        purgeCorruptDatasetActivity: vi.fn(),
      };
      mockProxyActivities.mockReturnValue(proxiedActivities);
    });

    it('should successfully complete the workflow using proxied activities', async () => {
      proxiedActivities.downloadAndArchiveActivity.mockResolvedValue({ success: true });
      proxiedActivities.indexRAGActivity.mockResolvedValue({ success: true });

      const result = await runDatasetIngestionWorkflow(datasetId);

      expect(result).toEqual({
        success: true,
        datasetId,
        status: 'indexed',
        message: 'Resilient ingestion and RAG vector indexing successfully completed via Temporal.',
      });

      expect(mockProxyActivities).toHaveBeenCalledWith({
        startToCloseTimeout: '30 minutes',
        retry: {
          initialInterval: '5s',
          backoffCoefficient: 2,
          maximumInterval: '2 minutes',
          maximumAttempts: 3
        }
      });
      expect(proxiedActivities.downloadAndArchiveActivity).toHaveBeenCalledWith(datasetId);
      expect(proxiedActivities.indexRAGActivity).toHaveBeenCalledWith(datasetId);
      expect(proxiedActivities.purgeCorruptDatasetActivity).not.toHaveBeenCalled();
    });

    it('should fail and trigger rollback if a proxied activity fails', async () => {
      proxiedActivities.downloadAndArchiveActivity.mockResolvedValue({ success: true });
      proxiedActivities.indexRAGActivity.mockResolvedValue({ success: false });
      proxiedActivities.purgeCorruptDatasetActivity.mockResolvedValue(undefined);

      await expect(runDatasetIngestionWorkflow(datasetId)).rejects.toThrow(
        `Dataset Ingestion Workflow Failed: Indexing step failed for dataset ${datasetId}`
      );

      expect(proxiedActivities.downloadAndArchiveActivity).toHaveBeenCalledWith(datasetId);
      expect(proxiedActivities.indexRAGActivity).toHaveBeenCalledWith(datasetId);
      expect(proxiedActivities.purgeCorruptDatasetActivity).toHaveBeenCalledOnce();
      expect(proxiedActivities.purgeCorruptDatasetActivity).toHaveBeenCalledWith(datasetId);
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Critical ingestion failure: Indexing step failed'));
    });
  });
});