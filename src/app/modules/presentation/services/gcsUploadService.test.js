import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { uploadPresentationToGCS, deleteFromGCS } from './gcsUploadService.js';

// Mock dependencies
vi.mock('@google-cloud/storage', () => {
  const mockFile = {
    exists: vi.fn(),
    save: vi.fn(),
    makePublic: vi.fn(),
    delete: vi.fn(),
  };
  const mockBucket = {
    file: vi.fn().mockReturnValue(mockFile),
  };
  const mockStorage = {
    bucket: vi.fn().mockReturnValue(mockBucket),
  };
  return {
    Storage: vi.fn().mockImplementation(() => mockStorage),
  };
});

vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
  },
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-project-id',
    },
    gcs: {
      presentation_bucket: 'test-presentation-bucket',
    },
  },
}));

// Mock console to prevent logging during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});


describe('gcsUploadService', () => {
  let mockStorageInstance;
  let mockBucketInstance;
  let mockFileInstance;

  beforeEach(() => {
    // This is a bit verbose but makes it clear what we're accessing from the mock
    const { Storage } = await import('@google-cloud/storage');
    mockStorageInstance = new Storage();
    mockBucketInstance = mockStorageInstance.bucket();
    mockFileInstance = mockBucketInstance.file();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadPresentationToGCS', () => {
    const userId = 'user123';
    const conversationId = 'conv456';
    const fileName = 'presentation.pptx';
    const fileBuffer = Buffer.from('test file content');

    describe('Uploading from a URL', () => {
      const fileUrl = 'http://example.com/presentation.pptx';

      it('should successfully upload a new file from a URL', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);
        mockFileInstance.save.mockResolvedValue();
        mockFileInstance.makePublic.mockResolvedValue();

        const result = await uploadPresentationToGCS(fileUrl, fileName, userId, conversationId);

        expect(axios.get).toHaveBeenCalledWith(fileUrl, { responseType: 'arraybuffer' });
        expect(mockBucketInstance.file).toHaveBeenCalledWith(`${userId}/${conversationId}/${fileName}`);
        expect(mockFileInstance.exists).toHaveBeenCalled();
        expect(mockFileInstance.save).toHaveBeenCalledWith(fileBuffer, {
          metadata: {
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          },
          resumable: false,
        });
        expect(mockFileInstance.makePublic).toHaveBeenCalled();
        expect(result).toEqual({
          success: true,
          publicUrl: `https://storage.googleapis.com/test-presentation-bucket/${userId}/${conversationId}/${fileName}`,
          gcsPath: `${userId}/${conversationId}/${fileName}`,
          bucket: 'test-presentation-bucket',
          size: fileBuffer.length,
        });
      });

      it('should generate a unique filename if the file already exists', async () => {
        const newFileName = 'presentation_1.pptx';
        const existingFile = { exists: vi.fn().mockResolvedValue([true]) };
        const newFile = {
          exists: vi.fn().mockResolvedValue([false]),
          save: vi.fn().mockResolvedValue(),
          makePublic: vi.fn().mockResolvedValue(),
        };

        axios.get.mockResolvedValue({ data: fileBuffer });
        mockBucketInstance.file
          .mockReturnValueOnce(existingFile)
          .mockReturnValueOnce(newFile);

        const result = await uploadPresentationToGCS(fileUrl, fileName, userId, conversationId);

        expect(mockBucketInstance.file).toHaveBeenCalledWith(`${userId}/${conversationId}/${fileName}`);
        expect(mockBucketInstance.file).toHaveBeenCalledWith(`${userId}/${conversationId}/${newFileName}`);
        expect(newFile.save).toHaveBeenCalled();
        expect(result.gcsPath).toBe(`${userId}/${conversationId}/${newFileName}`);
        expect(result.publicUrl).toContain(newFileName);
      });

      it('should correctly determine content type for PDF', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);

        await uploadPresentationToGCS(fileUrl, 'report.pdf', userId, conversationId);

        expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), {
          metadata: { contentType: 'application/pdf' },
          resumable: false,
        });
      });

      it('should correctly determine content type for JSON', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);

        await uploadPresentationToGCS(fileUrl, 'data.json', userId, conversationId);

        expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), {
          metadata: { contentType: 'application/json' },
          resumable: false,
        });
      });

      it('should use a default content type for unknown extensions', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);

        await uploadPresentationToGCS(fileUrl, 'archive.zip', userId, conversationId);

        expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), {
          metadata: { contentType: 'application/octet-stream' },
          resumable: false,
        });
      });

      it('should throw an error if downloading from URL fails', async () => {
        const downloadError = new Error('Network Error');
        axios.get.mockRejectedValue(downloadError);

        await expect(uploadPresentationToGCS(fileUrl, fileName, userId, conversationId))
          .rejects.toThrow(`Failed to upload presentation to GCS: ${downloadError.message}`);
      });
    });

    describe('Uploading from a local file path', () => {
      const presentonPath = '/app_data/exports/presentation.pptx';
      const resolvedBasePath = '/app/presenton_files';
      const resolvedFilePath = path.resolve(resolvedBasePath, 'exports/presentation.pptx');

      beforeEach(() => {
        fs.readFile.mockResolvedValue(fileBuffer);
        mockFileInstance.exists.mockResolvedValue([false]);
        mockFileInstance.save.mockResolvedValue();
        mockFileInstance.makePublic.mockResolvedValue();
      });

      it('should successfully upload a file from a valid local path', async () => {
        const result = await uploadPresentationToGCS(presentonPath, fileName, userId, conversationId);

        expect(fs.readFile).toHaveBeenCalledWith(resolvedFilePath);
        expect(mockFileInstance.save).toHaveBeenCalledWith(fileBuffer, expect.any(Object));
        expect(result.success).toBe(true);
        expect(result.gcsPath).toBe(`${userId}/${conversationId}/${fileName}`);
      });

      it('should throw an error for an invalid Presenton path format', async () => {
        const invalidPath = '/some_other_dir/file.pptx';
        await expect(uploadPresentationToGCS(invalidPath, fileName, userId, conversationId))
          .rejects.toThrow('Failed to upload presentation to GCS: Invalid Presenton file path format. Expected to start with /app_data/.');
      });

      it('should throw an error for a path traversal attempt', async () => {
        const traversalPath = '/app_data/../secrets/key.txt';
        await expect(uploadPresentationToGCS(traversalPath, 'key.txt', userId, conversationId))
          .rejects.toThrow('Failed to upload presentation to GCS: Attempted path traversal detected. File access denied.');
      });

      it('should throw an error for a more complex path traversal attempt', async () => {
        const traversalPath = '/app_data/exports/../../../etc/passwd';
        await expect(uploadPresentationToGCS(traversalPath, 'passwd', userId, conversationId))
          .rejects.toThrow('Failed to upload presentation to GCS: Attempted path traversal detected. File access denied.');
      });

      it('should throw an error if reading from local file fails', async () => {
        const readError = new Error('File not found');
        fs.readFile.mockRejectedValue(readError);

        await expect(uploadPresentationToGCS(presentonPath, fileName, userId, conversationId))
          .rejects.toThrow(`Failed to upload presentation to GCS: ${readError.message}`);
      });
    });

    it('should throw an error if GCS save operation fails', async () => {
      const gcsError = new Error('GCS upload failed');
      axios.get.mockResolvedValue({ data: fileBuffer });
      mockFileInstance.exists.mockResolvedValue([false]);
      mockFileInstance.save.mockRejectedValue(gcsError);

      await expect(uploadPresentationToGCS('http://a.com/f.pptx', fileName, userId, conversationId))
        .rejects.toThrow(`Failed to upload presentation to GCS: ${gcsError.message}`);
    });
  });

  describe('deleteFromGCS', () => {
    const gcsPath = 'user123/conv456/presentation.pptx';

    it('should successfully delete a file from GCS', async () => {
      mockFileInstance.delete.mockResolvedValue();

      const result = await deleteFromGCS(gcsPath);

      expect(mockBucketInstance.file).toHaveBeenCalledWith(gcsPath);
      expect(mockFileInstance.delete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if deleting from GCS fails', async () => {
      const deleteError = new Error('Permission denied');
      mockFileInstance.delete.mockRejectedValue(deleteError);

      const result = await deleteFromGCS(gcsPath);

      expect(mockBucketInstance.file).toHaveBeenCalledWith(gcsPath);
      expect(mockFileInstance.delete).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Error deleting file from GCS:', deleteError);
      expect(result).toBe(false);
    });
  });
});