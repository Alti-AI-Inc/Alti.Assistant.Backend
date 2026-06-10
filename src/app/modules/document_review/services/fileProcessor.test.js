import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../../../shared/logger.js';
import ApiError from '../../../../errors/ApiError.js';
import httpStatus from 'http-status';
import { STORAGE_CONFIG } from '../document_review.constant.js';

// Mock external dependencies
vi.mock('fs/promises');
vi.mock('fs');
vi.mock('path');
vi.mock('@google-cloud/storage');
vi.mock('pdf-parse');
vi.mock('mammoth');
vi.mock('../../../../shared/logger.js');
vi.mock('../../../../errors/ApiError.js');
vi.mock('http-status', () => ({
  default: {
    BAD_REQUEST: 400,
    INTERNAL_SERVER_ERROR: 500,
  },
}));

// Mock constants
vi.mock('../document_review.constant.js', () => ({
  STORAGE_CONFIG: {
    UPLOAD_FOLDER: 'uploads',
  },
}));

// Mock process.env for GCS initialization
const mockEnv = {};
const originalEnv = process.env;

beforeEach(() => {
  vi.clearAllMocks();
  // Reset process.env for each test
  process.env = { ...originalEnv, ...mockEnv };

  // Default mocks for path, logger, ApiError
  path.extname.mockImplementation((filename) => {
    const lastDotIndex = filename.lastIndexOf('.');
    return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
  });
  logger.info.mockImplementation(() => {});
  logger.warn.mockImplementation(() => {});
  logger.error.mockImplementation(() => {});
  ApiError.mockImplementation((status, message) => ({ status, message }));
});

afterEach(() => {
  process.env = originalEnv; // Restore original process.env
  vi.resetModules(); // Reset modules to re-import and re-run top-level code
});

// Helper to import the module after setting up mocks
const importFileProcessor = async () => {
  const { fileProcessor } = await import('./fileProcessor.js');
  return fileProcessor;
};

