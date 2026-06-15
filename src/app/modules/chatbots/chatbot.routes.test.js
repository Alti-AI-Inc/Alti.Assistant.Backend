import { vi, describe, it, expect } from 'vitest';

// Mock express.Router
const mockPost = vi.fn();
const mockGet = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

const mockRouteMethods = {
  post: mockPost,
  get: mockGet,
  patch: mockPatch,
  delete: mockDelete,
};

const mockRoute = vi.fn().mockImplementation(() => mockRouteMethods);

const {
  mockRouter,
  mockAuthMiddleware,
  mockCreateChatbot,
  mockGetChatbots,
  mockGetChatbotById,
  mockUpdateChatbot,
  mockDeleteChatbot,
  ENUM_USER_ROLE
} = vi.hoisted(() => {
  const mockRouter = {
    route: mockRoute,
  };

  // Mock auth middleware
  // The mock returns a distinct string to easily verify it was passed to the route method.
  const mockAuthMiddleware = vi.fn().mockImplementation((...roles) => `auth-middleware-for-${roles.join('-')}`);

  // Mock chatbotController functions
  const mockCreateChatbot = vi.fn();
  const mockGetChatbots = vi.fn();
  const mockGetChatbotById = vi.fn();
  const mockUpdateChatbot = vi.fn();
  const mockDeleteChatbot = vi.fn();

  // Mock ENUM_USER_ROLE
  const ENUM_USER_ROLE = {
    USER: 'user',
    ADMIN: 'admin',
    SUPER_ADMIN: 'super_admin',
  };

  return {
    mockRouter,
    mockAuthMiddleware,
    mockCreateChatbot,
    mockGetChatbots,
    mockGetChatbotById,
    mockUpdateChatbot,
    mockDeleteChatbot,
    ENUM_USER_ROLE
  };
});

vi.mock('express', () => ({
  default: {
    Router: vi.fn().mockImplementation(() => mockRouter),
  },
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
    const express = require('express').default; // Access the mocked express
    expect(express.Router).toHaveBeenCalledTimes(1);
  });

  it('should define routes for "/" and "/:id"', () => {
    expect(mockRoute).toHaveBeenCalledTimes(2);
    expect(mockRoute).toHaveBeenCalledWith('/');
    expect(mockRoute).toHaveBeenCalledWith('/:id');
  });

  it('should define all expected routes with correct methods, auth, and controllers', () => {
    // Verify POST /
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      mockAuthMiddleware.mock.results[0].value, // The return value of the 1st call to mockAuthMiddleware
      mockCreateChatbot
    );

    // Verify GET / and GET /:id (mockGet is called twice)
    expect(mockGet).toHaveBeenCalledTimes(2);
    expect(mockGet).toHaveBeenNthCalledWith(
      1,
      mockAuthMiddleware.mock.results[1].value, // The return value of the 2nd call to mockAuthMiddleware
      mockGetChatbots
    );
    expect(mockGet).toHaveBeenNthCalledWith(
      2,
      mockAuthMiddleware.mock.results[2].value, // The return value of the 3rd call to mockAuthMiddleware
      mockGetChatbotById
    );

    // Verify PATCH /:id
    expect(mockPatch).toHaveBeenCalledTimes(1);
    expect(mockPatch).toHaveBeenCalledWith(
      mockAuthMiddleware.mock.results[3].value, // The return value of the 4th call to mockAuthMiddleware
      mockUpdateChatbot
    );

    // Verify DELETE /:id
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(
      mockAuthMiddleware.mock.results[4].value, // The return value of the 5th call to mockAuthMiddleware
      mockDeleteChatbot
    );
  });

  it('should call auth middleware 5 times with correct role combinations', () => {
    expect(mockAuthMiddleware).toHaveBeenCalledTimes(5);

    // Check specific calls to auth middleware for each route
    expect(mockAuthMiddleware).toHaveBeenNthCalledWith(1, ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN); // For POST /
    expect(mockAuthMiddleware).toHaveBeenNthCalledWith(2, ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN); // For GET /
    expect(mockAuthMiddleware).toHaveBeenNthCalledWith(3, ENUM_USER_ROLE.USER, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN); // For GET /:id
    expect(mockAuthMiddleware).toHaveBeenNthCalledWith(4, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN); // For PATCH /:id
    expect(mockAuthMiddleware).toHaveBeenNthCalledWith(5, ENUM_USER_ROLE.SUPER_ADMIN, ENUM_USER_ROLE.ADMIN); // For DELETE /:id
  });
});