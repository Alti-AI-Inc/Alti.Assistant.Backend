import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractTextFromFile,
  uploadToGCS,
  cleanupTempFile,
  deleteFromGCS,
} from './fileProcessor.js'; // Assuming the test file is in the same directory or adjust path

// Mock external dependencies
vi.mock('fs', () => ({
  default: {
    readFileSync: vi.fn(),
    existsSync: vi.fn(),
    unlinkSync: vi.fn(),
  },
}));

vi.mock('path', () => ({
  default: {
    extname: vi.fn(),
  },
}));

const mockSave = vi.fn();
const mockDelete = vi.fn();
const mockFile = vi.fn().mockImplementation(() => ({
  save: mockSave,
  delete: mockDelete,
}));
const mockBucket = vi.fn().mockImplementation(() => ({
  file: mockFile,
}));

const {
  mockStorage,
  mockGetText
} = vi.hoisted(() => {
  const mockStorage = vi.fn().mockImplementation(() => ({
    bucket: mockBucket,
  }));

  const mockGetText = vi.fn();

  return {
    mockStorage,
    mockGetText
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorage,
}));

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: mockGetText,
  })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../../../../../config/index.js', () => ({
  default: {
    google: {
      gcp_project_id: 'test-project-id',
    },
  },
}));

vi.mock('../knowledge.constant.js', () => ({
  STORAGE_CONFIG: {
    GCS_BUCKET: 'test-gcs-bucket',
    USER_FILES_PREFIX: 'user-files',
    BOT_FILES_PREFIX: 'bot-files',
  },
  KNOWLEDGE_CONFIG: {}, // Not directly used in the tested functions, but good to mock if present
}));

// Import the mocked modules to ensure they are loaded correctly for type checking if needed,
// though for vitest mocks, the direct import of the module under test is usually enough.
// These are not strictly necessary for the tests to run but can help with IDE suggestions.
import fs from 'fs';
import path from 'path';
import { Storage } from '@google-cloud/storage';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { logger } from '../../../../shared/logger.js';
import config from '../../../../../config/index.js';
import { STORAGE_CONFIG } from '../knowledge.constant.js';

