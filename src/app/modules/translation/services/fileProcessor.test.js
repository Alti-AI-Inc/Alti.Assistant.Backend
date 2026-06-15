import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

const {
  mockFsPromises,
  mockFsSync,
  mockStorageConstructor,
  mockMammoth,
  mockPdfParseConstructor,
  mockXLSX,
  mockLogger,
  mockApiError,
  mockTranslationConstants
} = vi.hoisted(() => {
  // Mock external dependencies
  // Mock fs/promises
  const mockFsPromises = {
    readFile: vi.fn(),
    unlink: vi.fn(),
  };

  // Mock fs (sync)
  const mockFsSync = {
    existsSync: vi.fn(),
  };
  const mockStorageConstructor = vi.fn().mockImplementation(() => mockStorage);

  // Mock mammoth
  const mockMammoth = {
    extractRawText: vi.fn(),
  };
  const mockPdfParseConstructor = vi.fn().mockImplementation(() => mockPdfParseInstance);

  // Mock xlsx (dynamic import)
  const mockXLSX = {
    readFile: vi.fn(),
    utils: {
      sheet_to_csv: vi.fn(),
    },
  };

  // Mock logger
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  // Mock ApiError
  const mockApiError = vi.fn().mockImplementation((status, message) => {
    const error = new Error(message);
    error.statusCode = status;
    return error;
  });

  // Mock translation.constant.js (constants)
  const mockTranslationConstants = {
    SUPPORTED_DOCUMENT_FORMATS: ['.pdf', '.docx', '.doc', '.txt', '.md', '.html', '.json', '.csv', '.xlsx'],
    ERROR_MESSAGES: {
      UNSUPPORTED_FORMAT: 'Unsupported document format.',
    },
    STORAGE_CONFIG: {
      UPLOAD_FOLDER: 'translation-uploads',
    },
  };

  return {
    mockFsPromises,
    mockFsSync,
    mockStorageConstructor,
    mockMammoth,
    mockPdfParseConstructor,
    mockXLSX,
    mockLogger,
    mockApiError,
    mockTranslationConstants
  };
});

vi.mock('fs/promises', () => mockFsPromises);

vi.mock('fs', () => mockFsSync);

// Mock path (only extname is used, default to actual behavior)
vi.mock('path', async (importActual) => {
  const actual = await importActual();
  return {
    ...actual,
    extname: vi.fn().mockImplementation((p) => actual.extname(p)), // Default to actual behavior
  };
});

// Mock @google-cloud/storage
const mockFile = {
  getSignedUrl: vi.fn(),
  download: vi.fn(),
  delete: vi.fn(),
};
const mockBucket = {
  upload: vi.fn(),
  file: vi.fn().mockImplementation(() => mockFile),
};
const mockStorage = {
  bucket: vi.fn().mockImplementation(() => mockBucket),
};
vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorageConstructor,
}));

vi.mock('mammoth', () => mockMammoth);

// Mock pdf-parse
const mockPdfParseInstance = {
  getText: vi.fn(),
};
vi.mock('pdf-parse', () => ({
  PDFParse: mockPdfParseConstructor,
}));

vi.mock('xlsx', () => mockXLSX);

vi.mock('../../../../shared/logger.js', () => ({
  logger: mockLogger,
}));

vi.mock('../../../../errors/ApiError.js', () => ({
  default: mockApiError,
}));

// Import http-status (constants, no need to mock)
import httpStatus from 'http-status';

vi.mock('../translation.constant.js', () => mockTranslationConstants);

// Declare a variable to hold the imported module's exports
let fileProcessor;

