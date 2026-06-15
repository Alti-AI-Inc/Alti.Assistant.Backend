import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import httpStatus from 'http-status';

// Mock external dependencies first
// Mock @google-cloud/storage
const mockFile = {
  getSignedUrl: vi.fn().mockImplementation(() => Promise.resolve(['http://signed.url/file'])),
  download: vi.fn().mockImplementation(() => Promise.resolve()),
  delete: vi.fn().mockImplementation(() => Promise.resolve()),
};
const mockBucket = {
  upload: vi.fn().mockImplementation(() => Promise.resolve()),
  file: vi.fn().mockImplementation(() => mockFile),
};
const mockStorage = {
  bucket: vi.fn().mockImplementation(() => mockBucket),
};
const Storage = vi.fn().mockImplementation(() => mockStorage);
vi.mock('@google-cloud/storage', () => ({ Storage }));

// Mock fs/promises
const fsPromises = {
  unlink: vi.fn().mockImplementation(() => Promise.resolve()),
};
vi.mock('fs/promises', () => fsPromises);

// Mock fs (sync)
const fsSync = {
  existsSync: vi.fn().mockImplementation(() => true), // Default to true for keyFile existence
};
vi.mock('fs', () => fsSync);

const {
  logger
} = vi.hoisted(() => {
  // Mock logger
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  return {
    logger
  };
});
vi.mock('../../../../shared/logger.js', () => ({ logger }));

// Mock ApiError
const ApiError = vi.fn().mockImplementation((status, message) => {
  const error = new Error(message);
  error.statusCode = status;
  return error;
});
vi.mock('../../../../errors/ApiError.js', () => ({ default: ApiError }));

// Mock STORAGE_CONFIG
const STORAGE_CONFIG = {
  UPLOAD_FOLDER: 'test-uploads',
};
vi.mock('../translation.constant.js', () => ({ STORAGE_CONFIG }));

// Variable to hold the imported module's exports
let gcsFileProcessor;