describe('fileProcessor', () => {
  describe('GCS Initialization (top-level logic)', () => {
    it('should initialize GCS with keyFilename and projectId if GCS_KEY_FILE exists', async () => {
      process.env.GCS_KEY_FILE = '/path/to/key.json';
      process.env.GCP_PROJECT_ID = 'test-project';
      process.env.GCS_BUCKET_NAME = 'test-bucket';
      fsSync.existsSync.mockReturnValue(true);

      await importFileProcessor();

      expect(Storage).toHaveBeenCalledWith({
        keyFilename: '/path/to/key.json',
        projectId: 'test-project',
      });
      expect(Storage.mock.instances[0].bucket).toHaveBeenCalledWith(
        'test-bucket'
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should initialize GCS with projectId only if GCS_KEY_FILE does not exist but projectId is present', async () => {
      process.env.GCS_KEY_FILE = '/path/to/key.json';
      process.env.GCP_PROJECT_ID = 'test-project';
      process.env.GCS_BUCKET_NAME = 'test-bucket';
      fsSync.existsSync.mockReturnValue(false);

      await importFileProcessor();

      expect(Storage).toHaveBeenCalledWith({ projectId: 'test-project' });
      expect(Storage.mock.instances[0].bucket).toHaveBeenCalledWith(
        'test-bucket'
      );
      expect(logger.warn).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log a warning if GCS credentials are not configured', async () => {
      process.env.GCS_KEY_FILE = '';
      process.env.GCP_PROJECT_ID = '';
      process.env.GCS_BUCKET_NAME = '';
      fsSync.existsSync.mockReturnValue(false);

      await importFileProcessor();

      expect(Storage).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'GCS credentials not configured. Document uploads will be stored locally only.'
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should log an error if GCS initialization fails', async () => {
      process.env.GCP_PROJECT_ID = 'test-project';
      process.env.GCS_BUCKET_NAME = 'test-bucket';
      Storage.mockImplementation(() => {
        throw new Error('GCS init error');
      });

      await importFileProcessor();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to initialize Google Cloud Storage:',
        expect.any(Error)
      );
    });
  });

  describe('extractTextFromPDF', () => {
    const mockFilePath = '/tmp/test.pdf';
    const mockPdfText = 'Extracted PDF content';

    beforeEach(() => {
      PDFParse.mockImplementation(() => ({
        getText: vi.fn().mockResolvedValue({ text: mockPdfText }),
      }));
    });

    it('should extract text from a PDF file successfully', async () => {
      fs.readFile.mockResolvedValue(Buffer.from('pdf data'));
      const { fileProcessor } = await importFileProcessor();

      const result = await fileProcessor.extractTextFromPDF(mockFilePath);

      expect(fs.readFile).toHaveBeenCalledWith(mockFilePath);
      expect(PDFParse).toHaveBeenCalledWith({ data: Buffer.from('pdf data') });
      expect(result).toBe(mockPdfText);
    });

    it('should throw ApiError if PDF file reading fails', async () => {
      const errorMessage = 'File read error';
      fs.readFile.mockRejectedValue(new Error(errorMessage));
      const { fileProcessor } = await importFileProcessor();

      await expect(
        fileProcessor.extractTextFromPDF(mockFilePath)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.BAD_REQUEST,
        'Failed to extract text from PDF'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting text from PDF:',
        expect.any(Error)
      );
    });

    it('should throw ApiError if PDF text extraction fails', async () => {
      const errorMessage = 'PDF parse error';
      fs.readFile.mockResolvedValue(Buffer.from('pdf data'));
      PDFParse.mockImplementation(() => ({
        getText: vi.fn().mockRejectedValue(new Error(errorMessage)),
      }));
      const { fileProcessor } = await importFileProcessor();

      await expect(
        fileProcessor.extractTextFromPDF(mockFilePath)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.BAD_REQUEST,
        'Failed to extract text from PDF'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting text from PDF:',
        expect.any(Error)
      );
    });
  });

  describe('extractTextFromDOCX', () => {
    const mockFilePath = '/tmp/test.docx';
    const mockDocxText = 'Extracted DOCX content';

    beforeEach(() => {
      mammoth.extractRawText.mockResolvedValue({ value: mockDocxText });
    });

    it('should extract text from a DOCX file successfully', async () => {
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.extractTextFromDOCX(mockFilePath);

      expect(mammoth.extractRawText).toHaveBeenCalledWith({
        path: mockFilePath,
      });
      expect(result).toBe(mockDocxText);
    });

    it('should throw ApiError if DOCX text extraction fails', async () => {
      const errorMessage = 'Mammoth error';
      mammoth.extractRawText.mockRejectedValue(new Error(errorMessage));
      const { fileProcessor } = await importFileProcessor();

      await expect(
        fileProcessor.extractTextFromDOCX(mockFilePath)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.BAD_REQUEST,
        'Failed to extract text from DOCX'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting text from DOCX:',
        expect.any(Error)
      );
    });
  });

  describe('extractTextFromTXT', () => {
    const mockFilePath = '/tmp/test.txt';
    const mockTxtText = 'Extracted TXT content';

    beforeEach(() => {
      fs.readFile.mockResolvedValue(mockTxtText);
    });

    it('should extract text from a TXT file successfully', async () => {
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.extractTextFromTXT(mockFilePath);

      expect(fs.readFile).toHaveBeenCalledWith(mockFilePath, 'utf-8');
      expect(result).toBe(mockTxtText);
    });

    it('should throw ApiError if TXT file reading fails', async () => {
      const errorMessage = 'TXT read error';
      fs.readFile.mockRejectedValue(new Error(errorMessage));
      const { fileProcessor } = await importFileProcessor();

      await expect(
        fileProcessor.extractTextFromTXT(mockFilePath)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.BAD_REQUEST,
        'Failed to read text file'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error reading text file:',
        expect.any(Error)
      );
    });
  });

  describe('extractTextFromFile', () => {
    const mockFilePath = '/tmp/tempfile';
    const mockPdfText = 'PDF content';
    const mockDocxText = 'DOCX content';
    const mockTxtText = 'TXT content';

    beforeEach(() => {
      // Reset path.extname mock for each test in this suite
      path.extname.mockRestore();
      path.extname.mockImplementation((filename) => {
        const lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
      });

      // Mock individual extractors
      fs.readFile.mockImplementation((path, encoding) => {
        if (path.endsWith('.pdf')) return Promise.resolve(Buffer.from('pdf'));
        if (path.endsWith('.txt')) return Promise.resolve(mockTxtText);
        return Promise.reject(new Error('Unknown file for readFile mock'));
      });
      PDFParse.mockImplementation(() => ({
        getText: vi.fn().mockResolvedValue({ text: mockPdfText }),
      }));
      mammoth.extractRawText.mockResolvedValue({ value: mockDocxText });
    });

    it('should call extractTextFromPDF for .pdf files', async () => {
      const fileInfo = { path: mockFilePath + '.pdf', originalName: 'doc.pdf' };
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.extractTextFromFile(fileInfo);

      expect(result).toBe(mockPdfText);
      expect(logger.info).toHaveBeenCalledWith(
        `Extracting text from file: ${fileInfo.originalName} (.pdf)`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully extracted ${mockPdfText.length} characters from ${fileInfo.originalName}`
      );
    });

    it('should call extractTextFromDOCX for .docx files', async () => {
      const fileInfo = {
        path: mockFilePath + '.docx',
        originalName: 'doc.docx',
      };
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.extractTextFromFile(fileInfo);

      expect(result).toBe(mockDocxText);
      expect(logger.info).toHaveBeenCalledWith(
        `Extracting text from file: ${fileInfo.originalName} (.docx)`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully extracted ${mockDocxText.length} characters from ${fileInfo.originalName}`
      );
    });

    it('should call extractTextFromDOCX for .doc files (fallback)', async () => {
      const fileInfo = { path: mockFilePath + '.doc', originalName: 'doc.doc' };
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.extractTextFromFile(fileInfo);

      expect(result).toBe(mockDocxText);
      expect(logger.info).toHaveBeenCalledWith(
        `Extracting text from file: ${fileInfo.originalName} (.doc)`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully extracted ${mockDocxText.length} characters from ${fileInfo.originalName}`
      );
    });

    it('should call extractTextFromTXT for .txt files', async () => {
      const fileInfo = { path: mockFilePath + '.txt', originalName: 'doc.txt' };
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.extractTextFromFile(fileInfo);

      expect(result).toBe(mockTxtText);
      expect(logger.info).toHaveBeenCalledWith(
        `Extracting text from file: ${fileInfo.originalName} (.txt)`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `Successfully extracted ${mockTxtText.length} characters from ${fileInfo.originalName}`
      );
    });

    it('should throw ApiError for unsupported file types', async () => {
      const fileInfo = { path: mockFilePath + '.jpg', originalName: 'img.jpg' };
      const { fileProcessor } = await importFileProcessor();

      await expect(
        fileProcessor.extractTextFromFile(fileInfo)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.BAD_REQUEST,
        'Unsupported file type: .jpg'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(ApiError)
      );
    });

    it('should propagate errors from underlying extractors', async () => {
      const fileInfo = { path: mockFilePath + '.pdf', originalName: 'doc.pdf' };
      fs.readFile.mockRejectedValue(new Error('PDF read error')); // Simulate error in PDF extraction
      const { fileProcessor } = await importFileProcessor();

      await expect(
        fileProcessor.extractTextFromFile(fileInfo)
      ).rejects.toThrow(ApiError);
      expect(ApiError).toHaveBeenCalledWith(
        httpStatus.BAD_REQUEST,
        'Failed to extract text from PDF'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(ApiError)
      );
    });
  });

  describe('cleanupFile', () => {
    const mockFilePath = '/tmp/tempfile.txt';

    it('should delete the file successfully', async () => {
      fs.unlink.mockResolvedValue(undefined);
      const { fileProcessor } = await importFileProcessor();

      await fileProcessor.cleanupFile(mockFilePath);

      expect(fs.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.info).toHaveBeenCalledWith(
        `Cleaned up temporary file: ${mockFilePath}`
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should log a warning if file deletion fails', async () => {
      const errorMessage = 'Deletion failed';
      fs.unlink.mockRejectedValue(new Error(errorMessage));
      const { fileProcessor } = await importFileProcessor();

      await fileProcessor.cleanupFile(mockFilePath);

      expect(fs.unlink).toHaveBeenCalledWith(mockFilePath);
      expect(logger.warn).toHaveBeenCalledWith(
        `Failed to cleanup file ${mockFilePath}:`,
        expect.any(Error)
      );
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('uploadToGCS', () => {
    const mockLocalFilePath = '/tmp/local-file.pdf';
    const mockFilename = 'document.pdf';
    const mockDestination = `uploads/anonymous/${Date.now()}_${mockFilename}`; // Date.now() will vary, so use expect.stringMatching
    const mockSignedUrl = 'http://signed.url/document.pdf';
    const mockBucketName = 'test-bucket';

    let mockBucket;
    let mockFile;

    beforeEach(() => {
      process.env.GCS_BUCKET_NAME = mockBucketName;
      process.env.GCP_PROJECT_ID = 'test-project'; // Ensure GCS is considered configured

      mockFile = {
        getSignedUrl: vi.fn().mockResolvedValue([mockSignedUrl]),
        delete: vi.fn().mockResolvedValue(undefined),
      };
      mockBucket = {
        upload: vi.fn().mockResolvedValue(undefined),
        file: vi.fn().mockReturnValue(mockFile),
      };
      Storage.mockImplementation(() => ({
        bucket: vi.fn().mockReturnValue(mockBucket),
      }));
      fsSync.existsSync.mockReturnValue(true); // Assume key file exists for GCS init
    });

    it('should upload to GCS and return signed URL if GCS is configured', async () => {
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.uploadToGCS(
        mockLocalFilePath,
        mockFilename
      );

      expect(mockBucket.upload).toHaveBeenCalledWith(mockLocalFilePath, {
        destination: expect.stringMatching(
          new RegExp(`^uploads/anonymous/\\d+_document\\.pdf$`)
        ),
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            documentType: 'review',
            uploadedAt: expect.any(String),
            userId: 'anonymous',
            originalName: mockFilename,
          },
        },
      });
      expect(mockBucket.file).toHaveBeenCalledWith(
        expect.stringMatching(new RegExp(`^uploads/anonymous/\\d+_document\\.pdf$`))
      );
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expect.any(Number),
      });
      expect(result).toEqual({
        success: true,
        gcsPath: expect.stringMatching(
          new RegExp(`^gs://${mockBucketName}/uploads/anonymous/\\d+_document\\.pdf$`)
        ),
        publicUrl: mockSignedUrl,
        fileName: mockFilename,
        destination: expect.stringMatching(
          new RegExp(`^uploads/anonymous/\\d+_document\\.pdf$`)
        ),
        storageType: 'gcs',
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Uploading file to GCS:')
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('File uploaded successfully to GCS:')
      );
    });

    it('should use provided documentMetadata for GCS upload', async () => {
      const customMetadata = {
        userId: 'user123',
        documentType: 'template',
        originalName: 'original.pdf',
      };
      const { fileProcessor } = await importFileProcessor();
      await fileProcessor.uploadToGCS(
        mockLocalFilePath,
        mockFilename,
        customMetadata
      );

      expect(mockBucket.upload).toHaveBeenCalledWith(mockLocalFilePath, {
        destination: expect.stringMatching(
          new RegExp(`^uploads/${customMetadata.userId}/\\d+_document\\.pdf$`)
        ),
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            documentType: customMetadata.documentType,
            uploadedAt: expect.any(String),
            userId: customMetadata.userId,
            originalName: customMetadata.originalName,
          },
        },
      });
    });

    it('should return local path fallback if GCS is not configured', async () => {
      process.env.GCS_BUCKET_NAME = ''; // Simulate GCS not configured
      process.env.GCP_PROJECT_ID = '';
      fsSync.existsSync.mockReturnValue(false);

      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.uploadToGCS(
        mockLocalFilePath,
        mockFilename
      );

      expect(mockBucket.upload).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'GCS not configured. Returning local file path.'
      );
      expect(result).toEqual({
        success: true,
        localPath: mockLocalFilePath,
        fileName: mockFilename,
        storageType: 'local',
      });
    });

    it('should return local path fallback if GCS upload fails', async () => {
      const uploadError = new Error('GCS upload failed');
      mockBucket.upload.mockRejectedValue(uploadError);
      const { fileProcessor } = await importFileProcessor();

      const result = await fileProcessor.uploadToGCS(
        mockLocalFilePath,
        mockFilename
      );

      expect(mockBucket.upload).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading to GCS:',
        uploadError
      );
      expect(result).toEqual({
        success: true,
        localPath: mockLocalFilePath,
        fileName: mockFilename,
        storageType: 'local',
        error: uploadError.message,
      });
    });
  });

  describe('deleteDocumentFromGCS', () => {
    const mockGcsPath = 'gs://test-bucket/uploads/user123/12345_document.pdf';
    const mockFilePathInBucket = 'uploads/user123/12345_document.pdf';
    const mockBucketName = 'test-bucket';

    let mockBucket;
    let mockFile;

    beforeEach(() => {
      process.env.GCS_BUCKET_NAME = mockBucketName;
      process.env.GCP_PROJECT_ID = 'test-project'; // Ensure GCS is considered configured

      mockFile = {
        getSignedUrl: vi.fn(),
        delete: vi.fn().mockResolvedValue(undefined),
      };
      mockBucket = {
        upload: vi.fn(),
        file: vi.fn().mockReturnValue(mockFile),
      };
      Storage.mockImplementation(() => ({
        bucket: vi.fn().mockReturnValue(mockBucket),
      }));
      fsSync.existsSync.mockReturnValue(true); // Assume key file exists for GCS init
    });

    it('should delete document from GCS successfully if configured', async () => {
      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.deleteDocumentFromGCS(mockGcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith(mockFilePathInBucket);
      expect(mockFile.delete).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        `Document deleted from GCS: ${mockFilePathInBucket}`
      );
      expect(result).toEqual({
        success: true,
        message: 'Document deleted successfully',
      });
    });

    it('should return failure if GCS is not configured', async () => {
      process.env.GCS_BUCKET_NAME = ''; // Simulate GCS not configured
      process.env.GCP_PROJECT_ID = '';
      fsSync.existsSync.mockReturnValue(false);

      const { fileProcessor } = await importFileProcessor();
      const result = await fileProcessor.deleteDocumentFromGCS(mockGcsPath);

      expect(mockBucket.file).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('GCS not configured. Cannot delete from GCS.');
      expect(result).toEqual({ success: false, message: 'GCS not configured' });
    });

    it('should return failure if GCS deletion fails', async () => {
      const deleteError = new Error('GCS delete failed');
      mockFile.delete.mockRejectedValue(deleteError);
      const { fileProcessor } = await importFileProcessor();

      const result = await fileProcessor.deleteDocumentFromGCS(mockGcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith(mockFilePathInBucket);
      expect(mockFile.delete).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Error deleting document from GCS:',
        deleteError
      );
      expect(result).toEqual({ success: false, message: deleteError.message });
    });
  });

  describe('getMimeType', () => {
    beforeEach(() => {
      path.extname.mockRestore(); // Restore original path.extname for this suite
    });

    it('should return correct MIME type for .pdf', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.pdf')).toBe('application/pdf');
    });

    it('should return correct MIME type for .docx', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.docx')).toBe(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      );
    });

    it('should return correct MIME type for .doc', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.doc')).toBe(
        'application/msword'
      );
    });

    it('should return correct MIME type for .txt', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.txt')).toBe('text/plain');
    });

    it('should return correct MIME type for .xlsx', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.xlsx')).toBe(
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
    });

    it('should return correct MIME type for .xls', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.xls')).toBe(
        'application/vnd.ms-excel'
      );
    });

    it('should return correct MIME type for .pptx', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.pptx')).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      );
    });

    it('should return correct MIME type for .ppt', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.ppt')).toBe(
        'application/vnd.ms-powerpoint'
      );
    });

    it('should return application/octet-stream for unknown extension', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file.jpg')).toBe(
        'application/octet-stream'
      );
    });

    it('should handle filenames without extension', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('file_without_ext')).toBe(
        'application/octet-stream'
      );
    });

    it('should handle filenames with multiple dots but no recognized extension', async () => {
      const { fileProcessor } = await importFileProcessor();
      expect(fileProcessor.getMimeType('archive.tar.gz')).toBe(
        'application/octet-stream'
      );
    });
  });
});