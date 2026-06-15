import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock @google-cloud/storage
const mockFile = {
  upload: vi.fn(),
  getSignedUrl: vi.fn(),
  delete: vi.fn(),
  exists: vi.fn(),
  getMetadata: vi.fn(),
};

const mockBucket = {
  upload: vi.fn(),
  file: vi.fn().mockImplementation(() => mockFile),
};

const {
  mockStorage
} = vi.hoisted(() => {
  const mockStorage = {
    bucket: vi.fn().mockImplementation(() => mockBucket),
  };

  return {
    mockStorage
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn().mockImplementation(() => mockStorage),
}));

// Mock path
vi.mock('path', () => ({
  default: {
    extname: vi.fn().mockImplementation((filename) => {
      const lastDotIndex = filename.lastIndexOf('.');
      return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
    }),
  },
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    statSync: vi.fn().mockImplementation(() => ({ size: 12345 })),
  },
}));

// Mock config
vi.mock('../../../../config/index.js', () => ({
  default: {
    google: {
      google_application_credentials: 'mock-credentials.json',
      gcp_project_id: 'mock-project-id',
    },
    gcs: {
      transcription_bucket: 'mock-transcription-bucket',
    },
  },
}));

// Mock logger
vi.mock('../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import the service after mocks are set up
import { bucketUploadService } from './bucketUpload.service.js';
import ApiError from '../../../errors/ApiError.js';
import httpStatus from 'http-status';

describe('bucketUploadService', () => {
  const MOCK_BUCKET_NAME = 'mock-transcription-bucket';

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Ensure initial setup of Storage and bucket is consistent
    mockStorage.bucket.mockReturnValue(mockBucket);
    mockBucket.file.mockReturnValue(mockFile);
  });

  describe('uploadAudioToBucket', () => {
    const mockFilePath = '/tmp/test-audio.mp3';
    const mockOriginalName = 'my_audio_file.mp3';
    const mockMimeType = 'audio/mpeg';
    const mockFileSize = 12345;

    beforeEach(() => {
      fs.default.statSync.mockReturnValue({ size: mockFileSize });
      mockBucket.upload.mockResolvedValueOnce([]); // GCS upload returns an array
    });

    it('should upload an audio file to GCS and return file details', async () => {
      const result = await bucketUploadService.uploadAudioToBucket(
        mockFilePath,
        mockOriginalName,
        mockMimeType
      );

      expect(mockBucket.upload).toHaveBeenCalledTimes(1);
      expect(mockBucket.upload).toHaveBeenCalledWith(
        mockFilePath,
        expect.objectContaining({
          destination: expect.stringMatching(/^transcriptions\/\d+-\d+-my_audio_file\.mp3$/),
          metadata: {
            contentType: mockMimeType,
            metadata: {
              originalName: mockOriginalName,
              uploadTimestamp: expect.any(String),
            },
          },
        })
      );

      const expectedFileName = mockBucket.upload.mock.calls[0][1].destination;

      expect(result).toEqual({
        gsUri: `gs://${MOCK_BUCKET_NAME}/${expectedFileName}`,
        publicUrl: `https://storage.googleapis.com/${MOCK_BUCKET_NAME}/${expectedFileName}`,
        bucketName: MOCK_BUCKET_NAME,
        fileName: expectedFileName,
        originalName: mockOriginalName,
        mimeType: mockMimeType,
        size: mockFileSize,
      });

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Uploading audio to GCP bucket:')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Audio uploaded successfully:')
      );
      expect(fs.default.statSync).toHaveBeenCalledWith(mockFilePath);
    });

    it('should throw ApiError if upload fails', async () => {
      const mockError = new Error('GCS upload failed');
      mockBucket.upload.mockRejectedValueOnce(mockError);

      await expect(
        bucketUploadService.uploadAudioToBucket(
          mockFilePath,
          mockOriginalName,
          mockMimeType
        )
      ).rejects.toThrow(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to upload audio to GCP storage'
        )
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading audio to GCP bucket:',
        mockError
      );
    });
  });

  describe('getSignedUrl', () => {
    const mockFileName = 'transcriptions/123-test.mp3';
    const mockSignedUrl = 'https://signed.url/test.mp3';

    beforeEach(() => {
      mockFile.getSignedUrl.mockResolvedValueOnce([mockSignedUrl]);
    });

    it('should generate a signed URL for a given file', async () => {
      const result = await bucketUploadService.getSignedUrl(mockFileName);

      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockFile.getSignedUrl).toHaveBeenCalledTimes(1);
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          version: 'v4',
          action: 'read',
          expires: expect.any(Number), // Should be Date.now() + expiresIn * 1000
        })
      );
      expect(result).toBe(mockSignedUrl);
      expect(logger.info).toHaveBeenCalledWith(
        `Generated signed URL for: ${mockFileName}`
      );
    });

    it('should use default expiresIn if not provided', async () => {
      const now = Date.now();
      vi.setSystemTime(now); // Freeze time for consistent expires calculation

      await bucketUploadService.getSignedUrl(mockFileName);
      const callArgs = mockFile.getSignedUrl.mock.calls[0][0];
      const expectedExpires = now + 3600 * 1000; // Default 3600 seconds
      expect(callArgs.expires).toBe(expectedExpires);

      vi.useRealTimers(); // Restore real timers
    });

    it('should use provided expiresIn', async () => {
      const now = Date.now();
      vi.setSystemTime(now); // Freeze time for consistent expires calculation

      const customExpiresIn = 600; // 10 minutes
      await bucketUploadService.getSignedUrl(mockFileName, customExpiresIn);
      const callArgs = mockFile.getSignedUrl.mock.calls[0][0];
      const expectedExpires = now + customExpiresIn * 1000;
      expect(callArgs.expires).toBe(expectedExpires);

      vi.useRealTimers(); // Restore real timers
    });

    it('should throw ApiError if signed URL generation fails', async () => {
      const mockError = new Error('Signed URL generation failed');
      mockFile.getSignedUrl.mockRejectedValueOnce(mockError);

      await expect(
        bucketUploadService.getSignedUrl(mockFileName)
      ).rejects.toThrow(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to generate access URL'
        )
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error generating signed URL:',
        mockError
      );
    });
  });

  describe('deleteAudioFromBucket', () => {
    const mockFileName = 'transcriptions/123-test.mp3';

    beforeEach(() => {
      mockFile.delete.mockResolvedValueOnce([]);
    });

    it('should delete an audio file from GCS', async () => {
      await bucketUploadService.deleteAudioFromBucket(mockFileName);

      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockFile.delete).toHaveBeenCalledTimes(1);
      expect(logger.info).toHaveBeenCalledWith(
        `Deleted audio from bucket: ${mockFileName}`
      );
    });

    it('should log error but not throw if deletion fails', async () => {
      const mockError = new Error('GCS deletion failed');
      mockFile.delete.mockRejectedValueOnce(mockError);

      await expect(
        bucketUploadService.deleteAudioFromBucket(mockFileName)
      ).resolves.toBeUndefined(); // Should resolve, not reject

      expect(logger.error).toHaveBeenCalledWith(
        'Error deleting audio from bucket:',
        mockError
      );
    });
  });

  describe('audioExistsInBucket', () => {
    const mockFileName = 'transcriptions/123-test.mp3';

    it('should return true if audio file exists', async () => {
      mockFile.exists.mockResolvedValueOnce([true]);

      const exists = await bucketUploadService.audioExistsInBucket(
        mockFileName
      );

      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockFile.exists).toHaveBeenCalledTimes(1);
      expect(exists).toBe(true);
    });

    it('should return false if audio file does not exist', async () => {
      mockFile.exists.mockResolvedValueOnce([false]);

      const exists = await bucketUploadService.audioExistsInBucket(
        mockFileName
      );

      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockFile.exists).toHaveBeenCalledTimes(1);
      expect(exists).toBe(false);
    });

    it('should throw ApiError if checking existence fails', async () => {
      const mockError = new Error('GCS existence check failed');
      mockFile.exists.mockRejectedValueOnce(mockError);

      await expect(
        bucketUploadService.audioExistsInBucket(mockFileName)
      ).rejects.toThrow(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to check audio existence'
        )
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error checking audio existence:',
        mockError
      );
    });
  });

  describe('getAudioMetadata', () => {
    const mockFileName = 'transcriptions/123-test.mp3';
    const mockMetadata = {
      size: '54321',
      contentType: 'audio/wav',
      timeCreated: '2023-01-01T10:00:00Z',
      updated: '2023-01-01T10:05:00Z',
      metadata: {
        originalName: 'original.wav',
        uploadTimestamp: '2023-01-01T09:59:00Z',
      },
    };

    beforeEach(() => {
      mockFile.getMetadata.mockResolvedValueOnce([mockMetadata]);
    });

    it('should retrieve metadata for an audio file', async () => {
      const result = await bucketUploadService.getAudioMetadata(mockFileName);

      expect(mockBucket.file).toHaveBeenCalledWith(mockFileName);
      expect(mockFile.getMetadata).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        size: mockMetadata.size,
        mimeType: mockMetadata.contentType,
        created: mockMetadata.timeCreated,
        updated: mockMetadata.updated,
        metadata: mockMetadata.metadata,
        gsUri: `gs://${MOCK_BUCKET_NAME}/${mockFileName}`,
      });
    });

    it('should throw ApiError if retrieving metadata fails', async () => {
      const mockError = new Error('GCS metadata retrieval failed');
      mockFile.getMetadata.mockRejectedValueOnce(mockError);

      await expect(
        bucketUploadService.getAudioMetadata(mockFileName)
      ).rejects.toThrow(
        new ApiError(
          httpStatus.INTERNAL_SERVER_ERROR,
          'Failed to retrieve audio metadata'
        )
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Error getting audio metadata:',
        mockError
      );
    });
  });
});