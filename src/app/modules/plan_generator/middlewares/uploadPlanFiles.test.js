import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events'; // For stream mocking

// Mock path module
vi.mock('path', () => ({
  extname: vi.fn().mockImplementation((filename) => {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === 0) { // No dot or dot at the beginning
      return '';
    }
    return filename.substring(lastDotIndex).toLowerCase();
  }),
  basename: vi.fn().mockImplementation((filename, ext) => {
    const base = filename.split('/').pop(); // Get filename from path
    if (ext && base.endsWith(ext)) {
      return base.slice(0, -ext.length);
    }
    return base;
  }),
}));

// Mock @google-cloud/storage
const mockCreateWriteStream = vi.fn().mockImplementation(() => {
  const stream = new EventEmitter();
  stream.pipe = vi.fn().mockImplementation(() => stream); // Mock pipe to return itself for chaining
  return stream;
});
const mockDelete = vi.fn().mockImplementation(() => Promise.resolve());
const mockFile = vi.fn().mockImplementation((name) => ({
  name,
  createWriteStream: mockCreateWriteStream,
  delete: mockDelete,
}));
const mockBucket = vi.fn().mockImplementation((name) => ({
  name,
  file: mockFile,
}));

const {
  mockStorage,
  mockRateLimit,
  mockPlanGeneratorConfig,
  mockRedisClient,
  mockMulter
} = vi.hoisted(() => {
  const mockStorage = vi.fn().mockImplementation(() => ({
    bucket: mockBucket,
  }));
  const mockRateLimit = vi.fn().mockImplementation((options) => {
    // Store options to inspect later
    mockRateLimit.options = options;
    return mockRateLimitMiddleware;
  });

  // Mock PLAN_GENERATOR_CONFIG
  const mockPlanGeneratorConfig = {
    GCS_BUCKET_NAME: 'test-plan-bucket',
    SUPPORTED_FILE_EXTENSIONS: ['.pdf', '.docx'],
    SUPPORTED_MIME_TYPES: ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  };

  // Mock redisClient
  const mockRedisClient = {
    sendCommand: vi.fn(),
  };
  const mockMulter = vi.fn().mockImplementation(() => mockMulterInstance);

  return {
    mockStorage,
    mockRateLimit,
    mockPlanGeneratorConfig,
    mockRedisClient,
    mockMulter
  };
});

vi.mock('@google-cloud/storage', () => ({
  Storage: mockStorage,
}));

// Mock express-rate-limit and rate-limit-redis
const mockRateLimitMiddleware = vi.fn().mockImplementation((req, res, next) => next()); // Default pass-through
vi.mock('express-rate-limit', () => ({
  default: mockRateLimit,
}));

const mockRedisStoreInstance = {
  sendCommand: vi.fn(),
};
const MockRedisStore = vi.fn().mockImplementation(() => mockRedisStoreInstance);
vi.mock('rate-limit-redis', () => ({
  default: MockRedisStore,
}));

// Mock ApiError
const MockApiError = vi.fn().mockImplementation((statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
});
vi.mock('../../../../errors/ApiError.js', () => ({
  default: MockApiError,
}));

vi.mock('../plan_generator.constant.js', () => ({
  PLAN_GENERATOR_CONFIG: mockPlanGeneratorConfig,
}));

vi.mock('../../../../shared/redis.js', () => ({
  default: mockRedisClient,
}));

// Mock multer
const mockMulterInstance = {
  single: vi.fn().mockImplementation(() => vi.fn().mockImplementation((req, res, next) => next())), // Mock single to return a middleware
  array: vi.fn().mockImplementation(() => vi.fn().mockImplementation((req, res, next) => next())),
};
mockMulter.diskStorage = vi.fn(); // Multer might have other static methods, mock if needed
vi.mock('multer', () => ({
  default: mockMulter,
}));

// Import the module under test AFTER all mocks
const { uploadPlanRateLimiter, uploadPlanFiles } = await import('../uploadPlanFiles.js');

