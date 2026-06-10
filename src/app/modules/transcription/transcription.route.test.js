import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import optionalAuth from '../../middlewares/auth/optionalAuth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import checkDailyRequestLimit from '../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js';
import checkRAGFeature from '../../middlewares/checkRAGFeature/checkRAGFeature.js';
import checkStorageLimit from '../../middlewares/checkStorageLimit/checkStorageLimit.js';
import { transcriptionController } from './transcription.controller.js';
import multer from 'multer';

// Mock express to get a mock router instance
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

// Mock multer and its methods
const mockUploadMiddleware = 'upload.fieldsMiddleware';
const mockUpload = {
  fields: vi.fn().mockReturnValue(mockUploadMiddleware),
};
vi.mock('multer', () => ({
  default: vi.fn(() => mockUpload),
  diskStorage: vi.fn(),
}));

// Mock all other dependencies
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'admin',
    MANAGER: 'manager',
    USER: 'user',
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn((...roles) => `authMiddleware(${roles.join(',')})`),
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => 'optionalAuthMiddleware'),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: 'extractTenantContextMiddleware',
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: 'checkDailyRequestLimitMiddleware',
}));

vi.mock('../../middlewares/checkRAGFeature/checkRAGFeature.js', () => ({
  default: 'checkRAGFeatureMiddleware',
}));

vi.mock('../../middlewares/checkStorageLimit/checkStorageLimit.js', () => ({
  default: 'checkStorageLimitMiddleware',
}));

vi.mock('./transcription.controller.js', () => ({
  transcriptionController: {
    smartTranscriptionAssistant: 'smartTranscriptionAssistantController',
    getTranscriptionStats: 'getTranscriptionStatsController',
  },
}));

// Mock unused but imported modules to ensure a clean test environment
vi.mock('path', () => ({ default: { extname: vi.fn() } }));
vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({ default: vi.fn() }));
vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({ validateRequest: vi.fn() }));
vi.mock('./transcription.validation.js', () => ({ TranscriptionValidation: {} }));

describe('Transcription Routes', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamically import the router file before each test to apply mocks
    await import('./transcription.route.js');
  });

  describe('POST /assistant', () => {
    it('should define the route with the correct path and method', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/assistant',
        expect.any(Function), // optionalAuth
        expect.any(String), // extractTenantContext
        expect.any(String), // checkDailyRequestLimit
        expect.any(String), // checkStorageLimit
        expect.any(String), // upload.fields
        expect.any(String), // checkRAGFeature
        expect.any(String) // controller
      );
    });

    it('should apply the correct middleware chain in order', () => {
      const postCallArgs = mockRouter.post.mock.calls[0];
      expect(postCallArgs[0]).toBe('/assistant');
      expect(postCallArgs[1]).toBe('optionalAuthMiddleware');
      expect(postCallArgs[2]).toBe('extractTenantContextMiddleware');
      expect(postCallArgs[3]).toBe('checkDailyRequestLimitMiddleware');
      expect(postCallArgs[4]).toBe('checkStorageLimitMiddleware');
      expect(postCallArgs[5]).toBe(mockUploadMiddleware);
      expect(postCallArgs[6]).toBe('checkRAGFeatureMiddleware');
      expect(postCallArgs[7]).toBe('smartTranscriptionAssistantController');
    });

    it('should use optionalAuth middleware for flexible access', () => {
      expect(optionalAuth).toHaveBeenCalledOnce();
    });

    it('should configure multer to handle "audio" and "audios" file uploads', () => {
      expect(multer).toHaveBeenCalledOnce();
      expect(mockUpload.fields).toHaveBeenCalledOnce();
      expect(mockUpload.fields).toHaveBeenCalledWith([
        { name: 'audio', maxCount: 1 },
        { name: 'audios', maxCount: 10 },
      ]);
    });
  });

  describe('GET /stats', () => {
    it('should define the route with the correct path and method', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/stats',
        expect.any(String), // auth
        expect.any(String), // extractTenantContext
        expect.any(String) // controller
      );
    });

    it('should apply the correct middleware chain in order', () => {
      const getCallArgs = mockRouter.get.mock.calls[0];
      expect(getCallArgs[0]).toBe('/stats');
      expect(getCallArgs[1]).toBe(
        `authMiddleware(${ENUM_USER_ROLE.ADMIN},${ENUM_USER_ROLE.USER})`
      );
      expect(getCallArgs[2]).toBe('extractTenantContextMiddleware');
      expect(getCallArgs[3]).toBe('getTranscriptionStatsController');
    });

    it('should use auth middleware and restrict access to ADMIN and USER roles', () => {
      expect(auth).toHaveBeenCalledOnce();
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    });

    it('should not allow access for MANAGER or SUPER_ADMIN roles directly via this definition', () => {
      const authCall = auth.mock.calls[0];
      expect(authCall).not.toContain(ENUM_USER_ROLE.MANAGER);
      expect(authCall).not.toContain(ENUM_USER_ROLE.SUPER_ADMIN);
    });
  });
});