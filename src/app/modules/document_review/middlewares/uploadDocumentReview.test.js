import { vi, describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Setup mocks before importing the module to intercept immediate execution
const mockDiskStorage = vi.fn().mockImplementation((config) => {
  return {
    _destination: config.destination,
    _filename: config.filename,
  };
});

const mockMulterInstance = {
  single: vi.fn(),
  array: vi.fn(),
  fields: vi.fn(),
};

const {
  mockMulter
} = vi.hoisted(() => {
  const mockMulter = vi.fn().mockImplementation((options) => {
    return {
      ...mockMulterInstance,
      options,
    };
  });

  return {
    mockMulter
  };
});
mockMulter.diskStorage = mockDiskStorage;

vi.mock('multer', () => ({
  default: mockMulter,
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn().mockImplementation(() => false),
    mkdirSync: vi.fn(),
  },
}));

vi.mock('../document_review.constant.js', () => ({
  DOCUMENT_REVIEW_CONFIG: {
    SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.docx', '.txt'],
    MAX_FILE_SIZE: 5242880, // 5MB
  },
  STORAGE_CONFIG: {
    TEMP_FOLDER: '/mock/temp/folder',
  },
}));

// Import the module under test
import { uploadDocumentReview } from './uploadDocumentReview.js';

describe('uploadDocumentReview Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Initialization and Directory Creation', () => {
    it('should check if the temp directory exists and create it if it does not', () => {
      expect(fs.existsSync).toHaveBeenCalledWith('/mock/temp/folder');
      expect(fs.mkdirSync).toHaveBeenCalledWith('/mock/temp/folder', { recursive: true });
    });
  });

  describe('Multer Configuration', () => {
    it('should configure multer with correct limits', () => {
      expect(mockMulter).toHaveBeenCalled();
      const callArgs = mockMulter.mock.calls[0][0];
      expect(callArgs.limits).toEqual({ fileSize: 5242880 });
    });
  });

  describe('Storage Configuration', () => {
    it('should set the correct destination folder', () => {
      const storageConfig = mockDiskStorage.mock.results[0].value;
      const cb = vi.fn();
      const req = {};
      const file = {};

      storageConfig._destination(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, '/mock/temp/folder');
    });

    it('should generate a unique filename preserving the original extension', () => {
      const storageConfig = mockDiskStorage.mock.results[0].value;
      const cb = vi.fn();
      const req = {};
      const file = { originalname: 'important_document.pdf' };

      storageConfig._filename(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, expect.any(String));
      const generatedFilename = cb.mock.calls[0][1];
      expect(generatedFilename).toMatch(/^review-\d+-\d+\.pdf$/);
    });

    it('should handle files with uppercase extensions correctly during filename generation', () => {
      const storageConfig = mockDiskStorage.mock.results[0].value;
      const cb = vi.fn();
      const req = {};
      const file = { originalname: 'REPORT.DOCX' };

      storageConfig._filename(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, expect.any(String));
      const generatedFilename = cb.mock.calls[0][1];
      expect(generatedFilename).toMatch(/^review-\d+-\d+\.DOCX$/);
    });
  });

  describe('File Filter Validation', () => {
    it('should accept supported file extensions (case-insensitive)', () => {
      const callArgs = mockMulter.mock.calls[0][0];
      const fileFilter = callArgs.fileFilter;
      const cb = vi.fn();
      const req = {};

      fileFilter(req, { originalname: 'test.pdf' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);

      fileFilter(req, { originalname: 'test.PDF' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);

      fileFilter(req, { originalname: 'test.docx' }, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should reject unsupported file extensions', () => {
      const callArgs = mockMulter.mock.calls[0][0];
      const fileFilter = callArgs.fileFilter;
      const cb = vi.fn();
      const req = {};

      fileFilter(req, { originalname: 'malicious.exe' }, cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
      expect(cb.mock.calls[0][0].message).toContain('File type not supported');
    });
  });

  describe('Context Boundaries & Role-Based Access Compatibility', () => {
    const roles = ['super_admin', 'admin', 'manager', 'user'];

    roles.forEach((role) => {
      it(`should function correctly and preserve request context for role: ${role}`, () => {
        const callArgs = mockMulter.mock.calls[0][0];
        const fileFilter = callArgs.fileFilter;
        const storageConfig = mockDiskStorage.mock.results[0].value;

        const req = {
          user: {
            id: 'user-123',
            role: role,
          },
        };

        // Test file filter with role context
        const filterCb = vi.fn();
        fileFilter(req, { originalname: 'document.pdf' }, filterCb);
        expect(filterCb).toHaveBeenCalledWith(null, true);
        expect(req.user.role).toBe(role); // Ensure context is untouched

        // Test destination with role context
        const destCb = vi.fn();
        storageConfig._destination(req, {}, destCb);
        expect(destCb).toHaveBeenCalledWith(null, '/mock/temp/folder');

        // Test filename with role context
        const filenameCb = vi.fn();
        storageConfig._filename(req, { originalname: 'test.txt' }, filenameCb);
        expect(filenameCb).toHaveBeenCalledWith(null, expect.stringMatching(/^review-\d+-\d+\.txt$/));
      });
    });
  });
});