describe('fileProcessor', () => {
  beforeEach(async () => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    vi.resetModules(); // Crucial for re-initializing module-level state for GCS tests

    // Reset environment variables for each test
    vi.unstubAllEnvs();

    // Default mocks for GCS functions (assuming configured for most tests, overridden in specific blocks)
    mockStorageConstructor.mockReturnValue(mockStorage);
    mockStorage.bucket.mockReturnValue(mockBucket);
    mockBucket.file.mockReturnValue(mockFile);
    mockFile.getSignedUrl.mockResolvedValue(['http://signed.url']);
    mockFile.download.mockResolvedValue(undefined);
    mockFile.delete.mockResolvedValue(undefined);
    mockBucket.upload.mockResolvedValue(undefined);

    // Default mocks for text extraction
    mockFsPromises.readFile.mockResolvedValue('file content');
    mockMammoth.extractRawText.mockResolvedValue({ value: 'docx content' });
    mockPdfParseInstance.getText.mockResolvedValue({ text: 'pdf content' });
    mockPdfParseConstructor.mockReturnValue(mockPdfParseInstance);

    // Default mocks for xlsx
    mockXLSX.readFile.mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: { A1: { v: 'Header' }, A2: { v: 'Data' } },
      },
    });
    mockXLSX.utils.sheet_to_csv.mockReturnValue('Header\nData');

    // Default logger behavior
    mockLogger.info.mockImplementation(() => {});
    mockLogger.warn.mockImplementation(() => {});
    mockLogger.error.mockImplementation(() => {});

    // Default fsSync.existsSync behavior
    mockFsSync.existsSync.mockReturnValue(true); // Assume key file exists by default for GCS init
  });

  afterEach(() => {
    vi.unstubAllEnvs(); // Clean up environment stubs
  });

  // ============================================
  // TEXT EXTRACTION FUNCTIONS & UTILITIES
  // (These don't depend on GCS init, so we can import once for them)
  // ============================================
  describe('Text Extraction Functions and Utilities', () => {
    beforeEach(async () => {
      // Set up a default GCS configured environment for the initial module import
      vi.stubEnv('GCS_KEY_FILE', '/path/to/key.json');
      vi.stubEnv('GCP_PROJECT_ID', 'test-project');
      vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket');
      mockFsSync.existsSync.mockReturnValue(true);

      // Import the module once for these tests
      const module = await import('../fileProcessor.js');
      fileProcessor = module.fileProcessor;
    });

    describe('extractTextFromPDF', () => {
      it('should extract text from a PDF file successfully', async () => {
        const filePath = 'test.pdf';
        mockFsPromises.readFile.mockResolvedValue(Buffer.from('pdf data'));
        mockPdfParseInstance.getText.mockResolvedValue({ text: 'Extracted PDF Text' });

        const result = await fileProcessor.extractTextFromPDF(filePath);
        expect(result).toBe('Extracted PDF Text');
        expect(mockFsPromises.readFile).toHaveBeenCalledWith(filePath);
        expect(mockPdfParseConstructor).toHaveBeenCalledWith({ data: Buffer.from('pdf data') });
        expect(mockPdfParseInstance.getText).toHaveBeenCalled();
      });

      it('should throw ApiError if PDF extraction fails', async () => {
        const filePath = 'bad.pdf';
        mockFsPromises.readFile.mockRejectedValue(new Error('File read error'));

        await expect(fileProcessor.extractTextFromPDF(filePath)).rejects.toThrow(mockApiError);
        expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Failed to extract text from PDF');
        expect(mockLogger.error).toHaveBeenCalledWith('Error extracting text from PDF:', expect.any(Error));
      });
    });

    describe('extractTextFromDOCX', () => {
      it('should extract text from a DOCX file successfully', async () => {
        const filePath = 'test.docx';
        mockMammoth.extractRawText.mockResolvedValue({ value: 'Extracted DOCX Text' });

        const result = await fileProcessor.extractTextFromDOCX(filePath);
        expect(result).toBe('Extracted DOCX Text');
        expect(mockMammoth.extractRawText).toHaveBeenCalledWith({ path: filePath });
      });

      it('should throw ApiError if DOCX extraction fails', async () => {
        const filePath = 'bad.docx';
        mockMammoth.extractRawText.mockRejectedValue(new Error('Mammoth error'));

        await expect(fileProcessor.extractTextFromDOCX(filePath)).rejects.toThrow(mockApiError);
        expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Failed to extract text from DOCX');
        expect(mockLogger.error).toHaveBeenCalledWith('Error extracting text from DOCX:', expect.any(Error));
      });
    });

    describe('extractTextFromTXT', () => {
      it('should extract text from a TXT file successfully', async () => {
        const filePath = 'test.txt';
        mockFsPromises.readFile.mockResolvedValue('Extracted TXT Text');

        const result = await fileProcessor.extractTextFromTXT(filePath);
        expect(result).toBe('Extracted TXT Text');
        expect(mockFsPromises.readFile).toHaveBeenCalledWith(filePath, 'utf-8');
      });

      it('should throw ApiError if TXT extraction fails', async () => {
        const filePath = 'bad.txt';
        mockFsPromises.readFile.mockRejectedValue(new Error('File read error'));

        await expect(fileProcessor.extractTextFromTXT(filePath)).rejects.toThrow(mockApiError);
        expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Failed to read text file');
        expect(mockLogger.error).toHaveBeenCalledWith('Error reading text file:', expect.any(Error));
      });
    });

    describe('extractTextFromXLSX', () => {
      it('should extract text from an XLSX file successfully', async () => {
        const filePath = 'test.xlsx';
        const mockWorkbook = {
          SheetNames: ['Sheet1', 'Sheet2'],
          Sheets: {
            Sheet1: { A1: { v: 'Header1' }, B1: { v: 'Value1' } },
            Sheet2: { A1: { v: 'Header2' }, B1: { v: 'Value2' } },
          },
        };
        mockXLSX.readFile.mockReturnValue(mockWorkbook);
        mockXLSX.utils.sheet_to_csv
          .mockReturnValueOnce('Header1,Value1')
          .mockReturnValueOnce('Header2,Value2');

        const result = await fileProcessor.extractTextFromXLSX(filePath);
        expect(result).toBe('Header1,Value1\n\nHeader2,Value2\n\n');
        expect(mockXLSX.readFile).toHaveBeenCalledWith(filePath);
        expect(mockXLSX.utils.sheet_to_csv).toHaveBeenCalledTimes(2);
        expect(mockXLSX.utils.sheet_to_csv).toHaveBeenCalledWith(mockWorkbook.Sheets.Sheet1);
        expect(mockXLSX.utils.sheet_to_csv).toHaveBeenCalledWith(mockWorkbook.Sheets.Sheet2);
      });

      it('should throw ApiError if XLSX extraction fails', async () => {
        const filePath = 'bad.xlsx';
        mockXLSX.readFile.mockImplementation(() => {
          throw new Error('XLSX read error');
        });

        await expect(fileProcessor.extractTextFromXLSX(filePath)).rejects.toThrow(mockApiError);
        expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, 'Failed to extract text from XLSX file');
        expect(mockLogger.error).toHaveBeenCalledWith('XLSX extraction error:', expect.any(Error));
      });
    });

    describe('extractTextFromFile', () => {
      it('should call extractTextFromPDF for .pdf files', async () => {
        const fileInfo = { path: 'test.pdf', originalName: 'document.pdf' };
        vi.mocked(path.extname).mockReturnValue('.pdf');
        const pdfText = 'PDF Content';
        vi.spyOn(fileProcessor, 'extractTextFromPDF').mockResolvedValue(pdfText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(pdfText);
        expect(fileProcessor.extractTextFromPDF).toHaveBeenCalledWith(fileInfo.path);
        expect(mockLogger.info).toHaveBeenCalledWith(`Extracting text from file: ${fileInfo.originalName} (.pdf)`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Successfully extracted ${pdfText.length} characters from ${fileInfo.originalName}`);
      });

      it('should call extractTextFromDOCX for .docx files', async () => {
        const fileInfo = { path: 'test.docx', originalName: 'document.docx' };
        vi.mocked(path.extname).mockReturnValue('.docx');
        const docxText = 'DOCX Content';
        vi.spyOn(fileProcessor, 'extractTextFromDOCX').mockResolvedValue(docxText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(docxText);
        expect(fileProcessor.extractTextFromDOCX).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromDOCX for .doc files', async () => {
        const fileInfo = { path: 'test.doc', originalName: 'document.doc' };
        vi.mocked(path.extname).mockReturnValue('.doc');
        const docText = 'DOC Content';
        vi.spyOn(fileProcessor, 'extractTextFromDOCX').mockResolvedValue(docText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(docText);
        expect(fileProcessor.extractTextFromDOCX).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromTXT for .txt files', async () => {
        const fileInfo = { path: 'test.txt', originalName: 'document.txt' };
        vi.mocked(path.extname).mockReturnValue('.txt');
        const txtText = 'TXT Content';
        vi.spyOn(fileProcessor, 'extractTextFromTXT').mockResolvedValue(txtText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(txtText);
        expect(fileProcessor.extractTextFromTXT).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromTXT for .md files', async () => {
        const fileInfo = { path: 'test.md', originalName: 'document.md' };
        vi.mocked(path.extname).mockReturnValue('.md');
        const mdText = 'MD Content';
        vi.spyOn(fileProcessor, 'extractTextFromTXT').mockResolvedValue(mdText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(mdText);
        expect(fileProcessor.extractTextFromTXT).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromTXT for .html files', async () => {
        const fileInfo = { path: 'test.html', originalName: 'document.html' };
        vi.mocked(path.extname).mockReturnValue('.html');
        const htmlText = 'HTML Content';
        vi.spyOn(fileProcessor, 'extractTextFromTXT').mockResolvedValue(htmlText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(htmlText);
        expect(fileProcessor.extractTextFromTXT).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromTXT for .json files', async () => {
        const fileInfo = { path: 'test.json', originalName: 'document.json' };
        vi.mocked(path.extname).mockReturnValue('.json');
        const jsonText = 'JSON Content';
        vi.spyOn(fileProcessor, 'extractTextFromTXT').mockResolvedValue(jsonText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(jsonText);
        expect(fileProcessor.extractTextFromTXT).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromTXT for .csv files', async () => {
        const fileInfo = { path: 'test.csv', originalName: 'document.csv' };
        vi.mocked(path.extname).mockReturnValue('.csv');
        const csvText = 'CSV Content';
        vi.spyOn(fileProcessor, 'extractTextFromTXT').mockResolvedValue(csvText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(csvText);
        expect(fileProcessor.extractTextFromTXT).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should call extractTextFromXLSX for .xlsx files', async () => {
        const fileInfo = { path: 'test.xlsx', originalName: 'document.xlsx' };
        vi.mocked(path.extname).mockReturnValue('.xlsx');
        const xlsxText = 'XLSX Content';
        vi.spyOn(fileProcessor, 'extractTextFromXLSX').mockResolvedValue(xlsxText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(xlsxText);
        expect(fileProcessor.extractTextFromXLSX).toHaveBeenCalledWith(fileInfo.path);
      });

      it('should throw ApiError for unsupported file formats', async () => {
        const fileInfo = { path: 'test.zip', originalName: 'document.zip' };
        vi.mocked(path.extname).mockReturnValue('.zip');

        await expect(fileProcessor.extractTextFromFile(fileInfo)).rejects.toThrow(mockApiError);
        expect(mockApiError).toHaveBeenCalledWith(httpStatus.BAD_REQUEST, mockTranslationConstants.ERROR_MESSAGES.UNSUPPORTED_FORMAT);
        expect(mockLogger.error).toHaveBeenCalledWith('Error in extractTextFromFile:', expect.any(Error));
      });

      it('should re-throw error from sub-extraction functions', async () => {
        const fileInfo = { path: 'test.pdf', originalName: 'document.pdf' };
        vi.mocked(path.extname).mockReturnValue('.pdf');
        const extractionError = new Error('PDF extraction failed');
        vi.spyOn(fileProcessor, 'extractTextFromPDF').mockRejectedValue(extractionError);

        await expect(fileProcessor.extractTextFromFile(fileInfo)).rejects.toThrow(extractionError);
        expect(mockLogger.error).toHaveBeenCalledWith('Error in extractTextFromFile:', extractionError);
      });

      it('should handle fileInfo.originalname fallback', async () => {
        const fileInfo = { path: 'test.txt', originalname: 'document_old.txt' }; // Note: originalname instead of originalName
        vi.mocked(path.extname).mockReturnValue('.txt');
        const txtText = 'TXT Content';
        vi.spyOn(fileProcessor, 'extractTextFromTXT').mockResolvedValue(txtText);

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe(txtText);
        expect(fileProcessor.extractTextFromTXT).toHaveBeenCalledWith(fileInfo.path);
        expect(mockLogger.info).toHaveBeenCalledWith(`Extracting text from file: ${fileInfo.originalname} (.txt)`);
      });
    });

    describe('cleanupFile', () => {
      it('should delete the file if it exists', async () => {
        const filePath = '/tmp/temp_file.txt';
        mockFsSync.existsSync.mockReturnValue(true);
        mockFsPromises.unlink.mockResolvedValue(undefined);

        await fileProcessor.cleanupFile(filePath);

        expect(mockFsSync.existsSync).toHaveBeenCalledWith(filePath);
        expect(mockFsPromises.unlink).toHaveBeenCalledWith(filePath);
        expect(mockLogger.info).toHaveBeenCalledWith(`Cleaned up temporary file: ${filePath}`);
      });

      it('should do nothing if the file does not exist', async () => {
        const filePath = '/tmp/non_existent_file.txt';
        mockFsSync.existsSync.mockReturnValue(false);

        await fileProcessor.cleanupFile(filePath);

        expect(mockFsSync.existsSync).toHaveBeenCalledWith(filePath);
        expect(mockFsPromises.unlink).not.toHaveBeenCalled();
        expect(mockLogger.info).not.toHaveBeenCalled();
      });

      it('should log a warning if file cleanup fails', async () => {
        const filePath = '/tmp/temp_file.txt';
        const cleanupError = new Error('Permission denied');
        mockFsSync.existsSync.mockReturnValue(true);
        mockFsPromises.unlink.mockRejectedValue(cleanupError);

        await fileProcessor.cleanupFile(filePath);

        expect(mockFsSync.existsSync).toHaveBeenCalledWith(filePath);
        expect(mockFsPromises.unlink).toHaveBeenCalledWith(filePath);
        expect(mockLogger.warn).toHaveBeenCalledWith(`Failed to cleanup file ${filePath}:`, cleanupError);
      });
    });

    describe('getMimeType', () => {
      it('should return correct MIME type for PDF', () => {
        expect(fileProcessor.getMimeType('document.pdf')).toBe('application/pdf');
      });

      it('should return correct MIME type for DOCX', () => {
        expect(fileProcessor.getMimeType('document.docx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      });

      it('should return correct MIME type for DOC', () => {
        expect(fileProcessor.getMimeType('document.doc')).toBe('application/msword');
      });

      it('should return correct MIME type for TXT', () => {
        expect(fileProcessor.getMimeType('document.txt')).toBe('text/plain');
      });

      it('should return correct MIME type for MD', () => {
        expect(fileProcessor.getMimeType('document.md')).toBe('text/markdown');
      });

      it('should return correct MIME type for HTML', () => {
        expect(fileProcessor.getMimeType('document.html')).toBe('text/html');
      });

      it('should return correct MIME type for JSON', () => {
        expect(fileProcessor.getMimeType('document.json')).toBe('application/json');
      });

      it('should return correct MIME type for CSV', () => {
        expect(fileProcessor.getMimeType('document.csv')).toBe('text/csv');
      });

      it('should return correct MIME type for XLSX', () => {
        expect(fileProcessor.getMimeType('document.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      });

      it('should return correct MIME type for XLS', () => {
        expect(fileProcessor.getMimeType('document.xls')).toBe('application/vnd.ms-excel');
      });

      it('should return application/octet-stream for unknown extensions', () => {
        expect(fileProcessor.getMimeType('document.xyz')).toBe('application/octet-stream');
        expect(fileProcessor.getMimeType('document')).toBe('application/octet-stream');
      });

      it('should handle case insensitivity for extensions', () => {
        expect(fileProcessor.getMimeType('document.PDF')).toBe('application/pdf');
        expect(fileProcessor.getMimeType('document.DoCx')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      });
    });
  });


  // ============================================
  // GOOGLE CLOUD STORAGE FUNCTIONS
  // ============================================

  describe('GCS Configured Scenario', () => {
    beforeEach(async () => {
      vi.stubEnv('GCS_KEY_FILE', '/path/to/key.json');
      vi.stubEnv('GCP_PROJECT_ID', 'test-project');
      vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket');
      mockFsSync.existsSync.mockReturnValue(true); // Key file exists

      // Import the module under test AFTER setting up the environment and mocks
      // This import will trigger the module-level GCS initialization with configured values.
      const module = await import('../fileProcessor.js');
      fileProcessor = module.fileProcessor;
    });

    it('should upload file to GCS and return signed URL when GCS is configured', async () => {
      const localFilePath = '/tmp/local/file.pdf';
      const filename = 'document.pdf';
      const documentMetadata = {
        userId: 'user123',
        documentType: 'translation',
        originalName: 'original.pdf',
        targetLanguage: 'es',
        sourceLanguage: 'en',
      };

      const result = await fileProcessor.uploadToGCS(localFilePath, filename, documentMetadata);

      expect(mockStorageConstructor).toHaveBeenCalledTimes(1);
      expect(mockStorageConstructor).toHaveBeenCalledWith({
        keyFilename: '/path/to/key.json',
        projectId: 'test-project',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');

      expect(mockBucket.upload).toHaveBeenCalledTimes(1);
      const uploadArgs = mockBucket.upload.mock.calls[0];
      expect(uploadArgs[0]).toBe(localFilePath);
      expect(uploadArgs[1].destination).toMatch(new RegExp(`^${mockTranslationConstants.STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId}/\\d+_document.pdf$`));
      expect(uploadArgs[1].metadata.contentType).toBe('application/pdf');
      expect(uploadArgs[1].metadata.metadata).toEqual(expect.objectContaining({
        documentType: documentMetadata.documentType,
        userId: documentMetadata.userId,
        originalName: documentMetadata.originalName,
        targetLanguage: documentMetadata.targetLanguage,
        sourceLanguage: documentMetadata.sourceLanguage,
      }));

      expect(mockBucket.file).toHaveBeenCalledWith(uploadArgs[1].destination);
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
        version: 'v4',
        action: 'read',
        expires: expect.any(Number),
      }));

      expect(result).toEqual(expect.objectContaining({
        success: true,
        gcsPath: `gs://test-bucket/${uploadArgs[1].destination}`,
        publicUrl: 'http://signed.url',
        fileName: filename,
        destination: uploadArgs[1].destination,
        storageType: 'gcs',
      }));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Uploading translation file to GCS:'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Translation file uploaded successfully to GCS:'));
    });

    it('should handle upload errors gracefully and return local path fallback', async () => {
      const localFilePath = '/tmp/local/file.pdf';
      const filename = 'document.pdf';
      const documentMetadata = { userId: 'user123' };
      const uploadError = new Error('GCS upload failed');
      mockBucket.upload.mockRejectedValue(uploadError);

      const result = await fileProcessor.uploadToGCS(localFilePath, filename, documentMetadata);

      expect(mockBucket.upload).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Error uploading translation file to GCS:', uploadError);
      expect(result).toEqual({
        success: true, // Note: success is true even on error, as it provides a fallback
        localPath: localFilePath,
        fileName: filename,
        storageType: 'local',
        error: uploadError.message,
      });
    });

    it('should download file from GCS successfully', async () => {
      const gcsPath = 'gs://test-bucket/translation-uploads/user123/12345_document.pdf';
      const tempLocalPath = '/tmp/downloaded_file.pdf';

      const result = await fileProcessor.downloadFromGCS(gcsPath, tempLocalPath);

      expect(mockBucket.file).toHaveBeenCalledWith('translation-uploads/user123/12345_document.pdf');
      expect(mockFile.download).toHaveBeenCalledWith({ destination: tempLocalPath });
      expect(result).toEqual({ success: true, localPath: tempLocalPath });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Downloading file from GCS:'));
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('File downloaded successfully from GCS to:'));
    });

    it('should throw ApiError if GCS download fails', async () => {
      const gcsPath = 'gs://test-bucket/bad/path.pdf';
      const tempLocalPath = '/tmp/downloaded_file.pdf';
      const downloadError = new Error('GCS download error');
      mockFile.download.mockRejectedValue(downloadError);

      await expect(fileProcessor.downloadFromGCS(gcsPath, tempLocalPath)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to download file from GCS');
      expect(mockLogger.error).toHaveBeenCalledWith('Error downloading file from GCS:', downloadError);
    });

    it('should delete file from GCS successfully', async () => {
      const gcsPath = 'gs://test-bucket/translation-uploads/user123/12345_document.pdf';

      const result = await fileProcessor.deleteFromGCS(gcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith('translation-uploads/user123/12345_document.pdf');
      expect(mockFile.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, message: 'File deleted successfully from GCS' });
      expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('Translation file deleted from GCS:'));
    });

    it('should return failure message if GCS delete fails', async () => {
      const gcsPath = 'gs://test-bucket/bad/path.pdf';
      const deleteError = new Error('GCS delete error');
      mockFile.delete.mockRejectedValue(deleteError);

      const result = await fileProcessor.deleteFromGCS(gcsPath);

      expect(mockFile.delete).toHaveBeenCalledTimes(1);
      expect(mockLogger.error).toHaveBeenCalledWith('Error deleting translation file from GCS:', deleteError);
      expect(result).toEqual({ success: false, message: deleteError.message });
    });
  });

  describe('GCS Not Configured Scenario', () => {
    beforeEach(async () => {
      vi.stubEnv('GCS_KEY_FILE', ''); // No key file
      vi.stubEnv('GCP_PROJECT_ID', ''); // No project ID
      vi.stubEnv('GCS_BUCKET_NAME', ''); // No bucket name
      mockFsSync.existsSync.mockReturnValue(false); // Key file does not exist

      // Import the module under test AFTER setting up the environment and mocks
      // This import will trigger the module-level GCS initialization with unconfigured values.
      const module = await import('../fileProcessor.js');
      fileProcessor = module.fileProcessor;
    });

    it('should return local path info for upload if GCS is not configured', async () => {
      const localFilePath = '/tmp/local/file.pdf';
      const filename = 'document.pdf';
      const documentMetadata = { userId: 'user123' };

      const result = await fileProcessor.uploadToGCS(localFilePath, filename, documentMetadata);

      expect(mockStorageConstructor).not.toHaveBeenCalled(); // Storage should not be initialized
      expect(mockLogger.warn).toHaveBeenCalledWith('GCS credentials not configured. Translation file uploads will be stored locally only.');
      expect(mockLogger.warn).toHaveBeenCalledWith('GCS not configured. Returning local file path.');
      expect(result).toEqual({
        success: true,
        localPath: localFilePath,
        fileName: filename,
        storageType: 'local',
      });
    });

    it('should throw ApiError for download if GCS is not configured', async () => {
      const gcsPath = 'gs://test-bucket/path.pdf';
      const tempLocalPath = '/tmp/downloaded_file.pdf';

      await expect(fileProcessor.downloadFromGCS(gcsPath, tempLocalPath)).rejects.toThrow(mockApiError);
      expect(mockApiError).toHaveBeenCalledWith(httpStatus.INTERNAL_SERVER_ERROR, 'GCS not configured');
      expect(mockLogger.error).toHaveBeenCalledWith('Error downloading file from GCS:', expect.any(Error));
    });

    it('should return failure message for delete if GCS is not configured', async () => {
      const gcsPath = 'gs://test-bucket/path.pdf';

      const result = await fileProcessor.deleteFromGCS(gcsPath);

      expect(mockLogger.warn).toHaveBeenCalledWith('GCS not configured. Cannot delete from GCS.');
      expect(result).toEqual({ success: false, message: 'GCS not configured' });
    });
  });
});