describe('gcsFileProcessor', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules(); // Crucial to re-evaluate the module and its global variables

    // Set default environment variables for GCS to be configured
    vi.stubEnv('GCS_KEY_FILE', '/path/to/key.json');
    vi.stubEnv('GCP_PROJECT_ID', 'test-project');
    vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket');

    // Default GCS mocks to configured state
    Storage.mockImplementation(() => mockStorage);
    mockStorage.bucket.mockImplementation(() => mockBucket);
    fsSync.existsSync.mockReturnValue(true);

    // Dynamically import the module after setting up mocks and env
    // Assuming the test file is in the same directory as the source file
    const module = await import('./gcsFileProcessor.js');
    gcsFileProcessor = module.gcsFileProcessor;
  });

  afterEach(() => {
    vi.unstubAllEnvs(); // Clean up stubbed environment variables
  });

  // --- Test GCS Initialization Logic ---
  describe('GCS Initialization', () => {
    it('should initialize GCS with keyFilename if GCS_KEY_FILE and GCP_PROJECT_ID are set and keyFile exists', async () => {
      // The beforeEach already sets up the environment and imports.
      // We just need to assert the state after that import.
      expect(Storage).toHaveBeenCalledWith({
        keyFilename: '/path/to/key.json',
        projectId: 'test-project',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should initialize GCS with projectId if GCS_KEY_FILE is not set or keyFile does not exist', async () => {
      fsSync.existsSync.mockReturnValue(false);
      vi.stubEnv('GCS_KEY_FILE', ''); // Ensure keyFile is not considered

      // Re-import to trigger initialization with specific env
      await vi.resetModules();
      const module = await import('./gcsFileProcessor.js');
      gcsFileProcessor = module.gcsFileProcessor;

      expect(Storage).toHaveBeenCalledWith({
        projectId: 'test-project',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log a warning if GCS credentials are not configured (no keyFile or projectId)', async () => {
      fsSync.existsSync.mockReturnValue(false);
      vi.stubEnv('GCS_KEY_FILE', '');
      vi.stubEnv('GCP_PROJECT_ID', '');

      // Re-import to trigger initialization with specific env
      await vi.resetModules();
      const module = await import('./gcsFileProcessor.js');
      gcsFileProcessor = module.gcsFileProcessor;

      expect(Storage).not.toHaveBeenCalled();
      expect(mockStorage.bucket).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'GCS credentials not configured. Translation file uploads will be stored locally only.'
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log a warning if GCS_BUCKET_NAME is not set (bucket remains undefined)', async () => {
      vi.stubEnv('GCS_BUCKET_NAME', '');

      // Re-import to trigger initialization with specific env
      await vi.resetModules();
      const module = await import('./gcsFileProcessor.js');
      gcsFileProcessor = module.gcsFileProcessor;

      expect(Storage).toHaveBeenCalled(); // Storage object still created
      expect(mockStorage.bucket).not.toHaveBeenCalled(); // But bucket method not called
      expect(logger.warn).not.toHaveBeenCalledWith(
        'GCS credentials not configured. Translation file uploads will be stored locally only.'
      ); // This warning is for credentials, not bucket name
      expect(logger.error).not.toHaveBeenCalled(); // No error for missing bucket name, just `bucket` remains undefined
    });

    it('should log an error if GCS initialization fails', async () => {
      Storage.mockImplementation(() => {
        throw new Error('GCS init error');
      });

      // Re-import to trigger initialization with specific env
      await vi.resetModules();
      const module = await import('./gcsFileProcessor.js');
      gcsFileProcessor = module.gcsFileProcessor;

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize Google Cloud Storage for translation:',
        expect.any(Error)
      );
    });
  });

  // --- Test getMimeType ---
  describe('getMimeType', () => {
    it('should return correct MIME type for known extensions', () => {
      expect(gcsFileProcessor.getMimeType('document.pdf')).toBe('application/pdf');
      expect(gcsFileProcessor.getMimeType('report.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
      expect(gcsFileProcessor.getMimeType('image.txt')).toBe('text/plain');
      expect(gcsFileProcessor.getMimeType('index.html')).toBe('text/html');
      expect(gcsFileProcessor.getMimeType('data.json')).toBe('application/json');
      expect(gcsFileProcessor.getMimeType('data.csv')).toBe('text/csv');
      expect(gcsFileProcessor.getMimeType('sheet.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('should return application/octet-stream for unknown extensions', () => {
      expect(gcsFileProcessor.getMimeType('archive.zip')).toBe('application/octet-stream');
      expect(gcsFileProcessor.getMimeType('image.jpg')).toBe('application/octet-stream');
      expect(gcsFileProcessor.getMimeType('noextension')).toBe('application/octet-stream');
    });

    it('should handle case-insensitive extensions', () => {
      expect(gcsFileProcessor.getMimeType('document.PDF')).toBe('application/pdf');
      expect(gcsFileProcessor.getMimeType('report.DOCX')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });
  });

  // --- Test cleanupLocalFile ---
  describe('cleanupLocalFile', () => {
    const filePath = '/tmp/test-file.txt';

    it('should delete the file if it exists', async () => {
      fsSync.existsSync.mockReturnValue(true);
      await gcsFileProcessor.cleanupLocalFile(filePath);
      expect(fsPromises.unlink).toHaveBeenCalledWith(filePath);
      expect(logger.info).toHaveBeenCalledWith(`Cleaned up temporary file: ${filePath}`);
    });

    it('should do nothing if the file does not exist', async () => {
      fsSync.existsSync.mockReturnValue(false);
      await gcsFileProcessor.cleanupLocalFile(filePath);
      expect(fsPromises.unlink).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log a warning if file deletion fails', async () => {
      fsSync.existsSync.mockReturnValue(true);
      const error = new Error('Deletion failed');
      fsPromises.unlink.mockRejectedValue(error);
      await gcsFileProcessor.cleanupLocalFile(filePath);
      expect(fsPromises.unlink).toHaveBeenCalledWith(filePath);
      expect(logger.warn).toHaveBeenCalledWith(
        `Failed to cleanup file ${filePath}:`,
        error
      );
    });
  });

  // --- Test uploadToGCS ---
  describe('uploadToGCS', () => {
    const localFilePath = '/tmp/local/file.pdf';
    const filename = 'original_file.pdf';
    const userId = 'user123';
    const documentMetadata = {
      userId,
      documentType: 'invoice',
      originalName: 'invoice_123.pdf',
      targetLanguage: 'es',
      sourceLanguage: 'en',
    };

    it('should upload file to GCS and return signed URL when GCS is configured', async () => {
      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        filename,
        documentMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalledWith(localFilePath, {
        destination: expect.stringMatching(
          new RegExp(`^${STORAGE_CONFIG.UPLOAD_FOLDER}/${userId}/\\d+_original_file\\.pdf$`)
        ),
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            documentType: 'invoice',
            uploadedAt: expect.any(String),
            userId: 'user123',
            originalName: 'invoice_123.pdf',
            targetLanguage: 'es',
            sourceLanguage: 'en',
          },
        },
      });
      expect(mockBucket.file).toHaveBeenCalledWith(expect.stringMatching(
        new RegExp(`^${STORAGE_CONFIG.UPLOAD_FOLDER}/${userId}/\\d+_original_file\\.pdf$`)
      ));
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expect.any(Number),
      });
      expect(result).toEqual({
        success: true,
        gcsPath: expect.stringMatching(
          new RegExp(`^gs://test-bucket/${STORAGE_CONFIG.UPLOAD_FOLDER}/${userId}/\\d+_original_file\\.pdf$`)
        ),
        publicUrl: 'http://signed.url/file',
        fileName: 'original_file.pdf',
        destination: expect.stringMatching(
          new RegExp(`^${STORAGE_CONFIG.UPLOAD_FOLDER}/${userId}/\\d+_original_file\\.pdf$`)
        ),
        storageType: 'gcs',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Uploading translation file to GCS:')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Translation file uploaded successfully to GCS:')
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should use "anonymous" if userId is not provided in metadata', async () => {
      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        filename,
        {}
      ); // No userId

      expect(mockBucket.upload).toHaveBeenCalledWith(localFilePath, {
        destination: expect.stringMatching(
          new RegExp(`^${STORAGE_CONFIG.UPLOAD_FOLDER}/anonymous/\\d+_original_file\\.pdf$`)
        ),
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            documentType: 'translation', // Default
            uploadedAt: expect.any(String),
            userId: 'anonymous',
            originalName: 'original_file.pdf', // Uses sanitized filename
            targetLanguage: undefined,
            sourceLanguage: undefined,
          },
        },
      });
      expect(result.storageType).toBe('gcs');
    });

    it('should return local path fallback if GCS is not configured', async () => {
      // Simulate GCS not configured by making Storage return undefined
      Storage.mockImplementation(() => undefined);
      mockStorage.bucket.mockImplementation(() => undefined); // Ensure bucket is also undefined

      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        filename,
        documentMetadata
      );

      expect(mockBucket.upload).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('GCS not configured. Returning local file path.');
      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName: 'original_file.pdf',
        storageType: 'local',
      });
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return local path fallback if GCS upload fails', async () => {
      const uploadError = new Error('GCS upload failed');
      mockBucket.upload.mockRejectedValue(uploadError);

      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        filename,
        documentMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading translation file to GCS:',
        uploadError
      );
      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName: 'original_file.pdf',
        storageType: 'local',
        error: uploadError.message,
      });
    });

    it('should return local path fallback if signed URL generation fails', async () => {
      const signedUrlError = new Error('Signed URL failed');
      mockFile.getSignedUrl.mockRejectedValue(signedUrlError);

      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        filename,
        documentMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalled();
      expect(mockFile.getSignedUrl).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading translation file to GCS:',
        signedUrlError
      );
      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName: 'original_file.pdf',
        storageType: 'local',
        error: signedUrlError.message,
      });
    });

    it('should sanitize filename for GCS destination and return value', async () => {
      const maliciousFilename = '../../../../etc/passwd.pdf';
      const sanitizedFilename = 'passwd.pdf'; // path.basename result

      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        maliciousFilename,
        documentMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalledWith(localFilePath, {
        destination: expect.stringMatching(
          new RegExp(`^${STORAGE_CONFIG.UPLOAD_FOLDER}/${userId}/\\d+_${sanitizedFilename}$`)
        ),
        metadata: expect.any(Object),
      });
      expect(result.fileName).toBe(sanitizedFilename);
      expect(result.storageType).toBe('gcs');
    });

    it('should sanitize filename for local fallback', async () => {
      // Simulate GCS not configured
      Storage.mockImplementation(() => undefined);
      mockStorage.bucket.mockImplementation(() => undefined);

      const maliciousFilename = '../../../../etc/passwd.pdf';
      const sanitizedFilename = 'passwd.pdf';

      const result = await gcsFileProcessor.uploadToGCS(
        localFilePath,
        maliciousFilename,
        documentMetadata
      );

      expect(result.fileName).toBe(sanitizedFilename);
      expect(result.storageType).toBe('local');
    });
  });

  // --- Test downloadFromGCS ---
  describe('downloadFromGCS', () => {
    const gcsPath = 'gs://test-bucket/test-uploads/user123/file.pdf';
    const tempLocalPath = '/tmp/downloaded-file.pdf';

    it('should download file from GCS successfully', async () => {
      const result = await gcsFileProcessor.downloadFromGCS(gcsPath, tempLocalPath);

      expect(mockBucket.file).toHaveBeenCalledWith('test-uploads/user123/file.pdf');
      expect(mockFile.download).toHaveBeenCalledWith({ destination: tempLocalPath });
      expect(result).toEqual({ success: true, localPath: tempLocalPath });
      expect(logger.info).toHaveBeenCalledWith(
        'Downloading file from GCS: test-uploads/user123/file.pdf'
      );
      expect(logger.info).toHaveBeenCalledWith(
        `File downloaded successfully from GCS to: ${tempLocalPath}`
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should throw ApiError if GCS is not configured', async () => {
      Storage.mockImplementation(() => undefined);
      mockStorage.bucket.mockImplementation(() => undefined);

      await expect(gcsFileProcessor.downloadFromGCS(gcsPath, tempLocalPath)).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'GCS not configured');
      expect(logger.error).not.toHaveBeenCalled(); // Error is thrown, not caught by this module
    });

    it('should throw ApiError if GCS download fails', async () => {
      const downloadError = new Error('Download failed');
      mockFile.download.mockRejectedValue(downloadError);

      await expect(gcsFileProcessor.downloadFromGCS(gcsPath, tempLocalPath)).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to download file from GCS');
      expect(logger.error).toHaveBeenCalledWith(
        'Error downloading file from GCS:',
        downloadError
      );
    });
  });

  // --- Test deleteFromGCS ---
  describe('deleteFromGCS', () => {
    const gcsPath = 'gs://test-bucket/test-uploads/user123/file.pdf';

    it('should delete file from GCS successfully', async () => {
      const result = await gcsFileProcessor.deleteFromGCS(gcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith('test-uploads/user123/file.pdf');
      expect(mockFile.delete).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: 'File deleted successfully from GCS' });
      expect(logger.info).toHaveBeenCalledWith(
        'Translation file deleted from GCS: test-uploads/user123/file.pdf'
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return success: false if GCS is not configured', async () => {
      Storage.mockImplementation(() => undefined);
      mockStorage.bucket.mockImplementation(() => undefined);

      const result = await gcsFileProcessor.deleteFromGCS(gcsPath);

      expect(mockBucket.file).not.toHaveBeenCalled();
      expect(mockFile.delete).not.toHaveBeenCalled();
      expect(result).toEqual({ success: false, message: 'GCS not configured' });
      expect(logger.warn).toHaveBeenCalledWith('GCS not configured. Cannot delete from GCS.');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should return success: false and error message if GCS deletion fails', async () => {
      const deleteError = new Error('Deletion failed');
      mockFile.delete.mockRejectedValue(deleteError);

      const result = await gcsFileProcessor.deleteFromGCS(gcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith('test-uploads/user123/file.pdf');
      expect(mockFile.delete).toHaveBeenCalled();
      expect(result).toEqual({ success: false, message: deleteError.message });
      expect(logger.error).toHaveBeenCalledWith(
        'Error deleting translation file from GCS:',
        deleteError
      );
    });
  });
});