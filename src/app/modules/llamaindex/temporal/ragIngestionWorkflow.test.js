import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { resilientRAGIngestionWorkflow } from './ragIngestionWorkflow';

const {
  mockDownloadAndLoadFileActivity,
  mockParseToMarkdownActivity,
  mockChunkAndEmbedActivity,
  mockCommitToVectorStoreActivity,
  mockCleanupFailedIngestionActivity
} = vi.hoisted(() => {
  // Mock the activities module functions
  const mockDownloadAndLoadFileActivity = vi.fn();
  const mockParseToMarkdownActivity = vi.fn();
  const mockChunkAndEmbedActivity = vi.fn();
  const mockCommitToVectorStoreActivity = vi.fn();
  const mockCleanupFailedIngestionActivity = vi.fn();

  return {
    mockDownloadAndLoadFileActivity,
    mockParseToMarkdownActivity,
    mockChunkAndEmbedActivity,
    mockCommitToVectorStoreActivity,
    mockCleanupFailedIngestionActivity
  };
});

// Mock the dynamic import for ragIngestionActivities.js
// Vitest will intercept this module path regardless of whether it's a static or dynamic import.
vi.mock('./ragIngestionActivities.js', () => ({
  downloadAndLoadFileActivity: mockDownloadAndLoadFileActivity,
  parseToMarkdownActivity: mockParseToMarkdownActivity,
  chunkAndEmbedActivity: mockChunkAndEmbedActivity,
  commitToVectorStoreActivity: mockCommitToVectorStoreActivity,
  cleanupFailedIngestionActivity: mockCleanupFailedIngestionActivity,
}));

// Mock @temporalio/workflow. This mock will be used when `isMock` is false.
// The `proxyActivities` function will return an object containing our shared mock activity functions.
vi.mock('@temporalio/workflow', () => ({
  proxyActivities: vi.fn().mockImplementation(() => ({
    downloadAndLoadFileActivity: mockDownloadAndLoadFileActivity,
    parseToMarkdownActivity: mockParseToMarkdownActivity,
    chunkAndEmbedActivity: mockChunkAndEmbedActivity,
    commitToVectorStoreActivity: mockCommitToVectorStoreActivity,
    cleanupFailedIngestionActivity: mockCleanupFailedIngestionActivity,
  })),
}));

