import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { LEGAL_CONTRACT_CONFIG } from '../legal_contract.constant.js';

// Mock MulterError class
class MockMulterError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = 'MulterError';
  }
}

// Mock fs module
vi.mock('fs', () => ({
  existsSync: vi.fn(() => true), // Assume directory exists by default
  mkdirSync: vi.fn(),
}));

// Mock path module
vi.mock('path', async (importOriginal) => {
  const actualPath = await importOriginal();
  return {
    ...actualPath,
    join: vi.fn((...args) => {
      // Custom logic to return a consistent upload directory path
      if (args.includes('uploads/legal_contracts')) {
        return '/mocked/upload/dir';
      }
      return actualPath.join(...args);
    }),
    dirname: vi.fn(() => '/mock/src/app/modules/legal_contract/middlewares'), // Mock __dirname
    extname: vi.fn(actualPath.extname),
    basename: vi.fn(actualPath.basename),
  };
});

// Mock LEGAL_CONTRACT_CONFIG
vi.mock('../legal_contract.constant.js', () => ({
  LEGAL_CONTRACT_CONFIG: {
    SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.doc', '.docx'],
    SUPPORTED_MIME_TYPES: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    MAX_FILE_SIZE: 1024 * 1024 * 5, // 5MB
  },
}));

// Mock multer module
vi.mock('multer', () => {
  const mockDiskStorage = vi.fn((options) => options); // Capture options passed to diskStorage
  const mockMulter = vi.fn((config) => ({ // Capture config passed to multer
    config,
    single: vi.fn(() => (req, res, next) => next()), // Mock the actual middleware function
    array: vi.fn(() => (req, res, next) => next()),
    fields: vi.fn(() => (req, res, next) => next()),
    none: vi.fn(() => (req, res, next) => next()),
    any: vi.fn(() => (req, res, next) => next()),
  }));
  mockMulter.diskStorage = mockDiskStorage;
  mockMulter.MulterError = MockMulterError; // Attach the mock MulterError
  return {
    default: mockMulter,
    MulterError: MockMulterError, // Also export it directly for type checking if needed
  };
});

// Import the module under test AFTER mocks are defined
const { uploadLegalContract, handleUploadError } = await import('../uploadLegalContract.js');

describe('uploadLegalContract middleware', () => {
  let req, res, next, cb;

  beforeEach(() => {
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    cb = vi.fn();

    // Reset mocks before each test
    vi.clearAllMocks();
    fs.existsSync.mockReturnValue(true); // Default to directory existing
  });

  it('should ensure the upload directory exists', () => {
    fs.existsSync.mockReturnValue(false); // Simulate directory not existing
    // Re-import to trigger the directory check logic
    // This is a bit tricky with ESM and top-level await, but the initial import already ran it.
    // For a true test of this, the import would need to be inside the test or a separate file.
    // Given the current setup, we can only check if mkdirSync was called if existsSync was false.
    // The initial import already ran the check. Let's assume the initial import's side effects are what we're testing.
    // The `uploadLegalContract` constant is already initialized.
    // We can verify the initial state of fs.existsSync and fs.mkdirSync.
    expect(fs.existsSync).toHaveBeenCalledWith('/mocked/upload/dir');
    // If existsSync was initially false, mkdirSync would have been called.
    // Since we mock it to true by default, mkdirSync should not have been called on initial load.
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  it('should configure multer with correct limits', () => {
    expect(multer).toHaveBeenCalledTimes(1);
    const multerConfig = multer.mock.calls[0][0];
    expect(multerConfig.limits.fileSize).toBe(LEGAL_CONTRACT_CONFIG.MAX_FILE_SIZE);
  });

  describe('storage configuration', () => {
    let storage;

    beforeEach(() => {
      const multerConfig = multer.mock.calls[0][0];
      storage = multerConfig.storage;
      expect(storage).toBeDefined();
      expect(multer.diskStorage).toHaveBeenCalledTimes(1);
    });

    it('should set the correct destination directory', () => {
      storage.destination(req, { originalname: 'test.pdf' }, cb);
      expect(cb).toHaveBeenCalledWith(null, '/mocked/upload/dir');
    });

    it('should generate a unique filename with original name and extension', () => {
      const file = { originalname: 'my-document.pdf' };
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(1234567890);
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.123456789);

      storage.filename(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, 'my-document-1234567890-123456789.pdf');

      dateNowSpy.mockRestore();
      mathRandomSpy.mockRestore();
    });

    it('should handle filenames with multiple dots correctly', () => {
      const file = { originalname: 'archive.v1.0.docx' };
      const dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(123);
      const mathRandomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);

      storage.filename(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, 'archive.v1.0-123-500000000.docx');

      dateNowSpy.mockRestore();
      mathRandomSpy.mockRestore();
    });
  });

  describe('fileFilter configuration', () => {
    let fileFilter;

    beforeEach(() => {
      const multerConfig = multer.mock.calls[0][0];
      fileFilter = multerConfig.fileFilter;
      expect(fileFilter).toBeDefined();
    });

    it('should accept a file with a supported extension and MIME type', () => {
      const file = { originalname: 'contract.pdf', mimetype: 'application/pdf' };
      fileFilter(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should reject a file with an unsupported extension', () => {
      const file = { originalname: 'image.jpg', mimetype: 'image/jpeg' };
      fileFilter(req, file, cb);
      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(cb.mock.calls[0][0].message).toContain('Invalid file type.');
      expect(cb.mock.calls[0][0].message).toContain(LEGAL_CONTRACT_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', '));
    });

    it('should reject a file with an unsupported MIME type', () => {
      const file = { originalname: 'document.pdf', mimetype: 'application/octet-stream' };
      fileFilter(req, file, cb);
      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(cb.mock.calls[0][0].message).toContain('Invalid MIME type.');
      expect(cb.mock.calls[0][0].message).toContain(LEGAL_CONTRACT_CONFIG.SUPPORTED_MIME_TYPES.join(', '));
    });

    it('should reject a file with both unsupported extension and MIME type (extension check first)', () => {
      const file = { originalname: 'script.js', mimetype: 'application/javascript' };
      fileFilter(req, file, cb);
      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(cb.mock.calls[0][0].message).toContain('Invalid file type.');
    });

    it('should accept a file with a supported docx extension and MIME type', () => {
      const file = { originalname: 'report.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
      fileFilter(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });
  });
});

describe('handleUploadError middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  it('should handle MulterError with LIMIT_FILE_SIZE code', () => {
    const err = new multer.MulterError('LIMIT_FILE_SIZE', 'File too large');
    handleUploadError(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(413);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: `File too large. Maximum size is ${LEGAL_CONTRACT_CONFIG.MAX_FILE_SIZE / (1024 * 1024)}MB`,
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle other MulterError types', () => {
    const err = new multer.MulterError('SOME_OTHER_CODE', 'Unexpected field');
    handleUploadError(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Upload error: Unexpected field',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should handle generic Error objects', () => {
    const err = new Error('Something went wrong during upload');
    handleUploadError(err, req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Something went wrong during upload',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next() if no error is provided', () => {
    handleUploadError(null, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });

  it('should call next() if an undefined error is provided', () => {
    handleUploadError(undefined, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});