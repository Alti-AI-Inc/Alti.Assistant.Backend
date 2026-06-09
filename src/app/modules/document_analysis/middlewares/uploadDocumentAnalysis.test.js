import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

// Mock constants for predictable test results
const MOCK_UPLOAD_DIR_RESOLVED = '/mock/path/to/uploads/document_analysis';
const MOCK_SUPPORTED_EXTENSIONS = ['.pdf', '.docx'];
const MOCK_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// Mock modules
vi.mock('path', () => {
  const actualPath = vi.importActual('path');
  return {
    default: {
      ...actualPath, // Keep other path methods if they are not explicitly mocked
      join: vi.fn((...args) => {
        // Custom logic for the specific uploadDir path calculation
        if (args[0] === '/mock/path/to/module' && args[1] === '../../../../../uploads/document_analysis') {
          return MOCK_UPLOAD_DIR_RESOLVED;
        }
        // Fallback for other join calls if any, or a generic join
        return args.join('/');
      }),
      dirname: vi.fn(() => '/mock/path/to/module'),
      extname: vi.fn((filename) => {
        const lastDotIndex = filename.lastIndexOf('.');
        return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
      }),
    },
  };
});

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    mkdirSync: vi.fn(),
  },
}));

vi.mock('url', () => ({
  fileURLToPath: vi.fn(() => '/mock/path/to/module/file.js'),
}));

vi.mock('../document_analysis.constant.js', () => ({
  DOCUMENT_ANALYSIS_CONFIG: {
    SUPPORTED_FILE_EXTENSIONS: MOCK_SUPPORTED_EXTENSIONS,
    MAX_FILE_SIZE: MOCK_MAX_FILE_SIZE,
  },
}));

// Mock multer
const mockDiskStorage = {
  destination: vi.fn(),
  filename: vi.fn(),
};
const mockMulterInstance = {
  single: vi.fn(),
  array: vi.fn(),
};
const mockMulter = vi.fn(() => mockMulterInstance);
mockMulter.diskStorage = vi.fn(() => mockDiskStorage);
vi.mock('multer', () => ({
  default: mockMulter,
}));

// Variable to hold the dynamically imported module
let uploadDocumentAnalysisModule;