describe('resilientRAGIngestionWorkflow', () => {
  const filePath = '/path/to/file.pdf';
  const originalName = 'file.pdf';
  const userId = 'user123';
  const docId = 'doc456';

  // Store original process.env values to restore them
  let originalTemporalMock;
  let originalOfflineMode;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set up default successful mock implementations
    mockDownloadAndLoadFileActivity.mockResolvedValue({ success: true });
    mockParseToMarkdownActivity.mockResolvedValue({ success: true });
    mockChunkAndEmbedActivity.mockResolvedValue({ success: true });
    mockCommitToVectorStoreActivity.mockResolvedValue({ success: true });
    mockCleanupFailedIngestionActivity.mockResolvedValue({ success: true });

    // Store original values before overriding for the test
    originalTemporalMock = process.env.TEMPORAL_MOCK;
    originalOfflineMode = process.env.OFFLINE_MODE;

    // Default to mock mode for most tests
    process.env.TEMPORAL_MOCK = 'true';
    process.env.OFFLINE_MODE = 'true';
  });

  afterAll(() => {
    // Restore original process.env values after all tests
    if (originalTemporalMock !== undefined) {
      process.env.TEMPORAL_MOCK = originalTemporalMock;
    } else {
      delete process.env.TEMPORAL_MOCK;
    }
    if (originalOfflineMode !== undefined) {
      process.env.OFFLINE_MODE = originalOfflineMode;
    } else {
      delete process.env.OFFLINE_MODE;
    }
  });

  it('should successfully complete the ingestion workflow when all activities succeed (mock mode)', async () => {
    const result = await resilientRAGIngestionWorkflow(filePath, originalName, userId, docId);

    expect(mockDownloadAndLoadFileActivity).toHaveBeenCalledWith(filePath, originalName, docId);
    expect(mockParseToMarkdownActivity).toHaveBeenCalledWith(filePath, originalName, docId);
    expect(mockChunkAndEmbedActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
    expect(mockCommitToVectorStoreActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
    expect(mockCleanupFailedIngestionActivity).not.toHaveBeenCalled(); // Should not be called on success

    expect(result).toEqual({
      success: true,
      docId,
      originalName,
      status: 'completed',
      message: 'World-class resilient RAG document ingestion successfully committed via Temporal durable workflows.',
    });

    // Ensure proxyActivities was NOT called in mock mode
    const { proxyActivities } = await import('@temporalio/workflow'); // Import to access the mock
    expect(proxyActivities).not.toHaveBeenCalled();
  });

  it('should successfully complete the ingestion workflow when all activities succeed (non-mock mode)', async () => {
    // Disable mock environment variables to force the non-mock path
    delete process.env.TEMPORAL_MOCK;
    delete process.env.OFFLINE_MODE;

    const result = await resilientRAGIngestionWorkflow(filePath, originalName, userId, docId);

    // In non-mock mode, proxyActivities should be called
    const { proxyActivities } = await import('@temporalio/workflow'); // Import to access the mock
    expect(proxyActivities).toHaveBeenCalledWith({
      startToCloseTimeout: '60 minutes',
      retry: {
        initialInterval: '5s',
        backoffCoefficient: 2,
        maximumInterval: '5 minutes',
        maximumAttempts: 3
      }
    });
    expect(mockDownloadAndLoadFileActivity).toHaveBeenCalledWith(filePath, originalName, docId);
    expect(mockParseToMarkdownActivity).toHaveBeenCalledWith(filePath, originalName, docId);
    expect(mockChunkAndEmbedActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
    expect(mockCommitToVectorStoreActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
    expect(mockCleanupFailedIngestionActivity).not.toHaveBeenCalled();

    expect(result).toEqual({
      success: true,
      docId,
      originalName,
      status: 'completed',
      message: 'World-class resilient RAG document ingestion successfully committed via Temporal durable workflows.',
    });
  });

  it('should throw an error and initiate rollback if downloadAndLoadFileActivity fails', async () => {
    mockDownloadAndLoadFileActivity.mockResolvedValueOnce({ success: false });

    await expect(resilientRAGIngestionWorkflow(filePath, originalName, userId, docId)).rejects.toThrow(
      'Resilient RAG Ingestion Workflow Failed: Temporal Ingestion failed during file loading step.'
    );

    expect(mockDownloadAndLoadFileActivity).toHaveBeenCalledTimes(1);
    expect(mockParseToMarkdownActivity).not.toHaveBeenCalled();
    expect(mockChunkAndEmbedActivity).not.toHaveBeenCalled();
    expect(mockCommitToVectorStoreActivity).not.toHaveBeenCalled();
    expect(mockCleanupFailedIngestionActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
  });

  it('should throw an error and initiate rollback if parseToMarkdownActivity fails', async () => {
    mockParseToMarkdownActivity.mockResolvedValueOnce({ success: false });

    await expect(resilientRAGIngestionWorkflow(filePath, originalName, userId, docId)).rejects.toThrow(
      'Resilient RAG Ingestion Workflow Failed: Temporal Ingestion failed during high-fidelity HTML-to-Markdown parsing step.'
    );

    expect(mockDownloadAndLoadFileActivity).toHaveBeenCalledTimes(1);
    expect(mockParseToMarkdownActivity).toHaveBeenCalledTimes(1);
    expect(mockChunkAndEmbedActivity).not.toHaveBeenCalled();
    expect(mockCommitToVectorStoreActivity).not.toHaveBeenCalled();
    expect(mockCleanupFailedIngestionActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
  });

  it('should throw an error and initiate rollback if chunkAndEmbedActivity fails', async () => {
    mockChunkAndEmbedActivity.mockResolvedValueOnce({ success: false });

    await expect(resilientRAGIngestionWorkflow(filePath, originalName, userId, docId)).rejects.toThrow(
      'Resilient RAG Ingestion Workflow Failed: Temporal Ingestion failed during embedding generation step.'
    );

    expect(mockDownloadAndLoadFileActivity).toHaveBeenCalledTimes(1);
    expect(mockParseToMarkdownActivity).toHaveBeenCalledTimes(1);
    expect(mockChunkAndEmbedActivity).toHaveBeenCalledTimes(1);
    expect(mockCommitToVectorStoreActivity).not.toHaveBeenCalled();
    expect(mockCleanupFailedIngestionActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
  });

  it('should throw an error and initiate rollback if commitToVectorStoreActivity fails', async () => {
    mockCommitToVectorStoreActivity.mockResolvedValueOnce({ success: false });

    await expect(resilientRAGIngestionWorkflow(filePath, originalName, userId, docId)).rejects.toThrow(
      'Resilient RAG Ingestion Workflow Failed: Temporal Ingestion failed during vector database commit step.'
    );

    expect(mockDownloadAndLoadFileActivity).toHaveBeenCalledTimes(1);
    expect(mockParseToMarkdownActivity).toHaveBeenCalledTimes(1);
    expect(mockChunkAndEmbedActivity).toHaveBeenCalledTimes(1);
    expect(mockCommitToVectorStoreActivity).toHaveBeenCalledTimes(1);
    expect(mockCleanupFailedIngestionActivity).toHaveBeenCalledWith(filePath, originalName, docId, userId);
  });

  it('should still throw the original error if cleanupFailedIngestionActivity fails', async () => {
    mockCommitToVectorStoreActivity.mockResolvedValueOnce({ success: false });
    mockCleanupFailedIngestionActivity.mockRejectedValueOnce(new Error('Cleanup failed!'));

    // Spy on console.error to ensure the cleanup failure is logged
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(resilientRAGIngestionWorkflow(filePath, originalName, userId, docId)).rejects.toThrow(
      'Resilient RAG Ingestion Workflow Failed: Temporal Ingestion failed during vector database commit step.'
    );

    expect(mockCommitToVectorStoreActivity).toHaveBeenCalledTimes(1);
    expect(mockCleanupFailedIngestionActivity).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Temporal RAG Ingestion Orchestrator] Failed to execute compensating rollback activity: Cleanup failed!'
    );

    consoleErrorSpy.mockRestore(); // Clean up the spy
  });
});