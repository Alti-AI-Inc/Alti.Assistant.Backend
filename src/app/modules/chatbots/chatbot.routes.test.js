import { vi, describe, it, expect } from 'vitest';

const {
  mockPost,
  mockGet,
  mockPatch,
  mockDelete,
  mockRouteMethods,
  mockRoute,
  mockRouter,
  mockAuthMiddleware,
  mockCreateChatbot,
  mockGetChatbots,
  mockGetChatbotById,
  mockUpdateChatbot,
  mockDeleteChatbot,
  mockStartTuning,
  mockGetTuningStatus,
  mockExpress,
  ENUM_USER_ROLE
} = vi.hoisted(() => {
  const mockRouteMethods = {};
  const mockPost = vi.fn().mockImplementation(() => mockRouteMethods);
  const mockGet = vi.fn().mockImplementation(() => mockRouteMethods);
  const mockPatch = vi.fn().mockImplementation(() => mockRouteMethods);
  const mockDelete = vi.fn().mockImplementation(() => mockRouteMethods);

  mockRouteMethods.post = mockPost;
  mockRouteMethods.get = mockGet;
  mockRouteMethods.patch = mockPatch;
  mockRouteMethods.delete = mockDelete;

  const mockRoute = vi.fn().mockImplementation(() => mockRouteMethods);

  const mockRouter = {
    route: mockRoute,
    use: vi.fn().mockReturnThis(),
    post: mockPost,
    get: mockGet,
    patch: mockPatch,
    delete: mockDelete,
  };

  // Mock auth middleware
  const mockAuthMiddleware = vi.fn().mockImplementation((...roles) => `auth-middleware-for-${roles.join('-')}`);

  // Mock chatbotController functions
  const mockCreateChatbot = vi.fn();
  const mockGetChatbots = vi.fn();
  const mockGetChatbotById = vi.fn();
  const mockUpdateChatbot = vi.fn();
  const mockDeleteChatbot = vi.fn();
  const mockStartTuning = vi.fn();
  const mockGetTuningStatus = vi.fn();

  // Mock ENUM_USER_ROLE
  const ENUM_USER_ROLE = {
    USER: 'user',
    MANAGER: 'manager',
    SUPER_ADMIN: 'super_admin',
  };

  const mockExpress = {
    Router: vi.fn().mockImplementation(() => mockRouter),
  };

  return {
    mockPost,
    mockGet,
    mockPatch,
    mockDelete,
    mockRouteMethods,
    mockRoute,
    mockRouter,
    mockAuthMiddleware,
    mockCreateChatbot,
    mockGetChatbots,
    mockGetChatbotById,
    mockUpdateChatbot,
    mockDeleteChatbot,
    mockStartTuning,
    mockGetTuningStatus,
    mockExpress,
    ENUM_USER_ROLE
  };
});

vi.mock('express', () => ({
  default: mockExpress,
  Router: mockExpress.Router,
}));

vi.mock('../../middlewares/auth/auth.js', () => ({
  default: mockAuthMiddleware,
}));

vi.mock('./chatbot.controller.js', () => ({
  chatbotController: {
    createChatbot: mockCreateChatbot,
    getChatbots: mockGetChatbots,
    getChatbotById: mockGetChatbotById,
    updateChatbot: mockUpdateChatbot,
    deleteChatbot: mockDeleteChatbot,
    startTuning: mockStartTuning,
    getTuningStatus: mockGetTuningStatus,
  },
}));

vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE,
}));

// Import the module under test AFTER all mocks are defined.
// This will execute the route definitions once, populating the mock calls.
import { chatbotRoutes } from './chatbot.routes.js';

describe('Chatbot Routes Configuration', () => {
  it('should export the router instance', () => {
    expect(chatbotRoutes).toBe(mockRouter);
  });

  it('should call express.Router() to create a router', () => {
    expect(mockExpress.Router).toHaveBeenCalledTimes(2);
  });

  it('should define routes for "/" and "/:id"', () => {
    expect(mockRoute).toHaveBeenCalledTimes(2);
    expect(mockRoute).toHaveBeenCalledWith('/');
    expect(mockRoute).toHaveBeenCalledWith('/:id');
  });

  it('should define all expected routes with correct methods, auth, and controllers', () => {
    // Verify POST / and POST /:id/tune (mockPost is called 3 times, including the manager invitation route)
    expect(mockPost).toHaveBeenCalledTimes(3);
    
    // 1st POST call: POST /
    expect(mockPost).toHaveBeenNthCalledWith(
      1,
      mockAuthMiddleware.mock.results[0].value,
      expect.any(Function), // checkPlanLimits
      expect.any(Array), // createChatbotValidation
      expect.any(Function), // handleValidationErrors
      mockCreateChatbot
    );

    // 2nd POST call: POST /:id/tune
    expect(mockPost).toHaveBeenNthCalledWith(
      2,
      '/:id/tune',
      mockAuthMiddleware.mock.results[5].value,
      expect.any(Array), // chatbotIdValidation
      expect.any(Function), // handleValidationErrors
      mockStartTuning
    );

    // Verify GET / and GET /:id and GET /:id/tuning-status (mockGet is called 5 times, including manager metrics and team)
    expect(mockGet).toHaveBeenCalledTimes(5);
    
    // 1st GET call: GET /
    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      mockAuthMiddleware.mock.results[1].value,
      mockGetChatbots
    );

    // 2nd GET call: GET /:id
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      mockAuthMiddleware.mock.results[2].value,
      expect.any(Array), // chatbotIdValidation
      expect.any(Function), // handleValidationErrors
      mockGetChatbotById
    );

    // 3rd GET call: GET /:id/tuning-status
    expect(mockGet).toHaveBeenNthCalledWith(
      3,
      '/:id/tuning-status',
      mockAuthMiddleware.mock.results[6].value,
      expect.any(Array), // chatbotIdValidation
      expect.any(Function), // handleValidationErrors
      mockGetTuningStatus
    );

    // Verify PATCH /:id (mockPatch is called 2 times, including manager role update)
    expect(mockPatch).toHaveBeenCalledTimes(2);
    expect(mockPatch).toHaveBeenNthCalledWith(
      1,
      mockAuthMiddleware.mock.results[3].value,
      expect.any(Array), // chatbotIdValidation
      expect.any(Array), // updateChatbotValidation
      expect.any(Function), // handleValidationErrors
      mockUpdateChatbot
    );

    // Verify DELETE /:id (mockDelete is called 1 time)
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenNthCalledWith(
      1,
      mockAuthMiddleware.mock.results[4].value,
      expect.any(Array), // chatbotIdValidation
      expect.any(Function), // handleValidationErrors
      mockDeleteChatbot
    );
  });

  it('should call auth middleware 8 times with correct role combinations', () => {
    expect(mockAuthMiddleware).toHaveBeenCalledTimes(8);

    // The first 7 calls are for chatbots module endpoints (using USER, MANAGER, SUPER_ADMIN)
    for (let i = 1; i <= 7; i++) {
      expect(mockAuthMiddleware).toHaveBeenNthCalledWith(
        i,
        ENUM_USER_ROLE.USER,
        ENUM_USER_ROLE.MANAGER,
        ENUM_USER_ROLE.SUPER_ADMIN
      );
    }

    // The 8th call is the managerRouter middleware setup (using MANAGER, SUPER_ADMIN)
    expect(mockAuthMiddleware).toHaveBeenNthCalledWith(
      8,
      ENUM_USER_ROLE.MANAGER,
      ENUM_USER_ROLE.SUPER_ADMIN
    );
  });
});