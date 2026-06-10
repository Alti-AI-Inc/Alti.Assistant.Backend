import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadReportToGCS, deleteReportFromGCS, checkReportExistsInGCS } from './gcsUploadService.js';
import fs from 'fs/promises';

// Mock dependencies
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
  },
}));

const mockSave = vi.fn();
const mockDelete = vi.fn();
const mockExists = vi.fn();
const mockFile = vi.fn(() => ({
  save: mockSave,
  delete: mockDelete,
  exists: mockExists,
}));
const mockBucket = vi.fn(() => ({
  file: mockFile,
}));

vi.mock('@google-cloud/storage', () => {
  return {
    Storage: vi.fn().mockImplementation(() => ({
      bucket: mockBucket,
    })),
  };
});

vi.mock('../../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-gcp-project',
    },
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

describe('gcsUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('uploadReportToGCS', () => {
    const userId = 'user-123';
    const conversationId = 'conv-456';
    const fileName = 'report.pdf';
    const fileBuffer = Buffer.from('pdf-content');

    it('should successfully upload an absolute path file to GCS and return upload details', async () => {
      const localFilePath = '/absolute/path/to/report.pdf';
      fs.readFile.mockResolvedValueOnce(fileBuffer);
      mockSave.mockResolvedValueOnce();

      const result = await uploadReportToGCS(localFilePath, fileName, userId, conversationId);

      expect(fs.readFile).toHaveBeenCalledWith(localFilePath);
      expect(mockBucket).toHaveBeenCalledWith('alti_assistant_reports');
      expect(mockFile).toHaveBeenCalledWith(`${userId}/${conversationId}/${fileName}`);
      expect(mockSave).toHaveBeenCalledWith(fileBuffer, {
        metadata: { contentType: 'application/pdf' },
        resumable: false,
      });
      expect(result).toEqual({
        success: true,
        publicUrl: `https://storage.googleapis.com/alti_assistant_reports/${userId}/${conversationId}/${fileName}`,
        gcsPath: `${userId}/${conversationId}/${fileName}`,
        bucket: 'alti_assistant_reports',
        size: fileBuffer.length,
      });
    });

    it('should successfully upload a relative path file (with leading slash) to GCS', async () => {
      const localFilePath = '/relative/path/to/report.pdf';
      fs.readFile.mockResolvedValueOnce(fileBuffer);
      mockSave.mockResolvedValueOnce();

      await uploadReportToGCS(localFilePath, fileName, userId, conversationId);

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should successfully upload a relative path file (without leading slash) to GCS', async () => {
      const localFilePath = 'relative/path/to/report.pdf';
      fs.readFile.mockResolvedValueOnce(fileBuffer);
      mockSave.mockResolvedValueOnce();

      await uploadReportToGCS(localFilePath, fileName, userId, conversationId);

      expect(fs.readFile).toHaveBeenCalled();
    });

    it('should resolve correct content types for various file extensions', async () => {
      const extensions = [
        { ext: 'report.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { ext: 'report.doc', type: 'application/msword' },
        { ext: 'report.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
        { ext: 'report.xls', type: 'application/vnd.ms-excel' },
        { ext: 'report.csv', type: 'text/csv' },
        { ext: 'report.txt', type: 'text/plain' },
        { ext: 'report.md', type: 'text/markdown' },
        { ext: 'report.html', type: 'text/html' },
        { ext: 'report.json', type: 'application/json' },
        { ext: 'report.unknown', type: 'application/octet-stream' },
      ];

      fs.readFile.mockResolvedValue(fileBuffer);
      mockSave.mockResolvedValue(undefined);

      for (const item of extensions) {
        await uploadReportToGCS('/path/file', item.ext, userId, conversationId);
        expect(mockSave).toHaveBeenLastCalledWith(fileBuffer, {
          metadata: { contentType: item.type },
          resumable: false,
        });
      }
    });

    it('should throw an error if reading the local file fails', async () => {
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));

      await expect(
        uploadReportToGCS('/invalid/path', fileName, userId, conversationId)
      ).rejects.toThrow('Failed to upload report to GCS: File not found');
    });

    it('should throw an error if GCS upload fails', async () => {
      fs.readFile.mockResolvedValueOnce(fileBuffer);
      mockSave.mockRejectedValueOnce(new Error('GCS Error'));

      await expect(
        uploadReportToGCS('/path', fileName, userId, conversationId)
      ).rejects.toThrow('Failed to upload report to GCS: GCS Error');
    });

    it('should correctly partition GCS paths for different user roles (super_admin, admin, manager, user)', async () => {
      fs.readFile.mockResolvedValue(fileBuffer);
      mockSave.mockResolvedValue(undefined);

      const roles = ['super_admin', 'admin', 'manager', 'user'];

      for (const role of roles) {
        const roleUserId = `${role}_user_123`;
        const result = await uploadReportToGCS('/path', fileName, roleUserId, conversationId);
        expect(result.gcsPath).toBe(`${roleUserId}/${conversationId}/${fileName}`);
        expect(mockFile).toHaveBeenCalledWith(`${roleUserId}/${conversationId}/${fileName}`);
      }
    });
  });

  describe('deleteReportFromGCS', () => {
    const gcsPath = 'user-123/conv-456/report.pdf';

    it('should return true when file is successfully deleted', async () => {
      mockDelete.mockResolvedValueOnce();

      const result = await deleteReportFromGCS(gcsPath);

      expect(mockBucket).toHaveBeenCalledWith('alti_assistant_reports');
      expect(mockFile).toHaveBeenCalledWith(gcsPath);
      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false and log error when deletion fails', async () => {
      mockDelete.mockRejectedValueOnce(new Error('Delete failed'));

      const result = await deleteReportFromGCS(gcsPath);

      expect(result).toBe(false);
    });
  });

  describe('checkReportExistsInGCS', () => {
    const gcsPath = 'user-123/conv-456/report.pdf';

    it('should return true if file exists', async () => {
      mockExists.mockResolvedValueOnce([true]);

      const result = await checkReportExistsInGCS(gcsPath);

      expect(mockBucket).toHaveBeenCalledWith('alti_assistant_reports');
      expect(mockFile).toHaveBeenCalledWith(gcsPath);
      expect(mockExists).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('should return false if file does not exist', async () => {
      mockExists.mockResolvedValueOnce([false]);

      const result = await checkReportExistsInGCS(gcsPath);

      expect(result).toBe(false);
    });

    it('should return false and log error if exists check throws', async () => {
      mockExists.mockRejectedValueOnce(new Error('Network error'));

      const result = await checkReportExistsInGCS(gcsPath);

      expect(result).toBe(false);
    });
  });
});