import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs'; // Import fs to mock its methods

// Mock external dependencies
// Mock GCS_CONFIG first, as it's used in the module's top-level initialization
// This initial mock is a placeholder; it will be overridden in beforeEach or specific tests.
vi.doMock('../document.constant.js', () => ({
  GCS_CONFIG: {
    KEY_FILE: '/path/to/mock-key.json',
    PROJECT_ID: 'mock-project-id',
    BUCKET_NAME: 'mock-bucket-name',
    FOLDER_PREFIX: 'test-uploads/',
  },
}));

vi.mock('../../subscription/subscription.model.js', () => ({
  default: {
    findOne: vi.fn(),
  },
}));
vi.mock('../../usage/userUsage.model.js', () => ({
  default: {
    findOne: vi.fn(),
  },
}));
vi.mock('../../tenant/tenant.model.js', () => ({
  default: {
    findOne: vi.fn(),
  },
}));

// Mock @google-cloud/storage
const mockFile = {
  getSignedUrl: vi.fn().mockImplementation(() => Promise.resolve(['http://mock-signed-url'])),
  delete: vi.fn().mockImplementation(() => Promise.resolve()),
};
const mockBucket = {
  upload: vi.fn().mockImplementation(() => Promise.resolve()),
  file: vi.fn().mockImplementation(() => mockFile),
};
const mockStorage = {
  bucket: vi.fn().mockImplementation(() => mockBucket),
};

const {
  mockStorageConstructor,
  mockLogger
} = vi.hoisted(() => {
  const mockStorageConstructor = vi.fn().mockImplementation(function() {
    return mockStorage;
  });

  // Mock logger
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    mockStorageConstructor,
    mockLogger
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorageConstructor,
}));

// Mock fs for existsSync
vi.mock('fs', () => {
  const existsSyncFn = vi.fn();
  return {
    default: {
      existsSync: existsSyncFn,
    },
    existsSync: existsSyncFn,
  };
});

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

// Helper to re-import the module under test for different GCS_CONFIG scenarios
// This is crucial because the GCS initialization logic runs immediately on module load.
const importService = async (customGcsConfig) => {
  vi.resetModules(); // Reset module cache to allow re-importing with new mocks
  const configToUse = customGcsConfig || {
    KEY_FILE: '/path/to/mock-key.json',
    PROJECT_ID: 'mock-project-id',
    BUCKET_NAME: 'mock-bucket-name',
    FOLDER_PREFIX: 'test-uploads/',
  };
  vi.doMock('../document.constant.js', () => ({
    GCS_CONFIG: configToUse,
  }));
  const { GCS_CONFIG } = await import('../document.constant.js');
  const service = await import('./gcsUploadService.js');
  return { service, GCS_CONFIG };
};