describe('uploadPlanRateLimiter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-mock rateLimit to ensure options are captured fresh for each test
    mockRateLimit.mockClear();
    mockRateLimit.mockImplementation((options) => {
      mockRateLimit.options = options;
      return mockRateLimitMiddleware;
    });
    // Re-import to trigger the rate limiter initialization with fresh mocks
    // This is necessary because the rate limiter is initialized at module load time.
    vi.doMock('../uploadPlanFiles.js', async (importOriginal) => {
      const originalModule = await importOriginal();
      return {
        ...originalModule,
        uploadPlanRateLimiter: mockRateLimit(mockRateLimit.options), // Re-call with stored options
      };
    });
  });

  it('should be configured with correct windowMs, limit, and headers', () => {
    expect(mockRateLimit).toHaveBeenCalledTimes(1);
    const options = mockRateLimit.mock.calls[0][0];
    expect(options.windowMs).toBe(15 * 60 * 1000); // 15 minutes
    expect(options.limit).toBe(20);
    expect(options.standardHeaders).toBe('draft-7');
    expect(options.legacyHeaders).toBe(false);
  });

  it('should use RedisStore for storage', () => {
    expect(MockRedisStore).toHaveBeenCalledTimes(1);
    const options = mockRateLimit.mock.calls[0][0];
    expect(options.store).toBeInstanceOf(MockRedisStore);
    expect(mockRedisClient.sendCommand).toHaveBeenCalledTimes(0); // Not called on init
  });

  it('should use req.user.id as keyGenerator if available', () => {
    const options = mockRateLimit.mock.calls[0][0];
    const req = { user: { id: 'user123' }, ip: '127.0.0.1' };
    const res = {};
    expect(options.keyGenerator(req, res)).toBe('user123');
  });

  it('should use req.ip as keyGenerator if req.user.id is not available', () => {
    const options = mockRateLimit.mock.calls[0][0];
    const req = { ip: '127.0.0.1' };
    const res = {};
    expect(options.keyGenerator(req, res)).toBe('127.0.0.1');
  });

  it('should throw ApiError with correct status and message when limit is exceeded', () => {
    const options = mockRateLimit.mock.calls[0][0];
    const req = {};
    const res = {};
    const next = vi.fn();
    const limiterOptions = {
      statusCode: 429,
      limit: 20,
      windowMs: 15 * 60 * 1000,
    };

    expect(() => options.handler(req, res, next, limiterOptions)).toThrow(MockApiError);
    expect(MockApiError).toHaveBeenCalledWith(
      429,
      'Too many upload requests. You are limited to 20 requests per 15 minutes.'
    );
    expect(next).not.toHaveBeenCalled(); // Handler throws, so next is not called
  });
});

