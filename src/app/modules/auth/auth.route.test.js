import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  mockExpressRouter,
  ENUM_USER_ROLE,
  mockAuthMiddleware,
  mockCreateRateLimiter,
  mockValidateRequest,
  mockAuthController,
  mockAuthValidation
} = vi.hoisted(() => {
  // Mock all external dependencies
  const mockExpressRouter = vi.fn().mockImplementation(() => {
    const router = {
      get: vi.fn(),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      route: vi.fn().mockImplementation(path => {
        const routeHandler = {
          get: vi.fn(),
          post: vi.fn(),
          put: vi.fn(),
          delete: vi.fn(),
        };
        // Store the route handler for later inspection
        router._routes.push({ path, handler: routeHandler });
        return routeHandler;
      }),
      _routes: [], // To store routes defined via .route()
    };
    return router;
  });

  const ENUM_USER_ROLE = {
    ADMIN: 'admin',
    USER: 'user',
  };

  // Mock middleware functions to return identifiable strings or mock functions
  const mockAuthMiddleware = vi.fn().mockImplementation((...roles) => `auth_middleware(${roles.join(',')})`);

  const mockCreateRateLimiter = vi.fn().mockImplementation((max, window) => `rate_limiter_middleware(${max},${window})`);

  const mockValidateRequest = vi.fn().mockImplementation(schema => `validate_request_middleware(${JSON.stringify(schema)})`);

  // Mock authController methods
  const mockAuthController = {
    getUser: vi.fn().mockImplementation(() => 'authController.getUser'),
    register: vi.fn().mockImplementation(() => 'authController.register'),
    resendEmailConfirmation: vi.fn().mockImplementation(() => 'authController.resendEmailConfirmation'),
    confirmEmail: vi.fn().mockImplementation(() => 'authController.confirmEmail'),
    login: vi.fn().mockImplementation(() => 'authController.login'),
    refreshToken: vi.fn().mockImplementation(() => 'authController.refreshToken'),
    forgetPassword: vi.fn().mockImplementation(() => 'authController.forgetPassword'),
    resetPassword: vi.fn().mockImplementation(() => 'authController.resetPassword'),
    changePassword: vi.fn().mockImplementation(() => 'authController.changePassword'),
    updateUser: vi.fn().mockImplementation(() => 'authController.updateUser'),
    deleteUserAccountOTP: vi.fn().mockImplementation(() => 'authController.deleteUserAccountOTP'),
    deleteUserAccount: vi.fn().mockImplementation(() => 'authController.deleteUserAccount'),
  };

  // Mock AuthValidation schemas
  const mockAuthValidation = {
    UserValidationSchema: { _isZodSchema: true, name: 'UserValidationSchema' }, // Simplified mock for schema
    refreshTokenZodSchema: { _isZodSchema: true, name: 'refreshTokenZodSchema' },
  };

  return {
    mockExpressRouter,
    ENUM_USER_ROLE,
    mockAuthMiddleware,
    mockCreateRateLimiter,
    mockValidateRequest,
    mockAuthController,
    mockAuthValidation
  };
});

vi.mock('express', () => ({
  default: {
    Router: mockExpressRouter,
  },
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: ENUM_USER_ROLE,
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuthMiddleware,
}));

vi.mock('../../middlewares/rateLimit/authLimiter.js', () => ({
  default: mockCreateRateLimiter,
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: mockValidateRequest,
}));

vi.mock('./auth.controller.js', () => ({
  authController: mockAuthController,
}));

vi.mock('./auth.validation.js', () => ({
  AuthValidation: mockAuthValidation,
}));

// Import the module under test AFTER all mocks are defined.
// This ensures that when auth.route.js executes, it uses our mocked dependencies.
import { authRoutes } from './auth.route.js';

