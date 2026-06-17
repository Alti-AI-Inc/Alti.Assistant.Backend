import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

// Mock @google-cloud/storage first using globalThis to avoid ESM TDZ hoisting errors
vi.mock('@google-cloud/storage', () => {
  const mockFile = {
    exists: vi.fn(),
    save: vi.fn(),
    makePublic: vi.fn(),
    delete: vi.fn(),
    getMetadata: vi.fn().mockResolvedValue([{
      size: '1024',
      metadata: {
        workspaceId: 'mock-workspace-id',
      }
    }]),
    getSignedUrl: vi.fn().mockResolvedValue(['https://storage.googleapis.com/test-presentation-bucket/signed-url']),
  };
  const mockBucket = {
    file: vi.fn().mockReturnValue(mockFile),
  };
  const mockStorage = {
    bucket: vi.fn().mockReturnValue(mockBucket),
  };

  // Attach mock objects to globalThis for access in tests
  globalThis.__mockFile = mockFile;
  globalThis.__mockBucket = mockBucket;
  globalThis.__mockStorage = mockStorage;

  return {
    Storage: vi.fn(function() {
      return mockStorage;
    }),
  };
});

vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal();
  const normalize = (p) => p.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/');
  return {
    ...actual,
    default: {
      ...actual.default,
      resolve: vi.fn((...args) => normalize(actual.default.resolve(...args))),
      sep: '/',
    },
    resolve: vi.fn((...args) => normalize(actual.resolve(...args))),
    sep: '/',
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

// Initialize global user workspace mock
globalThis.__mockUserWorkspace = {
  _id: 'mock-workspace-id',
  storageUsed: 100,
  storageLimit: 1000000,
};

vi.mock('../../auth/auth.model.js', () => {
  return {
    default: {
      findById: vi.fn(() => ({
        populate: vi.fn(() => ({
          lean: vi.fn(() => Promise.resolve({
            _id: 'mock-user-id',
            workspace: globalThis.__mockUserWorkspace,
          })),
        })),
      })),
    }
  };
});

vi.mock('../../workspace/workspace.model.js', () => {
  return {
    default: {
      findByIdAndUpdate: vi.fn(() => Promise.resolve()),
    }
  };
});

// Import after mocks are registered
import { uploadPresentationToGCS, deleteFromGCS } from './gcsUploadService.js';

// Mock console to prevent logging during tests
vi.spyOn(console, 'log').mockImplementation(() => {});
vi.spyOn(console, 'error').mockImplementation(() => {});


describe('gcsUploadService', () => {
  let mockFileInstance;
  let mockBucketInstance;

  beforeEach(() => {
    // Reset workspace limits and usages
    globalThis.__mockUserWorkspace.storageUsed = 100;
    globalThis.__mockUserWorkspace.storageLimit = 1000000;

    mockFileInstance = globalThis.__mockFile;
    mockBucketInstance = globalThis.__mockBucket;
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
        mockFileInstance.getSignedUrl.mockResolvedValue([`https://storage.googleapis.com/test-presentation-bucket/${userId}/${conversationId}/${fileName}`]);

        const result = await uploadPresentationToGCS(fileUrl, fileName, userId, conversationId);

        expect(axios.get).toHaveBeenCalledWith(fileUrl, { responseType: 'arraybuffer' });
        expect(mockBucketInstance.file).toHaveBeenCalledWith(`${userId}/${conversationId}/${fileName}`);
        expect(mockFileInstance.exists).toHaveBeenCalled();
        expect(mockFileInstance.save).toHaveBeenCalledWith(fileBuffer, {
          metadata: {
            contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            metadata: {
              userId,
              workspaceId: 'mock-workspace-id',
              conversationId,
            },
          },
          resumable: false,
        });
        expect(result).toEqual({
          success: true,
          url: `https://storage.googleapis.com/test-presentation-bucket/${userId}/${conversationId}/${fileName}`,
          gcsPath: `${userId}/${conversationId}/${fileName}`,
          bucket: 'test-presentation-bucket',
          size: fileBuffer.length,
        });
      });

      it('should generate a unique filename if the file already exists', async () => {
        const newFileName = 'presentation_1.pptx';
        const existingFile = {
          exists: vi.fn().mockResolvedValue([true]),
        };
        const newFile = {
          exists: vi.fn().mockResolvedValue([false]),
          save: vi.fn().mockResolvedValue(),
          getSignedUrl: vi.fn().mockResolvedValue([`https://storage.googleapis.com/test-presentation-bucket/${userId}/${conversationId}/${newFileName}`]),
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
        expect(result.url).toContain(newFileName);
      });

      it('should correctly determine content type for PDF', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);

        await uploadPresentationToGCS(fileUrl, 'report.pdf', userId, conversationId);

        expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
          metadata: expect.objectContaining({ contentType: 'application/pdf' }),
        }));
      });

      it('should correctly determine content type for JSON', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);

        await uploadPresentationToGCS(fileUrl, 'data.json', userId, conversationId);

        expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
          metadata: expect.objectContaining({ contentType: 'application/json' }),
        }));
      });

      it('should use a default content type for unknown extensions', async () => {
        axios.get.mockResolvedValue({ data: fileBuffer });
        mockFileInstance.exists.mockResolvedValue([false]);

        await uploadPresentationToGCS(fileUrl, 'archive.zip', userId, conversationId);

        expect(mockFileInstance.save).toHaveBeenCalledWith(expect.any(Buffer), expect.objectContaining({
          metadata: expect.objectContaining({ contentType: 'application/octet-stream' }),
        }));
      });

      it('should throw an error if downloading from URL fails', async () => {
        const downloadError = new Error('Network Error');
        axios.get.mockRejectedValue(downloadError);

        await expect(uploadPresentationToGCS(fileUrl, fileName, userId, conversationId))
          .rejects.toThrow(`Failed to upload presentation: ${downloadError.message}`);
      });
    });

    describe('Uploading from a local file path', () => {
      const presentonPath = '/app_data/exports/presentation.pptx';
      const resolvedFilePath = '/app/presenton_files/exports/presentation.pptx';

      beforeEach(() => {
        fs.readFile.mockResolvedValue(fileBuffer);
        mockFileInstance.exists.mockResolvedValue([false]);
        mockFileInstance.save.mockResolvedValue();
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
          .rejects.toThrow('Failed to upload presentation: Invalid Presenton file path format. Expected to start with /app_data/.');
      });

      it('should throw an error for a path traversal attempt', async () => {
        const traversalPath = '/app_data/../secrets/key.txt';
        await expect(uploadPresentationToGCS(traversalPath, 'key.txt', userId, conversationId))
          .rejects.toThrow('Failed to upload presentation: Attempted path traversal detected. File access denied.');
      });

      it('should throw an error for a more complex path traversal attempt', async () => {
        const traversalPath = '/app_data/exports/../../../etc/passwd';
        await expect(uploadPresentationToGCS(traversalPath, 'passwd', userId, conversationId))
          .rejects.toThrow('Failed to upload presentation: Attempted path traversal detected. File access denied.');
      });

      it('should throw an error if reading from local file fails', async () => {
        const readError = new Error('File not found');
        fs.readFile.mockResolvedValue(fileBuffer); // Ensure first read in user lookup succeeds
        fs.readFile.mockRejectedValue(readError);

        await expect(uploadPresentationToGCS(presentonPath, fileName, userId, conversationId))
          .rejects.toThrow(`Failed to upload presentation: ${readError.message}`);
      });
    });

    it('should throw an error if GCS save operation fails', async () => {
      const gcsError = new Error('GCS upload failed');
      axios.get.mockResolvedValue({ data: fileBuffer });
      mockFileInstance.exists.mockResolvedValue([false]);
      mockFileInstance.save.mockRejectedValue(gcsError);

      await expect(uploadPresentationToGCS('http://a.com/f.pptx', fileName, userId, conversationId))
        .rejects.toThrow(`Failed to upload presentation: ${gcsError.message}`);
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
      expect(console.error).toHaveBeenCalledWith('Error deleting file user123/conv456/presentation.pptx from GCS:', deleteError);
      expect(result).toBe(false);
    });
  });
});