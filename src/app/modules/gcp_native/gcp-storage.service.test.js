import { describe, it, expect, vi, beforeEach, afterEach, afterAll, beforeAll } from 'vitest';
import { GcpStorageService } from './gcp-storage.service.js';
import { logger } from '../../../shared/logger.js';

// Mock the entire @google-cloud/storage module
const mockGetSignedUrl = vi.fn();
const mockFile = vi.fn(() => ({
  getSignedUrl: mockGetSignedUrl,
}));

const mockGetFiles = vi.fn();
const mockBucketInstance = {
  file: mockFile,
  getFiles: mockGetFiles,
};
const mockBucket = vi.fn(() => mockBucketInstance);

const mockCreateBucket = vi.fn();
const mockStorageInstance = {
  createBucket: mockCreateBucket,
  bucket: mockBucket,
};

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(() => mockStorageInstance),
}));

// Mock the logger to prevent console output and allow spying
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('GcpStorageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createBucket', () => {
    it('should create a bucket successfully and return its metadata', async () => {
      const bucketName = 'my-new-unique-bucket';
      const location = 'us-west1';
      const mockCreationTime = new Date().toISOString();

      const mockBucketResponse = {
        name: bucketName,
        metadata: {
          location: location.toUpperCase(), // GCS often returns uppercase location
          timeCreated: mockCreationTime,
        },
      };

      mockCreateBucket.mockResolvedValue([mockBucketResponse]);

      const result = await GcpStorageService.createBucket(bucketName, location);

      expect(mockCreateBucket).toHaveBeenCalledWith(bucketName, {
        location,
        storageClass: 'STANDARD',
      });
      expect(result).toEqual({
        success: true,
        bucketName: bucketName,
        location: mockBucketResponse.metadata.location,
        created: mockCreationTime,
      });
      expect(logger.info).toHaveBeenCalledWith(`GCS API: Creating storage bucket "${bucketName}" in location "${location}"...`);
    });

    it('should use the default location if none is provided', async () => {
      const bucketName = 'my-default-location-bucket';
      const mockCreationTime = new Date().toISOString();
      const mockBucketResponse = {
        name: bucketName,
        metadata: {
          location: 'US-CENTRAL1',
          timeCreated: mockCreationTime,
        },
      };
      mockCreateBucket.mockResolvedValue([mockBucketResponse]);

      await GcpStorageService.createBucket(bucketName);

      expect(mockCreateBucket).toHaveBeenCalledWith(bucketName, {
        location: 'us-central1', // default location
        storageClass: 'STANDARD',
      });
    });

    it('should throw an error if bucket creation fails', async () => {
      const bucketName = 'failed-bucket';
      const gcsError = new Error('Bucket name already exists.');
      mockCreateBucket.mockRejectedValue(gcsError);

      await expect(GcpStorageService.createBucket(bucketName)).rejects.toThrow(
        `GCS Bucket Creation failed: ${gcsError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith('GCS Bucket Creation Error:', gcsError);
    });
  });

  describe('generateSignedUrl', () => {
    const bucketName = 'test-bucket';
    const tenantId = 'tenant-abc-123';
    // Test context boundary for multi-tenancy
    const fileName = `tenants/${tenantId}/uploads/document.pdf`;

    beforeAll(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2023-10-27T10:00:00Z'));
    });

    afterAll(() => {
      vi.useRealTimers();
    });

    it('should generate a "read" signed URL successfully with default expiration', async () => {
      const mockUrl = 'https://storage.googleapis.com/test-bucket/signed-url-for-read';
      mockGetSignedUrl.mockResolvedValue([mockUrl]);

      const result = await GcpStorageService.generateSignedUrl(bucketName, fileName, 'read');

      const expectedExpires = Date.now() + 15 * 60 * 1000;
      expect(mockBucket).toHaveBeenCalledWith(bucketName);
      expect(mockFile).toHaveBeenCalledWith(fileName);
      expect(mockGetSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expectedExpires,
      });
      expect(result).toEqual({
        success: true,
        bucketName,
        fileName,
        action: 'read',
        url: mockUrl,
        expiresAt: new Date(expectedExpires),
      });
      expect(logger.info).toHaveBeenCalledWith(`GCS API: Generating signed URL for file "${fileName}" inside bucket "${bucketName}" (action: read)...`);
    });

    it('should generate a "write" signed URL successfully with custom expiration', async () => {
      const mockUrl = 'https://storage.googleapis.com/test-bucket/signed-url-for-write';
      mockGetSignedUrl.mockResolvedValue([mockUrl]);

      const expiresMinutes = 60;
      const result = await GcpStorageService.generateSignedUrl(bucketName, fileName, 'write', expiresMinutes);

      const expectedExpires = Date.now() + expiresMinutes * 60 * 1000;
      expect(mockGetSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'write',
        expires: expectedExpires,
      });
      expect(result).toEqual({
        success: true,
        bucketName,
        fileName,
        action: 'write',
        url: mockUrl,
        expiresAt: new Date(expectedExpires),
      });
    });

    it('should throw a validation error for an invalid action', async () => {
      const invalidAction = 'delete';
      await expect(GcpStorageService.generateSignedUrl(bucketName, fileName, invalidAction)).rejects.toThrow(
        'Invalid action specified. Must be "read" or "write".'
      );
      expect(logger.error).toHaveBeenCalled();
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('should throw a validation error for a non-positive expiration time', async () => {
      await expect(GcpStorageService.generateSignedUrl(bucketName, fileName, 'read', 0)).rejects.toThrow(
        'Expires minutes must be a positive number.'
      );
      await expect(GcpStorageService.generateSignedUrl(bucketName, fileName, 'read', -10)).rejects.toThrow(
        'Expires minutes must be a positive number.'
      );
      expect(logger.error).toHaveBeenCalledTimes(2);
      expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    it('should throw a generic error if GCS API fails', async () => {
      const gcsError = new Error('Permission denied on service account.');
      mockGetSignedUrl.mockRejectedValue(gcsError);

      await expect(GcpStorageService.generateSignedUrl(bucketName, fileName)).rejects.toThrow(
        `GCS Signed URL generation failed: ${gcsError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith('GCS Pre-Signed URL Error:', gcsError);
    });
  });

  describe('listFiles', () => {
    const bucketName = 'test-bucket';
    const tenantId = 'tenant-xyz-789';
    // Test context boundary for multi-tenancy
    const prefix = `tenants/${tenantId}/`;

    it('should list files successfully with a given prefix', async () => {
      const mockFilesResponse = [
        {
          name: `${prefix}file1.txt`,
          id: 'file1-id',
          metadata: {
            size: '1024',
            updated: '2023-10-27T11:00:00Z',
            contentType: 'text/plain',
          },
        },
        {
          name: `${prefix}images/photo.jpg`,
          id: 'photo-id',
          metadata: {
            size: '204800',
            updated: '2023-10-27T12:00:00Z',
            contentType: 'image/jpeg',
          },
        },
      ];
      mockGetFiles.mockResolvedValue([mockFilesResponse]);

      const result = await GcpStorageService.listFiles(bucketName, prefix);

      expect(mockBucket).toHaveBeenCalledWith(bucketName);
      expect(mockGetFiles).toHaveBeenCalledWith({ prefix });
      expect(result).toEqual({
        success: true,
        bucketName,
        prefix,
        files: [
          {
            name: `${prefix}file1.txt`,
            id: 'file1-id',
            size: 1024,
            updated: '2023-10-27T11:00:00Z',
            mimeType: 'text/plain',
          },
          {
            name: `${prefix}images/photo.jpg`,
            id: 'photo-id',
            size: 204800,
            updated: '2023-10-27T12:00:00Z',
            mimeType: 'image/jpeg',
          },
        ],
      });
      expect(logger.info).toHaveBeenCalledWith(`GCS API: Listing files inside bucket "${bucketName}" matching prefix "${prefix}"...`);
    });

    it('should list all files if no prefix is provided', async () => {
      mockGetFiles.mockResolvedValue([[]]);
      await GcpStorageService.listFiles(bucketName);
      expect(mockGetFiles).toHaveBeenCalledWith({ prefix: '' });
    });

    it('should handle empty file list correctly', async () => {
      mockGetFiles.mockResolvedValue([[]]);
      const result = await GcpStorageService.listFiles(bucketName, 'non-existent-prefix/');
      expect(result).toEqual({
        success: true,
        bucketName,
        prefix: 'non-existent-prefix/',
        files: [],
      });
    });

    it('should handle files with missing metadata gracefully', async () => {
        const mockFilesResponse = [
          {
            name: 'file-no-meta.txt',
            id: 'no-meta-id',
            metadata: {}, // Empty metadata
          },
        ];
        mockGetFiles.mockResolvedValue([mockFilesResponse]);
  
        const result = await GcpStorageService.listFiles(bucketName, '');
  
        expect(result.files[0]).toEqual({
          name: 'file-no-meta.txt',
          id: 'no-meta-id',
          size: 0, // Should default to 0
          updated: undefined,
          mimeType: undefined,
        });
      });

    it('should throw an error if listing files fails', async () => {
      const gcsError = new Error('Bucket not found.');
      mockGetFiles.mockRejectedValue(gcsError);

      await expect(GcpStorageService.listFiles(bucketName, prefix)).rejects.toThrow(
        `GCS File Listing failed: ${gcsError.message}`
      );
      expect(logger.error).toHaveBeenCalledWith('GCS Listing Files Error:', gcsError);
    });
  });
});