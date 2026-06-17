import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';

// Define and export all mock dependencies via vi.hoisted
const {
  mockFsPromises,
  mockFsSync,
  mockStorageConstructor,
  mockStorage,
  mockBucket,
  mockFile,
  mockWriteStream,
  mockMammoth,
  mockPdfParseConstructor,
  mockXLSX,
  mockLogger,
  mockApiError,
  mockTranslationConstants,
  mockExtname
} = vi.hoisted(() => {
  // Mock fs/promises
  const mockFsPromises = {
    readFile: vi.fn(),
    unlink: vi.fn(),
  };

  // Mock fs (sync)
  const mockFsSync = {
    existsSync: vi.fn(),
  };

  // Mock write stream
  const mockWriteStream = {
    on: vi.fn().mockImplementation(function(event, callback) {
      if (event === 'finish') {
        this._finishCallback = callback;
      } else if (event === 'error') {
        this._errorCallback = callback;
      }
      return this;
    }),
    end: vi.fn().mockImplementation(function(buffer) {
      if (this._shouldFail) {
        if (this._errorCallback) this._errorCallback(new Error('Stream error'));
      } else {
        if (this._finishCallback) this._finishCallback();
      }
    })
  };

  // Mock file
  const mockFile = {
    getSignedUrl: vi.fn(),
    download: vi.fn(),
    delete: vi.fn(),
    createWriteStream: vi.fn().mockImplementation(() => mockWriteStream),
  };

  // Mock bucket
  const mockBucket = {
    upload: vi.fn(),
    file: vi.fn().mockImplementation(() => mockFile),
  };

  // Mock storage
  const mockStorage = {
    bucket: vi.fn().mockImplementation(() => mockBucket),
  };

  // Simulate Google Cloud Storage client behavior where calling new Storage() 
  // without config throws a credentials error if local environment variables are not set.
  const mockStorageConstructor = vi.fn().mockImplementation(function(config) {
    if (!config && !process.env.GCS_KEY_FILE && !process.env.GCP_PROJECT_ID) {
      throw new Error('Could not load the default credentials.');
    }
    return mockStorage;
  });

  // Mock mammoth
  const mockMammoth = {
    extractRawText: vi.fn(),
  };

  // Mock pdf-parse
  const mockPdfParseInstance = {
    getText: vi.fn(),
  };
  const mockPdfParseConstructor = vi.fn().mockImplementation(function() {
    return mockPdfParseInstance;
  });

  // Mock xlsx (dynamic import)
  const mockXLSX = {
    readFile: vi.fn(),
    read: vi.fn(),
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
  const mockApiError = vi.fn().mockImplementation(function(status, message) {
    const error = new Error(message);
    error.statusCode = status;
    Object.setPrototypeOf(error, mockApiError.prototype);
    return error;
  });
  Object.setPrototypeOf(mockApiError.prototype, Error.prototype);

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

  // Mock path.extname
  const mockExtname = vi.fn();

  return {
    mockFsPromises,
    mockFsSync,
    mockStorageConstructor,
    mockStorage,
    mockBucket,
    mockFile,
    mockWriteStream,
    mockMammoth,
    mockPdfParseConstructor,
    mockXLSX,
    mockLogger,
    mockApiError,
    mockTranslationConstants,
    mockExtname
  };
});

vi.mock('fs/promises', () => mockFsPromises);
vi.mock('fs', () => mockFsSync);

// Mock path (only extname is used, default to actual behavior)
vi.mock('path', async (importActual) => {
  const actual = await importActual();
  return {
    default: {
      ...actual,
      extname: mockExtname,
    },
    ...actual,
    extname: mockExtname,
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorageConstructor,
}));

vi.mock('mammoth', () => ({
  default: mockMammoth,
}));

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

    // Default mocks for GCS functions - use mockImplementation for constructor mocks
    mockStorageConstructor.mockImplementation(function(config) {
      if (!config && !process.env.GCS_KEY_FILE && !process.env.GCP_PROJECT_ID) {
        throw new Error('Could not load the default credentials.');
      }
      return mockStorage;
    });
    mockStorage.bucket.mockReturnValue(mockBucket);
    mockBucket.file.mockReturnValue(mockFile);
    mockFile.getSignedUrl.mockResolvedValue(['http://signed.url']);
    mockFile.download.mockResolvedValue([Buffer.from('downloaded content')]);
    mockFile.delete.mockResolvedValue(undefined);
    mockBucket.upload.mockResolvedValue(undefined);
    
    // Reset write stream mock state
    mockWriteStream._shouldFail = false;
    mockWriteStream._finishCallback = null;
    mockWriteStream._errorCallback = null;

    // Default mocks for text extraction
    mockFsPromises.readFile.mockResolvedValue('file content');
    mockMammoth.extractRawText.mockResolvedValue({ value: 'docx content' });
    
    // We must reset pdf parse instance mock setup using mockImplementation for Vitest constructor compatibility
    const mockPdfParseInstance = {
      getText: vi.fn().mockResolvedValue({ text: 'pdf content' }),
    };
    mockPdfParseConstructor.mockImplementation(function() {
      return mockPdfParseInstance;
    });

    // Default mocks for xlsx
    mockXLSX.read.mockReturnValue({
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

    // Default fsSync.existsSync.
    mockFsSync.existsSync.mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs(); // Clean up environment stubs
  });

  // ============================================
  // TEXT EXTRACTION FUNCTIONS & UTILITIES
  // ============================================
  describe('Text Extraction Functions and Utilities', () => {
    beforeEach(async () => {
      // Set up a default GCS configured environment for the initial module import
      vi.stubEnv('GCS_KEY_FILE', '/path/to/key.json');
      vi.stubEnv('GCP_PROJECT_ID', 'test-project');
      vi.stubEnv('GCS_BUCKET_NAME', 'test-bucket');
      mockFsSync.existsSync.mockReturnValue(true);

      // Import the module once for these tests - use v1 static path dynamic import
      const module = await import('./fileProcessor.js?v=1');
      fileProcessor = module.fileProcessor;
    });

    describe('extractTextFromPDF', () => {
      it('should extract text from a PDF buffer successfully', async () => {
        const fileBuffer = Buffer.from('pdf data');
        const mockPdfInstance = {
          getText: vi.fn().mockResolvedValue({ text: 'Extracted PDF Text' }),
        };
        mockPdfParseConstructor.mockImplementation(function() {
          return mockPdfInstance;
        });

        const result = await fileProcessor.extractTextFromPDF(fileBuffer);
        expect(result).toBe('Extracted PDF Text');
        expect(mockPdfParseConstructor).toHaveBeenCalledWith({ data: fileBuffer });
        expect(mockPdfInstance.getText).toHaveBeenCalled();
      });

      it('should throw ApiError if PDF extraction fails', async () => {
        const fileBuffer = Buffer.from('bad pdf data');
        mockPdfParseConstructor.mockImplementationOnce(function() {
          throw new Error('PDF parse error');
        });

        await expect(fileProcessor.extractTextFromPDF(fileBuffer)).rejects.toThrow('Failed to extract text from PDF');
        expect(mockLogger.error).toHaveBeenCalledWith('Error extracting text from PDF buffer:', expect.any(Error));
      });
    });

    describe('extractTextFromDOCX', () => {
      it('should extract text from a DOCX buffer successfully', async () => {
        const fileBuffer = Buffer.from('docx data');
        mockMammoth.extractRawText.mockResolvedValue({ value: 'Extracted DOCX Text' });

        const result = await fileProcessor.extractTextFromDOCX(fileBuffer);
        expect(result).toBe('Extracted DOCX Text');
        expect(mockMammoth.extractRawText).toHaveBeenCalledWith({ buffer: fileBuffer });
      });

      it('should throw ApiError if DOCX extraction fails', async () => {
        const fileBuffer = Buffer.from('bad docx');
        mockMammoth.extractRawText.mockRejectedValue(new Error('Mammoth error'));

        await expect(fileProcessor.extractTextFromDOCX(fileBuffer)).rejects.toThrow('Failed to extract text from DOCX');
        expect(mockLogger.error).toHaveBeenCalledWith('Error extracting text from DOCX buffer:', expect.any(Error));
      });
    });

    describe('extractTextFromTXT', () => {
      it('should extract text from a TXT buffer successfully', async () => {
        const fileBuffer = Buffer.from('Extracted TXT Text');

        const result = await fileProcessor.extractTextFromTXT(fileBuffer);
        expect(result).toBe('Extracted TXT Text');
      });

      it('should throw ApiError if TXT extraction fails', async () => {
        const fileBuffer = {
          toString: () => { throw new Error('toString error'); }
        };

        await expect(fileProcessor.extractTextFromTXT(fileBuffer)).rejects.toThrow('Failed to read text file');
        expect(mockLogger.error).toHaveBeenCalledWith('Error reading text file from buffer:', expect.any(Error));
      });
    });

    describe('extractTextFromXLSX', () => {
      it('should extract text from an XLSX buffer successfully', async () => {
        const fileBuffer = Buffer.from('xlsx data');
        const mockWorkbook = {
          SheetNames: ['Sheet1', 'Sheet2'],
          Sheets: {
            Sheet1: { A1: { v: 'Header1' }, B1: { v: 'Value1' } },
            Sheet2: { A1: { v: 'Header2' }, B1: { v: 'Value2' } },
          },
        };
        mockXLSX.read.mockReturnValue(mockWorkbook);
        mockXLSX.utils.sheet_to_csv
          .mockReturnValueOnce('Header1,Value1')
          .mockReturnValueOnce('Header2,Value2');

        const result = await fileProcessor.extractTextFromXLSX(fileBuffer);
        expect(result).toBe('Header1,Value1\n\nHeader2,Value2');
        expect(mockXLSX.read).toHaveBeenCalledWith(fileBuffer, { type: 'buffer' });
        expect(mockXLSX.utils.sheet_to_csv).toHaveBeenCalledTimes(2);
        expect(mockXLSX.utils.sheet_to_csv).toHaveBeenCalledWith(mockWorkbook.Sheets.Sheet1);
        expect(mockXLSX.utils.sheet_to_csv).toHaveBeenCalledWith(mockWorkbook.Sheets.Sheet2);
      });

      it('should throw ApiError if XLSX extraction fails', async () => {
        const fileBuffer = Buffer.from('bad xlsx');
        mockXLSX.read.mockImplementation(() => {
          throw new Error('XLSX read error');
        });

        await expect(fileProcessor.extractTextFromXLSX(fileBuffer)).rejects.toThrow('Failed to extract text from XLSX file');
        expect(mockLogger.error).toHaveBeenCalledWith('XLSX extraction error from buffer:', expect.any(Error));
      });
    });

    describe('extractTextFromFile', () => {
      it('should call extractTextFromPDF for .pdf files', async () => {
        const fileInfo = { buffer: Buffer.from('pdf data'), originalname: 'document.pdf' };
        mockExtname.mockReturnValue('.pdf');

        const mockPdfInstance = {
          getText: vi.fn().mockResolvedValue({ text: 'PDF Content' }),
        };
        mockPdfParseConstructor.mockImplementation(function() {
          return mockPdfInstance;
        });

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('PDF Content');
        expect(mockLogger.info).toHaveBeenCalledWith(`Extracting text from in-memory file: ${fileInfo.originalname} (.pdf)`);
        expect(mockLogger.info).toHaveBeenCalledWith(`Successfully extracted 11 characters from ${fileInfo.originalname}`);
      });

      it('should call extractTextFromDOCX for .docx files', async () => {
        const fileInfo = { buffer: Buffer.from('docx data'), originalname: 'document.docx' };
        mockExtname.mockReturnValue('.docx');
        mockMammoth.extractRawText.mockResolvedValue({ value: 'DOCX Content' });

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('DOCX Content');
      });

      it('should call extractTextFromDOCX for .doc files', async () => {
        const fileInfo = { buffer: Buffer.from('doc data'), originalname: 'document.doc' };
        mockExtname.mockReturnValue('.doc');
        mockMammoth.extractRawText.mockResolvedValue({ value: 'DOC Content' });

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('DOC Content');
      });

      it('should call extractTextFromTXT for .txt files', async () => {
        const fileInfo = { buffer: Buffer.from('TXT Content'), originalname: 'document.txt' };
        mockExtname.mockReturnValue('.txt');

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('TXT Content');
      });

      it('should call extractTextFromTXT for .md files', async () => {
        const fileInfo = { buffer: Buffer.from('MD Content'), originalname: 'document.md' };
        mockExtname.mockReturnValue('.md');

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('MD Content');
      });

      it('should call extractTextFromTXT for .html files', async () => {
        const fileInfo = { buffer: Buffer.from('HTML Content'), originalname: 'document.html' };
        mockExtname.mockReturnValue('.html');

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('HTML Content');
      });

      it('should call extractTextFromTXT for .json files', async () => {
        const fileInfo = { buffer: Buffer.from('JSON Content'), originalname: 'document.json' };
        mockExtname.mockReturnValue('.json');

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('JSON Content');
      });

      it('should call extractTextFromTXT for .csv files', async () => {
        const fileInfo = { buffer: Buffer.from('CSV Content'), originalname: 'document.csv' };
        mockExtname.mockReturnValue('.csv');

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('CSV Content');
      });

      it('should call extractTextFromXLSX for .xlsx files', async () => {
        const fileInfo = { buffer: Buffer.from('xlsx data'), originalname: 'document.xlsx' };
        mockExtname.mockReturnValue('.xlsx');
        mockXLSX.read.mockReturnValue({
          SheetNames: ['Sheet1'],
          Sheets: { Sheet1: {} }
        });
        mockXLSX.utils.sheet_to_csv.mockReturnValue('XLSX Content');

        const result = await fileProcessor.extractTextFromFile(fileInfo);
        expect(result).toBe('XLSX Content');
      });

      it('should throw ApiError for unsupported file formats', async () => {
        const fileInfo = { buffer: Buffer.from('zip data'), originalname: 'document.zip' };
        mockExtname.mockReturnValue('.zip');

        await expect(fileProcessor.extractTextFromFile(fileInfo)).rejects.toThrow('Unsupported document format.');
        expect(mockLogger.error).toHaveBeenCalledWith('Error in extractTextFromFile:', expect.any(Error));
      });

      it('should re-throw error from sub-extraction functions', async () => {
        const fileInfo = { buffer: Buffer.from('pdf data'), originalname: 'document.pdf' };
        mockExtname.mockReturnValue('.pdf');
        
        mockPdfParseConstructor.mockImplementationOnce(function() {
          throw new Error('PDF extraction failed');
        });

        await expect(fileProcessor.extractTextFromFile(fileInfo)).rejects.toThrow('Failed to extract text from PDF');
        expect(mockLogger.error).toHaveBeenCalledWith('Error in extractTextFromFile:', expect.any(Error));
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
      mockFsSync.existsSync.mockReturnValue(true);

      // Import fresh GCS configured module instance via v2 static path dynamic import
      const module = await import('./fileProcessor.js?v=2');
      fileProcessor = module.fileProcessor;
    });

    it('should generate v4 signed URL for upload', async () => {
      const filename = 'document.pdf';
      const contentType = 'application/pdf';
      const documentMetadata = {
        userId: 'user123',
        documentType: 'translation',
        originalName: 'original.pdf',
        targetLanguage: 'es',
        sourceLanguage: 'en',
      };

      const result = await fileProcessor.generateV4UploadSignedUrl(filename, contentType, documentMetadata);

      expect(mockStorageConstructor).toHaveBeenCalledWith({
        keyFilename: '/path/to/key.json',
        projectId: 'test-project',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith(expect.stringContaining(`${mockTranslationConstants.STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId}/`));
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
        version: 'v4',
        action: 'write',
        contentType: 'application/pdf',
      }));

      expect(result).toEqual(expect.objectContaining({
        success: true,
        url: 'http://signed.url',
        gcsPath: expect.stringContaining('gs://test-bucket/'),
        destination: expect.any(String),
      }));
    });

    it('should stream upload to GCS successfully', async () => {
      const fileBuffer = Buffer.from('pdf data');
      const filename = 'document.pdf';
      const documentMetadata = {
        userId: 'user123',
        documentType: 'translation',
        originalName: 'original.pdf',
        targetLanguage: 'es',
        sourceLanguage: 'en',
      };

      const result = await fileProcessor.streamUploadToGCS(fileBuffer, filename, documentMetadata);

      expect(mockStorageConstructor).toHaveBeenCalledWith({
        keyFilename: '/path/to/key.json',
        projectId: 'test-project',
      });
      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith(expect.stringContaining(`${mockTranslationConstants.STORAGE_CONFIG.UPLOAD_FOLDER}/${documentMetadata.userId}/`));
      expect(mockFile.createWriteStream).toHaveBeenCalledWith(expect.objectContaining({
        resumable: false,
        metadata: expect.objectContaining({
          contentType: 'application/pdf',
        }),
      }));
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(expect.objectContaining({
        version: 'v4',
        action: 'read',
      }));

      expect(result).toEqual(expect.objectContaining({
        success: true,
        gcsPath: expect.stringContaining('gs://test-bucket/'),
        publicUrl: 'http://signed.url',
        fileName: filename,
        storageType: 'gcs',
      }));
    });

    it('should handle stream upload GCS errors', async () => {
      const fileBuffer = Buffer.from('pdf data');
      const filename = 'document.pdf';
      const documentMetadata = { userId: 'user123' };

      mockWriteStream._shouldFail = true;

      await expect(fileProcessor.streamUploadToGCS(fileBuffer, filename, documentMetadata)).rejects.toThrow('Failed to upload file to GCS');
    });

    it('should download file from GCS successfully to buffer', async () => {
      const gcsPath = 'gs://test-bucket/translation-uploads/user123/12345_document.pdf';
      const mockBuffer = Buffer.from('gcs file content');
      mockFile.download.mockResolvedValue([mockBuffer]);

      const result = await fileProcessor.downloadFromGCSToBuffer(gcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith('translation-uploads/user123/12345_document.pdf');
      expect(mockFile.download).toHaveBeenCalledWith();
      expect(result).toEqual({ success: true, buffer: mockBuffer });
    });

    it('should throw ApiError if GCS download to buffer fails', async () => {
      const gcsPath = 'gs://test-bucket/bad/path.pdf';
      const downloadError = new Error('GCS download error');
      mockFile.download.mockRejectedValue(downloadError);

      await expect(fileProcessor.downloadFromGCSToBuffer(gcsPath)).rejects.toThrow('Failed to download file from GCS');
    });

    it('should delete file from GCS successfully', async () => {
      const gcsPath = 'gs://test-bucket/translation-uploads/user123/12345_document.pdf';

      const result = await fileProcessor.deleteFromGCS(gcsPath);

      expect(mockBucket.file).toHaveBeenCalledWith('translation-uploads/user123/12345_document.pdf');
      expect(mockFile.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: true, message: 'File deleted successfully from GCS' });
    });

    it('should return failure message if GCS delete fails', async () => {
      const gcsPath = 'gs://test-bucket/bad/path.pdf';
      const deleteError = new Error('GCS delete error');
      mockFile.delete.mockRejectedValue(deleteError);

      const result = await fileProcessor.deleteFromGCS(gcsPath);

      expect(mockFile.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ success: false, message: deleteError.message });
    });
  });

  describe('GCS Not Configured Scenario', () => {
    beforeEach(async () => {
      vi.stubEnv('GCS_KEY_FILE', '');
      vi.stubEnv('GCP_PROJECT_ID', '');
      vi.stubEnv('GCS_BUCKET_NAME', '');
      mockFsSync.existsSync.mockReturnValue(false);

      // Import unconfigured GCS module instance via v3 static path dynamic import
      const module = await import('./fileProcessor.js?v=3');
      fileProcessor = module.fileProcessor;
    });

    it('should throw ApiError for generateV4UploadSignedUrl if GCS is not configured', async () => {
      await expect(fileProcessor.generateV4UploadSignedUrl('file.pdf', 'application/pdf', { userId: '123' })).rejects.toThrow('GCS not configured');
    });

    it('should throw ApiError for streamUploadToGCS if GCS is not configured', async () => {
      await expect(fileProcessor.streamUploadToGCS(Buffer.from('pdf data'), 'file.pdf', { userId: '123' })).rejects.toThrow('GCS not configured');
    });

    it('should throw ApiError for downloadFromGCSToBuffer if GCS is not configured', async () => {
      const gcsPath = 'gs://test-bucket/path.pdf';

      await expect(fileProcessor.downloadFromGCSToBuffer(gcsPath)).rejects.toThrow('GCS not configured');
    });

    it('should return failure message for delete if GCS is not configured', async () => {
      const gcsPath = 'gs://test-bucket/path.pdf';

      const result = await fileProcessor.deleteFromGCS(gcsPath);

      expect(mockLogger.warn).toHaveBeenCalledWith('GCS not configured. Cannot delete from GCS.');
      expect(result).toEqual({ success: false, message: 'GCS not configured' });
    });
  });
});