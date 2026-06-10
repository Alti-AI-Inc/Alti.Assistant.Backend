import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  LEGAL_CONTRACT_REVIEW_CONFIG,
  STORAGE_CONFIG,
} from '../legal_contract_review.constant.js';

// Mock external modules
vi.mock('multer');
vi.mock('path');
vi.mock('fs');
vi.mock('../legal_contract_review.constant.js', () => ({
  LEGAL_CONTRACT_REVIEW_CONFIG: {
    SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.doc', '.docx'],
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  },
  STORAGE_CONFIG: {
    TEMP_FOLDER: '/tmp/uploads',
  },
}));

// Declare variables to hold the captured configurations and the module export
let storageConfig;
let fileFilterConfig;
let limitsConfig;
let mockMulterInstance;
let uploadLegalContractReviewModule;

describe('uploadLegalContractReview middleware', () => {
  beforeEach(async () => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Mock fs behavior for directory existence check
    fs.existsSync.mockReturnValue(true); // Default: directory exists
    fs.mkdirSync.mockReturnValue(undefined); // Default: mkdirSync does nothing

    // Mock multer.diskStorage to return the options object directly
    multer.diskStorage.mockImplementation((options) => options);

    // Mock the main multer function to capture its arguments
    mockMulterInstance = {
      single: vi.fn(() => (req, res, next) => next()),
      array: vi.fn(() => (req, res, next) => next()),
      fields: vi.fn(() => (req, res, next) => next()),
      any: vi.fn(() => (req, res, next) => next()),
    };
    multer.mockImplementation((config) => {
      storageConfig = config.storage;
      fileFilterConfig = config.fileFilter;
      limitsConfig = config.limits;
      return mockMulterInstance;
    });

    // Dynamically import the module under test.
    // This ensures that the module's initialization (like fs checks)
    // happens *after* our mocks are set up.
    uploadLegalContractReviewModule = await import('../uploadLegalContractReview.js');
  });

  afterEach(() => {
    // Restore all mocks after each test to ensure isolation
    vi.restoreAllMocks();
  });

  describe('Directory setup', () => {
    it('should check if the upload directory exists', () => {
      expect(fs.existsSync).toHaveBeenCalledWith(STORAGE_CONFIG.TEMP_FOLDER);
    });

    it('should not create the upload directory if it already exists', () => {
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create the upload directory if it does not exist', async () => {
      // Clear mocks and reset fs.existsSync for this specific test
      vi.clearAllMocks();
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockReturnValue(undefined); // Ensure mkdirSync is mocked

      // Re-import the module to trigger the directory check again
      // This is necessary because the directory check happens at module load time
      await import('../uploadLegalContractReview.js');

      expect(fs.existsSync).toHaveBeenCalledWith(STORAGE_CONFIG.TEMP_FOLDER);
      expect(fs.mkdirSync).toHaveBeenCalledWith(STORAGE_CONFIG.TEMP_FOLDER, { recursive: true });
    });
  });

  describe('Multer storage configuration', () => {
    it('should configure destination function correctly', (done) => {
      const req = {};
      const file = {};
      const cb = (error, destination) => {
        expect(error).toBeNull();
        expect(destination).toBe(STORAGE_CONFIG.TEMP_FOLDER);
        done();
      };
      storageConfig.destination(req, file, cb);
    });

    it('should configure filename function correctly', (done) => {
      const req = {};
      const file = { originalname: 'my-contract.pdf' };
      const cb = (error, filename) => {
        expect(error).toBeNull();
        // Expect filename to match pattern: contract-review-TIMESTAMP-RANDOMNUMBER.ext
        expect(filename).toMatch(/^contract-review-\d{13}-\d{1,9}\.pdf$/);
        done();
      };
      storageConfig.filename(req, file, cb);
    });

    it('should handle filenames with multiple dots correctly', (done) => {
      const req = {};
      const file = { originalname: 'archive.document.v1.docx' };
      const cb = (error, filename) => {
        expect(error).toBeNull();
        expect(filename).toMatch(/^contract-review-\d{13}-\d{1,9}\.docx$/);
        done();
      };
      storageConfig.filename(req, file, cb);
    });

    it('should handle filenames with no extension', (done) => {
      const req = {};
      const file = { originalname: 'document_no_ext' };
      const cb = (error, filename) => {
        expect(error).toBeNull();
        expect(filename).toMatch(/^contract-review-\d{13}-\d{1,9}$/); // No dot or extension
        done();
      };
      storageConfig.filename(req, file, cb);
    });
  });

  describe('Multer fileFilter configuration', () => {
    const mockReq = {};

    it('should allow supported file types', (done) => {
      const file = { originalname: 'document.pdf' };
      path.extname.mockReturnValueOnce('.pdf'); // Mock path.extname for this specific call
      const cb = (error, allow) => {
        expect(error).toBeNull();
        expect(allow).toBe(true);
        done();
      };
      fileFilterConfig(mockReq, file, cb);
    });

    it('should allow supported file types regardless of case', (done) => {
      const file = { originalname: 'document.DOCX' };
      path.extname.mockReturnValueOnce('.DOCX'); // Mock path.extname for this specific call
      const cb = (error, allow) => {
        expect(error).toBeNull();
        expect(allow).toBe(true);
        done();
      };
      fileFilterConfig(mockReq, file, cb);
    });

    it('should reject unsupported file types', (done) => {
      const file = { originalname: 'image.jpg' };
      path.extname.mockReturnValueOnce('.jpg'); // Mock path.extname for this specific call
      const cb = (error, allow) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('File type not supported.');
        expect(error.message).toContain(LEGAL_CONTRACT_REVIEW_CONFIG.SUPPORTED_FILE_EXTENSIONS.join(', '));
        expect(allow).toBe(false);
        done();
      };
      fileFilterConfig(mockReq, file, cb);
    });

    it('should reject files with no extension if not explicitly supported', (done) => {
      const file = { originalname: 'document_no_ext' };
      path.extname.mockReturnValueOnce(''); // Mock path.extname for this specific call
      const cb = (error, allow) => {
        expect(error).toBeInstanceOf(Error);
        expect(error.message).toContain('File type not supported.');
        expect(allow).toBe(false);
        done();
      };
      fileFilterConfig(mockReq, file, cb);
    });
  });

  describe('Multer limits configuration', () => {
    it('should set the file size limit correctly', () => {
      expect(limitsConfig).toBeDefined();
      expect(limitsConfig.fileSize).toBe(LEGAL_CONTRACT_REVIEW_CONFIG.MAX_FILE_SIZE);
    });
  });

  describe('Exported middleware', () => {
    it('should export the multer instance as named export', () => {
      expect(uploadLegalContractReviewModule.uploadLegalContractReview).toBe(mockMulterInstance);
    });

    it('should export the multer instance as default export', () => {
      expect(uploadLegalContractReviewModule.default).toBe(mockMulterInstance);
    });
  });
});