describe('GcsStorage', () => {
  let req, file, cb, mockFileStream, gcsStorageInstance;
  let pathModule; // To access mocked path functions

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import path to use its mocked functions
    pathModule = await import('path');

    // Re-import the module to get the GcsStorage class and instantiate it fresh
    const { GcsStorage } = await vi.importActual('../uploadPlanFiles.js');
    gcsStorageInstance = new GcsStorage();

    mockFileStream = new EventEmitter();
    mockFileStream.pipe = vi.fn().mockImplementation(() => mockFileStream);

    req = {};
    file = {
      originalname: 'test_plan.pdf',
      mimetype: 'application/pdf',
      stream: mockFileStream,
    };
    cb = vi.fn();

    // Mock Date.now and Math.random for consistent filename generation
    vi.spyOn(Date, 'now').mockReturnValue(1678886400000); // A fixed timestamp
    vi.spyOn(Math, 'round').mockReturnValue(123456789); // A fixed random number
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('_handleFile', () => {
    it('should create a GCS file with a unique name and correct path', () => {
      gcsStorageInstance._handleFile(req, file, cb);

      expect(mockBucket).toHaveBeenCalledWith(mockPlanGeneratorConfig.GCS_BUCKET_NAME);
      expect(mockFile).toHaveBeenCalledWith(
        expect.stringMatching(/^plan_files\/plan-test_plan-1678886400000-123456789\.pdf$/)
      );
    });

    it('should create a writable stream to GCS with correct options', () => {
      gcsStorageInstance._handleFile(req, file, cb);

      expect(mockCreateWriteStream).toHaveBeenCalledTimes(1);
      expect(mockCreateWriteStream).toHaveBeenCalledWith({
        resumable: false,
        contentType: file.mimetype,
      });
    });

    it('should pipe the file stream to the GCS writable stream', () => {
      gcsStorageInstance._handleFile(req, file, cb);

      expect(file.stream.pipe).toHaveBeenCalledWith(mockCreateWriteStream.mock.results[0].value);
    });

    it('should call the callback with GCS file details on successful upload', () => {
      gcsStorageInstance._handleFile(req, file, cb);

      const gcsStream = mockCreateWriteStream.mock.results[0].value;
      gcsStream.emit('finish'); // Simulate successful upload

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(null, {
        bucket: mockPlanGeneratorConfig.GCS_BUCKET_NAME,
        path: expect.stringMatching(/^plan_files\/plan-test_plan-1678886400000-123456789\.pdf$/),
        filename: expect.stringMatching(/^plan_files\/plan-test_plan-1678886400000-123456789\.pdf$/),
        gcsUrl: expect.stringMatching(/^gs:\/\/test-plan-bucket\/plan_files\/plan-test_plan-1678886400000-123456789\.pdf$/),
      });
    });

    it('should call the callback with an error if the GCS stream errors', () => {
      gcsStorageInstance._handleFile(req, file, cb);

      const gcsStream = mockCreateWriteStream.mock.results[0].value;
      const uploadError = new Error('GCS upload failed');
      gcsStream.emit('error', uploadError); // Simulate GCS stream error

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(uploadError);
    });

    it('should handle file with no extension gracefully', () => {
      file.originalname = 'test_plan';
      file.mimetype = 'application/octet-stream'; // A generic mimetype
      pathModule.extname.mockReturnValue(''); // Ensure extname returns empty for no extension
      pathModule.basename.mockReturnValue('test_plan'); // Ensure basename returns correctly

      gcsStorageInstance._handleFile(req, file, cb);

      expect(mockFile).toHaveBeenCalledWith(
        expect.stringMatching(/^plan_files\/plan-test_plan-1678886400000-123456789$/)
      );
      const gcsStream = mockCreateWriteStream.mock.results[0].value;
      gcsStream.emit('finish');
      expect(cb).toHaveBeenCalledWith(null, expect.objectContaining({
        path: expect.stringMatching(/^plan_files\/plan-test_plan-1678886400000-123456789$/),
      }));
    });
  });

  describe('_removeFile', () => {
    it('should call delete on the GCS file with ignoreNotFound: true', async () => {
      file.path = 'plan_files/plan-test_plan.pdf'; // Multer adds 'path' to file object for removal
      await gcsStorageInstance._removeFile(req, file, cb);

      expect(mockFile).toHaveBeenCalledWith(file.path);
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(mockDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
      expect(cb).toHaveBeenCalledWith(null);
    });

    it('should call the callback with an error if GCS delete fails', async () => {
      const deleteError = new Error('GCS delete failed');
      mockDelete.mockRejectedValueOnce(deleteError); // Simulate delete failure

      file.path = 'plan_files/plan-test_plan.pdf';
      await gcsStorageInstance._removeFile(req, file, cb);

      expect(mockFile).toHaveBeenCalledWith(file.path);
      expect(mockDelete).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith(deleteError);
    });
  });
});

describe('fileFilter', () => {
  let req, file, cb, fileFilterFn;
  let pathModule;

  beforeEach(async () => {
    vi.clearAllMocks();
    pathModule = await import('path');
    // Re-import to get the fileFilter function directly
    const { fileFilter } = await vi.importActual('../uploadPlanFiles.js');
    fileFilterFn = fileFilter;

    req = {};
    cb = vi.fn();
  });

  it('should accept a file with a supported extension and MIME type', () => {
    file = { originalname: 'document.pdf', mimetype: 'application/pdf' };
    pathModule.extname.mockReturnValueOnce('.pdf');
    fileFilterFn(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });

  it('should reject a file with an unsupported extension', () => {
    file = { originalname: 'image.jpg', mimetype: 'image/jpeg' };
    pathModule.extname.mockReturnValueOnce('.jpg');
    fileFilterFn(req, file, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.any(MockApiError),
      false
    );
    expect(MockApiError).toHaveBeenCalledWith(
      400,
      'Invalid file type. Supported formats: .pdf, .docx'
    );
  });

  it('should reject a file with an unsupported MIME type', () => {
    file = { originalname: 'document.pdf', mimetype: 'text/plain' };
    pathModule.extname.mockReturnValueOnce('.pdf');
    fileFilterFn(req, file, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.any(MockApiError),
      false
    );
    expect(MockApiError).toHaveBeenCalledWith(
      400,
      'Invalid file MIME type. Supported types: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  });

  it('should reject a file with both unsupported extension and MIME type (extension takes precedence)', () => {
    file = { originalname: 'archive.zip', mimetype: 'application/zip' };
    pathModule.extname.mockReturnValueOnce('.zip');
    fileFilterFn(req, file, cb);
    expect(cb).toHaveBeenCalledWith(
      expect.any(MockApiError),
      false
    );
    expect(MockApiError).toHaveBeenCalledWith(
      400,
      'Invalid file type. Supported formats: .pdf, .docx'
    );
  });

  it('should handle case-insensitive extensions', () => {
    file = { originalname: 'document.PDF', mimetype: 'application/pdf' };
    pathModule.extname.mockReturnValueOnce('.pdf'); // Mocked extname returns lowercase
    fileFilterFn(req, file, cb);
    expect(cb).toHaveBeenCalledWith(null, true);
  });
});

describe('uploadPlanFiles (Multer instance)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should be a Multer instance', () => {
    expect(mockMulter).toHaveBeenCalledTimes(1);
    expect(uploadPlanFiles).toBe(mockMulterInstance);
  });

  it('should be configured with the custom GcsStorage', async () => {
    const multerConfig = mockMulter.mock.calls[0][0];
    const { GcsStorage } = await vi.importActual('../uploadPlanFiles.js');
    expect(multerConfig.storage).toBeInstanceOf(GcsStorage);
  });

  it('should be configured with the fileFilter function', async () => {
    const multerConfig = mockMulter.mock.calls[0][0];
    const { fileFilter } = await vi.importActual('../uploadPlanFiles.js');
    expect(multerConfig.fileFilter).toBe(fileFilter);
  });

  it('should be configured with the correct file size limit', () => {
    const multerConfig = mockMulter.mock.calls[0][0];
    expect(multerConfig.limits.fileSize).toBe(mockPlanGeneratorConfig.MAX_FILE_SIZE);
  });

  it('should expose a `single` method for file uploads', () => {
    expect(uploadPlanFiles.single).toBeInstanceOf(Function);
  });
});