describe('fileProcessor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('extractTextFromFile', () => {
    const mockFileInfo = {
      path: '/tmp/testfile.ext',
      location: '/tmp/testfile.ext', // For fallback test
      originalName: 'testfile.ext',
      filename: 'testfile.ext', // For fallback test
    };

    it('should extract text from a PDF file', async () => {
      path.extname.mockReturnValueOnce('.pdf');
      fs.readFileSync.mockReturnValueOnce(Buffer.from('pdf data'));
      mockGetText.mockResolvedValueOnce({
        pages: [{ text: 'Page 1 text' }, { text: 'Page 2 text' }],
      });

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('Page 1 text\nPage 2 text');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext');
      expect(PDFParse).toHaveBeenCalledWith({ data: Buffer.from('pdf data') });
      expect(mockGetText).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .pdf'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 25 characters from file'
      );
    });

    it('should extract text from a DOCX file', async () => {
      path.extname.mockReturnValueOnce('.docx');
      mammoth.extractRawText.mockResolvedValueOnce({ value: 'DOCX content' });

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('DOCX content');
      expect(mammoth.extractRawText).toHaveBeenCalledWith({
        path: '/tmp/testfile.ext',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .docx'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 12 characters from file'
      );
    });

    it('should extract text from a DOC file (handled as DOCX)', async () => {
      path.extname.mockReturnValueOnce('.doc');
      mammoth.extractRawText.mockResolvedValueOnce({ value: 'DOC content' });

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('DOC content');
      expect(mammoth.extractRawText).toHaveBeenCalledWith({
        path: '/tmp/testfile.ext',
      });
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .doc'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 11 characters from file'
      );
    });

    it('should extract text from a TXT file', async () => {
      path.extname.mockReturnValueOnce('.txt');
      fs.readFileSync.mockReturnValueOnce('TXT content', 'utf8');

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('TXT content');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext', 'utf8');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .txt'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 11 characters from file'
      );
    });

    it('should extract text from a MD file (handled as TXT)', async () => {
      path.extname.mockReturnValueOnce('.md');
      fs.readFileSync.mockReturnValueOnce('Markdown content', 'utf8');

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('Markdown content');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext', 'utf8');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .md'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 16 characters from file'
      );
    });

    it('should extract text from a CSV file (handled as TXT)', async () => {
      path.extname.mockReturnValueOnce('.csv');
      fs.readFileSync.mockReturnValueOnce('a,b,c\n1,2,3', 'utf8');

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('a,b,c\n1,2,3');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext', 'utf8');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .csv'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 9 characters from file'
      );
    });

    it('should extract text from a JSON file (handled as TXT)', async () => {
      path.extname.mockReturnValueOnce('.json');
      fs.readFileSync.mockReturnValueOnce('{"key": "value"}', 'utf8');

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('{"key": "value"}');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext', 'utf8');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .json'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 16 characters from file'
      );
    });

    it('should extract text from an XML file (handled as TXT)', async () => {
      path.extname.mockReturnValueOnce('.xml');
      fs.readFileSync.mockReturnValueOnce('<tag>content</tag>', 'utf8');

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('<tag>content</tag>');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext', 'utf8');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .xml'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 18 characters from file'
      );
    });

    it('should extract text from an HTML file (handled as TXT)', async () => {
      path.extname.mockReturnValueOnce('.html');
      fs.readFileSync.mockReturnValueOnce('<html><body>Hi</body></html>', 'utf8');

      const result = await extractTextFromFile(mockFileInfo);
      expect(result).toBe('<html><body>Hi</body></html>');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile.ext', 'utf8');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile.ext, type: .html'
      );
      expect(logger.info).toHaveBeenCalledWith(
        'Successfully extracted 28 characters from file'
      );
    });

    it('should throw an error for unsupported file types', async () => {
      path.extname.mockReturnValueOnce('.unsupported');
      await expect(extractTextFromFile(mockFileInfo)).rejects.toThrow(
        'Unsupported file type: .unsupported'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(Error)
      );
    });

    it('should throw an error if no text is extracted', async () => {
      path.extname.mockReturnValueOnce('.txt');
      fs.readFileSync.mockReturnValueOnce('', 'utf8'); // Empty content

      await expect(extractTextFromFile(mockFileInfo)).rejects.toThrow(
        'No text could be extracted from the file'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(Error)
      );
    });

    it('should throw an error if PDF extraction fails', async () => {
      path.extname.mockReturnValueOnce('.pdf');
      fs.readFileSync.mockReturnValueOnce(Buffer.from('corrupt pdf'));
      mockGetText.mockRejectedValueOnce(new Error('PDF parse error'));

      await expect(extractTextFromFile(mockFileInfo)).rejects.toThrow(
        'Failed to extract text from PDF: PDF parse error'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting text from PDF:',
        expect.any(Error)
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(Error)
      );
    });

    it('should throw an error if DOCX extraction fails', async () => {
      path.extname.mockReturnValueOnce('.docx');
      mammoth.extractRawText.mockRejectedValueOnce(new Error('DOCX parse error'));

      await expect(extractTextFromFile(mockFileInfo)).rejects.toThrow(
        'Failed to extract text from DOCX: DOCX parse error'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error extracting text from DOCX:',
        expect.any(Error)
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(Error)
      );
    });

    it('should throw an error if TXT extraction fails (e.g., file not found)', async () => {
      path.extname.mockReturnValueOnce('.txt');
      fs.readFileSync.mockImplementationOnce(() => {
        throw new Error('File not found');
      });

      await expect(extractTextFromFile(mockFileInfo)).rejects.toThrow(
        'Failed to read text file: File not found'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error reading text file:',
        expect.any(Error)
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Error in extractTextFromFile:',
        expect.any(Error)
      );
    });

    it('should use fileInfo.location if fileInfo.path is not available', async () => {
      const fileInfoWithLocation = {
        location: '/tmp/testfile_loc.txt',
        originalName: 'testfile_loc.txt',
      };
      path.extname.mockReturnValueOnce('.txt');
      fs.readFileSync.mockReturnValueOnce('Content from location', 'utf8');

      const result = await extractTextFromFile(fileInfoWithLocation);
      expect(result).toBe('Content from location');
      expect(fs.readFileSync).toHaveBeenCalledWith('/tmp/testfile_loc.txt', 'utf8');
    });

    it('should use fileInfo.filename if fileInfo.originalName is not available', async () => {
      const fileInfoWithFilename = {
        path: '/tmp/testfile_name.txt',
        filename: 'testfile_name.txt',
      };
      path.extname.mockReturnValueOnce('.txt');
      fs.readFileSync.mockReturnValueOnce('Content from filename', 'utf8');

      const result = await extractTextFromFile(fileInfoWithFilename);
      expect(result).toBe('Content from filename');
      expect(logger.info).toHaveBeenCalledWith(
        'Extracting text from file: testfile_name.txt, type: .txt'
      );
    });
  });

  describe('uploadToGCS', () => {
    const mockFileName = 'test-upload.pdf';
    const mockMetadata = {
      ownerType: 'user',
      ownerId: 'user123',
      folderId: 'folder456',
      customKey: 'customValue',
    };
    const mockFileBuffer = Buffer.from('file content');
    const mockFilePath = '/tmp/local-file.pdf';

    beforeEach(() => {
      mockSave.mockResolvedValueOnce([]); // GCS file.save resolves with an array
    });

    it('should upload a file buffer to GCS for a user with a folder', async () => {
      path.extname.mockReturnValueOnce('.pdf');
      const expectedGcsPath = `user-files/user123/folders/folder456/${mockFileName}`;
      const expectedPublicUrl = `https://storage.googleapis.com/${STORAGE_CONFIG.GCS_BUCKET}/${expectedGcsPath}`;

      const result = await uploadToGCS(mockFileBuffer, mockFileName, mockMetadata);

      expect(mockStorage).toHaveBeenCalledWith({
        projectId: config.google.gcp_project_id,
        keyFilename: 'alti_gcp.json',
      });
      expect(mockBucket).toHaveBeenCalledWith(STORAGE_CONFIG.GCS_BUCKET);
      expect(mockFile).toHaveBeenCalledWith(expectedGcsPath);
      expect(mockSave).toHaveBeenCalledWith(mockFileBuffer, {
        metadata: {
          contentType: 'application/pdf',
          metadata: {
            ...mockMetadata,
            uploadedAt: expect.any(String),
          },
        },
        resumable: false,
      });
      expect(result).toEqual({
        publicUrl: expectedPublicUrl,
        gcsPath: expectedGcsPath,
        bucket: STORAGE_CONFIG.GCS_BUCKET,
        storageType: 'gcs',
      });
      expect(logger.info).toHaveBeenCalledWith(
        `Uploading file to GCS: ${expectedGcsPath}`
      );
      expect(logger.info).toHaveBeenCalledWith(
        `File uploaded successfully to GCS: ${expectedPublicUrl}`
      );
    });

    it('should upload a file buffer to GCS for a bot without a folder', async () => {
      path.extname.mockReturnValueOnce('.txt');
      const botMetadata = { ownerType: 'bot', ownerId: 'bot789' };
      const expectedGcsPath = `bot-files/bot789/${mockFileName}`;
      const expectedPublicUrl = `https://storage.googleapis.com/${STORAGE_CONFIG.GCS_BUCKET}/${expectedGcsPath}`;

      const result = await uploadToGCS(mockFileBuffer, mockFileName, botMetadata);

      expect(mockFile).toHaveBeenCalledWith(expectedGcsPath);
      expect(mockSave).toHaveBeenCalledWith(mockFileBuffer, {
        metadata: {
          contentType: 'text/plain',
          metadata: {
            ...botMetadata,
            uploadedAt: expect.any(String),
          },
        },
        resumable: false,
      });
      expect(result.publicUrl).toBe(expectedPublicUrl);
      expect(result.gcsPath).toBe(expectedGcsPath);
    });

    it('should upload a file from a local path to GCS', async () => {
      path.extname.mockReturnValueOnce('.docx');
      fs.readFileSync.mockReturnValueOnce(mockFileBuffer);
      const expectedGcsPath = `user-files/user123/folders/folder456/${mockFileName}`;

      await uploadToGCS(mockFilePath, mockFileName, mockMetadata);

      expect(fs.readFileSync).toHaveBeenCalledWith(mockFilePath);
      expect(mockFile).toHaveBeenCalledWith(expectedGcsPath);
      expect(mockSave).toHaveBeenCalledWith(mockFileBuffer, {
        metadata: {
          contentType:
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          metadata: {
            ...mockMetadata,
            uploadedAt: expect.any(String),
          },
        },
        resumable: false,
      });
    });

    it('should handle unknown content types as application/octet-stream', async () => {
      path.extname.mockReturnValueOnce('.unknown');
      const expectedGcsPath = `user-files/user123/folders/folder456/${mockFileName}`;

      await uploadToGCS(mockFileBuffer, mockFileName, mockMetadata);

      expect(mockFile).toHaveBeenCalledWith(expectedGcsPath);
      expect(mockSave).toHaveBeenCalledWith(mockFileBuffer, {
        metadata: {
          contentType: 'application/octet-stream',
          metadata: {
            ...mockMetadata,
            uploadedAt: expect.any(String),
          },
        },
        resumable: false,
      });
    });

    it('should throw an error if GCS upload fails', async () => {
      const uploadError = new Error('GCS upload failed');
      mockSave.mockRejectedValueOnce(uploadError);
      path.extname.mockReturnValueOnce('.pdf');

      await expect(
        uploadToGCS(mockFileBuffer, mockFileName, mockMetadata)
      ).rejects.toThrow(`Failed to upload to GCS: ${uploadError.message}`);
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading to GCS:',
        uploadError
      );
    });

    it('should throw an error for invalid file data type', async () => {
      await expect(
        uploadToGCS(123, mockFileName, mockMetadata)
      ).rejects.toThrow('Invalid file data: must be Buffer or file path string');
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading to GCS:',
        expect.any(Error)
      );
    });

    it('should throw an error if reading local file fails', async () => {
      path.extname.mockReturnValueOnce('.txt');
      fs.readFileSync.mockImplementationOnce(() => {
        throw new Error('Local file read error');
      });

      await expect(
        uploadToGCS(mockFilePath, mockFileName, mockMetadata)
      ).rejects.toThrow('Failed to upload to GCS: Local file read error');
      expect(logger.error).toHaveBeenCalledWith(
        'Error uploading to GCS:',
        expect.any(Error)
      );
    });
  });

  describe('cleanupTempFile', () => {
    const filePath = '/tmp/temp-file.txt';

    it('should delete the file if it exists', async () => {
      fs.existsSync.mockReturnValueOnce(true);
      fs.unlinkSync.mockReturnValueOnce(undefined); // unlinkSync returns undefined

      await cleanupTempFile(filePath);

      expect(fs.existsSync).toHaveBeenCalledWith(filePath);
      expect(fs.unlinkSync).toHaveBeenCalledWith(filePath);
      expect(logger.info).toHaveBeenCalledWith(`Cleaned up temp file: ${filePath}`);
    });

    it('should do nothing if the file does not exist', async () => {
      fs.existsSync.mockReturnValueOnce(false);

      await cleanupTempFile(filePath);

      expect(fs.existsSync).toHaveBeenCalledWith(filePath);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should log a warning if file deletion fails', async () => {
      const unlinkError = new Error('Permission denied');
      fs.existsSync.mockReturnValueOnce(true);
      fs.unlinkSync.mockImplementationOnce(() => {
        throw unlinkError;
      });

      await cleanupTempFile(filePath);

      expect(fs.existsSync).toHaveBeenCalledWith(filePath);
      expect(fs.unlinkSync).toHaveBeenCalledWith(filePath);
      expect(logger.warn).toHaveBeenCalledWith(
        `Failed to cleanup temp file: ${filePath}`,
        unlinkError
      );
    });
  });

  describe('deleteFromGCS', () => {
    const gcsPath = 'user-files/user123/test-file.pdf';

    beforeEach(() => {
      mockDelete.mockResolvedValueOnce([]); // GCS file.delete resolves with an array
    });

    it('should delete a file from GCS successfully', async () => {
      const result = await deleteFromGCS(gcsPath);

      expect(mockStorage).toHaveBeenCalledWith({
        projectId: config.google.gcp_project_id,
        keyFilename: 'alti_gcp.json',
      });
      expect(mockBucket).toHaveBeenCalledWith(STORAGE_CONFIG.GCS_BUCKET);
      expect(mockFile).toHaveBeenCalledWith(gcsPath);
      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(true);
      expect(logger.info).toHaveBeenCalledWith(`Deleted file from GCS: ${gcsPath}`);
    });

    it('should return false and log error if GCS deletion fails', async () => {
      const deleteError = new Error('GCS delete failed');
      mockDelete.mockRejectedValueOnce(deleteError);

      const result = await deleteFromGCS(gcsPath);

      expect(mockDelete).toHaveBeenCalled();
      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        'Error deleting from GCS:',
        deleteError
      );
    });
  });
});