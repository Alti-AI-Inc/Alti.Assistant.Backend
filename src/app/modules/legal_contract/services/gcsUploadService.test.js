import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Mock dependencies
const mockDelete = vi.fn();
const mockFile = vi.fn().mockImplementation(() => ({ delete: mockDelete }));
const mockUpload = vi.fn();
const mockBucket = vi.fn().mockImplementation(() => ({
  upload: mockUpload,
  file: mockFile,
}));
const {
  mockStorage
} = vi.hoisted(() => {
  const mockStorage = vi.fn().mockImplementation(() => ({
    bucket: mockBucket,
  }));

  return {
    mockStorage
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorage,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Import fs mock for use in tests
import fs from 'fs';
import { logger } from '../../../../shared/logger.js';

describe('gcsUploadService', () => {
  let uploadContractToGCS;
  let deleteContractFromGCS;

  const userContext = { userId: 'user-123', workspaceId: 'ws-456' };
  const localFilePath = '/tmp/test-contract.pdf';
  const fileName = 'test-contract.pdf';

  // Helper to dynamically import the module under test
  const loadModule = async () => {
    const module = await import('./gcsUploadService.js');
    uploadContractToGCS = module.uploadContractToGCS;
    deleteContractFromGCS = module.deleteContractFromGCS;
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    // Set default environment variables for a configured GCS state
    process.env.GCS_BUCKET_NAME = 'test-bucket';
    process.env.GCP_PROJECT_ID = 'test-project';
    process.env.GCS_KEY_FILE = 'fake-key.json';

    // Default mock implementations
    fs.existsSync.mockReturnValue(true);
    mockUpload.mockResolvedValue(true);
    mockDelete.mockResolvedValue(true);
  });

  afterEach(() => {
    delete process.env.GCS_BUCKET_NAME;
    delete process.env.GCP_PROJECT_ID;
    delete process.env.GCS_KEY_FILE;
  });

  describe('GCS Initialization', () => {
    it('should initialize with key file if it exists', async () => {
      fs.existsSync.mockReturnValue(true);
      await loadModule();
      expect(mockStorage).toHaveBeenCalledWith({
        keyFilename: 'fake-key.json',
        projectId: 'test-project',
      });
      expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    });

    it('should initialize with project ID if key file does not exist', async () => {
      fs.existsSync.mockReturnValue(false);
      await loadModule();
      expect(mockStorage).toHaveBeenCalledWith({
        projectId: 'test-project',
      });
      expect(mockBucket).toHaveBeenCalledWith('test-bucket');
    });

    it('should warn if no credentials are provided', async () => {
      delete process.env.GCP_PROJECT_ID;
      delete process.env.GCS_KEY_FILE;
      await loadModule();
      expect(logger.warn).toHaveBeenCalledWith(
        'GCS credentials not configured. Contract uploads will be stored locally only.'
      );
      expect(mockStorage).not.toHaveBeenCalled();
    });
  });

  describe('uploadContractToGCS', () => {
    it('should successfully upload a file to GCS with correct context boundaries', async () => {
      await loadModule();
      const contractMetadata = { contractType: 'NDA', conversationId: 'conv-789' };
      const result = await uploadContractToGCS(localFilePath, userContext, contractMetadata);

      const expectedDestination = `contract/${userContext.workspaceId}/${userContext.userId}/${fileName}`;

      expect(mockUpload).toHaveBeenCalledTimes(1);
      expect(mockUpload).toHaveBeenCalledWith(localFilePath, {
        destination: expectedDestination,
        metadata: {
          contentType: 'application/pdf',
          metadata: expect.objectContaining({
            contractType: 'NDA',
            userId: userContext.userId,
            workspaceId: userContext.workspaceId,
            conversationId: 'conv-789',
          }),
        },
      });

      expect(result).toEqual({
        success: true,
        gcsPath: `gs://test-bucket/${expectedDestination}`,
        publicUrl: `https://storage.googleapis.com/test-bucket/${expectedDestination}`,
        fileName,
        destination: expectedDestination,
        storageType: 'gcs',
      });
      expect(logger.info).toHaveBeenCalledWith(`Uploading contract to GCS: ${expectedDestination}`);
    });

    it('should throw an error if userContext is missing or incomplete', async () => {
      await loadModule();
      await expect(uploadContractToGCS(localFilePath, null)).rejects.toThrow(
        'User context (userId, workspaceId) is required for file uploads.'
      );
      await expect(uploadContractToGCS(localFilePath, { userId: 'user-123' })).rejects.toThrow(
        'User context (userId, workspaceId) is required for file uploads.'
      );
      await expect(uploadContractToGCS(localFilePath, { workspaceId: 'ws-456' })).rejects.toThrow(
        'User context (userId, workspaceId) is required for file uploads.'
      );
      expect(logger.error).toHaveBeenCalledWith('uploadContractToGCS called without a valid userContext.');
    });

    it('should fall back to local storage if GCS is not configured', async () => {
      delete process.env.GCP_PROJECT_ID;
      delete process.env.GCS_KEY_FILE;
      await loadModule();

      const result = await uploadContractToGCS(localFilePath, userContext);

      expect(logger.warn).toHaveBeenCalledWith('GCS not configured. Returning local file path.');
      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName,
        storageType: 'local',
      });
      expect(mockUpload).not.toHaveBeenCalled();
    });

    it('should fall back to local storage on GCS upload failure', async () => {
      await loadModule();
      const uploadError = new Error('GCS upload failed');
      mockUpload.mockRejectedValue(uploadError);

      const result = await uploadContractToGCS(localFilePath, userContext);

      expect(logger.error).toHaveBeenCalledWith('Error uploading contract to GCS:', uploadError);
      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName,
        storageType: 'local',
        error: 'GCS upload failed',
      });
    });

    it('should prevent path traversal attacks', async () => {
      await loadModule();
      const maliciousPath = `../../root/${fileName}`;
      await uploadContractToGCS(maliciousPath, userContext);

      const expectedDestination = `contract/${userContext.workspaceId}/${userContext.userId}/${fileName}`;
      expect(mockUpload).toHaveBeenCalledWith(maliciousPath, expect.objectContaining({
        destination: expectedDestination,
      }));
    });

    it.each([
      ['contract.pdf', 'application/pdf'],
      ['contract.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['contract.doc', 'application/msword'],
      ['contract.txt', 'text/plain'],
      ['contract.unknown', 'application/octet-stream'],
    ])('should determine correct content type for %s', async (testFileName, expectedType) => {
      await loadModule();
      await uploadContractToGCS(`/tmp/${testFileName}`, userContext);
      expect(mockUpload).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        metadata: expect.objectContaining({
          contentType: expectedType,
        }),
      }));
    });
  });

  describe('deleteContractFromGCS', () => {
    it('should successfully delete a file from GCS using correct context boundaries', async () => {
      await loadModule();
      const result = await deleteContractFromGCS(userContext, fileName);

      const expectedPath = `contract/${userContext.workspaceId}/${userContext.userId}/${fileName}`;
      expect(mockFile).toHaveBeenCalledWith(expectedPath);
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, message: 'Contract deleted successfully' });
      expect(logger.info).toHaveBeenCalledWith(`Contract deleted from GCS: ${expectedPath}`);
    });

    it('should return an error if userContext is missing or incomplete', async () => {
      await loadModule();
      const expectedMsg = 'User context (userId, workspaceId) is required for file deletion.';
      
      let result = await deleteContractFromGCS(null, fileName);
      expect(result).toEqual({ success: false, message: expectedMsg });

      result = await deleteContractFromGCS({ userId: 'user-123' }, fileName);
      expect(result).toEqual({ success: false, message: expectedMsg });

      result = await deleteContractFromGCS({ workspaceId: 'ws-456' }, fileName);
      expect(result).toEqual({ success: false, message: expectedMsg });

      expect(logger.error).toHaveBeenCalledWith('deleteContractFromGCS called without a valid userContext.');
    });

    it('should return an error if fileName is missing', async () => {
      await loadModule();
      const result = await deleteContractFromGCS(userContext, '');
      expect(result).toEqual({ success: false, message: 'File name is required for deletion.' });
      expect(logger.error).toHaveBeenCalledWith('deleteContractFromGCS called without a fileName.');
    });

    it('should return an error if GCS is not configured', async () => {
      delete process.env.GCP_PROJECT_ID;
      delete process.env.GCS_KEY_FILE;
      await loadModule();

      const result = await deleteContractFromGCS(userContext, fileName);

      expect(logger.warn).toHaveBeenCalledWith('GCS not configured. Cannot delete from GCS.');
      expect(result).toEqual({ success: false, message: 'GCS not configured' });
      expect(mockFile).not.toHaveBeenCalled();
    });

    it('should return an error on GCS delete failure', async () => {
      await loadModule();
      const deleteError = new Error('Permission denied');
      mockDelete.mockRejectedValue(deleteError);

      const result = await deleteContractFromGCS(userContext, fileName);

      expect(logger.error).toHaveBeenCalledWith(
        `Error deleting contract from GCS (${userContext.workspaceId}/${userContext.userId}/${fileName}):`,
        deleteError
      );
      expect(result).toEqual({
        success: false,
        message: 'Failed to delete file from storage: Permission denied',
      });
    });

    it('should prevent path traversal attacks when constructing file path', async () => {
      await loadModule();
      const maliciousFileName = `../../other-ws/other-user/${fileName}`;
      await deleteContractFromGCS(userContext, maliciousFileName);

      const expectedPath = `contract/${userContext.workspaceId}/${userContext.userId}/${fileName}`;
      expect(mockFile).toHaveBeenCalledWith(expectedPath);
    });
  });
});