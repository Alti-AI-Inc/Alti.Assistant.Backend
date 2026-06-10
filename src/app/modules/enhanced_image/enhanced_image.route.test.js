import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the router to capture route definitions
const mockRouter = {
  post: vi.fn(),
  get: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: () => mockRouter,
  },
}));

// Mock all dependencies
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    ADMIN: 'admin',
    USER: 'user',
  },
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn((...roles) => `authMiddleware(${roles.join(',')})`),
}));

vi.mock('../../middlewares/auth/optionalAuth.js', () => ({
  default: vi.fn(() => 'optionalAuthMiddleware'),
}));

vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: vi.fn((limit, minutes) => `rateLimiterMiddleware(${limit},${minutes})`),
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: vi.fn(schema => `validateRequestMiddleware(${schema})`),
}));

vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: 'extractTenantContextMiddleware',
}));

vi.mock('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js', () => ({
  default: 'checkDailyRequestLimitMiddleware',
}));

vi.mock('./enhanced_image.controller.js', () => ({
  enhancedImageController: {
    generateImageDirect: 'generateImageDirectController',
    editImage: 'editImageController',
    analyzeIntent: 'analyzeIntentController',
    analyzeImageIntent: 'analyzeImageIntentController',
    evaluatePrompt: 'evaluatePromptController',
    addDetail: 'addDetailController',
    finalizePrompt: 'finalizePromptController',
    buildEnhancedPrompt: 'buildEnhancedPromptController',
    generateFromConversation: 'generateFromConversationController',
    getImageStats: 'getImageStatsController',
  },
}));

vi.mock('./enhanced_image.validation.js', () => ({
  EnhancedImageValidation: {
    generateImageSchema: 'generateImageSchema',
    editImageSchema: 'editImageSchema',
    analyzeIntentSchema: 'analyzeIntentSchema',
    analyzeImageIntentSchema: 'analyzeImageIntentSchema',
    evaluatePromptSchema: 'evaluatePromptSchema',
    addDetailSchema: 'addDetailSchema',
    finalizePromptSchema: 'finalizePromptSchema',
    buildEnhancedPromptSchema: 'buildEnhancedPromptSchema',
    generateFromConversationSchema: 'generateFromConversationSchema',
  },
}));

describe('Enhanced Image Routes', () => {
  let auth;
  let optionalAuth;
  let createRateLimiter;
  let validateRequest;
  let extractTenantContext;
  let checkDailyRequestLimit;
  let enhancedImageController;
  let EnhancedImageValidation;
  let ENUM_USER_ROLE;

  beforeEach(async () => {
    // Reset mocks to ensure clean state for each test
    vi.clearAllMocks();
    mockRouter.post.mockClear();
    mockRouter.get.mockClear();

    // Dynamically import mocked modules to get fresh mock functions
    auth = (await import('../../middlewares/auth/auth.js')).default;
    optionalAuth = (await import('../../middlewares/auth/optionalAuth.js')).default;
    createRateLimiter = (await import('../../middlewares/rateLimit/authLimiter.js')).default;
    validateRequest = (await import('../../middlewares/validateRequest/validateRequest.js')).validateRequest;
    extractTenantContext = (await import('../../middlewares/tenant/tenantContext.js')).extractTenantContext;
    checkDailyRequestLimit = (await import('../../middlewares/checkDailyRequestLimit/checkDailyRequestLimit.js')).default;
    enhancedImageController = (await import('./enhanced_image.controller.js')).enhancedImageController;
    EnhancedImageValidation = (await import('./enhanced_image.validation.js')).EnhancedImageValidation;
    ENUM_USER_ROLE = (await import('../../../shared/enum.js')).ENUM_USER_ROLE;

    // Import the router file which will use the mocked dependencies
    await import('./enhanced_image.route.js');
  });

  it('should configure POST /generate route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/generate',
      optionalAuth(),
      extractTenantContext,
      checkDailyRequestLimit,
      createRateLimiter(20, 15),
      validateRequest(EnhancedImageValidation.generateImageSchema),
      enhancedImageController.generateImageDirect
    );
  });

  it('should configure POST /edit route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/edit',
      optionalAuth(),
      extractTenantContext,
      checkDailyRequestLimit,
      createRateLimiter(20, 15),
      validateRequest(EnhancedImageValidation.editImageSchema),
      enhancedImageController.editImage
    );
  });

  it('should configure POST /analyze-intent route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/analyze-intent',
      optionalAuth(),
      extractTenantContext,
      createRateLimiter(30, 15),
      validateRequest(EnhancedImageValidation.analyzeIntentSchema),
      enhancedImageController.analyzeIntent
    );
  });

  it('should configure POST /analyze-image-intent route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/analyze-image-intent',
      optionalAuth(),
      extractTenantContext,
      checkDailyRequestLimit,
      createRateLimiter(20, 15),
      validateRequest(EnhancedImageValidation.analyzeImageIntentSchema),
      enhancedImageController.analyzeImageIntent
    );
  });

  it('should configure POST /evaluate-prompt route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/evaluate-prompt',
      optionalAuth(),
      extractTenantContext,
      createRateLimiter(30, 15),
      validateRequest(EnhancedImageValidation.evaluatePromptSchema),
      enhancedImageController.evaluatePrompt
    );
  });

  it('should configure POST /add-detail route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/add-detail',
      optionalAuth(),
      extractTenantContext,
      createRateLimiter(30, 15),
      validateRequest(EnhancedImageValidation.addDetailSchema),
      enhancedImageController.addDetail
    );
  });

  it('should configure POST /finalize-prompt route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/finalize-prompt',
      optionalAuth(),
      extractTenantContext,
      checkDailyRequestLimit,
      createRateLimiter(30, 15),
      validateRequest(EnhancedImageValidation.finalizePromptSchema),
      enhancedImageController.finalizePrompt
    );
  });

  it('should configure POST /build-enhanced-prompt route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/build-enhanced-prompt',
      optionalAuth(),
      extractTenantContext,
      checkDailyRequestLimit,
      createRateLimiter(30, 15),
      validateRequest(EnhancedImageValidation.buildEnhancedPromptSchema),
      enhancedImageController.buildEnhancedPrompt
    );
  });

  it('should configure POST /generate-from-conversation route correctly', () => {
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/generate-from-conversation',
      optionalAuth(),
      extractTenantContext,
      checkDailyRequestLimit,
      createRateLimiter(20, 15),
      validateRequest(EnhancedImageValidation.generateFromConversationSchema),
      enhancedImageController.generateFromConversation
    );
  });

  it('should configure GET /stats route correctly with ADMIN and USER roles', () => {
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/stats',
      auth(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
      extractTenantContext,
      createRateLimiter(100, 15),
      enhancedImageController.getImageStats
    );
    // Verify that the auth middleware was called with the correct roles
    expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
  });
});