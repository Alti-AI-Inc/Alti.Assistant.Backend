import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { Writable } from 'stream';

// Mock dependencies
const mockStream = new Writable();
mockStream.on = vi.fn();
mockStream.end = vi.fn().mockImplementation((buffer, cb) => {
  if (mockStream._shouldError) {
    mockStream.emit('error', new Error('Stream Error'));
  } else {
    mockStream.emit('finish');
  }
  if (cb) cb();
});

const mockFile = {
  createWriteStream: vi.fn().mockImplementation(() => mockStream),
  getSignedUrl: vi.fn(),
};

const mockBucket = {
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

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: vi.fn().mockResolvedValue({ text: 'mock pdf text' }),
  })),
}));

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn(),
  },
}));

vi.mock('xlsx', () => ({
  default: {
    read: vi.fn().mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: {
        Sheet1: { A1: { t: 's', v: 'mock excel text' } },
      },
    }),
    utils: {
      sheet_to_txt: vi.fn().mockReturnValue('mock excel text'),
    },
  },
}));

vi.mock('../../../../shared/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Dynamically import the module to be tested after mocks are set up
const { fileProcessor } = await import('./fileProcessor.js');
const {
  uploadBufferToGCS,
  getSignedUrlForGcsFile,
  processFile,
  validateFile,
} = fileProcessor;
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import xlsx from 'xlsx';

describe('fileProcessor Service', () => {
  const originalGcsBucketName = process.env.GCS_BUCKET_NAME;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T00:00:00.000Z'));
    process.env.GCS_BUCKET_NAME = 'test-bucket';
    mockStream._shouldError = false;
  });

  afterEach(() => {
    vi.useRealTimers();
    process.env.GCS_BUCKET_NAME = originalGcsBucketName;
  });

  describe('uploadBufferToGCS', () => {
    const mockFileObject = {
      buffer: Buffer.from('test data'),
      originalname: 'test.txt',
      mimetype: 'text/plain',
    };

    it('should throw an error if GCS_BUCKET_NAME is not configured', async () => {
      delete process.env.GCS_BUCKET_NAME;
      await expect(uploadBufferToGCS(mockFileObject)).rejects.toThrow(
        'GCS bucket name is not configured for upload.'
      );
    });

    it('should successfully upload a file and resolve with the GCS URI', async () => {
      const promise = uploadBufferToGCS(mockFileObject);
      mockStream.emit('finish');
      const gcsUri = await promise;

      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      const expectedDestination = `uploads/1672531200000-test.txt`;
      expect(mockBucket.file).toHaveBeenCalledWith(expectedDestination);
      expect(mockFile.createWriteStream).toHaveBeenCalledWith({
        metadata: { contentType: 'text/plain' },
        resumable: false,
      });
      expect(mockStream.end).toHaveBeenCalledWith(mockFileObject.buffer);
      expect(gcsUri).toBe(`gs://test-bucket/${expectedDestination}`);
    });

    it('should reject with an error if the GCS stream fails', async () => {
      const promise = uploadBufferToGCS(mockFileObject);
      const error = new Error('GCS stream failed');
      mockStream.emit('error', error);

      await expect(promise).rejects.toThrow(
        'Failed to upload file to Cloud Storage.'
      );
    });
  });

  describe('getSignedUrlForGcsFile', () => {
    it('should generate and return a signed URL for a valid GCS URI', async () => {
      const gcsUri = 'gs://test-bucket/uploads/file.pdf';
      const expectedUrl = 'https://signed-url.com/file.pdf';
      mockFile.getSignedUrl.mockResolvedValue([expectedUrl]);

      const url = await getSignedUrlForGcsFile(gcsUri, 30);

      expect(mockStorage.bucket).toHaveBeenCalledWith('test-bucket');
      expect(mockBucket.file).toHaveBeenCalledWith('uploads/file.pdf');
      expect(mockFile.getSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: Date.now() + 30 * 60 * 1000,
      });
      expect(url).toBe(expectedUrl);
    });

    it('should use a default duration of 15 minutes if not provided', async () => {
      const gcsUri = 'gs://test-bucket/uploads/file.pdf';
      await getSignedUrlForGcsFile(gcsUri);

      expect(mockFile.getSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          expires: Date.now() + 15 * 60 * 1000,
        })
      );
    });

    it('should throw an error for an invalid GCS URI format', async () => {
      const invalidUri = 'http://not-a-gcs-uri.com';
      await expect(getSignedUrlForGcsFile(invalidUri)).rejects.toThrow(
        'Invalid GCS URI format. Expected gs://<bucket-name>/<file-path>.'
      );
    });

    it('should throw a generic error if the GCS SDK fails', async () => {
      const gcsUri = 'gs://test-bucket/uploads/file.pdf';
      mockFile.getSignedUrl.mockRejectedValue(new Error('GCS SDK Error'));

      await expect(getSignedUrlForGcsFile(gcsUri)).rejects.toThrow(
        'Could not generate signed URL for the file.'
      );
    });
  });

  describe('processFile', () => {
    const fileMocks = {
      pdf: {
        buffer: Buffer.from('pdf data'),
        originalname: 'document.pdf',
        mimetype: 'application/pdf',
      },
      docx: {
        buffer: Buffer.from('docx data'),
        originalname: 'document.docx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
      txt: {
        buffer: Buffer.from('txt data'),
        originalname: 'document.txt',
        mimetype: 'text/plain',
      },
      xlsx: {
        buffer: Buffer.from('xlsx data'),
        originalname: 'spreadsheet.xlsx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      },
      pptx: {
        buffer: Buffer.from('pptx data'),
        originalname: 'presentation.pptx',
        mimetype:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      },
      unsupported: {
        buffer: Buffer.from('unsupported data'),
        originalname: 'archive.zip',
        mimetype: 'application/zip',
      },
    };

    it('should process a PDF file, extract text, and upload to GCS', async () => {
      const promise = processFile(fileMocks.pdf);
      mockStream.emit('finish');
      const result = await promise;

      expect(PDFParse).toHaveBeenCalledWith({ data: fileMocks.pdf.buffer });
      expect(result.extractedText).toBe('mock pdf text');
      expect(result.gcsUri).toContain('gs://test-bucket/uploads/');
    });

    it('should process a DOCX file, extract text, and upload to GCS', async () => {
      mammoth.extractRawText.mockResolvedValue({ value: 'mock docx text' });
      const promise = processFile(fileMocks.docx);
      mockStream.emit('finish');
      const result = await promise;

      expect(mammoth.extractRawText).toHaveBeenCalledWith({
        buffer: fileMocks.docx.buffer,
      });
      expect(result.extractedText).toBe('mock docx text');
      expect(result.gcsUri).toContain('gs://test-bucket/uploads/');
    });

    it('should process a TXT file, extract text, and upload to GCS', async () => {
      const promise = processFile(fileMocks.txt);
      mockStream.emit('finish');
      const result = await promise;

      expect(result.extractedText).toBe('txt data');
      expect(result.gcsUri).toContain('gs://test-bucket/uploads/');
    });

    it('should process an XLSX file, extract text, and upload to GCS', async () => {
      const promise = processFile(fileMocks.xlsx);
      mockStream.emit('finish');
      const result = await promise;

      expect(xlsx.read).toHaveBeenCalledWith(fileMocks.xlsx.buffer, {
        type: 'buffer',
      });
      expect(xlsx.utils.sheet_to_txt).toHaveBeenCalled();
      expect(result.extractedText).toBe(
        '--- Sheet: Sheet1 ---\nmock excel text'
      );
      expect(result.gcsUri).toContain('gs://test-bucket/uploads/');
    });

    it('should process a PPTX file, extract text, and upload to GCS', async () => {
      mammoth.extractRawText.mockResolvedValue({ value: 'mock pptx text' });
      const promise = processFile(fileMocks.pptx);
      mockStream.emit('finish');
      const result = await promise;

      expect(mammoth.extractRawText).toHaveBeenCalledWith({
        buffer: fileMocks.pptx.buffer,
      });
      expect(result.extractedText).toBe('mock pptx text');
      expect(result.gcsUri).toContain('gs://test-bucket/uploads/');
    });

    it('should process a file and skip upload if GCS_BUCKET_NAME is not set', async () => {
      delete process.env.GCS_BUCKET_NAME;
      const result = await processFile(fileMocks.txt);

      expect(result.extractedText).toBe('txt data');
      expect(result.gcsUri).toBeNull();
      expect(mockStorage.bucket).not.toHaveBeenCalled();
    });

    it('should throw an error for an unsupported file type', async () => {
      await expect(processFile(fileMocks.unsupported)).rejects.toThrow(
        'Unsupported file type: .zip'
      );
    });

    it('should throw an error if file or buffer is missing', async () => {
      await expect(processFile(null)).rejects.toThrow(
        'Invalid file information: buffer is missing.'
      );
      await expect(processFile({ originalname: 'test.txt' })).rejects.toThrow(
        'Invalid file information: buffer is missing.'
      );
    });

    it('should propagate errors from text extraction', async () => {
      mammoth.extractRawText.mockRejectedValue(new Error('Extraction failed'));
      await expect(processFile(fileMocks.docx)).rejects.toThrow(
        'Extraction failed'
      );
    });

    it('should propagate errors from GCS upload', async () => {
      const promise = processFile(fileMocks.txt);
      mockStream.emit('error', new Error('GCS upload failed'));
      await expect(promise).rejects.toThrow(
        'Failed to upload file to Cloud Storage.'
      );
    });
  });

  describe('validateFile', () => {
    const maxSize = 10 * 1024 * 1024; // 10MB

    it('should return valid for a file within the size limit', () => {
      const fileInfo = { size: 5 * 1024 * 1024 }; // 5MB
      const result = validateFile(fileInfo, maxSize);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for a file exceeding the size limit', () => {
      const fileInfo = { size: 15 * 1024 * 1024 }; // 15MB
      const result = validateFile(fileInfo, maxSize);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('File size exceeds maximum limit of 10MB');
    });

    it('should return invalid if no file is provided', () => {
      const result = validateFile(null, maxSize);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('No file provided');
    });
  });

  describe('Individual Text Extractors', () => {
    it('extractTextFromPPTX should return fallback message on error', async () => {
      mammoth.extractRawText.mockRejectedValue(new Error('PPTX parse error'));
      const result = await fileProcessor.extractTextFromPPTX(
        Buffer.from('bad pptx')
      );
      expect(result).toBe(
        'Unable to extract text from PowerPoint file. Please export as PDF for analysis.'
      );
    });

    it('extractTextFromPPTX should return fallback message if text is empty', async () => {
      mammoth.extractRawText.mockResolvedValue({ value: '' });
      const result = await fileProcessor.extractTextFromPPTX(
        Buffer.from('empty pptx')
      );
      expect(result).toBe(
        'Unable to extract text from PowerPoint file. Please use PDF export for better results.'
      );
    });
  });
});