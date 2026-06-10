import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';
import auth from '../../middlewares/auth/auth.js';
import { extractTenantContext } from '../../middlewares/tenant/tenantContext.js';
import { AiEndpointsController } from './aiEndpoint.controller.js';

// Mock express to capture router calls
const mockRouter = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
};
vi.mock('express', () => ({
  default: {
    Router: vi.fn(() => mockRouter),
  },
}));

// Mock middleware and controller functions
vi.mock('../../../shared/enum.js', () => ({
  ENUM_USER_ROLE: {
    ADMIN: 'admin',
  },
}));

// Mock auth middleware to return a mock middleware function
const mockAuthMiddleware = vi.fn((req, res, next) => next());
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn(() => mockAuthMiddleware),
}));

// Mock extractTenantContext middleware
const mockExtractTenantContext = vi.fn((req, res, next) => {
  req.tenant = { id: 'test-tenant-id' }; // Simulate tenant context extraction
  next();
});
vi.mock('../../middlewares/tenant/tenantContext.js', () => ({
  extractTenantContext: mockExtractTenantContext,
}));

// Mock AiEndpointsController methods
const mockGetAiEndpointForApp = vi.fn();
const mockGetWebAiEndpoint = vi.fn();
const mockAddAiEndpoint = vi.fn();
const mockUpdateWebAiEndpoint = vi.fn();
vi.mock('./aiEndpoint.controller.js', () => ({
  AiEndpointsController: {
    getAiEndpointForApp: mockGetAiEndpointForApp,
    getWebAiEndpoint: mockGetWebAiEndpoint,
    addAiEndpoint: mockAddAiEndpoint,
    updateWebAiEndpoint: mockUpdateWebAiEndpoint,
  },
}));

// Import the router after all mocks are set up
// This ensures that when the module is imported, it uses the mocked dependencies.
import { aiModelEndpointRoutes } from './aiEndpoint.route.js';

describe('aiModelEndpointRoutes', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
    // Ensure express.Router() is called once when the module is imported
    // and that it returns our mockRouter
    expect(express.Router).toHaveBeenCalledOnce();
  });

  it('should export the router instance', () => {
    expect(aiModelEndpointRoutes).toBe(mockRouter);
  });

  describe('GET /all-model', () => {
    it('should define a GET route for /all-model with correct middleware and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/all-model',
        mockExtractTenantContext,
        mockAuthMiddleware,
        mockGetAiEndpointForApp
      );
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN);
      expect(mockRouter.get).toHaveBeenCalledTimes(1); // Only checking for this specific route call
    });
  });

  describe('GET /all-model-web', () => {
    it('should define a GET route for /all-model-web with correct middleware and controller', () => {
      expect(mockRouter.get).toHaveBeenCalledWith(
        '/all-model-web',
        mockExtractTenantContext,
        mockAuthMiddleware,
        mockGetWebAiEndpoint
      );
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN);
      // Check that the total number of GET calls is 2 (for both GET routes)
      expect(mockRouter.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('POST /add-model', () => {
    it('should define a POST route for /add-model with correct middleware and controller', () => {
      expect(mockRouter.post).toHaveBeenCalledWith(
        '/add-model',
        mockExtractTenantContext,
        mockAuthMiddleware,
        mockAddAiEndpoint
      );
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN);
      expect(mockRouter.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('PATCH /update-model', () => {
    it('should define a PATCH route for /update-model with correct middleware and controller', () => {
      expect(mockRouter.patch).toHaveBeenCalledWith(
        '/update-model',
        mockExtractTenantContext,
        mockAuthMiddleware,
        mockUpdateWebAiEndpoint
      );
      expect(auth).toHaveBeenCalledWith(ENUM_USER_ROLE.ADMIN);
      expect(mockRouter.patch).toHaveBeenCalledTimes(1);
    });
  });
});