describe('gcsUploadService', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Default mock for fs.existsSync to true for key file presence
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks(); // Restore any spies or mocks that might have been set globally
  });

  describe('GCS Initialization', () => {
    it('should initialize GCS if PROJECT_ID is present', async () => {
      await importService({
        KEY_FILE: '/path/to/mock-key.json',
        PROJECT_ID: 'mock-project-id',
        BUCKET_NAME: 'mock-bucket-name',
        FOLDER_PREFIX: 'test-uploads/',
      });

      expect(mockStorageConstructor).toHaveBeenCalledWith({
        projectId: 'mock-project-id',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('mock-bucket-name');
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should initialize GCS with projectId if KEY_FILE does not exist but PROJECT_ID is present', async () => {
      await importService({
        KEY_FILE: undefined,
        PROJECT_ID: 'mock-project-id',
        BUCKET_NAME: 'mock-bucket-name',
        FOLDER_PREFIX: 'test-uploads/',
      });

      expect(mockStorageConstructor).toHaveBeenCalledWith({
        projectId: 'mock-project-id',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('mock-bucket-name');
      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should not initialize GCS if no credentials are provided', async () => {
      await importService({
        KEY_FILE: undefined,
        PROJECT_ID: undefined,
        BUCKET_NAME: 'mock-bucket-name',
        FOLDER_PREFIX: 'test-uploads/',
      });

      expect(mockStorageConstructor).not.toHaveBeenCalled();
      expect(mockStorage.bucket).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GCS_PROJECT_ID not configured. GCS services will be unavailable.'
      );
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log an error if GCS initialization fails', async () => {
      const initError = new Error('GCS Init Failed');
      mockStorageConstructor.mockImplementationOnce(function() {
        throw initError;
      });

      await importService({
        KEY_FILE: '/path/to/mock-key.json',
        PROJECT_ID: 'mock-project-id',
        BUCKET_NAME: 'mock-bucket-name',
        FOLDER_PREFIX: 'test-uploads/',
      });

      expect(mockStorageConstructor).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize Google Cloud Storage:',
        initError
      );
    });
  });

  describe('uploadDocumentToGCS', () => {
    const localFilePath = '/tmp/test-document.pdf';
    const documentMetadata = {
      userId: 'user123',
      documentType: 'report',
      title: 'Monthly Report',
    };

    it('should return local path if GCS is not configured', async () => {
      const { service } = await importService({
        KEY_FILE: undefined,
        PROJECT_ID: undefined,
        BUCKET_NAME: 'mock-bucket-name',
        FOLDER_PREFIX: 'test-uploads/',
      });

      const result = await service.uploadDocumentToGCS(
        localFilePath,
        documentMetadata
      );

      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName: 'test-document.pdf',
        storageType: 'local',
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GCS not configured. Returning local file path.'
      );
      expect(mockBucket.upload).not.toHaveBeenCalled();
      expect(mockFile.getSignedUrl).not.toHaveBeenCalled();
    });

    it('should successfully upload a document to GCS', async () => {
      const { service, GCS_CONFIG } = await importService();

      const result = await service.uploadDocumentToGCS(
        localFilePath,
        documentMetadata
      );

      const expectedDestination = `${GCS_CONFIG.FOLDER_PREFIX}${documentMetadata.userId}/test-document.pdf`;

      expect(mockBucket.upload).toHaveBeenCalledWith(localFilePath, {
        destination: expectedDestination,
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            documentType: documentMetadata.documentType,
            uploadedAt: expect.any(String),
            userId: documentMetadata.userId,
            title: documentMetadata.title,
          },
        },
      });
      expect(mockBucket.file).toHaveBeenCalledWith(expectedDestination);
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'read',
          expires: expect.any(Number), // Check that expires is a number
        })
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Uploading document to GCS: ${expectedDestination}`
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Document uploaded successfully to GCS: ${expectedDestination}`
      );
      expect(result).toEqual({
        success: true,
        gcsPath: `gs://${GCS_CONFIG.BUCKET_NAME}/${expectedDestination}`,
        publicUrl: 'http://mock-signed-url',
        fileName: 'test-document.pdf',
        destination: expectedDestination,
        storageType: 'gcs',
      });
    });

    it('should use default metadata if not provided', async () => {
      const { service, GCS_CONFIG } = await importService();
      const localFilePathTxt = '/tmp/another-doc.txt';

      const result = await service.uploadDocumentToGCS(localFilePathTxt, {});

      const expectedDestination = `${GCS_CONFIG.FOLDER_PREFIX}anonymous/another-doc.txt`;

      expect(mockBucket.upload).toHaveBeenCalledWith(localFilePathTxt, {
        destination: expectedDestination,
        metadata: {
          contentType: 'text/plain',
          metadata: {
            documentType: 'general',
            uploadedAt: expect.any(String),
            userId: 'anonymous',
            title: 'Untitled',
          },
        },
      });
      expect(result.fileName).toBe('another-doc.txt');
      expect(result.destination).toBe(expectedDestination);
    });

    it('should handle upload errors and return local path fallback', async () => {
      const uploadError = new Error('GCS Upload Failed');
      mockBucket.upload.mockRejectedValueOnce(uploadError);
      const { service } = await importService();

      const result = await service.uploadDocumentToGCS(
        localFilePath,
        documentMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error uploading document to GCS:',
        uploadError
      );
      expect(result).toEqual({
        success: true, // The original code returns success: true even on error fallback
        localPath: localFilePath,
        fileName: 'test-document.pdf',
        storageType: 'local',
        error: uploadError.message,
      });
      expect(mockFile.getSignedUrl).not.toHaveBeenCalled(); // Should not be called if upload fails
    });

    it('should handle getSignedUrl errors and return local path fallback', async () => {
      const signedUrlError = new Error('Signed URL Failed');
      mockFile.getSignedUrl.mockRejectedValueOnce(signedUrlError);
      const { service } = await importService();

      const result = await service.uploadDocumentToGCS(
        localFilePath,
        documentMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalled();
      expect(mockFile.getSignedUrl).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error uploading document to GCS:',
        signedUrlError
      );
      expect(result).toEqual({
        success: true, // The original code returns success: true even on error fallback
        localPath: localFilePath,
        fileName: 'test-document.pdf',
        storageType: 'local',
        error: signedUrlError.message,
      });
    });

    it('should return correct content type for various file extensions', async () => {
      const { service } = await importService();
      const testCases = [
        { file: 'doc.pdf', expected: 'application/pdf' },
        {
          file: 'doc.docx',
          expected:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        { file: 'doc.doc', expected: 'application/msword' },
        { file: 'doc.txt', expected: 'text/plain' },
        { file: 'doc.html', expected: 'text/html' },
        { file: 'doc.md', expected: 'text/markdown' },
        { file: 'doc.jpg', expected: 'image/jpeg' }, // Supported
        { file: 'doc', expected: 'application/octet-stream' }, // No extension
      ];

      for (const { file, expected } of testCases) {
        // Test getContentType indirectly by checking the metadata passed to bucket.upload
        await service.uploadDocumentToGCS(`/tmp/${file}`, documentMetadata);
        const uploadCall = mockBucket.upload.mock.calls.find(
          (call) => call[0] === `/tmp/${file}`
        );
        expect(uploadCall[1].metadata.contentType).toBe(expected);
        mockBucket.upload.mockClear(); // Clear for next iteration
      }
    });
  });

  describe('deleteDocumentFromGCS', () => {
    const gcsPath = 'gs://mock-bucket-name/test-uploads/tenant123/workspace123/user123/document.pdf';
    const expectedFilePath = 'test-uploads/tenant123/workspace123/user123/document.pdf';
    const mockUser = {
      id: 'user123',
      tenantId: 'tenant123',
      workspaceId: 'workspace123',
      role: 'user',
    };

    it('should throw failure if GCS is not configured', async () => {
      const { service } = await importService({
        KEY_FILE: undefined,
        PROJECT_ID: undefined,
        BUCKET_NAME: 'mock-bucket-name',
        FOLDER_PREFIX: 'test-uploads/',
      });

      await expect(service.deleteDocumentFromGCS(gcsPath, mockUser)).rejects.toThrow('GCS not configured.');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'GCS not configured. Cannot delete from GCS.'
      );
      expect(mockBucket.file).not.toHaveBeenCalled();
      expect(mockFile.delete).not.toHaveBeenCalled();
    });

    it('should successfully delete a document from GCS', async () => {
      const { service } = await importService();

      const result = await service.deleteDocumentFromGCS(gcsPath, mockUser);

      expect(mockBucket.file).toHaveBeenCalledWith(expectedFilePath);
      expect(mockFile.delete).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        `Document deleted from GCS by user ${mockUser.id}: ${expectedFilePath}`
      );
      expect(result).toEqual({
        success: true,
        message: 'Document deleted successfully',
      });
    });

    it('should handle deletion errors', async () => {
      const deleteError = new Error('GCS Delete Failed');
      mockFile.delete.mockRejectedValueOnce(deleteError);
      const { service } = await importService();

      await expect(service.deleteDocumentFromGCS(gcsPath, mockUser)).rejects.toThrow('Could not delete document.');

      expect(mockBucket.file).toHaveBeenCalledWith(expectedFilePath);
      expect(mockFile.delete).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        `Error deleting document from GCS for path ${gcsPath}:`,
        deleteError.message
      );
    });
  });
});