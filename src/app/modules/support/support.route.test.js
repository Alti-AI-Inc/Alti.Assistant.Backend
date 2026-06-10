import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ENUM_USER_ROLE } from '../../../shared/enum.js';

// Mock Express Router
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();
const mockRoute = vi.fn(() => ({
  get: mockGet,
  post: mockPost,
  patch: mockPatch,
  delete: mockDelete,
}));
vi.mock('express', () => ({
  default: {
    Router: () => ({
      route: mockRoute,
    }),
  },
}));

// Mock Middlewares
vi.mock('../../middlewares/auth/auth.js', () => ({
  default: vi.fn().mockImplementation((...roles) => {
    const middleware = () => {};
    middleware.roles = roles; // Attach roles for easy assertion
    return middleware;
  }),
}));

vi.mock('../../middlewares/validateRequest/validateRequest.js', () => ({
  validateRequest: vi.fn().mockImplementation(schema => {
    const middleware = () => {};
    middleware.schema = schema; // Attach schema for easy assertion
    return middleware;
  }),
}));

// Mock Controller
vi.mock('./support.controller.js', () => ({
  SupportController: {
    getAllSupportReq: vi.fn(),
    reqForSupport: vi.fn(),
    getSupportById: vi.fn(),
    updateSupportReq: vi.fn(),
    deleteSupportReq: vi.fn(),
    bulkDeleteSupportReq: vi.fn(),
  },
}));

// Mock Validation Schema
vi.mock('./support.validation.js', () => ({
  supportValidationSchema: {
    create: { name: 'createSchema' },
    update: { name: 'updateSchema' },
    bulkDelete: { name: 'bulkDeleteSchema' },
  },
}));

// Import the router file after all mocks are set up
import { supportRoutes } from './support.route.js';
import { SupportController } from './support.controller.js';
import { supportValidationSchema } from './support.validation.js';

describe('Support Routes', () => {
  beforeEach(() => {
    // Reset mocks before each test, but the router is initialized only once.
    // We are testing the result of that single initialization.
  });

  // Helper to find the route configuration object by its path
  const findRouteHandler = path => {
    const call = mockRoute.mock.calls.find(c => c[0] === path);
    if (!call) return null;
    const index = mockRoute.mock.calls.indexOf(call);
    return mockRoute.mock.results[index].value; // The { get, post, ... } object
  };

  it('should create a router and define routes', () => {
    expect(supportRoutes).toBeDefined();
    expect(mockRoute).toHaveBeenCalledWith('/');
    expect(mockRoute).toHaveBeenCalledWith('/:id');
    expect(mockRoute).toHaveBeenCalledWith('/bulk-delete');
  });

  describe('Route: /', () => {
    const route = findRouteHandler('/');

    it('should configure GET / to get all support requests (ADMIN only)', () => {
      expect(route.get).toHaveBeenCalledTimes(1);
      const getCallArgs = route.get.mock.calls[0];

      // Check auth middleware
      expect(getCallArgs[0].roles).toEqual([ENUM_USER_ROLE.ADMIN]);

      // Check controller
      expect(getCallArgs[1]).toBe(SupportController.getAllSupportReq);
    });

    it('should configure POST / to create a support request (ADMIN, USER)', () => {
      expect(route.post).toHaveBeenCalledTimes(1);
      const postCallArgs = route.post.mock.calls[0];

      // Check validation middleware
      expect(postCallArgs[0].schema).toBe(supportValidationSchema.create);

      // Check auth middleware
      expect(postCallArgs[1].roles).toEqual([
        ENUM_USER_ROLE.ADMIN,
        ENUM_USER_ROLE.USER,
      ]);

      // Check controller
      expect(postCallArgs[2]).toBe(SupportController.reqForSupport);
    });
  });

  describe('Route: /:id', () => {
    const route = findRouteHandler('/:id');

    it('should configure GET /:id to get a single support request (ADMIN, USER)', () => {
      expect(route.get).toHaveBeenCalledTimes(1);
      const getCallArgs = route.get.mock.calls[0];

      // Check auth middleware
      expect(getCallArgs[0].roles).toEqual([
        ENUM_USER_ROLE.ADMIN,
        ENUM_USER_ROLE.USER,
      ]);

      // Check controller
      expect(getCallArgs[1]).toBe(SupportController.getSupportById);
    });

    it('should configure PATCH /:id to update a support request (ADMIN, USER)', () => {
      expect(route.patch).toHaveBeenCalledTimes(1);
      const patchCallArgs = route.patch.mock.calls[0];

      // Check validation middleware
      expect(patchCallArgs[0].schema).toBe(supportValidationSchema.update);

      // Check auth middleware
      expect(patchCallArgs[1].roles).toEqual([
        ENUM_USER_ROLE.ADMIN,
        ENUM_USER_ROLE.USER,
      ]);

      // Check controller
      expect(patchCallArgs[2]).toBe(SupportController.updateSupportReq);
    });

    it('should configure DELETE /:id to delete a support request (ADMIN, USER)', () => {
      expect(route.delete).toHaveBeenCalledTimes(1);
      const deleteCallArgs = route.delete.mock.calls[0];

      // Check auth middleware
      expect(deleteCallArgs[0].roles).toEqual([
        ENUM_USER_ROLE.ADMIN,
        ENUM_USER_ROLE.USER,
      ]);

      // Check controller
      expect(deleteCallArgs[1]).toBe(SupportController.deleteSupportReq);
    });
  });

  describe('Route: /bulk-delete', () => {
    const route = findRouteHandler('/bulk-delete');

    it('should configure DELETE /bulk-delete for bulk deletion (ADMIN, USER)', () => {
      expect(route.delete).toHaveBeenCalledTimes(1);
      const deleteCallArgs = route.delete.mock.calls[0];

      // Check validation middleware
      expect(deleteCallArgs[0].schema).toBe(supportValidationSchema.bulkDelete);

      // Check auth middleware
      expect(deleteCallArgs[1].roles).toEqual([
        ENUM_USER_ROLE.ADMIN,
        ENUM_USER_ROLE.USER,
      ]);

      // Check controller
      expect(deleteCallArgs[2]).toBe(SupportController.bulkDeleteSupportReq);
    });
  });
});