describe('uploadDocumentAnalysis middleware', () => {
  const originalDateNow = Date.now;
  const originalMathRandom = Math.random;

  beforeEach(async () => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Set default mock implementations
    path.default.join.mockImplementation((...args) => {
      if (args[0] === '/mock/path/to/module' && args[1] === '../../../../../uploads/document_analysis') {
        return MOCK_UPLOAD_DIR_RESOLVED;
      }
      return args.join('/');
    });
    path.default.dirname.mockReturnValue('/mock/path/to/module');
    path.default.extname.mockImplementation((filename) => {
      const lastDotIndex = filename.lastIndexOf('.');
      return lastDotIndex !== -1 ? filename.substring(lastDotIndex) : '';
    });
    fs.default.existsSync.mockReturnValue(true); // Assume dir exists by default
    fs.default.mkdirSync.mockReturnValue(undefined);
    fileURLToPath.mockReturnValue('/mock/path/to/module/file.js');
    mockMulter.mockReturnValue(mockMulterInstance);
    mockMulter.diskStorage.mockReturnValue(mockDiskStorage);

    // Mock Date.now and Math.random for deterministic filename generation
    vi.spyOn(Date, 'now').mockReturnValue(1678886400000); // Specific timestamp
    vi.spyOn(Math, 'random').mockReturnValue(0.123456789); // Specific random value

    // Dynamically import the module to ensure mocks are applied and top-level code runs
    uploadDocumentAnalysisModule = await import('./uploadDocumentAnalysis.js');
  });

  afterEach(() => {
    // Restore original Date.now and Math.random
    vi.restoreAllMocks();
  });

  // Test 1: Directory creation logic
  it('should create the upload directory if it does not exist', async () => {
    fs.default.existsSync.mockReturnValue(false); // Simulate directory not existing
    // Re-import to re-run top-level code with new mock state
    await import('./uploadDocumentAnalysis.js');
    expect(fs.default.mkdirSync).toHaveBeenCalledWith(
      MOCK_UPLOAD_DIR_RESOLVED,
      { recursive: true }
    );
  });

  it('should not create the upload directory if it already exists', async () => {
    fs.default.existsSync.mockReturnValue(true); // Simulate directory existing
    // Re-import to re-run top-level code with new mock state
    await import('./uploadDocumentAnalysis.js');
    expect(fs.default.mkdirSync).not.toHaveBeenCalled();
  });

  // Test 2: Multer storage configuration (destination and filename)
  it('should configure destination correctly to the resolved upload directory', () => {
    // The storage configuration is passed to multer.diskStorage
    const storageConfig = mockMulter.diskStorage.mock.calls[0][0];
    const cb = vi.fn();
    storageConfig.destination({}, {}, cb);
    expect(cb).toHaveBeenCalledWith(null, MOCK_UPLOAD_DIR_RESOLVED);
  });

  it('should configure filename correctly with a unique suffix and original extension', () => {
    const storageConfig = mockMulter.diskStorage.mock.calls[0][0];
    const cb = vi.fn();
    const file = { originalname: 'my-document.pdf' };
    storageConfig.filename({}, file, cb);

    // Expected unique suffix: Date.now() - Math.round(Math.random() * 1e9)
    // 1678886400000 - Math.round(0.123456789 * 1e9) = 1678886400000 - 123456789
    const expectedUniqueSuffix = '1678886400000-123456789';
    expect(cb).toHaveBeenCalledWith(null, `analysis-${expectedUniqueSuffix}.pdf`);
  });

  it('should handle filenames without extensions gracefully in filename generation', () => {
    const storageConfig = mockMulter.diskStorage.mock.calls[0][0];
    const cb = vi.fn();
    const file = { originalname: 'my-document' };
    storageConfig.filename({}, file, cb);

    const expectedUniqueSuffix = '1678886400000-123456789';
    expect(cb).toHaveBeenCalledWith(null, `analysis-${expectedUniqueSuffix}`);
  });

  // Test 3: Multer fileFilter configuration
  it('should allow supported file types', () => {
    // The fileFilter function is passed directly to the multer instance
    const fileFilter = mockMulter.mock.calls[0][0].fileFilter;
    const cb = vi.fn();
    const file = { originalname: 'report.pdf' };
    fileFilter({}, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('should allow supported file types regardless of case', () => {
    const fileFilter = mockMulter.mock.calls[0][0].fileFilter;
    const cb = vi.fn();
    const file = { originalname: 'report.DOCX' }; // Uppercase extension
    fileFilter({}, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('should reject unsupported file types with an error message', () => {
    const fileFilter = mockMulter.mock.calls[0][0].fileFilter;
    const cb = vi.fn();
    const file = { originalname: 'image.jpg' }; // Unsupported extension
    fileFilter({}, file, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
    expect(cb.mock.calls[0][0].message).toBe(
      `Unsupported file type. Supported types: ${MOCK_SUPPORTED_EXTENSIONS.join(', ')}`
    );
  });

  it('should reject files without extensions if not explicitly supported', () => {
    const fileFilter = mockMulter.mock.calls[0][0].fileFilter;
    const cb = vi.fn();
    const file = { originalname: 'no-extension-file' };
    fileFilter({}, file, cb);
    expect(cb).toHaveBeenCalledWith(expect.any(Error), false);
    expect(cb.mock.calls[0][0].message).toBe(
      `Unsupported file type. Supported types: ${MOCK_SUPPORTED_EXTENSIONS.join(', ')}`
    );
  });

  // Test 4: Multer instance creation and export
  it('should export a multer instance configured with the correct storage, fileFilter, and limits', () => {
    expect(mockMulter).toHaveBeenCalledTimes(1); // Multer should be called once at module import
    const multerCallArgs = mockMulter.mock.calls[0][0];

    expect(multerCallArgs.storage).toBe(mockDiskStorage); // Should be the result of diskStorage
    expect(multerCallArgs.fileFilter).toBeInstanceOf(Function); // Should be the fileFilter function
    expect(multerCallArgs.limits).toEqual({
      fileSize: MOCK_MAX_FILE_SIZE,
    });

    // The exported value should be the mocked multer instance
    expect(uploadDocumentAnalysisModule.uploadDocumentAnalysis).toBe(mockMulterInstance);
  });
});