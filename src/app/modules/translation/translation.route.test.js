import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const {
  mockOptionalAuthMiddleware,
  mockExtractTenantContext,
  mockCheckDailyRequestLimit,
  mockUploadTranslationSingle,
  mockValidateRequest,
  mockConversationalRequestSchema,
  mockTranslateTextSchema,
  mockDetectLanguageSchema,
  mockConversationalAssistant,
  mockTranslateText,
  mockDetectLanguage,
  mockGetSupportedLanguages
} = vi.hoisted(() => {
  // Mock all external dependencies
  // Mock optionalAuth - it's a function that returns a middleware
  const mockOptionalAuthMiddleware = vi.fn().mockImplementation((req, res, next) => {
    req.user = { id: 'test-user-id', role: 'user' }; // Simulate an authenticated user
    next();
  });

  // Mock extractTenantContext
  const mockExtractTenantContext = vi.fn().mockImplementation((req, res, next) => {
    req.tenant = { id: 'test-tenant-id' };
    next();
  });

  // Mock checkDailyRequestLimit
  const mockCheckDailyRequestLimit = vi.fn().mockImplementation((req, res, next) => next());

  // Mock uploadTranslation (multer middleware)
  const mockUploadTranslationSingle = vi.fn().mockImplementation((fieldName) => (req, res, next) => {
    // Simulate multer processing: if a file is attached, populate req.file
    if (req.file) { // supertest's .attach() will set req.file
      req.file = {
        fieldname: fieldName,
        originalname: 'test.txt',
        encoding: '7bit',
        mimetype: 'text/plain',
        buffer: Buffer.from('test content'),
        size: 12,
      };
    }
    next();
  });
  const mockValidateRequest = vi.fn().mockImplementation((schema) => mockValidateRequestMiddleware);

  // Mock TranslationValidation schemas
  const mockConversationalRequestSchema = { type: 'object', properties: { prompt: { type: 'string' } }, _isJoi: true };
  const mockTranslateTextSchema = { type: 'object', properties: { text: { type: 'string' } }, _isJoi: true };
  const mockDetectLanguageSchema = { type: 'object', properties: { text: { type: 'string' } }, _isJoi: true };

  // Mock translationController
  const mockConversationalAssistant = vi.fn().mockImplementation(
    (req, res) => res.status(200).json({ message: 'Conversational assistant response' })
  );
  const mockTranslateText = vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'Translated text' }));
  const mockDetectLanguage = vi.fn().mockImplementation((req, res) => res.status(200).json({ message: 'Detected language' }));
  const mockGetSupportedLanguages = vi.fn().mockImplementation((req, res) => res.status(200).json({ languages: ['en', 'es', 'fr'] }));

  return {
    mockOptionalAuthMiddleware,
    mockExtractTenantContext,
    mockCheckDailyRequestLimit,
    mockUploadTranslationSingle,
    mockValidateRequest,
    mockConversationalRequestSchema,
    mockTranslateTextSchema,
    mockDetectLanguageSchema,
    mockConversationalAssistant,
    mockTranslateText,
    mockDetectLanguage,
    mockGetSupportedLanguages
  };
});

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn().mockImplementation(() => mockOptionalAuthMiddleware),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: mockCheckDailyRequestLimit,
}));

vi.mock('./middlewares/uploadTranslation.js', () => ({
  uploadTranslation: {
    single: mockUploadTranslationSingle,
  },
}));

// Mock validateRequest - it's a function that returns a middleware
const mockValidateRequestMiddleware = vi.fn().mockImplementation((req, res, next) => next());
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: mockValidateRequest,
}));

vi.mock('./translation.validation.js', () => ({
  TranslationValidation: {
    conversationalRequestSchema: mockConversationalRequestSchema,
    translateTextSchema: mockTranslateTextSchema,
    detectLanguageSchema: mockDetectLanguageSchema,
  },
}));

vi.mock('./translation.controller.js', () => ({
  translationController: {
    conversationalAssistant: mockConversationalAssistant,
    translateText: mockTranslateText,
    detectLanguage: mockDetectLanguage,
    getSupportedLanguages: mockGetSupportedLanguages,
  },
}));

// Import the router after all mocks are set up
import translationRouter from './translation.route.js';