describe('Auth Routes', () => {
  // The 'authRoutes' variable is the mocked router instance returned by mockExpressRouter.
  // We need to clear its internal state and call history before each test.
  beforeEach(() => {
    // Clear call history for router methods
    authRoutes.get.mockClear();
    authRoutes.post.mockClear();
    authRoutes.put.mockClear();
    authRoutes.delete.mockClear();
    authRoutes.route.mockClear();
    authRoutes._routes = []; // Clear the internal routes array for .route() calls

    // Clear call history for middleware factory functions
    mockAuthMiddleware.mockClear();
    mockCreateRateLimiter.mockClear();
    mockValidateRequest.mockClear();

    // Clear call history for controller methods
    Object.values(mockAuthController).forEach(mockFn => mockFn.mockClear());
  });

  // Helper to find a route defined via .route() chaining
  const findRoute = (path, method) => {
    const routeEntry = authRoutes._routes.find(r => r.path === path);
    return routeEntry?.handler[method];
  };

  it('should initialize express router', () => {
    // The router is initialized once when the module is loaded.
    expect(mockExpressRouter).toHaveBeenCalledTimes(1);
    expect(authRoutes).toBeDefined();
  });

  it('should define GET /user/single-user route with auth middleware', () => {
    const getHandler = findRoute('/user/single-user', 'get');
    expect(getHandler).toHaveBeenCalledTimes(1);
    expect(getHandler).toHaveBeenCalledWith(
      mockAuthMiddleware(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
      mockAuthController.getUser
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    expect(mockAuthController.getUser).not.toHaveBeenCalled(); // Controller is not called during route definition
  });

  it('should define POST /register route with rate limiter, validation, and controller', () => {
    const postHandler = findRoute('/register', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockCreateRateLimiter(5, 2),
      mockValidateRequest(mockAuthValidation.UserValidationSchema),
      mockAuthController.register
    );
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 2);
    expect(mockValidateRequest).toHaveBeenCalledWith(mockAuthValidation.UserValidationSchema);
    expect(mockAuthController.register).not.toHaveBeenCalled();
  });

  it('should define POST /register/resend-confirmation route with rate limiter and controller', () => {
    const postHandler = findRoute('/register/resend-confirmation', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockCreateRateLimiter(5, 2),
      mockAuthController.resendEmailConfirmation
    );
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 2);
    expect(mockAuthController.resendEmailConfirmation).not.toHaveBeenCalled();
  });

  it('should define POST /register/confirmation route with rate limiter and controller', () => {
    const postHandler = findRoute('/register/confirmation', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockCreateRateLimiter(5, 5),
      mockAuthController.confirmEmail
    );
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 5);
    expect(mockAuthController.confirmEmail).not.toHaveBeenCalled();
  });

  it('should define POST /login route with rate limiter and controller', () => {
    const postHandler = findRoute('/login', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockCreateRateLimiter(5, 5),
      mockAuthController.login
    );
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 5);
    expect(mockAuthController.login).not.toHaveBeenCalled();
  });

  it('should define POST /refresh-token route with validation and controller', () => {
    // This route is defined directly on the router, not via .route()
    expect(authRoutes.post).toHaveBeenCalledWith(
      '/refresh-token',
      mockValidateRequest(mockAuthValidation.refreshTokenZodSchema),
      mockAuthController.refreshToken
    );
    expect(mockValidateRequest).toHaveBeenCalledWith(mockAuthValidation.refreshTokenZodSchema);
    expect(mockAuthController.refreshToken).not.toHaveBeenCalled();
  });

  it('should define POST /forget-password route with rate limiter and controller', () => {
    const postHandler = findRoute('/forget-password', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockCreateRateLimiter(5, 2),
      mockAuthController.forgetPassword
    );
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 2);
    expect(mockAuthController.forgetPassword).not.toHaveBeenCalled();
  });

  it('should define POST /reset-password route with rate limiter and controller', () => {
    const postHandler = findRoute('/reset-password', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockCreateRateLimiter(5, 1),
      mockAuthController.resetPassword
    );
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 1);
    expect(mockAuthController.resetPassword).not.toHaveBeenCalled();
  });

  it('should define POST /change-password route with auth middleware and controller', () => {
    const postHandler = findRoute('/change-password', 'post');
    expect(postHandler).toHaveBeenCalledTimes(1);
    expect(postHandler).toHaveBeenCalledWith(
      mockAuthMiddleware(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
      mockAuthController.changePassword
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    expect(mockAuthController.changePassword).not.toHaveBeenCalled();
  });

  it('should define PUT /update-user/:userId route with auth middleware and controller', () => {
    const putHandler = findRoute('/update-user/:userId', 'put');
    expect(putHandler).toHaveBeenCalledTimes(1);
    expect(putHandler).toHaveBeenCalledWith(
      mockAuthMiddleware(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
      mockAuthController.updateUser
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    expect(mockAuthController.updateUser).not.toHaveBeenCalled();
  });

  it('should define DELETE /delete-account-otp/:id route with auth middleware, rate limiter, and controller', () => {
    const deleteHandler = findRoute('/delete-account-otp/:id', 'delete');
    expect(deleteHandler).toHaveBeenCalledTimes(1);
    expect(deleteHandler).toHaveBeenCalledWith(
      mockAuthMiddleware(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
      mockCreateRateLimiter(5, 2),
      mockAuthController.deleteUserAccountOTP
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    expect(mockCreateRateLimiter).toHaveBeenCalledWith(5, 2);
    expect(mockAuthController.deleteUserAccountOTP).not.toHaveBeenCalled();
  });

  it('should define DELETE /delete-account/:id route with auth middleware and controller', () => {
    const deleteHandler = findRoute('/delete-account/:id', 'delete');
    expect(deleteHandler).toHaveBeenCalledTimes(1);
    expect(deleteHandler).toHaveBeenCalledWith(
      mockAuthMiddleware(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER),
      mockAuthController.deleteUserAccount
    );
    expect(mockAuthMiddleware).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN, ENUM_USER_ROLE.USER);
    expect(mockAuthController.deleteUserAccount).not.toHaveBeenCalled();
  });
});