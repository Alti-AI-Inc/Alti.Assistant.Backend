import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Storage } from '@google-cloud/storage';
import { GCPStorageService } from './gcpStorageService.js';

const {
  mockFile,
  mockBucket,
  mockStorage,
  mockStorageConstructor
} = vi.hoisted(() => {
  const mockFile = {
    save: vi.fn(),
    delete: vi.fn(),
  };

  const mockBucket = {
    upload: vi.fn(),
    file: vi.fn().mockImplementation(() => mockFile),
    exists: vi.fn(),
  };

  const mockStorage = {
    bucket: vi.fn().mockImplementation(() => mockBucket),
  };

  const mockStorageConstructor = vi.fn().mockImplementation(function() {
    return mockStorage;
  });

  return {
    mockFile,
    mockBucket,
    mockStorage,
    mockStorageConstructor
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorageConstructor,
}));

describe('GCPStorageService', () => {
  const mockBucketName = 'test-bucket';
  const mockKeyFilePath = '/path/to/keyfile.json';
  let service;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    service = new GCPStorageService(mockBucketName, mockKeyFilePath);
  });

  describe('constructor', () => {
    it('should initialize Storage and Bucket correctly', () => {
      expect(service.bucketName).toBe(mockBucketName);
      expect(service.storage).toBe(mockStorage);
      expect(service.bucket).toBe(mockBucket);
      expect(vi.mocked(mockStorage.bucket)).toHaveBeenCalledWith(mockBucketName);
      expect(vi.mocked(mockStorage.bucket)).toHaveBeenCalledTimes(1);
    });

    it('should call Storage constructor with keyFilename', () => {
      expect(vi.mocked(Storage)).toHaveBeenCalledWith({
        keyFilename: mockKeyFilePath,
      });
      expect(vi.mocked(Storage)).toHaveBeenCalledTimes(1);
    });
  });

  describe('uploadFile', () => {
    const localFilePath = '/tmp/test-image.png';
    const destinationFileName = 'images/uploaded-image.png';
    const expectedPublicUrl = `https://storage.googleapis.com/${mockBucketName}/${destinationFileName}`;

    it('should upload a file and return its public URL', async () => {
      vi.mocked(mockBucket.upload).mockResolvedValueOnce([]);

      const result = await service.uploadFile(localFilePath, destinationFileName);

      expect(vi.mocked(mockBucket.upload)).toHaveBeenCalledWith(localFilePath, {
        destination: destinationFileName,
        metadata: {
          cacheControl: 'public, max-age=31536000',
        },
      });
      expect(result).toBe(expectedPublicUrl);
    });

    it('should throw an error if upload fails', async () => {
      const uploadError = new Error('Upload failed');
      vi.mocked(mockBucket.upload).mockRejectedValueOnce(uploadError);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.uploadFile(localFilePath, destinationFileName)).rejects.toThrow(uploadError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error uploading to GCP:', uploadError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('uploadBuffer', () => {
    const buffer = Buffer.from('test data');
    const destinationFileName = 'buffers/test-buffer.txt';
    const contentType = 'text/plain';
    const expectedPublicUrl = `https://storage.googleapis.com/${mockBucketName}/${destinationFileName}`;

    it('should upload a buffer with specified content type and return its public URL', async () => {
      vi.mocked(mockFile.save).mockResolvedValueOnce([]);

      const result = await service.uploadBuffer(buffer, destinationFileName, contentType);

      expect(vi.mocked(mockBucket.file)).toHaveBeenCalledWith(destinationFileName);
      expect(vi.mocked(mockFile.save)).toHaveBeenCalledWith(buffer, {
        metadata: {
          contentType: contentType,
          cacheControl: 'public, max-age=31536000',
        },
      });
      expect(result).toBe(expectedPublicUrl);
    });

    it('should upload a buffer with default content type if not specified', async () => {
      vi.mocked(mockFile.save).mockResolvedValueOnce([]);

      const result = await service.uploadBuffer(buffer, destinationFileName);

      expect(vi.mocked(mockBucket.file)).toHaveBeenCalledWith(destinationFileName);
      expect(vi.mocked(mockFile.save)).toHaveBeenCalledWith(buffer, {
        metadata: {
          contentType: 'image/png', // Default content type
          cacheControl: 'public, max-age=31536000',
        },
      });
      expect(result).toBe(expectedPublicUrl);
    });

    it('should throw an error if buffer upload fails', async () => {
      const uploadError = new Error('Buffer upload failed');
      vi.mocked(mockFile.save).mockRejectedValueOnce(uploadError);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.uploadBuffer(buffer, destinationFileName, contentType)).rejects.toThrow(uploadError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error uploading buffer to GCP:', uploadError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('deleteFile', () => {
    const fileNameToDelete = 'images/old-image.png';

    it('should delete a file successfully', async () => {
      vi.mocked(mockFile.delete).mockResolvedValueOnce([]);
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service.deleteFile(fileNameToDelete);

      expect(vi.mocked(mockBucket.file)).toHaveBeenCalledWith(fileNameToDelete);
      expect(vi.mocked(mockFile.delete)).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(`File ${fileNameToDelete} deleted from GCP bucket`);
      consoleLogSpy.mockRestore();
    });

    it('should throw an error if file deletion fails', async () => {
      const deleteError = new Error('Deletion failed');
      vi.mocked(mockFile.delete).mockRejectedValueOnce(deleteError);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.deleteFile(fileNameToDelete)).rejects.toThrow(deleteError);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error deleting from GCP:', deleteError);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('checkBucketAccess', () => {
    it('should return true if bucket exists', async () => {
      vi.mocked(mockBucket.exists).mockResolvedValueOnce([true]);

      const result = await service.checkBucketAccess();

      expect(vi.mocked(mockBucket.exists)).toHaveBeenCalledTimes(1);
      expect(result).toBe(true);
    });

    it('should return false if bucket does not exist', async () => {
      vi.mocked(mockBucket.exists).mockResolvedValueOnce([false]);

      const result = await service.checkBucketAccess();

      expect(vi.mocked(mockBucket.exists)).toHaveBeenCalledTimes(1);
      expect(result).toBe(false);
    });

    it('should return false and log error if checking bucket access fails', async () => {
      const accessError = new Error('Access check failed');
      vi.mocked(mockBucket.exists).mockRejectedValueOnce(accessError);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await service.checkBucketAccess();

      expect(vi.mocked(mockBucket.exists)).toHaveBeenCalledTimes(1);
      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error checking bucket access:', accessError);
      consoleErrorSpy.mockRestore();
    });
  });
});