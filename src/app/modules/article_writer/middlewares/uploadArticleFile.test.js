import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// --- Global Mocks Setup ---

// Mock fs to prevent actual file system operations
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

// Mock path.extname for consistent behavior
vi.mock('path', () => ({
  extname: vi.fn().mockImplementation((p) => {
    const lastDotIndex = p.lastIndexOf('.');
    return lastDotIndex !== -1 ? p.substring(lastDotIndex) : '';
  }),
}));

// Variables to capture internal functions from the module under test
let capturedDestinationFn;
let capturedFilenameFn;
let capturedFileFilterFn;
let capturedMulterOptions;

// Mock multer to capture its configuration
vi.mock('multer', () => {
  const mockMulterInstance = vi.fn().mockImplementation((options) => {
    capturedMulterOptions = options; // Capture options passed to multer()
    capturedFileFilterFn = options.fileFilter; // Capture the fileFilter function
    return {
      // Simulate a multer instance with common methods
      single: vi.fn().mockImplementation(() => (req, res, next) => next()),
      array: vi.fn().mockImplementation(() => (req, res, next) => next()),
      options, // Store options for direct inspection if needed
    };
  });

  return {
    default: mockMulterInstance, // Mock the default export (the multer instance)
    diskStorage: vi.fn().mockImplementation((options) => {
      capturedDestinationFn = options.destination; // Capture destination function
      capturedFilenameFn = options.filename; // Capture filename function
      // Return a mock storage engine object that Multer would expect
      return {
        _destination: capturedDestinationFn,
        _filename: capturedFilenameFn,
      };
    }),
  };
});

// --- Import the module under test ---
// This import will trigger the fs calls and the multer/diskStorage calls,
// populating our captured variables.
// We use `await import` because the original file uses top-level `fs.existsSync` and `fs.mkdirSync`.
const { uploadArticleFile } = await import('../uploadArticleFile.js');

describe('uploadArticleFile middleware', () => {
  const originalDateNow = Date.now;
  const originalMathRandom = Math.random;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();
    // Default fs.existsSync to true for most tests, except specific ones
    fs.existsSync.mockReturnValue(true);

    // Mock Date.now and Math.random for deterministic filename generation
    Date.now = vi.fn().mockImplementation(() => 1678886400000); // Fixed timestamp
    Math.random = vi.fn().mockImplementation(() => 0.123456789); // Fixed random number
  });

  afterEach(() => {
    // Restore original Date.now and Math.random
    Date.now = originalDateNow;
    Math.random = originalMathRandom;
  });

  // --- Test for initial directory creation ---
  // These tests require re-importing the module to re-evaluate the top-level logic.
  it('should ensure the upload directory exists and create it if missing', async () => {
    vi.resetModules(); // Clear module cache
    fs.existsSync.mockReturnValueOnce(false); // Simulate directory not existing
    // Re-import to trigger the top-level logic again
    await import('../uploadArticleFile.js');

    expect(fs.existsSync).toHaveBeenCalledWith('uploads/article_files');
    expect(fs.mkdirSync).toHaveBeenCalledWith('uploads/article_files', { recursive: true });
  });

  it('should not create directory if it already exists', async () => {
    vi.resetModules(); // Clear module cache
    fs.existsSync.mockReturnValueOnce(true); // Simulate directory existing
    // Re-import to trigger the top-level logic again
    await import('../uploadArticleFile.js');

    expect(fs.existsSync).toHaveBeenCalledWith('uploads/article_files');
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });

  // --- Test Multer instance configuration ---
  it('should configure multer with correct storage, fileFilter, and limits', () => {
    expect(multer.diskStorage).toHaveBeenCalled(); // Ensure diskStorage was called
    expect(capturedMulterOptions).toBeDefined();
    expect(capturedMulterOptions.storage).toBeDefined(); // Should be the object returned by multer.diskStorage
    expect(capturedMulterOptions.fileFilter).toBe(capturedFileFilterFn); // Should be the captured fileFilter function
    expect(capturedMulterOptions.limits).toEqual({
      fileSize: 10 * 1024 * 1024, // 10MB
    });
    // Ensure the exported value is the multer instance (or its mock)
    expect(uploadArticleFile).toBeDefined();
    expect(uploadArticleFile.single).toBeInstanceOf(Function); // Check a method of the mocked instance
  });

  // --- Test storage.destination function ---
  describe('storage.destination', () => {
    it('should call callback with null and the upload directory', () => {
      const req = {};
      const file = {};
      const cb = vi.fn();

      expect(capturedDestinationFn).toBeInstanceOf(Function);
      capturedDestinationFn(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, 'uploads/article_files');
    });
  });

  // --- Test storage.filename function ---
  describe('storage.filename', () => {
    it('should generate a unique filename with original extension', () => {
      const req = {};
      const file = { originalname: 'my-document.pdf' };
      const cb = vi.fn();

      expect(capturedFilenameFn).toBeInstanceOf(Function);
      capturedFilenameFn(req, file, cb);

      // Expected filename: article-1678886400000-123456789.pdf
      expect(cb).toHaveBeenCalledWith(null, 'article-1678886400000-123456789.pdf');
    });

    it('should handle files without extensions', () => {
      const req = {};
      const file = { originalname: 'my-document' };
      const cb = vi.fn();

      expect(capturedFilenameFn).toBeInstanceOf(Function);
      capturedFilenameFn(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, 'article-1678886400000-123456789');
    });

    it('should handle files with multiple dots but only one extension', () => {
      const req = {};
      const file = { originalname: 'archive.tar.gz' };
      const cb = vi.fn();

      expect(capturedFilenameFn).toBeInstanceOf(Function);
      capturedFilenameFn(req, file, cb);

      expect(cb).toHaveBeenCalledWith(null, 'article-1678886400000-123456789.gz');
    });
  });

  // --- Test fileFilter function ---
  describe('fileFilter', () => {
    it('should accept supported file types (e.g., .pdf)', () => {
      const req = {};
      const file = { originalname: 'test.pdf' };
      const cb = vi.fn();

      expect(capturedFileFilterFn).toBeInstanceOf(Function);
      capturedFileFilterFn(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept supported file types (e.g., .docx)', () => {
      const req = {};
      const file = { originalname: 'document.docx' };
      const cb = vi.fn();

      capturedFileFilterFn(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept supported file types (e.g., .txt)', () => {
      const req = {};
      const file = { originalname: 'notes.txt' };
      const cb = vi.fn();

      capturedFileFilterFn(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should accept supported file types (case-insensitive extension)', () => {
      const req = {};
      const file = { originalname: 'report.PDF' };
      const cb = vi.fn();

      capturedFileFilterFn(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    });

    it('should reject unsupported file types (e.g., .jpg)', () => {
      const req = {};
      const file = { originalname: 'image.jpg' };
      const cb = vi.fn();

      capturedFileFilterFn(req, file, cb);
      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(cb.mock.calls[0][0].message).toContain('File type not supported.');
      expect(cb.mock.calls[0][0].message).toContain('.pdf, .docx, .doc, .txt, .xlsx, .xls, .pptx, .ppt');
    });

    it('should reject files without an extension', () => {
      const req = {};
      const file = { originalname: 'noextensionfile' };
      const cb = vi.fn();

      capturedFileFilterFn(req, file, cb);
      expect(cb).toHaveBeenCalledWith(
        expect.any(Error),
        false
      );
      expect(cb.mock.calls[0][0].message).toContain('File type not supported.');
    });
  });
});