describe('Translation Routes', () => {
  let app;

  beforeEach(() => {
    // Reset all mocks before each test
    vi.clearAllMocks();

    // Re-create a fresh express app for each test
    app = express();
    app.use(express.json()); // Enable JSON body parsing for tests
    app.use(express.urlencoded({ extended: true })); // Enable URL-encoded body parsing for tests (e.g., for form data)
    app.use('/api/v1/translation', translationRouter); // Mount the router
  });

  describe('POST /api/v1/translation/assistant', () => {
    it('should call all expected middleware and the conversationalAssistant controller with file upload', async () => {
      await request(app)
        .post('/api/v1/translation/assistant')
        .field('prompt', 'Hello, translate this document.')
        .attach('file', Buffer.from('This is a test document content.'), 'document.txt') // Simulate file upload
        .expect(200);

      expect(mockOptionalAuthMiddleware).toHaveBeenCalledTimes(1);
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(1);
      expect(mockCheckDailyRequestLimit).toHaveBeenCalledTimes(1);
      expect(mockUploadTranslationSingle).toHaveBeenCalledTimes(1);
      expect(mockUploadTranslationSingle).toHaveBeenCalledWith('file');
      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockConversationalRequestSchema);
      expect(mockValidateRequestMiddleware).toHaveBeenCalledTimes(1); // The middleware returned by validateRequest
      expect(mockConversationalAssistant).toHaveBeenCalledTimes(1);
      expect(mockConversationalAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { prompt: 'Hello, translate this document.' },
          file: expect.objectContaining({ originalname: 'document.txt' }),
        }),
        expect.any(Object),
      );
    });

    it('should call all expected middleware and the conversationalAssistant controller without file upload', async () => {
      await request(app)
        .post('/api/v1/translation/assistant')
        .send({ prompt: 'Hello, translate this text inline.' })
        .expect(200);

      expect(mockOptionalAuthMiddleware).toHaveBeenCalledTimes(1);
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(1);
      expect(mockCheckDailyRequestLimit).toHaveBeenCalledTimes(1);
      expect(mockUploadTranslationSingle).toHaveBeenCalledTimes(1); // Multer middleware is still applied
      expect(mockUploadTranslationSingle).toHaveBeenCalledWith('file');
      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockConversationalRequestSchema);
      expect(mockValidateRequestMiddleware).toHaveBeenCalledTimes(1);
      expect(mockConversationalAssistant).toHaveBeenCalledTimes(1);
      expect(mockConversationalAssistant).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { prompt: 'Hello, translate this text inline.' },
          file: undefined, // No file attached
        }),
        expect.any(Object),
      );
    });
  });

  describe('POST /api/v1/translation/translate', () => {
    it('should call all expected middleware and the translateText controller', async () => {
      await request(app)
        .post('/api/v1/translation/translate')
        .send({ text: 'Hello world', targetLanguage: 'es' })
        .expect(200);

      expect(mockOptionalAuthMiddleware).toHaveBeenCalledTimes(1);
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockTranslateTextSchema);
      expect(mockValidateRequestMiddleware).toHaveBeenCalledTimes(1);
      expect(mockTranslateText).toHaveBeenCalledTimes(1);
      expect(mockTranslateText).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { text: 'Hello world', targetLanguage: 'es' },
        }),
        expect.any(Object),
      );
      // Ensure other middlewares are NOT called
      expect(mockCheckDailyRequestLimit).not.toHaveBeenCalled();
      expect(mockUploadTranslationSingle).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/translation/detect', () => {
    it('should call all expected middleware and the detectLanguage controller', async () => {
      await request(app)
        .post('/api/v1/translation/detect')
        .send({ text: 'Bonjour le monde' })
        .expect(200);

      expect(mockOptionalAuthMiddleware).toHaveBeenCalledTimes(1);
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledTimes(1);
      expect(mockValidateRequest).toHaveBeenCalledWith(mockDetectLanguageSchema);
      expect(mockValidateRequestMiddleware).toHaveBeenCalledTimes(1);
      expect(mockDetectLanguage).toHaveBeenCalledTimes(1);
      expect(mockDetectLanguage).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { text: 'Bonjour le monde' },
        }),
        expect.any(Object),
      );
      // Ensure other middlewares are NOT called
      expect(mockCheckDailyRequestLimit).not.toHaveBeenCalled();
      expect(mockUploadTranslationSingle).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/translation/languages', () => {
    it('should call all expected middleware and the getSupportedLanguages controller', async () => {
      await request(app)
        .get('/api/v1/translation/languages')
        .expect(200);

      expect(mockOptionalAuthMiddleware).toHaveBeenCalledTimes(1);
      expect(mockExtractTenantContext).toHaveBeenCalledTimes(1);
      expect(mockGetSupportedLanguages).toHaveBeenCalledTimes(1);
      // Ensure other middlewares are NOT called
      expect(mockCheckDailyRequestLimit).not.toHaveBeenCalled();
      expect(mockUploadTranslationSingle).not.toHaveBeenCalled();
      expect(mockValidateRequest).not.toHaveBeenCalled();
    });
  });
});